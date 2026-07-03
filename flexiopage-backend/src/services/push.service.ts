/**
 * Push mobile via Expo Push Service (https://exp.host/--/api/v2/push/send).
 *
 * Modèle son : Android porte le son via un CANAL de notification (son fixe par
 * canal). On expose donc 3 sons = 3 canaux ; l'app mobile enregistre ces canaux
 * (mêmes `channelId`) avec les fichiers son correspondants. Le vendeur choisit
 * un son (stocké sur `User.pushSoundPreference`) et le backend route le push
 * vers le bon canal (Android) + `sound` (iOS).
 *
 * Best-effort : un échec de push ne doit jamais bloquer l'opération métier
 * (création de commande, etc.) — l'appelant enveloppe déjà en try/catch.
 */
import axios from 'axios';
import { User } from '../models/User.model';
import { logger } from '../lib/logger';

export interface PushSound {
  /** Clé stockée sur l'utilisateur + envoyée par l'app. */
  key: string;
  /** Libellé affiché au vendeur dans le sélecteur. */
  label: string;
  /** Canal Android (doit correspondre à celui enregistré par l'app mobile). */
  channelId: string;
  /** Nom du fichier son embarqué (iOS + Android). */
  file: string;
}

/** Catalogue des sons proposés. Les `file` doivent exister dans l'app mobile
 *  (assets/sounds/) ET être déclarés au plugin expo-notifications (app.json).
 *  Phase de test : un seul son (« cha-ching » caisse, façon Shopify). Pour en
 *  ajouter, dépose le .wav dans l'app + ajoute l'entrée ici, dans app.json et
 *  dans mobile/src/push.ts (SOUND_CHANNELS). */
export const PUSH_SOUNDS: PushSound[] = [
  { key: 'cash', label: 'Cha-ching (caisse)', channelId: 'orders-cash', file: 'cash_register.wav' },
  // À ajouter plus tard (quand les fichiers seront déposés) :
  // { key: 'bell', label: 'Cloche', channelId: 'orders-bell', file: 'bell.wav' },
  // { key: 'ding', label: 'Ding',   channelId: 'orders-ding', file: 'ding.wav' },
];
export const DEFAULT_PUSH_SOUND = 'cash';

export function resolveSound(key?: string): PushSound {
  return PUSH_SOUNDS.find((s) => s.key === key) || PUSH_SOUNDS.find((s) => s.key === DEFAULT_PUSH_SOUND)!;
}

/** Un ExpoPushToken valide ressemble à `ExponentPushToken[xxxx]` ou `ExpoPushToken[xxxx]`. */
export function isExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token.trim());
}

export interface PushPayload {
  title: string;
  body: string;
  /** Route in-app (ouvre la bonne page dans la WebView au tap). */
  link?: string;
  /** Données additionnelles transmises au device. */
  data?: Record<string, unknown>;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: string;      // iOS : nom du fichier
  channelId: string;  // Android : canal (porte le son)
  priority: 'high';
  data: Record<string, unknown>;
}

/** Construit un message Expo par token. Pur & testable. */
export function buildExpoMessages(tokens: string[], soundKey: string | undefined, payload: PushPayload): ExpoMessage[] {
  const sound = resolveSound(soundKey);
  const data = { link: payload.link, ...(payload.data || {}) };
  return tokens
    .filter(isExpoPushToken)
    .map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      sound: sound.file,
      channelId: sound.channelId,
      priority: 'high',
      data,
    }));
}

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/**
 * Envoie une push à TOUS les appareils du vendeur, avec son son préféré.
 * Purge les tokens signalés `DeviceNotRegistered` par Expo. Ne throw jamais.
 */
export async function sendToUser(userId: string | { toString(): string }, payload: PushPayload): Promise<{ sent: number }> {
  try {
    const user = await User.findById(String(userId)).select('expoPushTokens pushSoundPreference').lean();
    const tokens = (user?.expoPushTokens || []).filter(isExpoPushToken);
    if (!tokens.length) return { sent: 0 };

    const messages = buildExpoMessages(tokens, user?.pushSoundPreference, payload);
    const res = await axios.post(EXPO_ENDPOINT, messages, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });

    // Récupère les tokens morts pour les retirer (les tickets sont dans l'ordre).
    const tickets: Array<{ status?: string; details?: { error?: string } }> = res.data?.data || [];
    const dead: string[] = [];
    tickets.forEach((t, i) => {
      if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered') dead.push(messages[i].to);
    });
    if (dead.length) {
      await User.updateOne({ _id: String(userId) }, { $pull: { expoPushTokens: { $in: dead } } });
      logger.info({ userId: String(userId), removed: dead.length }, '[push] tokens morts purgés');
    }
    return { sent: messages.length - dead.length };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[push] envoi échoué (non-fatal)');
    return { sent: 0 };
  }
}
