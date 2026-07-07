/**
 * Bot Telegram vendeur — Phase 1 : liaison + notifications sortantes.
 *
 * Modèle : UN bot plateforme. Chaque vendeur lie son Telegram via un deep-link
 * `https://t.me/<bot>?start=<token>`. Le webhook reçoit `/start <token>`,
 * retrouve le user par token et enregistre son `chatId`. Ensuite, chaque
 * notification créée (commande, livraison, solde…) est aussi poussée ici via
 * `sendToUser` — appelé par notification.service, best-effort, jamais bloquant.
 *
 * Gratuit : l'API Bot Telegram n'a aucun coût par message.
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../models/User.model';
import {
  TELEGRAM_API,
  TELEGRAM_BOT_USERNAME,
  TELEGRAM_WEBHOOK_SECRET,
  isTelegramConfigured,
} from '../config/telegram';

const FRONTEND_BASE = (process.env.FRONTEND_URL || 'http://localhost:3002')
  .split(',')[0]
  .trim()
  .replace(/\/$/, '');
const API_BASE = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min

/** Échappe le HTML pour le `parse_mode: 'HTML'` de Telegram. */
function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Appel bas-niveau de l'API Bot Telegram (best-effort, jamais throw). */
async function tg(method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; description?: string } | null> {
  if (!TELEGRAM_API) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) console.warn('[telegram]', method, 'failed:', data.description);
    return data;
  } catch (err) {
    console.warn('[telegram]', method, 'error:', err);
    return null;
  }
}

/** Envoie un message (HTML) avec bouton inline optionnel. */
export async function sendMessage(chatId: string, text: string, buttonUrl?: string): Promise<void> {
  const reply_markup = buttonUrl
    ? { inline_keyboard: [[{ text: '👁 Ouvrir dans FlexioPage', url: buttonUrl }]] }
    : undefined;
  await tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup,
  });
}

/**
 * Pousse une notification vers le Telegram du vendeur, s'il est lié et actif.
 * Appelé par notification.service (fan-out). Best-effort : toute erreur est
 * avalée pour ne jamais bloquer l'opération métier sous-jacente.
 */
export async function sendToUser(
  userId: mongoose.Types.ObjectId | string,
  n: { title: string; body: string; link?: string },
): Promise<void> {
  if (!isTelegramConfigured()) return;
  const user = await User.findById(userId).select('telegram').lean();
  const tgInfo = user?.telegram;
  if (!tgInfo?.chatId || tgInfo.enabled === false) return;
  const text = `<b>${esc(n.title)}</b>\n${esc(n.body)}`;
  const url = n.link ? `${FRONTEND_BASE}${n.link}` : undefined;
  await sendMessage(tgInfo.chatId, text, url);
}

/**
 * Génère un token de liaison à usage unique et renvoie le deep-link Telegram.
 * Le vendeur l'ouvre → `/start <token>` → handleUpdate lie le chatId.
 */
export async function createLinkDeepLink(
  userId: mongoose.Types.ObjectId | string,
): Promise<{ deepLink: string }> {
  const token = crypto.randomBytes(24).toString('base64url');
  await User.findByIdAndUpdate(userId, {
    telegramLinkToken: token,
    telegramLinkTokenExpiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
  });
  return { deepLink: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}` };
}

/** Type minimal d'un update Telegram (on ne traite que les messages texte). */
interface TgUpdate {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    from?: { username?: string; first_name?: string };
  };
}

/** Traite un update entrant (webhook). Best-effort. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  const msg = update?.message;
  const rawId = msg?.chat?.id;
  if (rawId === undefined || rawId === null) return;
  const chatId = String(rawId);
  const text = String(msg?.text || '').trim();

  // /start [token] — liaison
  if (text.startsWith('/start')) {
    const token = text.split(/\s+/)[1];
    if (!token) {
      await sendMessage(
        chatId,
        '👋 Bonjour ! Pour lier ce Telegram à ta boutique, ouvre le dashboard FlexioPage → <b>Intégrations → Telegram</b> → « Lier mon Telegram ».',
      );
      return;
    }
    const user = await User.findOne({
      telegramLinkToken: token,
      telegramLinkTokenExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      await sendMessage(chatId, '❌ Lien invalide ou expiré. Régénère-le depuis <b>Intégrations → Telegram</b>.');
      return;
    }
    user.telegram = {
      chatId,
      username: msg?.from?.username,
      firstName: msg?.from?.first_name,
      linkedAt: new Date(),
      enabled: true,
    };
    user.telegramLinkToken = undefined;
    user.telegramLinkTokenExpiresAt = undefined;
    await user.save();
    await sendMessage(
      chatId,
      "✅ <b>C'est lié !</b>\nTu recevras ici les notifications de ta boutique FlexioPage : nouvelles commandes, statuts de livraison, alertes de solde.\n\n<i>/stop</i> pour couper · <i>/aide</i> pour l'aide",
    );
    return;
  }

  // /stop — coupe les notifs sans délier
  if (text === '/stop') {
    await User.updateOne({ 'telegram.chatId': chatId }, { $set: { 'telegram.enabled': false } });
    await sendMessage(chatId, '🔕 Notifications coupées. Réactive-les depuis le dashboard (Intégrations → Telegram) ou en refaisant la liaison.');
    return;
  }

  // /aide
  if (text === '/aide' || text === '/help') {
    await sendMessage(
      chatId,
      "ℹ️ Ce bot t'envoie les notifications de ta boutique FlexioPage.\n<i>/stop</i> — couper les notifications\nGère la liaison depuis <b>Dashboard → Intégrations → Telegram</b>.",
    );
    return;
  }

  // Phase 2 (dialogue avec la boutique via Claude) : à venir.
  await sendMessage(chatId, "Pour l'instant je t'envoie seulement les notifications 🛎️. Le dialogue avec ta boutique arrive bientôt !");
}

/**
 * Configure le webhook Telegram au démarrage (si bot configuré + URL publique).
 * Idempotent côté Telegram : rappeler setWebhook écrase la précédente.
 */
export async function setupTelegramWebhook(): Promise<void> {
  if (!isTelegramConfigured()) {
    console.log('[telegram] non configuré (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME manquants) — bot désactivé.');
    return;
  }
  if (!API_BASE || API_BASE.startsWith('http://localhost')) {
    console.warn('[telegram] API_PUBLIC_URL non public — webhook non configuré (en dev : ngrok).');
    return;
  }
  const url = `${API_BASE}/api/webhooks/telegram`;
  const res = await tg('setWebhook', {
    url,
    secret_token: TELEGRAM_WEBHOOK_SECRET || undefined,
    allowed_updates: ['message'],
  });
  if (res?.ok) console.log('[telegram] webhook configuré →', url);
}
