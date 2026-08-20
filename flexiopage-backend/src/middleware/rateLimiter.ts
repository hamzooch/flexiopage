import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { record as recordSecurityEvent } from '../services/security-monitor.service';

const isDev = process.env.NODE_ENV !== 'production';

/** Called by express-rate-limit each time a client is 429'd. */
function onLimitReached(req: Request, _res: Response): void {
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  recordSecurityEvent({
    type: 'rate_limit_hit',
    sourceIp: xff || req.ip,
    target: req.path,
  });
}

/**
 * Endpoints that are polled by design (job status, wallet badge refresh,
 * webhooks). Hitting the global limiter on these creates 429 cascades during
 * AI landing-page generation, so we skip them here. They still benefit from
 * `authMiddleware` for ownership checks where applicable.
 */
const POLLING_PATHS = [
  /^\/api\/jobs\//,         // long-poll generation status
  /^\/api\/wallet$/,        // sidebar badge refresh every 30s
  /^\/api\/wallet\/.*/,     // wallet sub-endpoints
  /^\/api\/webhooks\//,     // payment + delivery providers (external)
  // Webhooks messenger-bot : Meta / WhatsApp Cloud / Wasender envoient
  // depuis leurs IPs partagées entre TOUS leurs clients — le rate-limiter
  // par IP pouvait donc bouffer notre quota et retourner 429 en amont du
  // controller (aucune trace dans le panel debug côté vendeur). Chaque
  // webhook a sa propre signature validée dans son controller.
  /^\/webhook\//,
];

function isPollingRequest(req: Request): boolean {
  return POLLING_PATHS.some((re) => re.test(req.path));
}

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Generous in dev (frequent reloads), tighter in prod.
  max: isDev ? 5000 : 600,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't count high-frequency polling endpoints against the limit.
  skip: isPollingRequest,
  handler: (req, res, _next, options) => {
    onLimitReached(req, res);
    res.status(options.statusCode).json(options.message);
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    recordSecurityEvent({ type: 'auth_bruteforce', sourceIp: xff || req.ip, target: req.path });
    res.status(options.statusCode).json(options.message);
  },
});
