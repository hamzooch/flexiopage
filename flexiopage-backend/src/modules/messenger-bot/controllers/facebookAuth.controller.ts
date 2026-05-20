/**
 * OAuth Facebook + connexion d'une page Messenger.
 *
 * Flux :
 *   1. GET  /facebook/auth-url     → URL du dialogue OAuth (le front redirige).
 *   2. POST /facebook/callback     → { code } → user token → liste des pages.
 *   3. POST /facebook/connect      → { pageId, pageAccessToken } → BotConfig
 *      (token chiffré) + abonnement de la page au webhook de l'app.
 *   4. POST /facebook/disconnect   → status=disconnected (+ désabonnement).
 *
 * Les tokens utilisateur ne sont JAMAIS persistés ; seul le token de page l'est,
 * chiffré. Aucun secret n'est loggé.
 */
import type { Response } from 'express';
import axios from 'axios';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../lib/logger';
import { GRAPH_API_BASE } from '../config/messengerBot.config';
import { BotConfig } from '../models/BotConfig.model';
import { encryptionService } from '../services/encryption.service';
import { getOwnedStoreId } from '../utils/vendorAuth';
import { connectPageSchema } from '../schemas/config.schema';

const SCOPES = 'pages_show_list,pages_messaging,pages_manage_metadata';

function redirectUri(): string {
  if (process.env.FACEBOOK_REDIRECT_URI) return process.env.FACEBOOK_REDIRECT_URI;
  const front = (process.env.FRONTEND_URL || 'http://localhost:3002').split(',')[0].trim().replace(/\/$/, '');
  return `${front}/dashboard/apps/messenger-bot`;
}

export async function getAuthUrl(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) { res.status(500).json({ error: 'FACEBOOK_APP_ID non configuré.' }); return; }

  const url =
    `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri())}` +
    `&state=${encodeURIComponent(storeId)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&response_type=code`;
  res.json({ url, redirectUri: redirectUri() });
}

interface FbPage { id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }

export async function oauthCallback(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const code = String((req.body as { code?: string }).code || '');
  if (!code) { res.status(400).json({ error: 'code requis' }); return; }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) { res.status(500).json({ error: 'FACEBOOK_APP_ID/SECRET non configurés.' }); return; }

  try {
    // 1. code → user access token
    const tokenRes = await axios.get(`${GRAPH_API_BASE}/oauth/access_token`, {
      params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri(), code },
      timeout: 10_000,
    });
    const userToken = (tokenRes.data as { access_token?: string }).access_token;
    if (!userToken) { res.status(502).json({ error: 'Échec de l’échange du code.' }); return; }

    // 2. pages gérées par l'utilisateur
    const pagesRes = await axios.get(`${GRAPH_API_BASE}/me/accounts`, {
      params: { fields: 'id,name,access_token,picture', access_token: userToken },
      timeout: 10_000,
    });
    const pages = ((pagesRes.data as { data?: FbPage[] }).data || []).map((p) => ({
      id: p.id,
      name: p.name,
      access_token: p.access_token, // transitoire, le front le renvoie à /connect
      picture_url: p.picture?.data?.url,
    }));
    res.json({ pages });
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[messenger-bot] oauthCallback échec');
    res.status(502).json({ error: 'Échec OAuth Facebook.' });
  }
}

export async function listPages(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const userToken = String(req.query.userToken || '');
  if (!userToken) { res.status(400).json({ error: 'userToken requis (passe par /facebook/callback).' }); return; }
  try {
    const pagesRes = await axios.get(`${GRAPH_API_BASE}/me/accounts`, {
      params: { fields: 'id,name,access_token,picture', access_token: userToken },
      timeout: 10_000,
    });
    const pages = ((pagesRes.data as { data?: FbPage[] }).data || []).map((p) => ({
      id: p.id, name: p.name, access_token: p.access_token, picture_url: p.picture?.data?.url,
    }));
    res.json({ pages });
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[messenger-bot] listPages échec');
    res.status(502).json({ error: 'Impossible de lister les pages.' });
  }
}

export async function connectPage(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const parsed = connectPageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation échouée', details: parsed.error.flatten() }); return; }
  const { pageId, pageAccessToken, pageName, pagePictureUrl } = parsed.data;

  // Une page ne peut être reliée qu'à une seule boutique.
  const clash = await BotConfig.findOne({ facebook_page_id: pageId, vendor_id: { $ne: storeId } }).lean();
  if (clash) { res.status(409).json({ error: 'Cette page Facebook est déjà connectée à une autre boutique.' }); return; }

  // Abonne la page au webhook de l'app (best-effort mais on remonte l'échec).
  try {
    await axios.post(`${GRAPH_API_BASE}/${pageId}/subscribed_apps`, null, {
      params: { subscribed_fields: 'messages,messaging_postbacks,messaging_optins', access_token: pageAccessToken },
      timeout: 10_000,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[messenger-bot] subscribe page échec');
    res.status(502).json({ error: 'Impossible d’abonner la page au webhook (vérifie les permissions).' });
    return;
  }

  const config = await BotConfig.findOneAndUpdate(
    { vendor_id: storeId, channel: 'messenger' },
    {
      $set: {
        vendor_id: storeId,
        channel: 'messenger',
        facebook_page_id: pageId,
        page_access_token_encrypted: encryptionService.encrypt(pageAccessToken),
        page_name: pageName,
        page_picture_url: pagePictureUrl,
        status: 'active',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json({ connected: true, pageId: config.facebook_page_id, pageName: config.page_name });
}

export async function disconnect(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: 'messenger' });
  if (!config) { res.status(404).json({ error: 'Aucune page connectée.' }); return; }

  // Désabonnement best-effort.
  try {
    const token = encryptionService.decrypt(config.page_access_token_encrypted);
    await axios.delete(`${GRAPH_API_BASE}/${config.facebook_page_id}/subscribed_apps`, {
      params: { access_token: token }, timeout: 10_000,
    });
  } catch {
    // peu importe : on déconnecte côté Flexiopage de toute façon
  }
  config.status = 'disconnected';
  await config.save();
  res.json({ disconnected: true });
}
