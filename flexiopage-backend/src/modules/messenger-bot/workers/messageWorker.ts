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
import { encryptionService } from '../services/encryption.service';
import { messageQueue, type IncomingMessageJob } from '../services/queue.service';
import { buildSystemPrompt } from '../prompts/systemPrompt';
import { claudeTools } from '../tools/claudeTools';
import { HISTORY_WINDOW } from '../config/messengerBot.config';

const MAX_TOOL_ITERATIONS = 4;

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
    throw new Error('BotConfig ou Conversation introuvable');
  }

  const vendor = await Store.findById(config.vendor_id).select('name').lean();
  const catalog = await catalogService.getCatalog(config);
  const systemPrompt = buildSystemPrompt({ botConfig: config, vendor: vendor || {}, catalog });

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

  const toolsUsed: string[] = [];
  let createdOrderId: string | undefined;
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let lastModel = '';
  let replyText = '';

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const result = await claudeService.generateResponse({
      conversationHistory: messages,
      systemPrompt,
      tools: claudeTools,
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
      const token = encryptionService.decrypt(config.page_access_token_encrypted);
      if (config.channel === 'whatsapp') {
        await whatsappService.sendText({
          phoneNumberId: config.whatsapp_phone_number_id || '',
          accessToken: token,
          to: conversation.customer_psid,
          message: replyText,
        });
      } else {
        await messengerService.sendTypingIndicator({ pageAccessToken: token, recipientPsid: conversation.customer_psid });
        await messengerService.sendMessage({ pageAccessToken: token, recipientPsid: conversation.customer_psid, message: replyText });
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, channel: config.channel }, '[messenger-bot] envoi réponse échec');
    }
  }

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

/** Branche le processor sur la file (appelé au démarrage du module). */
export function registerMessageWorker(): void {
  messageQueue.registerProcessor(async (job) => {
    await processIncomingMessage(job);
  });
  logger.info('[messenger-bot] worker enregistré (in-process — BullMQ à venir)');
}
