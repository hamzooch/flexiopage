/**
 * Worker de traitement d'un message entrant.
 *
 * Pipeline : charge le contexte (config, vendeur, catalogue, historique) →
 * construit le system prompt → appelle Claude avec les tools → exécute les
 * tools (create_order, get_shipping_fee, check_product_availability,
 * escalate_to_human) dans une boucle bornée → persiste la réponse + l'usage →
 * envoie la réponse via Messenger (sauf MESSENGER_DRY_RUN).
 *
 * Enregistré sur `messageQueue` via `registerMessageWorker()`. La version
 * BullMQ branchera ce même `processIncomingMessage` sur un worker Redis.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../../lib/logger';
import { Store } from '../../../models/Store.model';
import { BotConfig } from '../models/BotConfig.model';
import { BotUsage } from '../models/BotUsage.model';
import { Conversation } from '../models/Conversation.model';
import { Message } from '../models/Message.model';
import { claudeService, type ClaudeMessage } from '../services/claude.service';
import { catalogService } from '../services/catalog.service';
import { orderCreationService, type CreateOrderToolInput } from '../services/orderCreation.service';
import { messengerService } from '../services/messenger.service';
import { whatsappService } from '../services/whatsapp.service';
import { wasenderService, WasenderApiError } from '../services/wasender.service';
import { encryptionService } from '../services/encryption.service';
import { messageQueue, type IncomingMessageJob } from '../services/queue.service';
import { buildSystemPrompt } from '../prompts/systemPrompt';
import { detectDialect } from '../utils/languageDetector';
import { claudeTools } from '../tools/claudeTools';
import { HISTORY_WINDOW, VISION_SUPPORTED_MIME } from '../config/messengerBot.config';
import { mediaFallbackMessage, imagePromptHint } from '../utils/mediaFallback';
import { enforceMessageLimit } from '../services/botMetering.service';
import type { IBotConfig, BotLanguage } from '../models/BotConfig.model';
import { MetaApiError } from '../services/metaErrors';
import { sendEmail } from '../../../services/email.service';
import { User } from '../../../models/User.model';

const MAX_TOOL_ITERATIONS = 4;

/**
 * Buffer mémoire des N derniers traitements de messages — exposé via un
 * endpoint admin pour debug en prod quand on n'a pas accès aux logs.
 * RAZ au redémarrage. Capture le résultat (success/error) de chaque
 * processIncomingMessage, avec assez de détail pour identifier où ça casse.
 */
export interface CapturedWorkerRun {
  at: string;
  conversationId: string;
  vendorId: string;
  customerText: string;
  status: 'success' | 'error' | 'empty_reply';
  step: 'load_context' | 'claude_call' | 'tool_execution' | 'persist' | 'send' | 'complete';
  errorMessage?: string;
  modelUsed?: string;
  toolsUsed?: string[];
  replyPreview?: string;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
}
const WORKER_BUFFER_MAX = 10;
const capturedWorkerRuns: CapturedWorkerRun[] = [];
function captureRun(entry: CapturedWorkerRun): void {
  capturedWorkerRuns.unshift(entry);
  if (capturedWorkerRuns.length > WORKER_BUFFER_MAX) capturedWorkerRuns.length = WORKER_BUFFER_MAX;
}
export function getCapturedWorkerRuns(): CapturedWorkerRun[] {
  return capturedWorkerRuns;
}

