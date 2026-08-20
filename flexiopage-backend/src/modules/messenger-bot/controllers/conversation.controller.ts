/**
 * Conversations & inbox (vendeur authentifié). Scopé par ?storeId=.
 */
import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../lib/logger';
import { Conversation } from '../models/Conversation.model';
import { Message } from '../models/Message.model';
import { BotConfig } from '../models/BotConfig.model';
import { getOwnedStoreId, getChannel } from '../utils/vendorAuth';
import { sendManualSchema } from '../schemas/config.schema';
import { messengerService } from '../services/messenger.service';
import { whatsappService } from '../services/whatsapp.service';
import { wasenderService } from '../services/wasender.service';
import { encryptionService } from '../services/encryption.service';

export async function listConversations(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const channel = getChannel(req);
  const filter: Record<string, unknown> = { vendor_id: storeId, channel };
  if (req.query.status) filter.status = String(req.query.status);

  // Filtre par bot_number courant : quand le vendeur a changé de numéro
  // WhatsApp (ou de page Facebook), l'inbox n'affiche que les conversations
  // reçues sur le numéro/page ACTUEL. Les anciennes conversations restent en
  // base (historiques accessibles par ID), mais ne polluent plus l'inbox.
  //
  // Rétrocompat : les conversations créées avant l'introduction du champ
  // `bot_number` (bot_number = null) sont incluses SI la config n'a jamais
  // eu de bot_number (nouvelle install). Sinon on filtre strict.
  const config = await BotConfig.findOne({ vendor_id: storeId, channel }).lean();
  const currentBotNumber = channel === 'whatsapp'
    ? config?.whatsapp_display_number
    : config?.facebook_page_id || config?.page_name;
  if (currentBotNumber) {
    filter.bot_number = currentBotNumber;
  }

  const [items, total] = await Promise.all([
    Conversation.find(filter).sort({ last_message_at: -1, created_at: -1 }).skip(skip).limit(limit).lean(),
    Conversation.countDocuments(filter),
  ]);
  res.json({ conversations: items, total, limit, skip });
}

export async function getConversation(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }

  const conv = await Conversation.findOne({ _id: req.params.id, vendor_id: storeId }).lean();
  if (!conv) { res.status(404).json({ error: 'Conversation introuvable.' }); return; }
  const messages = await Message.find({ conversation_id: conv._id }).sort({ timestamp: 1 }).limit(500).lean();
  res.json({ conversation: conv, messages });
}

export async function takeover(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }

  const conv = await Conversation.findOneAndUpdate(
    { _id: req.params.id, vendor_id: storeId },
    { $set: { status: 'human_takeover' } },
    { new: true },
  ).lean();
  if (!conv) { res.status(404).json({ error: 'Conversation introuvable.' }); return; }
  res.json({ conversation: conv });
}

/**
 * Rebascule une conversation 'human_takeover' vers 'active' → le bot
 * reprend la main sur les prochains messages entrants. Utile quand le bot
 * a escaladé à tort (cas typique : il a confirmé une commande verbalement
 * en disant "un agent va te recontacter" au lieu d'appeler create_order).
 */
export async function releaseToBot(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const conv = await Conversation.findOneAndUpdate(
    { _id: req.params.id, vendor_id: storeId },
    { $set: { status: 'active' } },
    { new: true },
  ).lean();
  if (!conv) { res.status(404).json({ error: 'Conversation introuvable.' }); return; }
  res.json({ conversation: conv });
}

export async function sendManual(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }

  const parsed = sendManualSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'message requis' }); return; }

  const conv = await Conversation.findOne({ _id: req.params.id, vendor_id: storeId });
  if (!conv) { res.status(404).json({ error: 'Conversation introuvable.' }); return; }
  const config = await BotConfig.findById(conv.bot_config_id);
  if (!config) { res.status(404).json({ error: 'Config bot introuvable.' }); return; }

  try {
    // Route selon (canal, provider) — même logique que le worker.
    if (config.channel === 'whatsapp' && config.whatsapp_provider === 'wasender') {
      if (!config.wasender_session_token_encrypted) throw new Error('Wasender session token absent');
      const sessionToken = encryptionService.decrypt(config.wasender_session_token_encrypted);
      await wasenderService.sendText({ sessionToken, to: conv.customer_psid, message: parsed.data.message });
    } else if (config.channel === 'whatsapp') {
      if (!config.page_access_token_encrypted) throw new Error('WhatsApp access token absent');
      const token = encryptionService.decrypt(config.page_access_token_encrypted);
      await whatsappService.sendText({
        phoneNumberId: config.whatsapp_phone_number_id || '',
        accessToken: token,
        to: conv.customer_psid,
        message: parsed.data.message,
      });
    } else {
      if (!config.page_access_token_encrypted) throw new Error('Messenger page access token absent');
      const token = encryptionService.decrypt(config.page_access_token_encrypted);
      await messengerService.sendMessage({ pageAccessToken: token, recipientPsid: conv.customer_psid, message: parsed.data.message });
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, channel: config.channel, provider: config.whatsapp_provider }, '[messenger-bot] envoi manuel échec');
    res.status(502).json({ error: 'Échec de l’envoi du message.' });
    return;
  }

  const msg = await Message.create({
    conversation_id: conv._id,
    vendor_id: storeId,
    sender: 'human',
    content: parsed.data.message,
  });
  conv.message_count += 1;
  conv.last_message_at = new Date();
  await conv.save();
  res.json({ message: msg });
}
