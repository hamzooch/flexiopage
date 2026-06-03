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
import { BotConfig, type IBotConfig } from '../models/BotConfig.model';
import type { HydratedDocument } from 'mongoose';
import { Conversation } from '../models/Conversation.model';
import { Message } from '../models/Message.model';
import { messageQueue } from '../services/queue.service';
import { hashWasenderToken } from '../services/wasender.service';
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

/**
 * Buffer mémoire des N derniers webhooks Wasender, exposé via un endpoint
 * admin pour debug quand on n'a pas accès aux logs prod. RAZ au redémarrage —
 * suffisant pour comprendre la forme réelle des payloads et débugger en live.
 */
export interface CapturedWebhook {
  at: string;
  event: string;
  sessionId?: string;
  signatureMatched: boolean;
  processed: 'enqueued' | 'ignored' | 'unsupported' | 'error' | 'session_status';
  reason?: string;
  payload: unknown;
}
const WEBHOOK_BUFFER_MAX = 10;
const capturedWebhooks: CapturedWebhook[] = [];
function capture(entry: CapturedWebhook): void {
  capturedWebhooks.unshift(entry);
  if (capturedWebhooks.length > WEBHOOK_BUFFER_MAX) capturedWebhooks.length = WEBHOOK_BUFFER_MAX;
}
export function getCapturedWebhooks(): CapturedWebhook[] {
  return capturedWebhooks;
}

/** Headers Wasender / alias acceptés pour le secret webhook. */
function readSignatureHeader(req: Request): string | null {
  const candidates = [
    req.header('x-webhook-signature'), // ← le vrai header Wasender
    req.header('x-webhook-secret'),
    req.header('x-wasender-secret'),
    req.header('x-wasender-signature'),
    String(req.query.secret || ''),
  ].filter(Boolean) as string[];
  return candidates[0] || null;
}

/**
 * Compare deux secrets en temps constant. Sans risque si l'un des deux est
 * vide / mal formé.
 */
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
  catch { return false; }
}

/**
 * Vérif legacy (route `/webhook/wasender` sans :webhookId) : compare au
 * `WASENDER_WEBHOOK_SECRET` global. Accepte tout si non défini (compat dev).
 */