function isDryRun(): boolean {
  return process.env.MESSENGER_DRY_RUN === '1' || process.env.MESSENGER_DRY_RUN === 'true';
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface ProcessResult {
  replyText: string;
  toolsUsed: string[];
  orderId?: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

export async function processIncomingMessage(job: IncomingMessageJob): Promise<ProcessResult> {
  const config = await BotConfig.findById(job.botConfigId);
  const conversation = await Conversation.findById(job.conversationId);
  if (!config || !conversation) {
    captureRun({
      at: new Date().toISOString(),
      conversationId: job.conversationId,
      vendorId: job.vendorId,
      customerText: (job.text || '').slice(0, 100),
      status: 'error',
      step: 'load_context',
      errorMessage: 'BotConfig ou Conversation introuvable',
    });
    throw new Error('BotConfig ou Conversation introuvable');
  }

  const vendor = await Store.findById(config.vendor_id).select('name ownerId').lean();
  const catalog = await catalogService.getCatalog(config);

  // Historique (fenêtre), du plus ancien au plus récent.
  const history = await Message.find({ conversation_id: conversation._id })
    .sort({ timestamp: -1 })
    .limit(HISTORY_WINDOW)
    .lean();
  history.reverse();

  const messages: ClaudeMessage[] = history.map((m) => ({
    role: m.sender === 'customer' ? 'user' : 'assistant',
    content: m.content,
  }));
  // Garde-fou : si l'historique est vide, injecte le message courant.
  if (!messages.length && job.text) messages.push({ role: 'user', content: job.text });

  // Auto-détection du dialecte du client : on agrège tout son texte (historique
  // + message courant) pour un signal stable, et on n'override la langue
  // configurée que si la détection est confiante. Sinon → langue de la boutique.
  const customerText = [
    ...history.filter((m) => m.sender === 'customer').map((m) => m.content),
    job.text || '',
  ].join(' ');
  const detectedLanguage = detectDialect(customerText) ?? undefined;
  const systemPrompt = buildSystemPrompt({ botConfig: config, vendor: vendor || {}, catalog, detectedLanguage });

  const toolsUsed: string[] = [];
  let createdOrderId: string | undefined;
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let lastModel = '';
  let replyText = '';

  // ── Metering : limite de messages + facturation au dépassement ───────
  // AVANT tout traitement (Claude ou repli média). Jusqu'à `messages_limit` =
  // inclus ; au-delà, chaque message est prélevé du solde IA (tokens) et le
  // vendeur est notifié. Si le solde IA est épuisé → on ne répond pas (message
  // non compté), le vendeur est notifié pour recharger.
  if (vendor?.ownerId) {
    // Fail-open absolu : toute erreur du metering NE DOIT JAMAIS empêcher le bot
    // de répondre (un bug de facturation ne coupe pas un bot en prod).
    try {
      const period = currentPeriod();
      const usage = await BotUsage.findOne({ vendor_id: config.vendor_id, period })
        .select('messages_count')
        .lean();
      const meter = await enforceMessageLimit({
        config,
        storeOwnerId: String(vendor.ownerId),
        storeId: String(config.vendor_id),
        period,
        usedBefore: usage?.messages_count || 0,
      });
      if (!meter.allowed) {
        return { replyText: '', toolsUsed: [], tokensInput: 0, tokensOutput: 0, costUsd: 0 };
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, vendorId: String(config.vendor_id) }, '[bot] metering en échec — fail-open, le bot répond');
    }
  }

  // ── Médias entrants (WhatsApp) ───────────────────────────────────────
  // Image → vision Claude (avec repli auto) ; audio/document/sticker/vidéo →
  // message de repli localisé sans appel Claude. Le texte pur ne passe pas ici.
  const lang: BotLanguage = detectedLanguage ?? config.language;
  let skipClaude = false;

  if (job.mediaType && job.mediaType !== 'image') {
    replyText = mediaFallbackMessage(lang, job.mediaType);
    skipClaude = true;
  } else if (job.mediaType === 'image') {
    const block = await loadWhatsAppImageBlock(config, job.mediaId);
    const last = messages[messages.length - 1];
    if (block && last && last.role === 'user') {
      // Remplace le placeholder texte du dernier tour client par l'image +
      // sa légende (ou un indice neutre dans la langue détectée).
      last.content = [block, { type: 'text', text: job.caption?.trim() || imagePromptHint(lang) }];
    } else if (!block) {
      replyText = mediaFallbackMessage(lang, 'image'); // download/vision impossible
      skipClaude = true;
    }
  }

  if (!skipClaude)
  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const result = await claudeService.generateResponse({
      conversationHistory: messages,
      systemPrompt,
      tools: claudeTools,
      // Routing provider : darija/arabe → Anthropic ; autres → OpenRouter
      // si disponible. Cf. claude.service.pickProvider().
      language: detectedLanguage ?? config.language,
    });
    totalIn += result.tokensInput;
    totalOut += result.tokensOutput;
    totalCost += result.costUsd;
    lastModel = result.model;
    replyText = result.content || replyText;

    if (result.stopReason !== 'tool_use' || !result.toolUses.length) break;

    // Ré-injecte les blocs assistant (dont tool_use) puis fournit les tool_result.
    messages.push({ role: 'assistant', content: result.rawContent as Anthropic.ContentBlockParam[] });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of result.toolUses) {
      toolsUsed.push(tu.name);
      const out = await executeTool(tu.name, tu.input, { config, conversation, catalog });
      if (out.orderId) createdOrderId = out.orderId;
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out.content });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Persiste la réponse du bot.
  if (replyText) {
    await Message.create({
      conversation_id: conversation._id,
      vendor_id: config.vendor_id,
      sender: 'bot',
      content: replyText,
      claude_model: lastModel,
      tokens_input: totalIn,
      tokens_output: totalOut,
      cost_usd: totalCost,
      tool_calls: toolsUsed.length ? toolsUsed.map((name) => ({ name })) : undefined,
    });
    conversation.message_count += 1;
    conversation.total_tokens_used += totalIn + totalOut;
    conversation.last_message_at = new Date();
    await conversation.save();
  }

  // Usage mensuel + total config.
  await BotConfig.updateOne({ _id: config._id }, { $inc: { total_tokens_consumed: totalIn + totalOut } });
  await BotUsage.updateOne(
    { vendor_id: config.vendor_id, period: currentPeriod() },
    {
      $inc: { messages_count: 1, tokens_input: totalIn, tokens_output: totalOut, cost_usd: totalCost },
      $setOnInsert: { bot_config_id: config._id },
    },
    { upsert: true },
  );

  // Envoi de la réponse via le bon canal (sauf dry-run / token de test).
  if (replyText && !isDryRun()) {
    try {
      if (config.channel === 'whatsapp' && config.whatsapp_provider === 'wasender') {
        // WasenderAPI : envoie avec le session token (différent du PAT).
        if (!config.wasender_session_token_encrypted) {
          throw new Error('Wasender session token absent — session non encore connectée');
        }
        const sessionToken = encryptionService.decrypt(config.wasender_session_token_encrypted);
        await wasenderService.sendText({ sessionToken, to: conversation.customer_psid, message: replyText });
      } else if (config.channel === 'whatsapp') {
        const token = encryptionService.decrypt(config.page_access_token_encrypted);
        await whatsappService.sendText({
          phoneNumberId: config.whatsapp_phone_number_id || '',
          accessToken: token,
          to: conversation.customer_psid,
          message: replyText,
        });
      } else {
        const token = encryptionService.decrypt(config.page_access_token_encrypted);
        await messengerService.sendTypingIndicator({ pageAccessToken: token, recipientPsid: conversation.customer_psid });
        await messengerService.sendMessage({ pageAccessToken: token, recipientPsid: conversation.customer_psid, message: replyText });
      }
    } catch (err) {
      if (err instanceof MetaApiError && err.isAuthError) {
        await handleInvalidToken(config, err);
      } else if (err instanceof WasenderApiError && err.isAuthError) {
        await handleInvalidToken(config, err);
      } else {
        logger.error({ err: (err as Error).message, channel: config.channel, provider: config.whatsapp_provider }, '[messenger-bot] envoi réponse échec');
        captureRun({
          at: new Date().toISOString(),
          conversationId: String(conversation._id),
          vendorId: String(config.vendor_id),
          customerText: (job.text || '').slice(0, 100),
          status: 'error',
          step: 'send',
          errorMessage: `Envoi ${config.whatsapp_provider || config.channel} échec : ${(err as Error).message}`,
          modelUsed: lastModel,
          toolsUsed,
          replyPreview: replyText.slice(0, 200),
          tokensInput: totalIn,
          tokensOutput: totalOut,
          costUsd: totalCost,
        });
      }
    }
  }

  // Capture du run global. Si replyText est vide, on flag explicitement
  // 'empty_reply' pour qu'on voie tout de suite si Claude n'a pas généré de
  // texte (cas tool-use sans message final, max iterations atteint, etc).
  captureRun({
    at: new Date().toISOString(),
    conversationId: String(conversation._id),
    vendorId: String(config.vendor_id),
    customerText: (job.text || '').slice(0, 100),
    status: replyText ? 'success' : 'empty_reply',
    step: replyText ? 'complete' : 'claude_call',
    modelUsed: lastModel,
    toolsUsed,
    replyPreview: replyText.slice(0, 200),
    tokensInput: totalIn,
    tokensOutput: totalOut,
    costUsd: totalCost,
    errorMessage: replyText
      ? undefined
      : `Claude a terminé sans produire de texte (tools: ${toolsUsed.join(',') || 'aucun'}, iterations max=${MAX_TOOL_ITERATIONS}). Vérifier le system prompt / la cohérence tool_use.`,
  });

  return { replyText, toolsUsed, orderId: createdOrderId, tokensInput: totalIn, tokensOutput: totalOut, costUsd: totalCost };
}

