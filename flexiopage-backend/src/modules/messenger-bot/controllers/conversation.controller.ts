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
import { encryptionService } from '../services/encryption.service';

export async function listConversations(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const filter: Record<string, unknown> = { vendor_id: storeId, channel: getChannel(req) };
  if (req.query.status) filter.status = String(req.query.status);

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
    const token = encryptionService.decrypt(config.page_access_token_encrypted);
    // Route selon le canal de la config (même logique que le worker).
    if (config.channel === 'whatsapp') {
      await whatsappService.sendText({
        phoneNumberId: config.whatsapp_phone_number_id || '',
        accessToken: token,
        to: conv.customer_psid,
        message: parsed.data.message,
      });
    } else {
      await messengerService.sendMessage({ pageAccessToken: token, recipientPsid: conv.customer_psid, message: parsed.data.message });
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, channel: config.channel }, '[messenger-bot] envoi manuel échec');
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
