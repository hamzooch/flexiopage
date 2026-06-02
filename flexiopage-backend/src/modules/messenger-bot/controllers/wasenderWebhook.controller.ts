/**
 * Webhook WasenderAPI (WhatsApp Web via QR).
 *
 *   POST /webhook/wasender
 *
 * Wasender envoie un événement par message reçu. Comme la signature exacte
 * n'est pas (encore) documentée publiquement de façon stable, on accepte une
 * vérification par secret partagé via header ou query (envoyé à la création
 * de la session via `webhook_secret`). Tout est best-effort : on rejette si le
 * secret est défini et ne matche pas.
 *
 * Le payload est aplati : on tolère plusieurs variantes de clés (`event`,
 * `data.message`, `messageBody`, etc.) — on cherche ce qu'il nous faut sans
 * faire d'hypothèse rigide sur le format.
 */
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../../../lib/logger';
import { BotConfig } from '../models/BotConfig.model';
import { Conversation } from '../models/Conversation.model';
import { Message } from '../models/Message.model';
import { messageQueue } from '../services/queue.service';
import type { IncomingMediaType } from '../utils/mediaFallback';

interface WasenderPayload {
  event?: string;
  type?: string;
  session_id?: string;
  sessionId?: string;
  data?: Record<string, unknown> | unknown;
  message?: Record<string, unknown> | unknown;
  [k: string]: unknown;
}

