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
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/User.model';
import { Store } from '../models/Store.model';
import { Order } from '../models/Order.model';
import { applyConfirmationStatus, markOrderShipped } from './order-confirmation.service';
import { JWT_SECRET } from '../lib/jwtSecret';
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
const OPEN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

/** Chemin interne seulement. Un lien Telegram ne doit jamais sortir du site. */
function safeNext(path: string | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/dashboard';
  return path;
}

/**
 * Lien du bouton « Ouvrir dans FlexioPage ». Le navigateur de Telegram n'a
 * pas la session du vendeur, donc un lien direct vers /dashboard tombe sur
 * /login. Ce jeton signé ouvre la session puis la bonne page.
 */
function openLink(userId: string, path?: string): string {
  const body = Buffer.from(JSON.stringify({
    uid: userId,
    exp: Date.now() + OPEN_LINK_TTL_MS,
    next: safeNext(path),
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${FRONTEND_BASE}/tg?k=${body}.${sig}`;
}

export async function exchangeOpenKey(key: string): Promise<{
  token: string;
  next: string;
  user: { _id: string; email: string; name: string; role?: string };
} | null> {
  const dot = key.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = key.slice(0, dot);
  const sig = key.slice(dot + 1);
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data: { uid?: string; exp?: number; next?: string };
  try {
    data = JSON.parse(Buffer.from(body, 'base64url').toString()) as { uid?: string; exp?: number; next?: string };
  } catch {
    return null;
  }
  if (!data.uid || !data.exp || data.exp < Date.now()) return null;
  if (!mongoose.isValidObjectId(data.uid)) return null;
  const user = await User.findById(data.uid).select('email name role');
  if (!user) return null;
  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES as jwt.SignOptions['expiresIn'] },
  );
  return {
    token,
    next: safeNext(data.next),
    user: { _id: user._id.toString(), email: user.email, name: user.name, role: user.role },
  };
}

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

type TgButton = { text: string; url?: string; callback_data?: string };

/** Envoie un message (HTML). `rows` ajoute des boutons sous le lien d'ouverture. */
export async function sendMessage(
  chatId: string,
  text: string,
  buttonUrl?: string,
  rows?: TgButton[][],
): Promise<boolean> {
  const keyboard: TgButton[][] = [];
  if (rows?.length) keyboard.push(...rows);
  if (buttonUrl) keyboard.push([{ text: '👁 Ouvrir dans FlexioPage', url: buttonUrl }]);
  const reply_markup = keyboard.length ? { inline_keyboard: keyboard } : undefined;
  const res = await tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup,
  });
  return !!res?.ok;
}

function orderRows(orderId: string): TgButton[][] {
  return [[
    { text: '✅ Confirmer', callback_data: `oc:${orderId}` },
    { text: '✕ Annuler', callback_data: `ox:${orderId}` },
    { text: '📦 Expédier', callback_data: `os:${orderId}` },
  ]];
}

/**
 * Envoi d'un message de test au vendeur courant. Utilisé par le bouton
 * "Envoyer une notif de test" du dashboard pour qu'il vérifie que la
 * liaison est fonctionnelle sans attendre une vraie commande. Renvoie
 * un statut explicite pour que l'UI puisse remonter un message clair.
 */
export async function sendTestMessage(
  userId: mongoose.Types.ObjectId | string,
): Promise<{ ok: boolean; reason?: 'not_configured' | 'not_linked' | 'disabled' | 'send_failed' }> {
  if (!isTelegramConfigured()) return { ok: false, reason: 'not_configured' };
  const user = await User.findById(userId).select('telegram').lean();
  const tgInfo = user?.telegram;
  if (!tgInfo?.chatId) return { ok: false, reason: 'not_linked' };
  if (tgInfo.enabled === false) return { ok: false, reason: 'disabled' };
  const text =
    '<b>✅ Test réussi !</b>\n' +
    'Si tu lis ce message, les notifications FlexioPage arriveront bien ici.\n\n' +
    '<i>Tape /aide pour voir les commandes dispo.</i>';
  const ok = await sendMessage(tgInfo.chatId, text, openLink(String(userId), '/dashboard'));
  return ok ? { ok: true } : { ok: false, reason: 'send_failed' };
}

/**
 * Pousse une notification vers le Telegram du vendeur, s'il est lié et actif.
 * Appelé par notification.service (fan-out). Best-effort : toute erreur est
 * avalée pour ne jamais bloquer l'opération métier sous-jacente.
 */
export async function sendToUser(
  userId: mongoose.Types.ObjectId | string,
  n: { title: string; body: string; link?: string; orderId?: string },
): Promise<void> {
  if (!isTelegramConfigured()) return;
  const user = await User.findById(userId).select('telegram').lean();
  const tgInfo = user?.telegram;
  if (!tgInfo?.chatId || tgInfo.enabled === false) return;
  const text = `<b>${esc(n.title)}</b>\n${esc(n.body)}`;
  const link = openLink(String(userId), n.link);
  await sendMessage(tgInfo.chatId, text, link, n.orderId ? orderRows(n.orderId) : undefined);
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

/** Message texte ou appui sur un bouton. */
interface TgUpdate {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    from?: { username?: string; first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id?: number; chat?: { id?: number | string } };
  };
}

function commandOf(text: string): string {
  return text.split(/\s+/)[0].split('@')[0].toLowerCase();
}

async function ownedOrder(userId: mongoose.Types.ObjectId, orderId: string) {
  if (!mongoose.isValidObjectId(orderId)) return null;
  const stores = await Store.find({ ownerId: userId }).select('_id').lean();
  if (stores.length === 0) return null;
  return Order.findOne({ _id: orderId, storeId: { $in: stores.map((s) => s._id) } }).select('storeId orderNumber');
}

async function sendToday(chatId: string, userId: mongoose.Types.ObjectId): Promise<void> {
  const stores = await Store.find({ ownerId: userId }).select('_id').lean();
  if (stores.length === 0) {
    await sendMessage(chatId, 'Aucune boutique sur ce compte.');
    return;
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const orders = await Order.find({
    storeId: { $in: stores.map((s) => s._id) },
    createdAt: { $gte: start },
    paymentStatus: { $ne: 'abandoned' },
  }).select('orderNumber total currency confirmationStatus fulfillmentStatus customerName').sort({ createdAt: -1 }).limit(40);

  const active = orders.filter((o) => o.fulfillmentStatus !== 'cancelled' && o.confirmationStatus !== 'declined');
  const toConfirm = active.filter((o) => (o.confirmationStatus || 'pending') === 'pending');
  const confirmed = active.filter((o) => o.confirmationStatus === 'confirmed');
  const totals = new Map<string, number>();
  for (const o of active) totals.set(o.currency || '', (totals.get(o.currency || '') || 0) + (o.total || 0));
  const totalText = [...totals.entries()].map(([c, n]) => `${n} ${c}`.trim()).join(' · ') || '0';
  const lines = toConfirm.slice(0, 5).map((o) => `• ${esc(o.orderNumber)} — ${esc(o.customerName || 'client')} — ${o.total} ${esc(o.currency || '')}`);
  const text = [
    '<b>Aujourd’hui</b>',
    `${toConfirm.length} à confirmer · ${confirmed.length} confirmée${confirmed.length > 1 ? 's' : ''}`,
    `Total : ${esc(totalText)}`,
    lines.length ? `\n${lines.join('\n')}` : '',
  ].join('\n');
  await sendMessage(chatId, text, openLink(userId.toString(), '/dashboard/orders'));
}

async function handleCallback(q: NonNullable<TgUpdate['callback_query']>): Promise<void> {
  const chatId = q.message?.chat?.id;
  const answer = (text: string) => tg('answerCallbackQuery', { callback_query_id: q.id, text });
  if (chatId === undefined || chatId === null) {
    await answer('Message introuvable.');
    return;
  }
  const chat = String(chatId);
  const user = await User.findOne({ 'telegram.chatId': chat, 'telegram.enabled': { $ne: false } }).select('_id');
  if (!user) {
    await answer('Compte non lié.');
    return;
  }
  const [action, orderId] = String(q.data || '').split(':');
  const order = orderId ? await ownedOrder(user._id, orderId) : null;
  if (!order || (action !== 'oc' && action !== 'ox' && action !== 'os')) {
    await answer('Commande introuvable.');
    return;
  }

  if (action === 'os') {
    const shipped = await markOrderShipped({
      orderId: order._id.toString(),
      storeId: order.storeId.toString(),
      userId: user._id.toString(),
    });
    if ('error' in shipped) {
      await answer(shipped.error);
      return;
    }
    await answer('Commande expédiée');
    await sendMessage(chat, `📦 <b>${esc(shipped.orderNumber)}</b> est marquée expédiée.`);
  } else {
    const result = await applyConfirmationStatus({
      orderId: order._id.toString(),
      storeId: order.storeId.toString(),
      userId: user._id.toString(),
      confirmationStatus: action === 'oc' ? 'confirmed' : 'declined',
      note: action === 'oc' ? 'Confirmée depuis Telegram' : 'Annulée depuis Telegram',
    });
    if ('error' in result) {
      await answer('Action impossible.');
      return;
    }
    await answer(action === 'oc' ? 'Commande confirmée' : 'Commande annulée');
    await sendMessage(
      chat,
      action === 'oc'
        ? `✅ <b>${esc(result.order.orderNumber)}</b> est confirmée.`
        : `✕ <b>${esc(result.order.orderNumber)}</b> est annulée.`,
    );
  }

  if (q.message?.message_id !== undefined && action !== 'oc') {
    await tg('editMessageReplyMarkup', {
      chat_id: chat,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  }
}

/** Traite un update entrant (webhook). Best-effort. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update?.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
  const msg = update?.message;
  const rawId = msg?.chat?.id;
  if (rawId === undefined || rawId === null) return;
  const chatId = String(rawId);
  const text = String(msg?.text || '').trim();
  if (!text) return;
  const command = commandOf(text);

  // /start [token] — liaison
  if (command === '/start') {
    const token = text.split(/\s+/)[1];
    if (!token) {
      await sendMessage(
        chatId,
        '👋 Bonjour ! Pour lier ce Telegram à ta boutique, ouvre FlexioPage → <b>Applications → Bot Telegram</b> → « Lier mon Telegram ».',
      );
      return;
    }
    const user = await User.findOne({
      telegramLinkToken: token,
      telegramLinkTokenExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      await sendMessage(chatId, '❌ Lien invalide ou expiré. Régénère-le depuis <b>Applications → Bot Telegram</b>.');
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
      "✅ <b>C'est lié !</b>\nTu recevras ici tes commandes. Sur chaque commande : Confirmer, Annuler ou Expédier.\n\n<i>/commandes</i> le résumé du jour · <i>/stop</i> pour couper · <i>/aide</i>",
      openLink(user._id.toString(), '/dashboard'),
    );
    return;
  }

  // /stop — coupe les notifs sans délier
  if (command === '/stop') {
    await User.updateOne({ 'telegram.chatId': chatId }, { $set: { 'telegram.enabled': false } });
    await sendMessage(chatId, '🔕 Notifications coupées. Réactive-les depuis <b>Applications → Bot Telegram</b>, ou refais la liaison.');
    return;
  }

  // /aide
  if (command === '/aide' || command === '/help') {
    await sendMessage(
      chatId,
      "ℹ️ <b>Commandes</b>\n<i>/commandes</i> — résumé du jour\n<i>/stop</i> — couper les notifications\n\nSur une nouvelle commande : <b>Confirmer</b>, <b>Annuler</b> ou <b>Expédier</b>.",
    );
    return;
  }

  if (command === '/commandes') {
    const user = await User.findOne({ 'telegram.chatId': chatId, 'telegram.enabled': { $ne: false } }).select('_id');
    if (!user) {
      await sendMessage(chatId, 'Ce Telegram n’est pas lié. Ouvre <b>Applications → Bot Telegram</b>.');
      return;
    }
    await sendToday(chatId, user._id);
    return;
  }

  await sendMessage(chatId, 'Tape <i>/commandes</i> pour le résumé du jour, ou <i>/aide</i>.');
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
    allowed_updates: ['message', 'callback_query'],
  });
  if (res?.ok) console.log('[telegram] webhook configuré →', url);
}