/**
 * Exécute un tool et renvoie le `content` (string) à fournir à Claude comme
 * tool_result. (Fonction nommée `executeTool` pour rester appelable
 * librement depuis la boucle ci-dessus.)
 */
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: {
    config: Parameters<typeof orderCreationService.createFromBot>[0]['config'];
    conversation: Parameters<typeof orderCreationService.createFromBot>[0]['conversation'];
    catalog: Parameters<typeof orderCreationService.createFromBot>[0]['catalog'];
  },
): Promise<{ content: string; orderId?: string }> {
  switch (name) {
    case 'create_order': {
      const outcome = await orderCreationService.createFromBot({
        config: ctx.config,
        conversation: ctx.conversation,
        catalog: ctx.catalog,
        input: input as unknown as CreateOrderToolInput,
      });
      return { content: JSON.stringify(outcome), orderId: outcome.orderId };
    }
    case 'get_shipping_fee': {
      const fee = orderCreationService.shippingFeeFor(ctx.config, String(input.city || ''));
      return { content: JSON.stringify({ city: input.city, fee }) };
    }
    case 'check_product_availability': {
      const p = catalogService.findProduct(ctx.catalog, {
        id: input.product_id as string | undefined,
        name: input.product_name as string | undefined,
      });
      const available = !!p && (typeof p.stock !== 'number' || p.stock > 0);
      return { content: JSON.stringify({ found: !!p, available, price: p?.price ?? null, name: p?.name ?? null }) };
    }
    case 'escalate_to_human': {
      ctx.conversation.status = 'human_takeover';
      ctx.conversation.intent = 'complaint';
      await ctx.conversation.save();
      return { content: JSON.stringify({ escalated: true }) };
    }
    default:
      return { content: JSON.stringify({ error: `Tool inconnu: ${name}` }) };
  }
}

