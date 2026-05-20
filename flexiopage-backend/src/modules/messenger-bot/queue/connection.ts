/**
 * Connexion Redis pour BullMQ. Optionnelle : si REDIS_URL n'est pas défini, on
 * retourne null et le module retombe sur le traitement in-process.
 */
import IORedis, { type Redis } from 'ioredis';
import { logger } from '../../../lib/logger';

let connection: Redis | null = null;
let tried = false;

export function getRedisConnection(): Redis | null {
  if (tried) return connection;
  tried = true;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  // BullMQ exige maxRetriesPerRequest: null.
  connection = new IORedis(url, { maxRetriesPerRequest: null });
  connection.on('error', (err) => logger.error({ err: err.message }, '[messenger-bot] Redis error'));
  return connection;
}
