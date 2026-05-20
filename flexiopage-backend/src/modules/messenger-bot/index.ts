/**
 * Point d'entrée du module Messenger Bot. Monte :
 *   - /api/messenger-bot/*   → API vendeur (JWT)
 *   - /webhook/messenger     → webhook Meta (public, signature validée)
 *
 * À appeler depuis src/index.ts : `registerMessengerBot(app)`.
 * (Le worker BullMQ sera enregistré séparément à la prochaine session.)
 */
import type { Express } from 'express';
import { apiRouter, webhookRouter } from './routes/messengerBot.routes';
import { logger } from '../../lib/logger';

export function registerMessengerBot(app: Express): void {
  app.use('/api/messenger-bot', apiRouter);
  app.use('/webhook/messenger', webhookRouter);
  logger.info('[messenger-bot] module monté (/api/messenger-bot, /webhook/messenger)');
}