/**
 * Charge une image WhatsApp entrante comme bloc vision base64, ou `null` si
 * indisponible (média absent, canal non-WhatsApp, MIME non supporté, download
 * trop gros ou en échec) → l'appelant retombe sur un repli localisé.
 */
async function loadWhatsAppImageBlock(
  config: IBotConfig,
  mediaId?: string,
): Promise<Anthropic.ImageBlockParam | null> {
  if (!mediaId || config.channel !== 'whatsapp') return null;
  try {
    let media: { base64: string; mimeType: string; sizeBytes: number } | null = null;
    if (config.whatsapp_provider === 'wasender') {
      // Côté Wasender, mediaId est en fait l'URL publique/signée fournie par
      // le webhook — pas besoin d'auth pour la télécharger.
      media = await wasenderService.fetchMediaFromUrl({ url: mediaId });
    } else {
      const token = encryptionService.decrypt(config.page_access_token_encrypted);
      media = await whatsappService.fetchMedia({ mediaId, accessToken: token });
    }
    if (!media || !VISION_SUPPORTED_MIME.has(media.mimeType)) return null;
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: media.mimeType as Anthropic.Base64ImageSource['media_type'],
        data: media.base64,
      },
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[whatsapp-bot] image vision indisponible — repli');
    return null;
  }
}

