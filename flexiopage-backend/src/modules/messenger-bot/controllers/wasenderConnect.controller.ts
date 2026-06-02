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

/**
 * URL publique du webhook Wasender. Wasender REJETTE les URLs locales
 * (`localhost`, `127.0.0.1`, `*.local`, IPs privées) — on doit donc avoir un
 * `API_PUBLIC_URL` qui pointe vers internet (ngrok, cloudflared, ou prod).
 * Retourne null si l'URL n'est pas publique → le controller renverra une
 * 400 explicative.
 */
function publicWebhookUrl(): string | null {
  const raw = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
  if (!raw) return null;
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\.local(\b|:)|^https?:\/\/(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./i.test(raw)) {
    return null;
  }
  return `${raw}/webhook/wasender`;
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
  const { personalAccessToken, sessionName, phoneNumber, accountProtection } = parsed.data;

  // Wasender exige une URL webhook PUBLIQUE — on garde-fou côté backend pour
  // éviter un 422 cryptique. En dev local : lance `ngrok http 5050` (ou
  // `cloudflared tunnel --url http://localhost:5050`) et mets l'URL HTTPS
  // résultante dans `API_PUBLIC_URL` de ton .env.
  const webhookUrl = publicWebhookUrl();
  if (!webhookUrl) {
    res.status(400).json({
      error:
        'API_PUBLIC_URL doit pointer vers une URL HTTPS publique (Wasender refuse localhost). ' +
        'En dev : `ngrok http 5050` puis API_PUBLIC_URL=https://xxxx.ngrok.app dans flexiopage-backend/.env',
    });
    return;
  }

  const webhookSecret = ensureWebhookSecret();
  try {
    let session;
    try {
      session = await wasenderService.createSession({
        pat: personalAccessToken,
        name: sessionName || `FlexioPage ${String(storeId).slice(-6)}`,
        phoneNumber,
        webhookUrl,
        webhookSecret,
        accountProtection,
      });
    } catch (err) {
      // "The phone number has already been taken" : une session existe déjà
      // côté Wasender (tentative précédente). On la retrouve via listSessions
      // et on la ré-attache à cette boutique au lieu de demander au vendeur
      // d'aller supprimer la session dans le dashboard Wasender.
      const isTaken = err instanceof WasenderApiError && /phone[_ ]?number.*taken|already.*taken/i.test(err.message);
      if (!isTaken) throw err;
      const existing = await wasenderService.listSessions({ pat: personalAccessToken });
      const normalized = phoneNumber.replace(/[^\d]/g, '');
      session = existing.find((s) => (s.phoneNumber || '').replace(/[^\d]/g, '') === normalized);
      if (!session || !session.id) throw err;
    }

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
        // Nettoie les champs des autres providers (cas du switch Meta → Wasender).
        $unset: {
          facebook_page_id: '',
          whatsapp_phone_number_id: '',
          whatsapp_business_account_id: '',
        },
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
      // Remonte directement le message Wasender (ex. "This endpoint requires a
      // valid personal access token — You can generate a new token in your
      // profile settings."). Bien plus utile qu'un message générique.
      const prefix = err.isAuthError ? 'Personal Access Token invalide' : 'Échec création session Wasender';
      res.status(err.isAuthError ? 401 : 502).json({ error: `${prefix} : ${err.message}` });
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
