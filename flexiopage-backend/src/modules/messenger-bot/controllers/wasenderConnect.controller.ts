/**
 * Connexion WhatsApp via WasenderAPI (alternative à WhatsApp Cloud API Meta).
 *
 * Flow vendeur :
 *   1. POST /wasender/connect  → vendeur colle son PAT Wasender → crée la
 *      session côté Wasender (avec webhook_url pointant vers notre /webhook/
 *      wasender) → stocke session_id + api_token (chiffré) dans BotConfig.
 *   2. GET  /wasender/qr       → renvoie le QR à scanner.
 *   3. GET  /wasender/status   → poll : 'need_scan' | 'connected' | …
 *   4. POST /wasender/disconnect → logout + bascule status=disconnected.
 *
 * Le PAT et le session token ne sont JAMAIS renvoyés au client.
 */
import type { Response } from 'express';
import crypto from 'crypto';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../lib/logger';
import { BotConfig } from '../models/BotConfig.model';
import { encryptionService } from '../services/encryption.service';
import { wasenderService, WasenderApiError } from '../services/wasender.service';
import { getOwnedStoreId } from '../utils/vendorAuth';
import { connectWasenderSchema } from '../schemas/config.schema';

function publicWebhookUrl(): string {
  const base = (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 5050}`).replace(/\/$/, '');
  return `${base}/webhook/wasender`;
}

/** Lit (ou génère + stocke) un secret de webhook par boutique. */
function ensureWebhookSecret(): string {
  // Secret partagé global : Wasender ne signe pas tous ses webhooks de façon
  // cohérente, on s'en sert comme "shared secret" propagé en header / query.
  const env = process.env.WASENDER_WEBHOOK_SECRET;
  if (env) return env;
  // Génère un secret en mémoire au boot — recommandé : définir l'env en prod.
  return crypto.randomBytes(24).toString('hex');
}

export async function connectWasender(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const parsed = connectWasenderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation échouée', details: parsed.error.flatten() }); return; }
  const { personalAccessToken, sessionName, phoneNumber } = parsed.data;

  const webhookSecret = ensureWebhookSecret();
  try {
    const session = await wasenderService.createSession({
      pat: personalAccessToken,
      name: sessionName || `FlexioPage ${String(storeId).slice(-6)}`,
      phoneNumber,
      webhookUrl: publicWebhookUrl(),
      webhookSecret,
    });

    if (!session.id) {
      res.status(502).json({ error: 'Réponse Wasender invalide (session_id absent).' });
      return;
    }

    // Une session Wasender ne peut être reliée qu'à une seule boutique.
    const clash = await BotConfig.findOne({ wasender_session_id: session.id, vendor_id: { $ne: storeId } }).lean();
    if (clash) {
      res.status(409).json({ error: 'Cette session Wasender est déjà reliée à une autre boutique.' });
      return;
    }

    const config = await BotConfig.findOneAndUpdate(
      { vendor_id: storeId, channel: 'whatsapp' },
      {
        $set: {
          vendor_id: storeId,
          channel: 'whatsapp',
          whatsapp_provider: 'wasender',
          wasender_session_id: session.id,
          wasender_session_token_encrypted: session.apiToken ? encryptionService.encrypt(session.apiToken) : undefined,
          // page_access_token_encrypted = PAT Wasender (sert à gérer la session).
          page_access_token_encrypted: encryptionService.encrypt(personalAccessToken),
          whatsapp_display_number: session.phoneNumber || phoneNumber,
          page_name: session.phoneNumber ? `WhatsApp ${session.phoneNumber}` : 'WhatsApp (Wasender)',
          status: session.status === 'connected' ? 'active' : 'paused',
        },
        // Évite que setDefaultsOnInsert ne ressuscite un facebook_page_id null.
        $unset: { facebook_page_id: '', whatsapp_phone_number_id: '' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({
      connected: true,
      sessionId: config.wasender_session_id,
      status: session.status,
      provider: 'wasender' as const,
    });
  } catch (err) {
    if (err instanceof WasenderApiError) {
      const msg = err.isAuthError
        ? 'Personal Access Token invalide ou expiré.'
        : `Échec de création de session Wasender (${err.status || 'réseau'}).`;
      res.status(err.isAuthError ? 401 : 502).json({ error: msg });
      return;
    }
    logger.error({ err: (err as Error).message }, '[wasender] connect échec');
    res.status(500).json({ error: 'Erreur interne.' });
  }
}

/** Renvoie le QR à scanner pour la session en cours. */
export async function getWasenderQr(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config || !config.wasender_session_id) { res.status(404).json({ error: 'Aucune session Wasender.' }); return; }
  try {
    const pat = encryptionService.decrypt(config.page_access_token_encrypted);
    const out = await wasenderService.getQrCode({ pat, sessionId: config.wasender_session_id });
    res.json({ qr: out.qr, status: out.status });
  } catch (err) {
    if (err instanceof WasenderApiError) {
      res.status(err.isAuthError ? 401 : 502).json({ error: err.message });
      return;
    }
    logger.error({ err: (err as Error).message }, '[wasender] qr échec');
    res.status(500).json({ error: 'Erreur interne.' });
  }
}

/**
 * Statut de la session (poll côté frontend pendant le scan QR). Si la session
 * passe 'connected' et qu'on n'a pas encore son api_token, on re-fetch la
 * session pour le récupérer et on persiste status='active'.
 */
export async function getWasenderStatus(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config || !config.wasender_session_id) { res.status(404).json({ error: 'Aucune session Wasender.' }); return; }
  try {
    const pat = encryptionService.decrypt(config.page_access_token_encrypted);
    const session = await wasenderService.getSessionStatus({ pat, sessionId: config.wasender_session_id });

    // Si on passe à connected et qu'on n'avait pas le session token, on le stocke.
    const updates: Record<string, unknown> = {};
    if (session.status === 'connected') updates.status = 'active';
    if (session.status === 'disconnected') updates.status = 'disconnected';
    if (session.apiToken && !config.wasender_session_token_encrypted) {
      updates.wasender_session_token_encrypted = encryptionService.encrypt(session.apiToken);
    }
    if (session.phoneNumber && !config.whatsapp_display_number) {
      updates.whatsapp_display_number = session.phoneNumber;
    }
    if (Object.keys(updates).length) {
      await BotConfig.updateOne({ _id: config._id }, { $set: updates });
    }

    res.json({ status: session.status, phoneNumber: session.phoneNumber });
  } catch (err) {
    if (err instanceof WasenderApiError) {
      res.status(err.isAuthError ? 401 : 502).json({ error: err.message });
      return;
    }
    logger.error({ err: (err as Error).message }, '[wasender] status échec');
    res.status(500).json({ error: 'Erreur interne.' });
  }
}

export async function disconnectWasender(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config) { res.status(404).json({ error: 'Aucune session Wasender.' }); return; }
  try {
    if (config.wasender_session_id) {
      const pat = encryptionService.decrypt(config.page_access_token_encrypted);
      try {
        await wasenderService.disconnectSession({ pat, sessionId: config.wasender_session_id });
      } catch (err) {
        // Best-effort : on bascule en disconnected même si l'API distante échoue.
        logger.warn({ err: (err as Error).message }, '[wasender] disconnect API échec — on bascule local quand même');
      }
    }
    config.status = 'disconnected';
    await config.save();
    res.json({ disconnected: true });
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[wasender] disconnect échec');
    res.status(500).json({ error: 'Erreur interne.' });
  }
}