function verifyLegacyWasenderSecret(req: Request): boolean {
  const expected = process.env.WASENDER_WEBHOOK_SECRET;
  if (!expected) return true;
  const got = readSignatureHeader(req);
  return !!got && constantTimeEq(got, expected);
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
  // Wasender envoie le message sous `data.messages` (cf. docs officielles) :
  //   - messages.received → data.messages est un OBJET unique
  //   - messages.upsert (Baileys) → data.messages est un TABLEAU
  //   - Variants legacy → data.message singulier
  const root = asObject(payload);
  const data = asObject(root.data);
  const raw = data.messages ?? data.message ?? root.message ?? data;
  const msg = Array.isArray(raw) ? asObject(raw[0] as unknown) : asObject(raw);
  const key = asObject(msg.key);

  // `messageBody` peut être une STRING (format messages.received) ou un OBJET
  // (format messages.upsert avec imageMessage, audioMessage…).
  const bodyRaw = msg.messageBody ?? msg.body ?? msg.content;
  const bodyText = typeof bodyRaw === 'string' ? bodyRaw : undefined;
  const bodyObj = bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
    ? asObject(bodyRaw)
    : {};
  const innerMsg = asObject(msg.message);

  const messageId = String(key.id || msg.id || data.id || '') || undefined;
  const fromMe = Boolean(key.fromMe ?? msg.fromMe ?? data.fromMe);

  // Numéro expéditeur — Wasender expose `cleanedSenderPn` ("1234567890") qui est
  // le plus propre. Repli sur senderPn / remoteJid (avec stripping du suffixe
  // @s.whatsapp.net).
  const cleanedPn = (key.cleanedSenderPn || msg.cleanedSenderPn) as string | undefined;
  const senderPn = (key.senderPn || msg.senderPn) as string | undefined;
  const remoteJid = String(key.remoteJid || msg.from || data.from || msg.chatId || data.chatId || '');
  const fromJid = cleanedPn
    ? String(cleanedPn).replace(/[^\d]/g, '')
    : senderPn
      ? String(senderPn).split('@')[0]
      : remoteJid
        ? remoteJid.split('@')[0]
        : undefined;
  const fromName = (msg.pushName || data.pushName || msg.senderName || data.senderName || undefined) as string | undefined;

  // Texte simple : ordre de priorité = string messageBody (format
  // messages.received) → conversation/extendedTextMessage (format upsert) →
  // texte natif inner message.
  const text =
    bodyText ||
    (bodyObj.conversation as string | undefined) ||
    (bodyObj.text as string | undefined) ||
    (asObject(bodyObj.extendedTextMessage).text as string | undefined) ||
    (innerMsg.conversation as string | undefined) ||
    (asObject(innerMsg.extendedTextMessage).text as string | undefined) ||
    (msg.text as string | undefined);

  // Médias : on cherche dans bodyObj (upsert) ET dans innerMsg (autres formats).
  const candidates = [bodyObj, innerMsg];
  const findMedia = (kind: 'imageMessage' | 'audioMessage' | 'videoMessage' | 'documentMessage' | 'stickerMessage' | 'image' | 'audio' | 'video' | 'document' | 'sticker') =>
    candidates.reduce<Record<string, unknown>>((acc, c) => Object.keys(acc).length ? acc : asObject(c[kind]), {});
  const img = Object.keys(findMedia('imageMessage')).length ? findMedia('imageMessage') : findMedia('image');
  const aud = Object.keys(findMedia('audioMessage')).length ? findMedia('audioMessage') : findMedia('audio');
  const vid = Object.keys(findMedia('videoMessage')).length ? findMedia('videoMessage') : findMedia('video');
  const doc = Object.keys(findMedia('documentMessage')).length ? findMedia('documentMessage') : findMedia('document');
  const stk = Object.keys(findMedia('stickerMessage')).length ? findMedia('stickerMessage') : findMedia('sticker');

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
  const payload = (req.body || {}) as WasenderPayload;
  const event = eventNameOf(payload);
  const sessionIdEarly = String(payload.session_id || payload.sessionId || asObject(payload.data).session_id || '');
  const webhookIdParam = String(req.params.webhookId || '');

  // Si la route inclut un :webhookId → mode multi-vendeur : on lookup la
  // BotConfig dès le départ pour vérifier le secret par session. Si pas
  // d'id (route legacy `/webhook/wasender`) on tombe sur le secret global.
  let routedConfig: HydratedDocument<IBotConfig> | null = null;
  if (webhookIdParam) {
    routedConfig = await BotConfig.findOne({
      wasender_webhook_id: webhookIdParam,
      channel: 'whatsapp',
      whatsapp_provider: 'wasender',
    });
    if (!routedConfig) {
      capture({ at: new Date().toISOString(), event, sessionId: sessionIdEarly, signatureMatched: false, processed: 'error', reason: `webhookId ${webhookIdParam} inconnu`, payload });
      logger.warn({ webhookId: webhookIdParam }, '[wasender] webhookId inconnu — rejet');
      res.sendStatus(404);
      return;
    }
    // Vérif du secret par session (hash en DB).
    const got = readSignatureHeader(req);
    const expectedHash = routedConfig.wasender_webhook_secret_hash;
    const matched = !!got && !!expectedHash && constantTimeEq(crypto.createHash('sha256').update(got).digest('hex'), expectedHash);
    if (!matched) {
      capture({ at: new Date().toISOString(), event, sessionId: sessionIdEarly, signatureMatched: false, processed: 'error', reason: 'signature per-session invalide', payload });
      logger.warn({ webhookId: webhookIdParam }, '[wasender] signature per-session invalide — rejet');
      res.sendStatus(401);
      return;
    }
  } else if (!verifyLegacyWasenderSecret(req)) {
    capture({
      at: new Date().toISOString(),
      event,
      sessionId: sessionIdEarly,
      signatureMatched: false,
      processed: 'error',
      reason: 'signature legacy invalide',
      payload,
    });
    logger.warn(
      { headers: { 'x-webhook-signature': !!req.header('x-webhook-signature'), 'x-webhook-secret': !!req.header('x-webhook-secret') } },
      '[wasender] webhook secret legacy invalide — rejet',
    );
    res.sendStatus(401);
    return;
  }

  // ACK rapide pour éviter les redeliveries en cascade.
  res.status(200).json({ received: true });

  try {
    const topLevelKeys = Object.keys(payload || {});
    logger.info(
      { event, topLevelKeys, hasData: !!payload.data, hasMessage: !!payload.message },
      '[wasender] webhook reçu',
    );

    // Événements de session : on met à jour le statut local sans traiter de message.
    if (event.includes('session') || event === 'qrcode.updated') {
      await applySessionStatus(payload);
      capture({ at: new Date().toISOString(), event, sessionId: sessionIdEarly, signatureMatched: true, processed: 'session_status', payload });
      return;
    }
    // Filtres : event de test, events sortants, status messages.
    if (
      event === 'webhook.test' ||
      !event.includes('message') ||
      event.includes('sent') ||
      event.includes('receipt') ||
      event.includes('reaction')
    ) {
      capture({ at: new Date().toISOString(), event, sessionId: sessionIdEarly, signatureMatched: true, processed: 'ignored', reason: 'event non géré', payload });
      logger.info({ event }, '[wasender] event non géré — ignoré');
      return;
    }

    const sessionId = sessionIdEarly;
    // Résolution de la BotConfig par ordre de priorité :
    //   1. Route multi-vendeur : `routedConfig` déjà résolu via :webhookId.
    //   2. sessionId présent dans le payload (simulator) : match par hash de
    //      l'API token, puis par UUID interne (legacy).
    //   3. Fallback single-tenant (route legacy `/webhook/wasender` sans id)
    //      sur l'unique BotConfig wasender active du système. Multi-vendeur
    //      sur la route legacy n'est PAS supporté — utiliser la route avec
    //      :webhookId.
    let config = routedConfig;
    if (!config && sessionId) {
      const tokenHash = hashWasenderToken(sessionId);
      config = await BotConfig.findOne({
        channel: 'whatsapp',
        whatsapp_provider: 'wasender',
        $or: [
          { wasender_session_token_hash: tokenHash },
          { wasender_session_id: sessionId },
        ],
      });
    }
    if (!config) {
      const candidates = await BotConfig.find({
        channel: 'whatsapp',
        whatsapp_provider: 'wasender',
        status: 'active',
      }).limit(2);
      if (candidates.length === 1) {
        config = candidates[0];
      } else if (candidates.length > 1) {
        capture({ at: new Date().toISOString(), event, sessionId: sessionId || undefined, signatureMatched: true, processed: 'error', reason: 'route legacy + plusieurs bots wasender actifs (utiliser la route /webhook/wasender/{id})', payload });
        logger.warn({ count: candidates.length }, '[wasender] route legacy avec plusieurs bots — ignoré');
        return;
      }
    }
    if (!config) {
      capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'error', reason: 'aucun BotConfig pour ce session_id', payload });
      logger.warn({ sessionId }, '[wasender] aucun BotConfig pour ce session_id — ignoré');
      return;
    }
    if (config.status !== 'active') {
      capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'ignored', reason: `bot status=${config.status}`, payload });
      logger.warn({ sessionId, status: config.status }, '[wasender] bot non actif — ignoré');
      return;
    }
    if (config.conversations_used_this_month >= config.conversations_limit) {
      capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'ignored', reason: 'quota atteint', payload });
      logger.info({ sessionId }, '[wasender] quota atteint — message ignoré');
      return;
    }

    const norm = normalizeMessage(payload);
    if (norm.fromMe) {
      capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'ignored', reason: 'fromMe (echo)', payload });
      logger.info('[wasender] message fromMe (echo) — ignoré');
      return;
    }
    if (!norm.fromJid) {
      capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'unsupported', reason: 'fromJid absent', payload });
      logger.warn({ event }, '[wasender] message sans fromJid — ignoré');
      return;
    }
    if (norm.kind === 'unsupported') {
      capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'unsupported', reason: 'kind=unsupported (ajuster normalizeMessage)', payload });
      logger.warn({ event, sample: JSON.stringify(payload).slice(0, 500) }, '[wasender] message kind=unsupported — ajuster normalizeMessage');
      return;
    }

    // Idempotence stricte par id message Wasender.
    if (norm.messageId && (await Message.exists({ messenger_message_id: norm.messageId }))) {
      capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'ignored', reason: 'duplicate messageId', payload });
      return;
    }

    // Dedup fuzzy : si plusieurs events (messages.received + messages.upsert
    // + messages-personal.received) sont souscrits côté Wasender pour la même
    // session, ils arrivent avec des messageId potentiellement différents pour
    // le même message client. On ignore donc tout message du même expéditeur
    // avec le même contenu reçu dans les 30 dernières secondes.
    const text = norm.kind === 'text' ? (norm.text || '') : `[${norm.kind}]${norm.caption ? ' ' + norm.caption : ''}`;
    if (text) {
      const fuzzyDupe = await Message.exists({
        vendor_id: config.vendor_id,
        sender: 'customer',
        content: text,
        timestamp: { $gte: new Date(Date.now() - 30_000) },
      });
      if (fuzzyDupe) {
        capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'ignored', reason: 'fuzzy duplicate (30s window)', payload });
        logger.info({ event, text: text.slice(0, 40) }, '[wasender] message dupliqué (fenêtre 30s) — ignoré');
        return;
      }
    }

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
    capture({ at: new Date().toISOString(), event, sessionId, signatureMatched: true, processed: 'enqueued', reason: norm.kind, payload });
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
    capture({ at: new Date().toISOString(), event, sessionId: sessionIdEarly, signatureMatched: true, processed: 'error', reason: (err as Error).message, payload });
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
  const tokenHash = hashWasenderToken(sessionId);
  await BotConfig.updateOne(
    {
      channel: 'whatsapp',
      whatsapp_provider: 'wasender',
      $or: [
        { wasender_session_token_hash: tokenHash },
        { wasender_session_id: sessionId },
      ],
    },
    { $set: { status: next } },
  );
}