/** Vrai si le header/secret matche WASENDER_WEBHOOK_SECRET (si défini). */
function verifyWasenderSecret(req: Request): boolean {
  const expected = process.env.WASENDER_WEBHOOK_SECRET;
  if (!expected) return true; // pas de secret configuré → on accepte
  const candidates = [
    req.header('x-webhook-secret'),
    req.header('x-wasender-secret'),
    req.header('x-wasender-signature'),
    String(req.query.secret || ''),
  ].filter(Boolean) as string[];
  return candidates.some((c) => {
    try {
      return c.length === expected.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** Normalise un objet message Wasender vers la même forme que parseWaMessage(). */
interface NormalizedMsg {
  kind: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'unsupported';
  text?: string;
  mediaUrl?: string;
  mediaMime?: string;
  caption?: string;
  fromJid?: string;
  fromName?: string;
  messageId?: string;
  fromMe?: boolean;
}

function normalizeMessage(payload: WasenderPayload): NormalizedMsg {
  // Wasender encapsule typiquement le message dans `data` ou `data.message`.
  const root = asObject(payload);
  const data = asObject(root.data);
  const msg = asObject(data.message ?? root.message ?? data);
  const key = asObject(msg.key);
  const messageBody = asObject(msg.messageBody ?? msg.body ?? msg.content ?? msg);

  const messageId = String(key.id || msg.id || data.id || '') || undefined;
  const fromMe = Boolean(key.fromMe ?? msg.fromMe ?? data.fromMe);
  const remoteJid = String(key.remoteJid || msg.from || data.from || msg.chatId || data.chatId || '');
  const fromJid = remoteJid.split('@')[0] || undefined;
  const fromName = (msg.pushName || data.pushName || msg.senderName || data.senderName || undefined) as string | undefined;

  // Texte simple : plusieurs variantes selon Wasender.
  const text =
    (messageBody.conversation as string | undefined) ||
    (messageBody.text as string | undefined) ||
    ((asObject(messageBody.extendedTextMessage).text) as string | undefined) ||
    (msg.text as string | undefined);

  const img = asObject(messageBody.imageMessage ?? messageBody.image);
  const aud = asObject(messageBody.audioMessage ?? messageBody.audio);
  const vid = asObject(messageBody.videoMessage ?? messageBody.video);
  const doc = asObject(messageBody.documentMessage ?? messageBody.document);
  const stk = asObject(messageBody.stickerMessage ?? messageBody.sticker);

  const pickMedia = (m: Record<string, unknown>) =>
    ({
      url: (m.url || m.directPath || m.mediaUrl) as string | undefined,
      mime: (m.mimetype || m.mimeType) as string | undefined,
      caption: (m.caption as string | undefined)?.trim() || undefined,
    });

  if (Object.keys(img).length) {
    const p = pickMedia(img);
    return { kind: 'image', mediaUrl: p.url, mediaMime: p.mime, caption: p.caption, fromJid, fromName, messageId, fromMe };
  }
  if (Object.keys(aud).length) {
    const p = pickMedia(aud);
    return { kind: 'audio', mediaUrl: p.url, mediaMime: p.mime, fromJid, fromName, messageId, fromMe };
  }
  if (Object.keys(vid).length) {
    const p = pickMedia(vid);
    return { kind: 'video', mediaUrl: p.url, mediaMime: p.mime, caption: p.caption, fromJid, fromName, messageId, fromMe };
  }
  if (Object.keys(doc).length) {
    const p = pickMedia(doc);
    return { kind: 'document', mediaUrl: p.url, mediaMime: p.mime, fromJid, fromName, messageId, fromMe };
  }
  if (Object.keys(stk).length) {
    const p = pickMedia(stk);
    return { kind: 'sticker', mediaUrl: p.url, mediaMime: p.mime, fromJid, fromName, messageId, fromMe };
  }
  if (text && text.trim()) {
    return { kind: 'text', text: text.trim(), fromJid, fromName, messageId, fromMe };
  }
  return { kind: 'unsupported', fromJid, fromName, messageId, fromMe };
}

function eventNameOf(payload: WasenderPayload): string {
  return String(payload.event || payload.type || '').toLowerCase();
}

export async function receiveWasenderWebhook(req: Request, res: Response): Promise<void> {
  if (!verifyWasenderSecret(req)) {
    logger.warn(
      { headers: { 'x-webhook-secret': !!req.header('x-webhook-secret'), 'x-wasender-secret': !!req.header('x-wasender-secret'), 'x-wasender-signature': !!req.header('x-wasender-signature') } },
      '[wasender] webhook secret invalide — rejet',
    );
    res.sendStatus(401);
    return;
  }

  const payload = (req.body || {}) as WasenderPayload;
  // ACK rapide pour éviter les redeliveries en cascade.
  res.status(200).json({ received: true });

  try {
    const event = eventNameOf(payload);
    const topLevelKeys = Object.keys(payload || {});
    logger.info(
      { event, topLevelKeys, hasData: !!payload.data, hasMessage: !!payload.message },
      '[wasender] webhook reçu',
    );

    // Événements de session : on met à jour le statut local sans traiter de message.
    if (event.includes('session') || event.includes('status')) {
      await applySessionStatus(payload);
      return;
    }
    // Tout ce qui n'est pas un message entrant est ignoré (sent, status update, reaction…).
    if (!event.includes('message') || event.includes('sent') || event.includes('status')) {
      logger.info({ event }, '[wasender] event non géré — ignoré');
      return;
    }

    const sessionId = String(payload.session_id || payload.sessionId || asObject(payload.data).session_id || '');
    if (!sessionId) {
      logger.warn({ topLevelKeys }, '[wasender] webhook sans session_id — ignoré');
      return;
    }
    const config = await BotConfig.findOne({
      wasender_session_id: sessionId,
      channel: 'whatsapp',
      whatsapp_provider: 'wasender',
    });
    if (!config) {
      logger.warn({ sessionId }, '[wasender] aucun BotConfig pour ce session_id — ignoré');
      return;
    }
    if (config.status !== 'active') {
      logger.warn({ sessionId, status: config.status }, '[wasender] bot non actif — ignoré');
      return;
    }
    if (config.conversations_used_this_month >= config.conversations_limit) {
      logger.info({ sessionId }, '[wasender] quota atteint — message ignoré');
      return;
    }

    const norm = normalizeMessage(payload);
    if (norm.fromMe) {
      logger.info('[wasender] message fromMe (echo) — ignoré');
      return;
    }
    if (!norm.fromJid) {
      logger.warn({ event }, '[wasender] message sans fromJid — ignoré');
      return;
    }
    if (norm.kind === 'unsupported') {
      logger.warn({ event, sample: JSON.stringify(payload).slice(0, 500) }, '[wasender] message kind=unsupported — ajuster normalizeMessage');
      return;
    }

    // Idempotence par id message Wasender.
    if (norm.messageId && (await Message.exists({ messenger_message_id: norm.messageId }))) return;

    let content: string;
    let mediaType: IncomingMediaType | undefined;
    let mediaUrl: string | undefined;
    let caption: string | undefined;
    const attachments: { type: string; url: string }[] = [];

    if (norm.kind === 'text') {
      content = norm.text || '';
    } else {
      mediaType = norm.kind as IncomingMediaType;
      mediaUrl = norm.mediaUrl;
      caption = norm.caption;
      if (norm.kind === 'image') content = caption || '[image]';
      else content = `[${norm.kind}]`;
      if (mediaUrl) attachments.push({ type: norm.kind, url: mediaUrl });
    }

    let conv = await Conversation.findOne({
      vendor_id: config.vendor_id,
      channel: 'whatsapp',
      customer_psid: norm.fromJid,
      status: { $in: ['active', 'human_takeover'] },
    });
    const isNew = !conv;
    if (!conv) {
      conv = await Conversation.create({
        vendor_id: config.vendor_id,
        bot_config_id: config._id,
        channel: 'whatsapp',
        customer_psid: norm.fromJid,
        customer_name: norm.fromName,
        status: 'active',
      });
    }

    try {
      await Message.create({
        conversation_id: conv._id,
        vendor_id: config.vendor_id,
        sender: 'customer',
        content,
        attachments,
        messenger_message_id: norm.messageId,
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return;
      throw e;
    }
    conv.message_count += 1;
    conv.last_message_at = new Date();
    if (norm.fromName && !conv.customer_name) conv.customer_name = norm.fromName;
    await conv.save();

    if (isNew) {
      await BotConfig.updateOne({ _id: config._id }, { $inc: { total_conversations: 1, conversations_used_this_month: 1 } });
    }
    if (conv.status === 'human_takeover') return;

    // Le worker récupère l'URL média telle quelle (Wasender renvoie une URL
    // publique ou signée). `mediaId` réutilisé pour transporter l'URL — le
    // worker lit la config pour savoir comment fetch (provider=wasender).
    await messageQueue.enqueue({
      botConfigId: String(config._id),
      conversationId: String(conv._id),
      vendorId: String(config.vendor_id),
      pageId: sessionId,
      customerPsid: norm.fromJid,
      text: content,
      messengerMessageId: norm.messageId,
      mediaType,
      mediaId: mediaUrl,
      caption,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[wasender] traitement webhook échec');
  }
}

/** Maj du statut BotConfig sur événement `session.status` (best-effort). */
async function applySessionStatus(payload: WasenderPayload): Promise<void> {
  const sessionId = String(payload.session_id || payload.sessionId || asObject(payload.data).session_id || '');
  if (!sessionId) return;
  const status = String(asObject(payload.data).status || payload.status || '').toLowerCase();
  if (!status) return;
  const next = status === 'connected' ? 'active' : status === 'disconnected' || status === 'logged_out' ? 'disconnected' : null;
  if (!next) return;
  await BotConfig.updateOne(
    { wasender_session_id: sessionId, channel: 'whatsapp', whatsapp_provider: 'wasender' },
    { $set: { status: next } },
  );
}
