/**
 * Security monitor — detects hostile traffic patterns and alerts the admin.
 *
 * How it works:
 *  1. Hot code paths (cert-ask, rate limiter, webhook signature check) call
 *     `record({ type, sourceIp, target?, sample? })`. That's a lock-free
 *     in-memory increment — costs microseconds, no I/O.
 *  2. A 60-second interval flushes the buckets into the SecurityEvent
 *     collection via bulk `$inc` upserts. Attackers can never DoS Mongo
 *     because the volume is capped at (types × distinct IPs) writes/min,
 *     regardless of incoming request rate.
 *  3. Right after a flush, buckets that crossed a threshold trigger a
 *     Telegram + email alert to the operator. A per-bucket 30-min cooldown
 *     stops the alert stream when an attack lasts hours.
 *
 * Env:
 *   ADMIN_ALERT_EMAIL           where to email security alerts
 *   ADMIN_TELEGRAM_CHAT_ID      Telegram chat id of the platform admin
 *   SECURITY_ALERT_THRESHOLD    hits/min required before an alert fires
 *                               (default 200 — tuned for real attacks, not blips)
 */
import { logger } from '../lib/logger';
import { SecurityEvent, type SecurityEventType } from '../models/SecurityEvent.model';
import { sendEmail } from './email.service';
import { sendMessage as sendTelegramMessage } from './telegram.service';

interface Bucket {
  hits: number;
  firstSeen: number;
  lastSeen: number;
  sample?: Record<string, unknown>;
  target?: string;
}

/** In-memory aggregator keyed on `${type}::${ip}`. */
const buckets = new Map<string, Bucket>();

const FLUSH_INTERVAL_MS = 60_000;
const ALERT_COOLDOWN_MS = 30 * 60_000;
const DEFAULT_THRESHOLD = 200;

function bucketKey(type: SecurityEventType, sourceIp: string): string {
  return `${type}::${sourceIp}`;
}

export interface RecordArgs {
  type: SecurityEventType;
  sourceIp: string | undefined;
  target?: string;
  sample?: Record<string, unknown>;
}

/**
 * Record a single suspicious event. Hot-path safe — non-blocking, no I/O.
 * The actual DB write and alerting happen in the background flush.
 */
export function record({ type, sourceIp, target, sample }: RecordArgs): void {
  const ip = (sourceIp || 'unknown').trim() || 'unknown';
  const key = bucketKey(type, ip);
  const now = Date.now();
  const existing = buckets.get(key);
  if (existing) {
    existing.hits += 1;
    existing.lastSeen = now;
    if (target) existing.target = target;
    if (sample) existing.sample = sample;
  } else {
    buckets.set(key, { hits: 1, firstSeen: now, lastSeen: now, target, sample });
  }
}

function drainBuckets(): Array<{ key: string; type: SecurityEventType; sourceIp: string; bucket: Bucket }> {
  const drained: Array<{ key: string; type: SecurityEventType; sourceIp: string; bucket: Bucket }> = [];
  for (const [key, bucket] of buckets.entries()) {
    const [type, sourceIp] = key.split('::');
    drained.push({ key, type: type as SecurityEventType, sourceIp: sourceIp || 'unknown', bucket });
  }
  buckets.clear();
  return drained;
}

/**
 * Persist in-memory counters to Mongo. Uses `$inc` so the doc keeps growing
 * across flushes for the same (type + IP) as long as the campaign runs.
 * Returns the docs that we just touched with fresh totals + notifiedAt so the
 * alert dispatcher can decide who to warn.
 */
