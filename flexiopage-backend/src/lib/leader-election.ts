/**
 * Leader election via Redis — garantit qu'UNE SEULE instance Node exécute
 * les tâches périodiques (schedulers cart-abandonment, announcement,
 * security-monitor) même quand le backend tourne en multi-instance.
 *
 * Algorithme (le classique "SET NX EX + renouvellement") :
 *   1. Au boot, chaque instance tente SET leader:<key> <nodeId> NX EX <ttl>.
 *   2. Le premier qui réussit devient leader.
 *   3. Le leader renouvelle sa TTL toutes les ttl/3 secondes (via un script
 *      atomique qui vérifie que la valeur stockée est bien son nodeId —
 *      sinon un ex-leader zombie pourrait écraser un nouveau leader
 *      légitime).
 *   4. Les non-leaders retentent périodiquement le SET NX (si le leader
 *      meurt, sa TTL expire et un autre prend le relais en <ttl> secondes).
 *   5. Au shutdown, le leader DEL son lock (si et seulement si c'est son
 *      nodeId) pour accélérer la bascule.
 *
 * Dégradation gracieuse : si Redis est absent (getRedis() === null), chaque
 * instance se considère leader. OK en single-instance (ce qu'on a aujourd'hui).
 * En multi-instance sans Redis, on retombe sur l'ancien comportement
 * dupliqué — à éviter en prod mais pas un crash.
 */
import { hostname } from 'os';
import { randomBytes } from 'crypto';
import { logger } from './logger';
import { getRedis } from './redis';

export interface LeaderElection {
  /** True si cette instance détient actuellement le lock. */
  isLeader(): boolean;
  /** ID unique de ce process (pour debug/logs). */
  readonly nodeId: string;
  /** Démarre la boucle d'élection. Idempotent. */
  start(): Promise<void>;
  /** Libère le lock s'il nous appartient (appelé par graceful shutdown). */
  stop(): Promise<void>;
}

const DEFAULT_TTL_MS = 30_000;

/**
 * Script Lua pour renouveler la TTL de MANIÈRE ATOMIQUE : on ne renouvelle
 * que si on détient toujours le lock. Évite le scénario où un leader lent
 * (pause GC, swap) se réveille après que le lock a expiré et qu'un autre
 * est devenu leader — sans le check, il écraserait l'autre.
 */
const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export function createLeaderElection(options: { key?: string; ttlMs?: number } = {}): LeaderElection {
  const key = options.key || 'flexiopage:leader:schedulers';
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const renewMs = Math.floor(ttlMs / 3);
  // ID unique = hostname (= container id en Docker) + random, assez pour
  // différencier des instances sur la même machine.
  const nodeId = `${hostname()}-${randomBytes(4).toString('hex')}`;

  let leader = false;
  let loopTimer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped) return;
    const r = getRedis();
    if (!r) {
      // Pas de Redis → chaque instance est "leader par défaut".
      if (!leader) {
        leader = true;
        logger.info({ nodeId, mode: 'solo' }, '[leader] no Redis → acting as leader');
      }
      return;
    }
    try {
      if (leader) {
        // Renouveler notre lock. Si le renew échoue (0 = pas notre lock), on perd le leadership.
        const res = (await r.eval(RENEW_SCRIPT, 1, key, nodeId, String(ttlMs))) as number;
        if (res === 0) {
          leader = false;
          logger.warn({ nodeId, key }, '[leader] lost leadership (lock no longer ours)');
        }
      } else {
        // Tenter de prendre le lock.
        const res = await r.set(key, nodeId, 'PX', ttlMs, 'NX');
        if (res === 'OK') {
          leader = true;
          logger.info({ nodeId, key, ttlMs }, '[leader] acquired leadership');
        }
      }
    } catch (err) {
      // Redis down ou timeout : on garde l'état précédent, on retentera au
      // prochain tick. Pas de spam de logs — l'event 'error' du client Redis
      // les émet déjà.
      logger.debug({ err: (err as Error).message }, '[leader] tick failed');
    }
  }

  return {
    nodeId,
    isLeader: () => leader,
    async start(): Promise<void> {
      if (loopTimer) return;
      await tick(); // premier essai immédiat
      loopTimer = setInterval(() => void tick(), renewMs);
      loopTimer.unref?.();
      logger.info({ nodeId, key, renewMs, ttlMs }, '[leader] election started');
    },
    async stop(): Promise<void> {
      stopped = true;
      if (loopTimer) {
        clearInterval(loopTimer);
        loopTimer = null;
      }
      if (!leader) return;
      const r = getRedis();
      if (!r) return;
      try {
        await r.eval(RELEASE_SCRIPT, 1, key, nodeId);
        logger.info({ nodeId }, '[leader] released lock on shutdown');
      } catch (err) {
        logger.warn({ err: (err as Error).message }, '[leader] release failed');
      }
    },
  };
}

/** Instance singleton partagée par les schedulers. */
export const leaderElection = createLeaderElection();
