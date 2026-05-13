import { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware';

/**
 * Central error handler.
 *
 * For **admins**, we return the full `err.message` (with provider names,
 * upstream status codes, etc.) so they can debug from the UI. For every
 * other authenticated user — or unauthenticated callers — we return
 * `err.publicMessage` if set, otherwise a generic fallback. This keeps
 * implementation details (fal.ai, FAL_KEY, FLUX, Claude, …) out of
 * regular vendors' dashboards while preserving admin visibility.
 *
 * Services that want a different public/internal split should throw an
 * Error with both fields:
 *
 *   const err = new Error('fal.ai nano-banana 429: rate limit') as
 *     Error & { statusCode?: number; publicMessage?: string };
 *   err.statusCode = 502;
 *   err.publicMessage = 'La génération a échoué (code 429). Réessaie.';
 *   throw err;
 */
export function errorHandler(
  err: Error & { statusCode?: number; publicMessage?: string },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  const isAdmin = (req as AuthRequest).user?.role === 'admin';
  const detailed = err.message || 'Internal server error';
  const generic = err.publicMessage || 'Une erreur est survenue. Réessaie dans un instant.';
  const message = isAdmin ? detailed : generic;

  if (statusCode >= 500) {
    // Always log the detailed message for ops, regardless of who triggered it.
    console.error(err);
  }
  res.status(statusCode).json({ error: message });
}
