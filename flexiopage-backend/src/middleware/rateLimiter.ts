import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

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
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});
