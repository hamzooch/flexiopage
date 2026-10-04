import type { Request, Response } from 'express';
import rateLimit, { type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../lib/redis';
import { logger } from '../lib/logger';
import { record as recordSecurityEvent } from '../services/security-monitor.service';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Store partagé Redis pour tous les rate-limiters du backend. Sans ça, chaque
 * worker Node en multi-instance aurait son propre compteur in-memory → la
 * limite réelle devient `limit × N workers` au lieu du cap voulu. Avec Redis,
 * le compteur est unique peu importe le nombre d'instances.
 *
 * Dégradation gracieuse : si Redis absent (REDIS_URL non défini) ou down au
 * boot, on retombe sur le store mémoire par défaut. Préserve le comportement
 * single-instance qu'on a toujours eu.
 *
 * Factory : chaque limiter doit avoir son propre Store (sinon ils partageraient
 * les mêmes buckets). Le `prefix` les isole par usage.
 */
function makeStore(prefix: string): Store | undefined {
  const r = getRedis();
  if (!r) {
    if (!isDev) logger.warn({ prefix }, '[rate-limit] no Redis → using memory store (not shared between instances)');
    return undefined;
  }
  return new RedisStore({
    // `call` signature imposée par rate-limit-redis v4 — on wrappe la commande
    // Redis dans sendCommand (ioredis). Le cast en any est nécessaire car les
    // types RedisReply attendus par rate-limit-redis ne matchent pas ceux
    // d'ioredis.call() ; les deux retournent le même payload à l'exécution.
    sendCommand: (command: string, ...args: string[]) =>
      r.call(command, ...args) as unknown as Promise<string>,
    prefix: `rl:${prefix}:`,
  });
}

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
  store: makeStore('global'),
  // Don't count high-frequency polling endpoints against the limit.
  skip: isPollingRequest,
  handler: (req, res, _next, options) => {
    onLimitReached(req, res);
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Anti double-clic sur les générations AI Studio (poster / landing / video).
 * Chaque génération coûte plusieurs tokens et déclenche un pipeline lourd
 * (LLM + image/vidéo). Sans ce garde-fou, un vendeur qui double-clique ou
 * qui a un souci réseau (retry navigateur, autocomplete formulaire) peut
 * être facturé 2× en quelques ms.
 *
 * Fenêtre volontairement courte (3s) : couvre le double-clic accidentel et
 * les retries automatiques du navigateur, mais ne gêne pas un vendeur qui
 * veut régénérer après avoir vu le résultat (retour visuel ≥ quelques
 * dizaines de secondes de toute façon).
 *
 * Keyé sur (userId, kind) : autorise poster + landing + video en parallèle
 * pour un même user (ce sont 3 CTA distincts dans l'UI), bloque seulement
 * un double-clic sur le même bouton.
 */
export const aiGenerationLimiter = rateLimit({
  windowMs: 3_000,
  max: 1,
  store: makeStore('ai-gen'),
  keyGenerator: (req) => {
    const user = (req as unknown as { user?: { _id?: { toString(): string } } }).user;
    const userKey = user?._id?.toString() || req.ip || 'anon';
    const kind = req.path.split('/').pop() || 'unknown';
    return `ai:${userKey}:${kind}`;
  },
  message: {
    error: 'generation_in_flight',
    message: 'Une génération est déjà en cours pour ce format. Attends la fin ou réessaie dans 3 secondes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    onLimitReached(req, res);
    res.status(options.statusCode).json(options.message);
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: makeStore('auth'),
  message: { error: 'Too many login attempts' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    recordSecurityEvent({ type: 'auth_bruteforce', sourceIp: xff || req.ip, target: req.path });
    res.status(options.statusCode).json(options.message);
  },
});
