/**
 * Connexion WhatsApp par token manuel (WhatsApp Cloud API).
 * Le vendeur colle son phone_number_id + un token d'accès (depuis Meta →
 * WhatsApp → Configuration de l'API). On valide le token via un appel léger,
 * puis on crée/maj la BotConfig (canal whatsapp, token chiffré).
 */
import type { Response } from 'express';
import axios from 'axios';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../lib/logger';
import { GRAPH_API_BASE } from '../config/messengerBot.config';
import { BotConfig } from '../models/BotConfig.model';
import { encryptionService } from '../services/encryption.service';
import { getOwnedStoreId } from '../utils/vendorAuth';
import { connectWhatsAppSchema } from '../schemas/config.schema';

export async function connectWhatsApp(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const parsed = connectWhatsAppSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation échouée', details: parsed.error.flatten() }); return; }
  const { phoneNumberId, accessToken, wabaId, displayNumber } = parsed.data;

  // Une ligne WhatsApp ne peut être reliée qu'à une seule boutique.
  const clash = await BotConfig.findOne({ whatsapp_phone_number_id: phoneNumberId, vendor_id: { $ne: storeId } }).lean();
  if (clash) { res.status(409).json({ error: 'Ce numéro WhatsApp est déjà connecté à une autre boutique.' }); return; }

  // Validation du token : on lit les infos du numéro.
  let display = displayNumber;
  try {
    const r = await axios.get(`${GRAPH_API_BASE}/${phoneNumberId}`, {
      params: { fields: 'display_phone_number,verified_name', access_token: accessToken },
      timeout: 10_000,
    });
    display = display || (r.data as { display_phone_number?: string }).display_phone_number;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[whatsapp-bot] validation token échec');
    res.status(400).json({ error: 'Token ou phone_number_id invalide (vérifie les permissions WhatsApp).' });
    return;
  }

  try {
    const config = await BotConfig.findOneAndUpdate(
      { vendor_id: storeId, channel: 'whatsapp' },
      {
        $set: {
          vendor_id: storeId,
          channel: 'whatsapp',
          whatsapp_phone_number_id: phoneNumberId,
          whatsapp_business_account_id: wabaId,
          whatsapp_display_number: display,
          page_access_token_encrypted: encryptionService.encrypt(accessToken),
          page_name: display ? `WhatsApp ${display}` : 'WhatsApp',
          status: 'active',
        },
        // Évite que setDefaultsOnInsert ne laisse traîner des null sur le
        // champ Messenger qui pourraient ressusciter une collision d'index
        // si les anciens index unique non-partiels n'ont pas été migrés.
        $unset: { facebook_page_id: '' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ connected: true, phoneNumberId: config.whatsapp_phone_number_id, displayNumber: config.whatsapp_display_number });
  } catch (err) {
    const e = err as { code?: number; keyPattern?: Record<string, number> };
    if (e?.code === 11000) {
      logger.warn({ err, storeId, phoneNumberId }, '[whatsapp-bot] dup key — index à migrer ?');
      res.status(409).json({ error: 'Conflit d\'unicité côté base. Réessaie ou contacte le support.' });
      return;
    }
    throw err;
  }
}

export async function disconnectWhatsApp(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp' });
  if (!config) { res.status(404).json({ error: 'Aucun WhatsApp connecté.' }); return; }
  config.status = 'disconnected';
  await config.save();
  res.json({ disconnected: true });
}
