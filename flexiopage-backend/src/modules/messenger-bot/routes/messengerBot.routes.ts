/**
 * Routeurs du module Messenger Bot.
 *   - apiRouter   : routes vendeur (JWT) montées sous /api/messenger-bot
 *   - webhookRouter : webhook Meta public monté sous /webhook/messenger
 *                     (signature X-Hub-Signature-256 validée dans le controller)
 */
import { Router } from 'express';
import { authMiddleware } from '../../../middleware/auth.middleware';
import * as botConfig from '../controllers/botConfig.controller';
import * as conversation from '../controllers/conversation.controller';
import * as facebookAuth from '../controllers/facebookAuth.controller';
import * as stats from '../controllers/stats.controller';
import { verifyWebhook, receiveWebhook } from '../controllers/webhook.controller';
import { verifyWhatsAppWebhook, receiveWhatsAppWebhook } from '../controllers/whatsappWebhook.controller';
import { connectWhatsApp, disconnectWhatsApp } from '../controllers/whatsappConnect.controller';
import {
  connectWasender,
  disconnectWasender,
  getWasenderQr,
  getWasenderStatus,
  recentWasenderWebhooks,
  recentWorkerRuns,
} from '../controllers/wasenderConnect.controller';
import { receiveWasenderWebhook } from '../controllers/wasenderWebhook.controller';

// ── API vendeur (authentifiée) ───────────────────────────────────────
export const apiRouter = Router();
apiRouter.use(authMiddleware);

// Config
apiRouter.get('/config', botConfig.getConfig);
apiRouter.put('/config', botConfig.updateConfig);
apiRouter.post('/config/test', botConfig.testBot);

// OAuth Facebook (Messenger)
apiRouter.get('/facebook/auth-url', facebookAuth.getAuthUrl);
apiRouter.post('/facebook/callback', facebookAuth.oauthCallback);
apiRouter.post('/facebook/connect', facebookAuth.connectPage);
apiRouter.post('/facebook/disconnect', facebookAuth.disconnect);
apiRouter.get('/facebook/pages', facebookAuth.listPages);

// WhatsApp (connexion par token manuel — Meta Cloud API)
apiRouter.post('/whatsapp/connect', connectWhatsApp);
apiRouter.post('/whatsapp/disconnect', disconnectWhatsApp);

// WhatsApp via WasenderAPI (QR + session managée)
apiRouter.post('/wasender/connect', connectWasender);
apiRouter.get('/wasender/qr', getWasenderQr);
apiRouter.get('/wasender/status', getWasenderStatus);
apiRouter.post('/wasender/disconnect', disconnectWasender);
apiRouter.get('/wasender/recent-webhooks', recentWasenderWebhooks);
apiRouter.get('/wasender/recent-worker-runs', recentWorkerRuns);

// Conversations
apiRouter.get('/conversations', conversation.listConversations);
apiRouter.get('/conversations/:id', conversation.getConversation);
apiRouter.post('/conversations/:id/takeover', conversation.takeover);
apiRouter.post('/conversations/:id/release', conversation.releaseToBot);
apiRouter.post('/conversations/:id/send', conversation.sendManual);

// Stats
apiRouter.get('/stats/overview', stats.overview);
apiRouter.get('/stats/conversations', stats.conversationStats);
apiRouter.get('/stats/usage', stats.usageStats);

// ── Webhook Messenger (public) ───────────────────────────────────────
export const webhookRouter = Router();
webhookRouter.get('/', verifyWebhook);
webhookRouter.post('/', receiveWebhook);

// ── Webhook WhatsApp (public) ────────────────────────────────────────
export const whatsappWebhookRouter = Router();
whatsappWebhookRouter.get('/', verifyWhatsAppWebhook);
whatsappWebhookRouter.post('/', receiveWhatsAppWebhook);

// ── Webhook Wasender (public) ────────────────────────────────────────
// Route legacy `/webhook/wasender` (sans id) : single-tenant + secret via
// WASENDER_WEBHOOK_SECRET. Garde l'historique pour les sessions existantes.
// Route multi-vendeur `/webhook/wasender/:webhookId` : chaque session a son
// id dans l'URL → lookup direct, secret vérifié par hash en DB.
export const wasenderWebhookRouter = Router();
wasenderWebhookRouter.post('/', receiveWasenderWebhook);
wasenderWebhookRouter.post('/:webhookId', receiveWasenderWebhook);