/**
 * Token expiré/invalide (HTTP 401 / code Meta 190 / OAuthException, OU 401/403
 * côté Wasender) : désactive le bot pour stopper les tentatives répétées (y
 * compris les redeliveries) et notifie le vendeur par email avec le lien de
 * reconnexion.
 */
async function handleInvalidToken(config: IBotConfig, err: MetaApiError | WasenderApiError): Promise<void> {
  const meta = err instanceof MetaApiError ? { metaCode: err.metaCode } : { provider: 'wasender' };
  logger.error(
    { channel: config.channel, ...meta, status: err.status, vendorId: String(config.vendor_id) },
    '[messenger-bot] token invalide/expiré — bot désactivé, notification vendeur',
  );
  await BotConfig.updateOne({ _id: config._id }, { $set: { status: 'disconnected' } });
  try {
    const to = await resolveVendorEmail(config);
    if (to) await sendTokenInvalidEmail(to, config);
  } catch (e) {
    logger.warn({ err: (e as Error).message }, '[messenger-bot] notification token invalide échec');
  }
}

/** Email du vendeur : `notification_email` de la config, sinon owner de la boutique. */
async function resolveVendorEmail(config: IBotConfig): Promise<string | null> {
  if (config.notification_email) return config.notification_email;
  const store = await Store.findById(config.vendor_id).select('ownerId').lean();
  if (!store?.ownerId) return null;
  const user = await User.findById(store.ownerId).select('email').lean();
  return user?.email || null;
}

async function sendTokenInvalidEmail(to: string, config: IBotConfig): Promise<void> {
  const channel = config.channel === 'whatsapp' ? 'WhatsApp' : 'Messenger';
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const path = config.channel === 'whatsapp' ? 'whatsapp-bot' : 'messenger-bot';
  const link = `${base}/dashboard/apps/${path}`;
  await sendEmail({
    to,
    subject: `⚠️ Ton bot ${channel} est déconnecté — reconnecte-le`,
    html: `<p>Bonjour,</p><p>Le jeton d'accès de ton bot <strong>${channel}</strong> n'est plus valide (expiré ou révoqué). Ton bot a été <strong>mis en pause</strong> et ne répond plus à tes clients.</p><p>Reconnecte-le ici&nbsp;: <a href="${link}">${link}</a></p>`,
    text: `Bonjour,\n\nLe jeton d'accès de ton bot ${channel} n'est plus valide (expiré ou révoqué). Ton bot a été mis en pause.\n\nReconnecte-le ici : ${link}\n`,
  });
}

/** Branche le processor sur la file (appelé au démarrage du module). */
export function registerMessageWorker(): void {
  messageQueue.registerProcessor(async (job) => {
    try {
      await processIncomingMessage(job);
    } catch (err) {
      // Filet de sécurité — toute erreur non capturée plus haut atterrit ici.
      captureRun({
        at: new Date().toISOString(),
        conversationId: job.conversationId,
        vendorId: job.vendorId,
        customerText: (job.text || '').slice(0, 100),
        status: 'error',
        step: 'claude_call',
        errorMessage: (err as Error).message || String(err),
      });
      throw err;
    }
  });
  logger.info('[messenger-bot] worker enregistré (in-process — BullMQ à venir)');
}
