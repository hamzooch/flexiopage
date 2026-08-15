/**
 * Web Push (navigateur / PWA installée) via le protocole standard + VAPID.
 *
 * C'est le canal qui notifie le vendeur MÊME NAVIGATEUR FERMÉ ou téléphone
 * verrouillé : le push est délivré au service worker (public/sw.js côté
 * frontend) par le push service du navigateur (FCM pour Chrome, Mozilla
 * autopush, APNs pour Safari/iOS PWA ≥ 16.4).
 *
 * Best-effort comme les autres canaux : un échec d'envoi ne doit jamais
 * bloquer l'opération métier. Les abonnements morts (404/410 = désabonné,
 * navigateur réinstallé…) sont purgés automatiquement.
 */
import webpush from 'web-push';
import { User } from '../models/User.model';
import { logger } from '../lib/logger';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@flexiopage.com';

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[webpush] clés VAPID invalides — canal désactivé');
  }
} else {
  logger.warn('[webpush] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absents — canal Web Push désactivé');
}

export function isWebPushConfigured(): boolean {
  return configured;
}

export function getVapidPublicKey(): string {
  return PUBLIC_KEY;
}

export interface WebPushPayload {
  title: string;
  body: string;
  /** Route ouverte au clic sur la notification (ex: /dashboard/orders). */
  link?: string;
  /** Tag de dédoublonnage (ex: id de la notification). */
  tag?: string;
}

export interface WebPushSendResult {
  subscriptions: number;
  sent: number;
  removed: number;
  errors: string[];
}

/** Envoie une push à TOUS les navigateurs abonnés du vendeur. Ne throw jamais. */
export async function sendWebPushToUser(
  userId: string | { toString(): string },
  payload: WebPushPayload
): Promise<WebPushSendResult> {
  if (!configured) return { subscriptions: 0, sent: 0, removed: 0, errors: ['vapid_not_configured'] };
  try {
    const user = await User.findById(String(userId)).select('webPushSubscriptions').lean();
    const subs = user?.webPushSubscriptions || [];
    if (!subs.length) return { subscriptions: 0, sent: 0, removed: 0, errors: [] };

    const body = JSON.stringify(payload);
    const dead: string[] = [];
    const errors: string[] = [];
    let sent = 0;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            body,
            { TTL: 24 * 3600, urgency: 'high' }
          );
          sent++;
        } catch (err) {
          const e = err as { statusCode?: number; message?: string };
          // 404/410 = abonnement expiré/révoqué → purge.
          if (e.statusCode === 404 || e.statusCode === 410) dead.push(sub.endpoint);
          else errors.push(`${e.statusCode || '?'}: ${e.message || 'erreur inconnue'}`);
        }
      })
    );

    if (dead.length) {
      await User.updateOne(
        { _id: String(userId) },
        { $pull: { webPushSubscriptions: { endpoint: { $in: dead } } } }
      );
      logger.info({ userId: String(userId), removed: dead.length }, '[webpush] abonnements morts purgés');
    }
    if (errors.length) logger.warn({ userId: String(userId), errors }, '[webpush] erreurs d’envoi');
    return { subscriptions: subs.length, sent, removed: dead.length, errors };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[webpush] envoi échoué (non-fatal)');
    return { subscriptions: 0, sent: 0, removed: 0, errors: [(err as Error).message] };
  }
}
