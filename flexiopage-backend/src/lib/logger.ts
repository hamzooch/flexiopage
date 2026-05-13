/**
 * Structured logging — pino is fast and produces JSON in production, pretty
 * output in development. Import the `logger` directly to log; the
 * `httpLogger` middleware logs every request.
 *
 * Usage:
 *   import { logger } from '../lib/logger';
 *   logger.info({ orderId }, 'order finalized');
 *   logger.warn({ err }, 'mogadelivery dispatch failed');
 *   logger.error({ err }, 'unhandled exception');
 */
import pino from 'pino';
import pinoHttp from 'pino-http';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  // Pretty-print in dev only — keep prod JSON for log aggregators.
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
      }
    : undefined,
  // Strip noisy bits from req/res serializers (default pino includes everything).
  serializers: {
    req(req) {
      return { method: req.method, url: req.url, id: req.id };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
    err: pino.stdSerializers.err,
  },
  // Auth tokens, passwords, webhook bodies sometimes leak into logs. Redact them.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-access-token"]',
      'req.body.password',
      'req.body.token',
      '*.password',
      '*.apikey',
      '*.api_key',
      '*.CINETPAY_API_KEY',
    ],
    censor: '[REDACTED]',
  },
});

export const httpLogger = pinoHttp({
  logger,
  // Skip health / static probes — they spam the logs and aren't useful.
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url?.startsWith('/uploads/') || false,
  },
  // Lower the level for noisy 4xx (validation rejections etc.); keep 5xx loud.
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