async function flush(): Promise<void> {
  const drained = drainBuckets();
  if (drained.length === 0) return;

  const threshold = Number(process.env.SECURITY_ALERT_THRESHOLD || DEFAULT_THRESHOLD);
  const now = new Date();

  // We fan out one upsert per bucket. It stays cheap even under attack because
  // the bucket count is bounded by (types × distinct IPs), not raw request
  // volume — a single IP flooding 100k reqs is still 1 upsert per flush.
  for (const { type, sourceIp, bucket } of drained) {
    try {
      const doc = await SecurityEvent.findOneAndUpdate(
        { type, sourceIp },
        {
          $inc: { hits: bucket.hits },
          $set: {
            lastSeen: new Date(bucket.lastSeen),
            ...(bucket.target && { target: bucket.target }),
            ...(bucket.sample && { sample: bucket.sample }),
          },
          $setOnInsert: {
            firstSeen: new Date(bucket.firstSeen),
          },
        },
        { upsert: true, new: true },
      );

      // Alert if the bucket just crossed the threshold this minute AND we
      // haven't already alerted recently. `bucket.hits` is the hits added
      // THIS flush window — a genuine spike, not the cumulative total.
      const notifiedRecently =
        doc.notifiedAt && now.getTime() - doc.notifiedAt.getTime() < ALERT_COOLDOWN_MS;
      if (bucket.hits >= threshold && !notifiedRecently) {
        void dispatchAlert({
          type,
          sourceIp,
          hitsLastMinute: bucket.hits,
          totalHits: doc.hits,
          target: bucket.target,
          firstSeen: doc.firstSeen,
        }).catch((err) => logger.error({ err }, '[security] alert dispatch failed'));
        // Mark notified immediately so a second alert can't fire from a
        // concurrent flush before dispatchAlert returns.
        await SecurityEvent.updateOne({ _id: doc._id }, { $set: { notifiedAt: now } });
      }
    } catch (err) {
      logger.error({ err, type, sourceIp }, '[security] flush upsert failed');
    }
  }
}

interface AlertPayload {
  type: SecurityEventType;
  sourceIp: string;
  hitsLastMinute: number;
  totalHits: number;
  target?: string;
  firstSeen: Date;
}

const TYPE_LABEL: Record<SecurityEventType, string> = {
  cert_flood: 'Flood cert-ask (tentative d\'émission Let\'s Encrypt sur des domaines non autorisés)',
  rate_limit_hit: 'Rate-limit global (429) répété',
  auth_bruteforce: 'Bruteforce d\'authentification',
  webhook_forged: 'Webhook paiement avec signature invalide',
  suspicious_signup: 'Signups automatisés suspects',
};

async function dispatchAlert(payload: AlertPayload): Promise<void> {
  const subject = `[FlexioPage sécurité] ${TYPE_LABEL[payload.type]}`;
  const line = (label: string, value: string | number): string => `${label}: ${value}`;

  const bodyLines = [
    `⚠️ Événement de sécurité détecté sur FlexioPage.`,
    '',
    line('Type', TYPE_LABEL[payload.type]),
    line('IP source', payload.sourceIp),
    line('Hits sur la dernière minute', payload.hitsLastMinute),
    line('Hits cumulés depuis le début de l\'attaque', payload.totalHits),
    line('Première occurrence', payload.firstSeen.toISOString()),
    ...(payload.target ? [line('Cible', payload.target)] : []),
    '',
    'Consulte le dashboard admin → Sécurité pour l\'historique complet.',
  ];
  const text = bodyLines.join('\n');

  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;

  const tasks: Promise<unknown>[] = [];

  if (adminEmail) {
    tasks.push(
      sendEmail({
        to: adminEmail,
        subject,
        text,
        html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5;background:#f7f7f7;padding:16px;border-radius:8px;">${text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</pre>`,
      }),
    );
  }

  if (adminChatId) {
    // Telegram: keep it short + HTML. 4096-char limit but we're well below.
    const tgText = [
      `<b>⚠️ ${TYPE_LABEL[payload.type]}</b>`,
      '',
      `IP: <code>${payload.sourceIp}</code>`,
      `Cette minute: <b>${payload.hitsLastMinute}</b> hits`,
      `Cumulé: ${payload.totalHits}`,
      ...(payload.target ? [`Cible: <code>${payload.target}</code>`] : []),
    ].join('\n');
    tasks.push(sendTelegramMessage(adminChatId, tgText));
  }

  if (tasks.length === 0) {
    logger.warn({ payload }, '[security] alert triggered but no ADMIN_ALERT_EMAIL/ADMIN_TELEGRAM_CHAT_ID configured');
    return;
  }

  await Promise.allSettled(tasks);
  logger.warn({ payload }, '[security] alert dispatched');
}

let flushTimer: NodeJS.Timeout | null = null;

/** Called once at server boot to enable the background flush. */
export function startSecurityMonitor(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flush().catch((err) => logger.error({ err }, '[security] flush cycle crashed'));
  }, FLUSH_INTERVAL_MS);
  // Don't hold the event loop open on graceful shutdown.
  flushTimer.unref?.();
  logger.info({ intervalMs: FLUSH_INTERVAL_MS }, '[security] monitor started');
}

/** Test helper — force an immediate flush (used by admin manual refresh). */
export async function flushNow(): Promise<void> {
  await flush();
}
