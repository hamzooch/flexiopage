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
import walletRoutes from './routes/wallet.routes';
import adminRoutes from './routes/admin.routes';
import complaintRoutes from './routes/complaint.routes';
import { rateLimiter } from './middleware/rateLimiter';

const app = express();
const PORT = process.env.PORT || 5000;

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
// dev when the frontend is run on multiple ports).
const corsOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3002')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(mongoSanitize());

// Rate limiting
app.use(rateLimiter);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
// Stores + nested: products, pages, orders, media at /api/stores/:storeId/*
app.use('/api/stores', storeRoutes);
// Async generation jobs (polling)
app.use('/api/jobs', jobsRoutes);
// Payment provider webhooks (CinetPay, mock dev)
app.use('/api/webhooks', webhooksRoutes);
// Public storefront API (no auth)
app.use('/api/public', publicRoutes);

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
