/**
 * Webhook WhatsApp Cloud API (Meta).
 *
 *   GET  /webhook/whatsapp  → challenge de vérification.
 *   POST /webhook/whatsapp  → réception des messages.
 *
 * Mêmes garanties que le webhook Messenger : signature X-Hub-Signature-256
 * vérifiée sur le rawBody, identification du vendeur (par phone_number_id),
 * quota de plan, persistance, enqueue, réponse 200 immédiate. Le worker partagé
 * détecte le canal via la config et répond via la Cloud API.
 */
import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { validateMetaSignature } from '../utils/signatureValidator';
import { BotConfig } from '../models/BotConfig.model';
import { Conversation } from '../models/Conversation.model';
import { Message } from '../models/Message.model';
import { messageQueue } from '../services/queue.service';

type RawRequest = Request & { rawBody?: Buffer };

export function verifyWhatsAppWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || process.env.MESSENGER_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === expected) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }
  res.sendStatus(403);
}

interface WaMessage { from?: string; id?: string; type?: string; text?: { body?: string } }
interface WaValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WaMessage[];
}
interface WaChange { field?: string; value?: WaValue }
interface WaEntry { id?: string; changes?: WaChange[] }

export async function receiveWhatsAppWebhook(req: Request, res: Response): Promise<void> {
  const raw = (req as RawRequest).rawBody;
  const ok = validateMetaSignature(
    raw ?? JSON.stringify(req.body ?? {}),
    req.header('x-hub-signature-256'),
    process.env.FACEBOOK_APP_SECRET,
  );
  if (!ok) {
    logger.warn('[whatsapp-bot] webhook signature invalide — rejet');
    res.sendStatus(401);
    return;
  }

  const body = req.body as { object?: string; entry?: WaEntry[] };
  if (body.object !== 'whatsapp_business_account') {
    res.sendStatus(404);
    return;
  }

  res.status(200).send('EVENT_RECEIVED');

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const config = await BotConfig.findOne({ whatsapp_phone_number_id: phoneNumberId, channel: 'whatsapp' });
        if (!config || config.status !== 'active') continue;
        if (config.conversations_used_this_month >= config.conversations_limit) {
          logger.info({ phoneNumberId }, '[whatsapp-bot] quota atteint — message ignoré');
          continue;
        }

        const contactName = value.contacts?.[0]?.profile?.name;
        for (const m of value.messages || []) {
          const waId = m.from;
          const text = m.text?.body;
          if (!waId || !text) continue; // (médias non gérés pour l'instant)

          let conv = await Conversation.findOne({
            vendor_id: config.vendor_id,
            channel: 'whatsapp',
            customer_psid: waId,
            status: { $in: ['active', 'human_takeover'] },
          });
          const isNew = !conv;
          if (!conv) {
            conv = await Conversation.create({
              vendor_id: config.vendor_id,
              bot_config_id: config._id,
              channel: 'whatsapp',
              customer_psid: waId,
              customer_name: contactName,
              status: 'active',
            });
          }

          await Message.create({
            conversation_id: conv._id,
            vendor_id: config.vendor_id,
            sender: 'customer',
            content: text,
            messenger_message_id: m.id,
          });
          conv.message_count += 1;
          conv.last_message_at = new Date();
          if (contactName && !conv.customer_name) conv.customer_name = contactName;
          await conv.save();

          if (isNew) {
            await BotConfig.updateOne({ _id: config._id }, { $inc: { total_conversations: 1, conversations_used_this_month: 1 } });
          }
          if (conv.status === 'human_takeover') continue;

          await messageQueue.enqueue({
            botConfigId: String(config._id),
            conversationId: String(conv._id),
            vendorId: String(config.vendor_id),
            pageId: phoneNumberId,
            customerPsid: waId,
            text,
            messengerMessageId: m.id,
          });
        }
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[whatsapp-bot] traitement webhook échec');
  }
}
