/**
 * Client Redis partagé par tout le backend (rate-limit, leader election,
 * caches futurs). Singleton paresseux : la connexion n'est ouverte que si
 * quelqu'un appelle `getRedis()`, et une seule fois pour tout le process.
 *
 * Note : le module messenger-bot a son propre `getRedisConnection()` dédié
 * à BullMQ (contraintes BullMQ : `maxRetriesPerRequest: null`). Les deux
 * clients peuvent cohabiter sans problème — ioredis multiplexe les commandes
 * sur une seule TCP conn, même quand plusieurs instances IORedis pointent
 * sur la même URL.
 *
 * Si REDIS_URL n'est pas défini, `getRedis()` renvoie `null` et les
 * consommateurs doivent gérer la dégradation (ex : rate-limit retombe sur
 * mémoire, leader election fait de chaque instance un leader → OK en
 * single-instance).
 */
import IORedis, { type Redis } from 'ioredis';
import { logger } from './logger';

let client: Redis | null = null;
let tried = false;

export function getRedis(): Redis | null {
  if (tried) return client;
  tried = true;
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('[redis] REDIS_URL absent — rate-limit en mémoire, leader election désactivée.');
    return null;
  }
  client = new IORedis(url, {
    // Les commandes qui ne peuvent pas être livrées (Redis down) rejettent
    // vite au lieu de boucler indéfiniment. 2 retries max pour les commandes
    // one-shot (rate-limit, lock renewal).
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    // Garde la conn ouverte en keep-alive OS (évite les timeouts NAT côté VPS).
    keepAlive: 30_000,
  });
  client.on('error', (err) => logger.error({ err: err.message }, '[redis] client error'));
  client.on('ready', () => logger.info('[redis] client ready'));
  client.on('reconnecting', (delay: number) => logger.warn({ delay }, '[redis] reconnecting'));
  return client;
}

/** Ferme la connexion Redis (appelé par le graceful shutdown). */
export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
  client = null;
  tried = false;
}
