/**
 * FlexioPage Backend - Main entry point
 * Express server with MongoDB, JWT auth, REST API
 */
import 'dotenv/config';
import path from 'path';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { connectDB } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { logger, httpLogger } from './lib/logger';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import storeRoutes from './routes/store.routes';
import publicRoutes from './routes/public.routes';
import jobsRoutes from './routes/jobs.routes';
import webhooksRoutes from './routes/webhooks.routes';
import paymentRoutes from './routes/payment.routes';
import { registerMessengerBot } from './modules/messenger-bot';
import walletRoutes from './routes/wallet.routes';
import adminRoutes from './routes/admin.routes';
import complaintRoutes from './routes/complaint.routes';
import teamRoutes from './routes/team.routes';
import notificationRoutes from './routes/notification.routes';
import calculatorRoutes from './routes/calculator.routes';
import internalRoutes from './routes/internal.routes';
import { rateLimiter } from './middleware/rateLimiter';

const app = express();
const PORT = process.env.PORT || 5000;

// Behind a single reverse proxy (Nginx). Lets express-rate-limit read the
// real client IP from X-Forwarded-For instead of sharing one counter.
app.set('trust proxy', 1);

// Structured request logging — must come before route handlers so every
// request gets a logger attached at req.log.
app.use(httpLogger);

// Security headers. Helmet's default Cross-Origin-Resource-Policy is
// "same-origin", which would block the frontend (flexiopage.com) from
// embedding images served by the API (api.flexiopage.com). We disable
// the global CORP header here and set it explicitly on /uploads so
// only the public static folder is cross-origin-embeddable.
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── Public static uploads — open, non-credentialed CORS ─────────────
// Mounted BEFORE the credentialed cors() below so the wildcard
// Access-Control-Allow-Origin doesn't clash with Access-Control-Allow-
// Credentials: true (combination is invalid per the CORS spec).
const uploadPath = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads');
app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(uploadPath),
);

// ── API CORS — credentialed, origin allow-list ──────────────────────
// Accept either a single FRONTEND_URL or a comma-separated list (handy during
// dev when the frontend is run on multiple ports). Storefronts run on
// per-seller subdomains, so for each listed origin we also allow ANY
// subdomain of its hostname (e.g. macaftans.flexiopage.com when the list
// contains flexiopage.com).
// Normalize origins so common misconfigurations (trailing slash, mixed
// case) don't silently break CORS in prod. We compare a canonical form
// (lowercased, trailing slash stripped) on both sides.
function normalizeOrigin(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, '');
}

const corsOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3002')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

// Pre-compute apex hostnames so subdomain matching is a cheap endsWith().
const allowedApexHosts = corsOrigins
  .map((o) => {
    try { return new URL(o).hostname.toLowerCase(); } catch { return null; }
  })
  .filter((h): h is string => !!h);

// Cache des customDomain vérifiés — les vendeurs ayant branché leur
// propre nom de domaine (afrochance.com, etc.) doivent pouvoir taper
// l'API depuis ce domaine. On rafraîchit toutes les 60s pour ne pas
// faire de DB hit sur chaque preflight CORS.
let customDomainCache: { hosts: Set<string>; expiresAt: number } = {
  hosts: new Set(),
  expiresAt: 0,
};
const CUSTOM_DOMAIN_CACHE_MS = 60_000;

async function getVerifiedCustomDomains(): Promise<Set<string>> {
  if (customDomainCache.expiresAt > Date.now()) return customDomainCache.hosts;
  try {
    // Import paresseux — Mongoose n'est pas encore initialisé au top-level
    // si on importait Store directement ici (boot order).
    const { Store } = await import('./models/Store.model');
    const docs = await Store.find(
      { customDomainVerified: true, customDomain: { $exists: true, $ne: null } },
      { customDomain: 1 },
    ).lean<{ customDomain?: string }[]>();
    const hosts = new Set<string>();
    for (const d of docs) {
      if (d.customDomain) hosts.add(d.customDomain.trim().toLowerCase());
    }
    customDomainCache = { hosts, expiresAt: Date.now() + CUSTOM_DOMAIN_CACHE_MS };
    return hosts;
  } catch (err) {
    logger.warn({ err }, '[cors] custom-domain cache refresh failed');
    return customDomainCache.hosts;
  }
}

app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // server-to-server / curl
    const candidate = normalizeOrigin(origin);
    if (corsOrigins.includes(candidate)) return cb(null, true);
    try {
      const host = new URL(candidate).hostname.toLowerCase();
      // 1) Sous-domaines de la plateforme (storefronts par défaut).
      if (allowedApexHosts.some((apex) => host === apex || host.endsWith('.' + apex))) {
        return cb(null, true);
      }
      // 2) Domaines custom vérifiés — afrochance.com, etc. Async lookup
      //    avec cache 60s pour éviter le DB hit sur chaque preflight.
      void getVerifiedCustomDomains().then((hosts) => {
        if (hosts.has(host) || hosts.has(host.replace(/^www\./, ''))) {
          return cb(null, true);
        }
        logger.warn({ origin, host, allowed: corsOrigins }, '[cors] origin rejected');
        cb(new Error(`CORS: origin ${origin} not allowed`));
      });
      return;
    } catch { /* fall through */ }
    logger.warn({ origin, allowed: corsOrigins }, '[cors] origin rejected');
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

// Helper exporté pour invalider le cache (utilisé après vérification
// d'un nouveau domaine custom dans le contrôleur store).
export function invalidateCustomDomainCorsCache(): void {
  customDomainCache = { hosts: new Set(), expiresAt: 0 };
}
// Capture the raw body so webhook handlers can verify provider signatures
// (e.g. Meta's X-Hub-Signature-256, which signs the exact bytes received).
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
// Skip mongo-sanitize on webhook routes: it strips req.query keys containing
// dots, which would delete Meta's hub.mode / hub.verify_token / hub.challenge
// params and break webhook verification. Protection stays on everywhere else.
app.use((req, res, next) => {
  if (req.path.startsWith('/webhook/')) return next();
  return mongoSanitize()(req, res, next);
});

// Rate limiting
app.use(rateLimiter);

// Internal endpoints (reverse-proxy → backend). Mounted at the root so the
// Caddyfile URL stays short; safe to expose publicly (read-only domain
// authorization check).
app.use('/internal', internalRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/calculator', calculatorRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
// Stores + nested: products, pages, orders, media at /api/stores/:storeId/*
app.use('/api/stores', storeRoutes);
// Async generation jobs (polling)
app.use('/api/jobs', jobsRoutes);
// Online payment API (initiate + verify) — CinetPay / Flutterwave
app.use('/api/payment', paymentRoutes);
// Payment provider webhooks (CinetPay, Flutterwave, mock dev)
app.use('/api/webhooks', webhooksRoutes);
// Public storefront API (no auth)
app.use('/api/public', publicRoutes);
// Messenger Bot module (API vendeur /api/messenger-bot + webhook /webhook/messenger)
registerMessengerBot(app);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 and error handler
app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    logger.info({ port: PORT }, `FlexioPage API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
