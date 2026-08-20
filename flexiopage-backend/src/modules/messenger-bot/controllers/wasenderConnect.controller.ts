/**
 * Connexion WhatsApp via WasenderAPI (alternative à WhatsApp Cloud API Meta).
 *
 * Flow vendeur :
 *   1. POST /wasender/connect  → vendeur colle son PAT Wasender → crée la
 *      session côté Wasender (avec webhook_url pointant vers notre /webhook/
 *      wasender) → stocke session_id + api_token (chiffré) dans BotConfig.
 *   2. GET  /wasender/qr       → renvoie le QR à scanner. Auto-répare si la
 *      session Wasender est en `disconnected` (appelle /connect avant retry).
 *   3. GET  /wasender/status   → poll : 'need_scan' | 'connected' | …
 *   4. POST /wasender/pause    → status='paused' (garde tout, réversible).
 *   5. POST /wasender/resume   → status='active' si session existe.
 *   6. POST /wasender/disconnect → DELETE session Wasender + wipe des
 *      credentials (PAT, session_id/token, webhook_id/secret). Garde la
 *      config bot (langue, messages, shipping). Utilisé pour "Changer de
 *      numéro" ou "Déconnecter".
 *   7. DELETE /wasender        → supprime toute la BotConfig WhatsApp.
 *      Utilisé pour "Supprimer l'intégration" (retour onboarding vierge).
 *
 * Le PAT et le session token ne sont JAMAIS renvoyés au client.
 */
import type { Response } from 'express';
import crypto from 'crypto';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../lib/logger';
import { BotConfig } from '../models/BotConfig.model';
import { Conversation } from '../models/Conversation.model';
import { encryptionService } from '../services/encryption.service';
import { botConfigInsertDefaults } from '../services/botDefaults.service';
import { wasenderService, WasenderApiError, hashWasenderToken } from '../services/wasender.service';
import { getOwnedStoreId } from '../utils/vendorAuth';
import { connectWasenderSchema } from '../schemas/config.schema';
import { getCapturedWebhooks } from './wasenderWebhook.controller';
import { getCapturedWorkerRuns } from '../workers/messageWorker';

/**
 * Base URL publique du backend (sans le suffixe webhook). Wasender REJETTE
 * les URLs locales — on a besoin d'un `API_PUBLIC_URL` qui pointe vers
 * internet (ngrok, cloudflared, ou prod). Retourne null si non publique.
 */
function publicApiBase(): string | null {
  const raw = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
  if (!raw) return null;
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\.local(\b|:)|^https?:\/\/(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./i.test(raw)) {
    return null;
  }
  return raw;
}

/** URL webhook personnalisée pour une session — chaque BotConfig a la sienne. */
function webhookUrlFor(webhookId: string): string | null {
  const base = publicApiBase();
  return base ? `${base}/webhook/wasender/${webhookId}` : null;
}

/**
 * Génère un secret webhook UNIQUE par session : Wasender stocke ce secret
 * côté leur serveur et l'envoie en clair dans `X-Webhook-Signature` à chaque
 * webhook. On stocke uniquement le SHA-256 côté BotConfig pour vérification.
 * Chaque vendeur a son propre secret → pas de partage entre boutiques.
 */
function generatePerSessionWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** ID public utilisé dans la route /webhook/wasender/{id} — hex 32 chars. */
function generateWebhookId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Regex de détection "phone number already taken" — Wasender renvoie ce
 * message quand une session existe déjà pour le même numéro (peu importe son
 * état). On l'utilise pour déclencher le fallback DELETE+retry.
 */
function isPhoneTakenError(err: unknown): boolean {
  return err instanceof WasenderApiError && /phone[_ ]?number.*taken|already.*taken/i.test(err.message);
}

/**
 * Détecte le message "Session does not need scanning" (état `disconnected`
 * côté Wasender). Utilisé pour déclencher un `connectSession` transparent
 * avant de re-demander le QR.
 */
