import { Request, Response, NextFunction } from 'express';
import validator from 'validator';

/** Sanitize string for XSS */
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') return '';
  return validator.escape(validator.trim(str));
}

/** Sanitize object string values recursively (one level) */
export function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') out[k] = sanitizeString(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date))
      out[k] = sanitizeBody(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

/** Middleware: sanitize req.body */
export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeBody(req.body as Record<string, unknown>);
  }
  next();
}
