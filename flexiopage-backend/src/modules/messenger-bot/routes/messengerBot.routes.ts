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

// ── API vendeur (authentifiée) ───────────────────────────────────────
export const apiRouter = Router();
apiRouter.use(authMiddleware);

// Config
apiRouter.get('/config', botConfig.getConfig);
apiRouter.put('/config', botConfig.updateConfig);
apiRouter.post('/config/test', botConfig.testBot);

// OAuth Facebook
apiRouter.get('/facebook/auth-url', facebookAuth.getAuthUrl);
apiRouter.post('/facebook/callback', facebookAuth.oauthCallback);
apiRouter.post('/facebook/connect', facebookAuth.connectPage);
apiRouter.post('/facebook/disconnect', facebookAuth.disconnect);
apiRouter.get('/facebook/pages', facebookAuth.listPages);

// Conversations
apiRouter.get('/conversations', conversation.listConversations);
apiRouter.get('/conversations/:id', conversation.getConversation);
apiRouter.post('/conversations/:id/takeover', conversation.takeover);
apiRouter.post('/conversations/:id/send', conversation.sendManual);

// Stats
apiRouter.get('/stats/overview', stats.overview);
apiRouter.get('/stats/conversations', stats.conversationStats);
apiRouter.get('/stats/usage', stats.usageStats);

// ── Webhook Meta (public) ────────────────────────────────────────────
export const webhookRouter = Router();
webhookRouter.get('/', verifyWebhook);
webhookRouter.post('/', receiveWebhook);