function isNeedInitError(err: unknown): boolean {
  return err instanceof WasenderApiError && /does not need scanning|initialize the session|not.*active/i.test(err.message);
}

/**
 * Trouve puis supprime toute session Wasender existante pour ce numéro.
 * Best-effort : on ignore les erreurs (session déjà supprimée, etc). Utilisé
 * pour repartir d'un état propre quand `createSession` échoue avec
 * "phone number already taken".
 */
async function purgeExistingSessionsForPhone(args: { pat: string; phoneNumber: string }): Promise<number> {
  const normalized = args.phoneNumber.replace(/[^\d]/g, '');
  try {
    const list = await wasenderService.listSessions({ pat: args.pat });
    const matches = list.filter((s) => (s.phoneNumber || '').replace(/[^\d]/g, '') === normalized && s.id);
    for (const s of matches) {
      try {
        await wasenderService.deleteSession({ pat: args.pat, sessionId: s.id });
        logger.info({ sessionId: s.id, phone: normalized }, '[wasender] session existante supprimée avant recréation');
      } catch (err) {
        logger.warn({ err: (err as Error).message, sessionId: s.id }, '[wasender] deleteSession pré-recréation échec (ignoré)');
      }
    }
    return matches.length;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[wasender] listSessions pré-purge échec (ignoré)');
    return 0;
  }
}

