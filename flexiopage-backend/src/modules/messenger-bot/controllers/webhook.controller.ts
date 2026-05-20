/**
 * Webhook Messenger (Meta) — vérification + réception.
 *
 * GET  /webhook/messenger : challenge de vérification (hub.verify_token).
 * POST /webhook/messenger : réception des messages.
 *   1. Valide la signature X-Hub-Signature-256 sur le rawBody (sinon 401).
 *   2. Pour chaque message : identifie le vendeur via page_id, vérifie que le
 *      bot est actif et que le quota du plan n'est pas dépassé.
 *   3. Récupère/crée la conversation, persiste le message client.
 *   4. Met en file pour traitement async (Claude) et répond 200 immédiatement.
 */
import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { validateMetaSignature } from '../utils/signatureValidator';
import { BotConfig } from '../models/BotConfig.model';
import { Conversation } from '../models/Conversation.model';
import { Message } from '../models/Message.model';
import { messageQueue } from '../services/queue.service';

/** rawBody est injecté par le hook `verify` de express.json dans index.ts. */
type RawRequest = Request & { rawBody?: Buffer };

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.MESSENGER_VERIFY_TOKEN) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }
  res.sendStatus(403);
}

interface MetaMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; attachments?: Array<{ type?: string; payload?: { url?: string } }> };
}
interface MetaEntry {
  id?: string; // page id
  messaging?: MetaMessaging[];
}

export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  // 1. Signature.
  const raw = (req as RawRequest).rawBody;
  const ok = validateMetaSignature(
    raw ?? JSON.stringify(req.body ?? {}),
    req.header('x-hub-signature-256'),
    process.env.FACEBOOK_APP_SECRET,
  );
  if (!ok) {
    logger.warn('[messenger-bot] webhook signature invalide — rejet');
    res.sendStatus(401);
    return;
  }

  const body = req.body as { object?: string; entry?: MetaEntry[] };
  if (body.object !== 'page') {
    res.sendStatus(404);
    return;
  }

  // On répond 200 d'abord (Meta exige < ~20s) ; le traitement est best-effort.
  res.status(200).send('EVENT_RECEIVED');

  try {
    for (const entry of body.entry || []) {
      const pageId = entry.id;
      if (!pageId) continue;

      const config = await BotConfig.findOne({ facebook_page_id: pageId });
      if (!config || config.status !== 'active') continue;

      // Quota du plan (utilise le cache dénormalisé).
      if (config.conversations_used_this_month >= config.conversations_limit) {
        logger.info({ pageId }, '[messenger-bot] quota conversations atteint — message ignoré');
        continue;
      }

      for (const m of entry.messaging || []) {
        const psid = m.sender?.id;
        const text = m.message?.text;
        if (!psid || (!text && !m.message?.attachments?.length)) continue;

        // Conversation active existante, sinon création.
        let conv = await Conversation.findOne({
          vendor_id: config.vendor_id,
          channel: 'messenger',
          customer_psid: psid,
          status: { $in: ['active', 'human_takeover'] },
        });
        const isNew = !conv;
        if (!conv) {
          conv = await Conversation.create({
            vendor_id: config.vendor_id,
            bot_config_id: config._id,
            channel: 'messenger',
            customer_psid: psid,
            status: 'active',
          });
        }

        // Persiste le message client.
        await Message.create({
          conversation_id: conv._id,
          vendor_id: config.vendor_id,
          sender: 'customer',
          content: text || '[pièce jointe]',
          attachments: (m.message?.attachments || []).map((a) => ({ type: a.type || 'file', url: a.payload?.url || '' })),
          messenger_message_id: m.message?.mid,
        });
        conv.message_count += 1;
        conv.last_message_at = new Date();
        await conv.save();

        if (isNew) {
          await BotConfig.updateOne({ _id: config._id }, { $inc: { total_conversations: 1, conversations_used_this_month: 1 } });
        }

        // Si un humain a pris la main, on ne déclenche pas le bot.
        if (conv.status === 'human_takeover') continue;

        await messageQueue.enqueue({
          botConfigId: String(config._id),
          conversationId: String(conv._id),
          vendorId: String(config.vendor_id),
          pageId,
          customerPsid: psid,
          text: text || '',
          messengerMessageId: m.message?.mid,
        });
      }
    }
  } catch (err) {
    // La réponse 200 est déjà partie — on logge seulement.
    logger.error({ err: (err as Error).message }, '[messenger-bot] traitement webhook échec');
  }
}
