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
import { dataDeletionRouter } from './routes/dataDeletion.routes';
import { registerMessageWorker } from './workers/messageWorker';
import { initMessengerQueue } from './queue/messageQueue';
import { logger } from '../../lib/logger';

export function registerMessengerBot(app: Express): void {
  // Data Deletion (Meta) — PUBLIC, doit passer avant le routeur JWT.
  app.use('/api/messenger-bot', dataDeletionRouter);
  app.use('/api/messenger-bot', apiRouter);
  app.use('/webhook/messenger', webhookRouter);

  // Toujours enregistrer le processor in-process (repli si pas de Redis).
  registerMessageWorker();
  // Si REDIS_URL est défini, BullMQ prend le relais (durable, hors-process).
  const bull = initMessengerQueue();
  logger.info(
    `[messenger-bot] module monté (/api/messenger-bot, /webhook/messenger) — traitement: ${bull ? 'BullMQ/Redis' : 'in-process'}`,
  );
}