export async function connectWasender(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const parsed = connectWasenderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation échouée', details: parsed.error.flatten() }); return; }
  const { personalAccessToken, sessionName, phoneNumber, accountProtection } = parsed.data;

  // On (re)trouve la BotConfig existante pour réutiliser son webhook_id si
  // déjà présent — sinon on en génère un nouveau. Idem pour le secret.
  const existing = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp' }).lean();
  const webhookId = existing?.wasender_webhook_id || generateWebhookId();
  const webhookUrl = webhookUrlFor(webhookId);
  if (!webhookUrl) {
    res.status(400).json({
      error:
        'API_PUBLIC_URL doit pointer vers une URL HTTPS publique (Wasender refuse localhost). ' +
        'En dev : `ngrok http 5051` puis API_PUBLIC_URL=https://xxxx.ngrok.app dans flexiopage-backend/.env',
    });
    return;
  }

  // Secret généré par bot (pas un secret partagé) → multi-vendeur isolé.
  const webhookSecret = generatePerSessionWebhookSecret();
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
      // "phone number already taken" : ancien flow rattachait la session
      // existante (recovery hack) mais ne pouvait pas synchroniser
      // webhook_url/secret → webhooks reçus mais rejetés en signature.
      // Nouveau flow : on SUPPRIME la (les) session(s) existante(s) sur ce
      // numéro puis on recrée proprement avec le bon webhook.
      if (!isPhoneTakenError(err)) throw err;
      const purged = await purgeExistingSessionsForPhone({ pat: personalAccessToken, phoneNumber });
      if (purged === 0) throw err;
      session = await wasenderService.createSession({
        pat: personalAccessToken,
        name: sessionName || `FlexioPage ${String(storeId).slice(-6)}`,
        phoneNumber,
        webhookUrl,
        webhookSecret,
        accountProtection,
      });
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

    const insertDefaults = await botConfigInsertDefaults();
    const config = await BotConfig.findOneAndUpdate(
      { vendor_id: storeId, channel: 'whatsapp' },
      {
        $set: {
          vendor_id: storeId,
          channel: 'whatsapp',
          whatsapp_provider: 'wasender',
          wasender_session_id: session.id,
          wasender_session_token_encrypted: session.apiToken ? encryptionService.encrypt(session.apiToken) : undefined,
          wasender_session_token_hash: session.apiToken ? hashWasenderToken(session.apiToken) : undefined,
          wasender_webhook_id: webhookId,
          wasender_webhook_secret_hash: hashWasenderToken(webhookSecret),
          // page_access_token_encrypted = PAT Wasender (sert à gérer la session).
          page_access_token_encrypted: encryptionService.encrypt(personalAccessToken),
          whatsapp_display_number: session.phoneNumber || phoneNumber,
          page_name: session.phoneNumber ? `WhatsApp ${session.phoneNumber}` : 'WhatsApp (Wasender)',
          status: session.status === 'connected' ? 'active' : 'paused',
        },
        $setOnInsert: insertDefaults,
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

/**
 * Renvoie le QR à scanner. Auto-répare le cas "Session does not need
 * scanning" (état disconnected) en appelant `connectSession` avant retry —
 * l'user n'a plus à aller cliquer "Connect" dans le dashboard Wasender.
 */
export async function getWasenderQr(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config || !config.wasender_session_id || !config.page_access_token_encrypted) {
    res.status(404).json({ error: 'Aucune session Wasender.' });
    return;
  }
  const pat = encryptionService.decrypt(config.page_access_token_encrypted);
  const sessionId = config.wasender_session_id;

  async function fetchQr() {
    return wasenderService.getQrCode({ pat, sessionId });
  }

  try {
    let out;
    try {
      out = await fetchQr();
    } catch (err) {
      // Auto-répare : session en `disconnected` côté Wasender → force un
      // /connect qui la remet en `need_scan`, puis re-fetch le QR.
      if (!isNeedInitError(err)) throw err;
      logger.info({ sessionId }, '[wasender] auto-connect avant re-fetch QR');
      await wasenderService.connectSession({ pat, sessionId });
      out = await fetchQr();
    }
    res.json({ qr: out.qr, status: out.status });
  } catch (err) {
    if (err instanceof WasenderApiError) {
      // 404 côté Wasender = session supprimée dans leur dashboard par l'user
      // → on wipe les credentials pour que l'UI retombe sur l'onboarding.
      if (err.status === 404) {
        await BotConfig.updateOne(
          { _id: config._id },
          {
            $set: { status: 'disconnected' },
            $unset: {
              wasender_session_id: '',
              wasender_session_token_encrypted: '',
              wasender_session_token_hash: '',
              wasender_webhook_id: '',
              wasender_webhook_secret_hash: '',
              page_access_token_encrypted: '',
              whatsapp_display_number: '',
              page_name: '',
            },
          },
        );
        res.status(410).json({ error: 'Session supprimée côté Wasender. Reconnecte le bot.' });
        return;
      }
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
  if (!config || !config.wasender_session_id || !config.page_access_token_encrypted) {
    res.status(404).json({ error: 'Aucune session Wasender.' });
    return;
  }
  try {
    const pat = encryptionService.decrypt(config.page_access_token_encrypted);
    const session = await wasenderService.getSessionStatus({ pat, sessionId: config.wasender_session_id });

    // Si on passe à connected et qu'on n'avait pas le session token, on le stocke.
    const updates: Record<string, unknown> = {};
    if (session.status === 'connected') updates.status = 'active';
    if (session.status === 'disconnected') updates.status = 'disconnected';
    // Si Wasender retourne un apiToken et qu'il a changé (rotation : session
    // restart / disconnect+reconnect côté Wasender génère un nouveau token),
    // on rafraîchit le token chiffré ET le hash. Sans ça, les webhooks
    // entrants matcheraient encore l'ancien hash → bot ne répond plus.
    if (session.apiToken) {
      const newHash = hashWasenderToken(session.apiToken);
      if (newHash !== config.wasender_session_token_hash) {
        updates.wasender_session_token_encrypted = encryptionService.encrypt(session.apiToken);
        updates.wasender_session_token_hash = newHash;
      }
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

/**
 * Renvoie les 10 derniers webhooks reçus côté backend, filtrés sur la session
 * du vendeur connecté. Permet de debugger en prod sans accès aux logs.
 */
export async function recentWasenderWebhooks(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  const sid = config?.wasender_session_id;
  const all = getCapturedWebhooks();
  // Inclut : événements sans session_id, ceux qui matchent notre session, ET
  // les events de test (sessionId placeholder "YOUR_API_KEY" du simulator
  // Wasender). Comme ça le simulator reste visible pendant le debug.
  const items = sid
    ? all.filter((w) => !w.sessionId || w.sessionId === sid || w.event === 'webhook.test' || w.sessionId === 'YOUR_API_KEY')
    : all;
  res.json({ items, total: items.length, sessionId: sid });
}

/**
 * Renvoie les 10 derniers traitements de messages côté worker, filtrés par
 * vendor du caller. Permet de voir si le bot a planté en cours de génération
 * (Claude/OpenRouter erreur, tool_use sans texte final, send échec, etc).
 */
export async function recentWorkerRuns(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const all = getCapturedWorkerRuns();
  const items = all.filter((r) => r.vendorId === storeId);
  res.json({ items, total: items.length });
}

/**
 * "Mettre en pause" — status='paused', tout est conservé (session Wasender,
 * PAT, config). Le bot arrête de répondre mais peut être réactivé en 1 clic
 * via /resume sans re-scanner de QR. Idéal pour vacances / coupure courte.
 */
export async function pauseWasender(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config) { res.status(404).json({ error: 'Aucune session Wasender.' }); return; }
  config.status = 'paused';
  await config.save();
  res.json({ paused: true });
}

/**
 * "Réparer le webhook" — pour les sessions Wasender déjà créées mais avec
 * webhook mal configuré (0 events subscribed, toggle enabled OFF…). Génère
 * un nouveau secret, met à jour la session côté Wasender (webhook_enabled=true
 * + webhook_events + webhook_url + webhook_secret) et rafraîchit le hash en
 * base. Idempotent — peut être appelé plusieurs fois sans casser.
 */
export async function syncWasenderWebhook(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config || !config.wasender_session_id || !config.page_access_token_encrypted) {
    res.status(404).json({ error: 'Aucune session Wasender à réparer.' });
    return;
  }
  const webhookId = config.wasender_webhook_id || generateWebhookId();
  const webhookUrl = webhookUrlFor(webhookId);
  if (!webhookUrl) {
    res.status(400).json({ error: 'API_PUBLIC_URL manquant / invalide côté backend.' });
    return;
  }
  const webhookSecret = generatePerSessionWebhookSecret();
  try {
    const pat = encryptionService.decrypt(config.page_access_token_encrypted);
    await wasenderService.updateSessionWebhook({
      pat,
      sessionId: config.wasender_session_id,
      webhookUrl,
      webhookSecret,
    });
    await BotConfig.updateOne(
      { _id: config._id },
      { $set: {
        wasender_webhook_id: webhookId,
        wasender_webhook_secret_hash: hashWasenderToken(webhookSecret),
      } },
    );
    res.json({ synced: true, webhookUrl });
  } catch (err) {
    if (err instanceof WasenderApiError) {
      res.status(err.isAuthError ? 401 : 502).json({ error: err.message });
      return;
    }
    logger.error({ err: (err as Error).message }, '[wasender] sync-webhook échec');
    res.status(500).json({ error: 'Erreur interne.' });
  }
}

/** "Réactiver" — inverse de pause. */
export async function resumeWasender(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config) { res.status(404).json({ error: 'Aucune session Wasender.' }); return; }
  if (!config.wasender_session_id) {
    res.status(400).json({ error: 'Aucune session à réactiver — reconnecte le bot.' });
    return;
  }
  config.status = 'active';
  await config.save();
  res.json({ resumed: true });
}

/**
 * "Déconnecter" / "Changer de numéro" — supprime la session côté Wasender
 * (best-effort) puis wipe les credentials en base. Garde la config bot
 * (langue, welcome_message, shipping…) pour que la reconnexion soit rapide.
 * L'UI retombe alors sur le WasenderConnectForm.
 */
export async function disconnectWasender(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config) { res.status(404).json({ error: 'Aucune session Wasender.' }); return; }
  // Best-effort : on tente de supprimer la session côté Wasender pour libérer
  // le numéro. Si ça échoue (déjà supprimée, PAT invalide…), on wipe quand
  // même la BotConfig localement — l'user attend une action irréversible.
  if (config.wasender_session_id && config.page_access_token_encrypted) {
    try {
      const pat = encryptionService.decrypt(config.page_access_token_encrypted);
      await wasenderService.deleteSession({ pat, sessionId: config.wasender_session_id });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[wasender] deleteSession échec (on wipe local quand même)');
    }
  }
  // Archive les conversations liées à l'ancien numéro : sans ça, l'inbox du
  // NOUVEAU numéro afficherait l'historique de l'ancien mélangé au nouveau
  // (bug de conception réglé par le champ bot_number).
  await archiveConversationsForOldNumber(storeId, config.whatsapp_display_number);
  await BotConfig.updateOne(
    { _id: config._id },
    {
      $set: { status: 'disconnected' },
      $unset: {
        wasender_session_id: '',
        wasender_session_token_encrypted: '',
        wasender_session_token_hash: '',
        wasender_webhook_id: '',
        wasender_webhook_secret_hash: '',
        page_access_token_encrypted: '',
        whatsapp_display_number: '',
        page_name: '',
      },
    },
  );
  res.json({ disconnected: true });
}

/**
 * Passe en `completed` toutes les conversations WhatsApp `active`/`human_takeover`
 * du vendeur qui étaient reçues sur l'ancien numéro. Best-effort — si la
 * requête échoue on continue quand même le disconnect.
 *
 * Rétrocompat : si `oldBotNumber` est undefined (conversation créée avant
 * l'introduction du champ), on archive AUSSI les conversations sans
 * bot_number — sinon elles resteraient orphelines dans l'inbox du nouveau
 * numéro (déjà filtré par bot_number côté listConversations).
 */
async function archiveConversationsForOldNumber(vendorId: string, oldBotNumber: string | undefined): Promise<void> {
  try {
    const filter: Record<string, unknown> = {
      vendor_id: vendorId,
      channel: 'whatsapp',
      status: { $in: ['active', 'human_takeover'] },
    };
    if (oldBotNumber) {
      filter.$or = [{ bot_number: oldBotNumber }, { bot_number: { $exists: false } }, { bot_number: null }];
    }
    const result = await Conversation.updateMany(filter, { $set: { status: 'completed' } });
    logger.info({ vendorId, oldBotNumber, archived: result.modifiedCount }, '[wasender] conversations anciennes archivées');
  } catch (err) {
    logger.warn({ err: (err as Error).message, vendorId }, '[wasender] archive conversations échec (ignoré)');
  }
}

/**
 * "Supprimer l'intégration" — DELETE Wasender session (best-effort) puis
 * supprime TOUTE la BotConfig WhatsApp (config incluse). L'UI retombe sur
 * l'écran ProviderPicker vierge, comme si le bot n'avait jamais existé.
 * Irréversible.
 */
export async function deleteWasenderIntegration(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'whatsapp', whatsapp_provider: 'wasender' });
  if (!config) { res.status(404).json({ error: 'Aucune session Wasender.' }); return; }
  if (config.wasender_session_id && config.page_access_token_encrypted) {
    try {
      const pat = encryptionService.decrypt(config.page_access_token_encrypted);
      await wasenderService.deleteSession({ pat, sessionId: config.wasender_session_id });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[wasender] deleteSession échec (on supprime la BotConfig quand même)');
    }
  }
  // Archive aussi ici : "supprimer l'intégration" = fresh start complet →
  // les conversations restent en base pour audit mais disparaissent de
  // l'inbox par défaut.
  await archiveConversationsForOldNumber(storeId, config.whatsapp_display_number);
  await BotConfig.deleteOne({ _id: config._id });
  res.json({ deleted: true });
}
