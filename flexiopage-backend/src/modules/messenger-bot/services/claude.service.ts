/**
 * Intégration Claude (Haiku 4.5 par défaut) pour la conversation Messenger.
 *
 * - Tool use complet (les définitions viennent de tools/claudeTools).
 * - Prompt caching : le system prompt et les tools (stables sur une
 *   conversation) sont marqués `cache_control: ephemeral` → coût input amorti.
 * - Retry automatique sur erreur API, puis bascule vers le modèle fallback.
 * - Suivi des tokens + coût USD (tient compte des tarifs cache write/read).
 */
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../../lib/logger';
import { CLAUDE_MODELS, CLAUDE_MAX_RETRIES, MAX_OUTPUT_TOKENS } from '../config/messengerBot.config';
import { computeCost } from '../utils/tokenCounter';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlockParam[];
}

export interface ClaudeToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeResult {
  /** Texte concaténé des blocs `text` de la réponse. */
  content: string;
  toolUses: ClaudeToolUse[];
  /** Blocs bruts de la réponse — à ré-injecter tels quels dans la boucle outils. */
  rawContent: Anthropic.ContentBlock[];
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  model: string;
  stopReason: string | null;
}

export interface GenerateResponseArgs {
  conversationHistory: ClaudeMessage[];
  systemPrompt: string;
  tools?: Anthropic.Tool[];
  /** Contexte vendeur additionnel (déjà majoritairement inclus dans le prompt). */
  vendorContext?: Record<string, unknown>;
  maxTokens?: number;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY manquant.');
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export class ClaudeService {
  /** Génère la réponse du bot pour l'historique fourni. */
  async generateResponse(args: GenerateResponseArgs): Promise<ClaudeResult> {
    const { conversationHistory, systemPrompt, tools, maxTokens = MAX_OUTPUT_TOKENS } = args;

    // Le system prompt est mis en cache (préfixe stable de la conversation).
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ];

    const call = (model: string) =>
      getClient().messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: tools && tools.length ? tools : undefined,
        messages: conversationHistory as Anthropic.MessageParam[],
      });

    const resp = await this.withRetryAndFallback(call);
    return this.toResult(resp.model, resp.response);
  }

  /**
   * Classification d'intention rapide pour le routing (réponse en un mot).
   * Best-effort : en cas d'échec, retourne 'other'.
   */
  async classifyIntent(message: string): Promise<'order' | 'question' | 'complaint' | 'greeting' | 'other'> {
    try {
      const resp = await getClient().messages.create({
        model: CLAUDE_MODELS.primary,
        max_tokens: 8,
        system: [
          {
            type: 'text',
            text:
              "Classe le message client en UN seul mot parmi : order, question, complaint, greeting, other. Réponds uniquement par ce mot.",
          },
        ],
        messages: [{ role: 'user', content: message }],
      });
      const text = this.extractText(resp.content).trim().toLowerCase();
      const allowed = ['order', 'question', 'complaint', 'greeting', 'other'] as const;
      return (allowed as readonly string[]).includes(text) ? (text as (typeof allowed)[number]) : 'other';
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[messenger-bot] classifyIntent échec');
      return 'other';
    }
  }

  // ── internes ───────────────────────────────────────────────────────

  private async withRetryAndFallback(
    call: (model: string) => Promise<Anthropic.Message>,
  ): Promise<{ model: string; response: Anthropic.Message }> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
      try {
        const response = await call(CLAUDE_MODELS.primary);
        return { model: CLAUDE_MODELS.primary, response };
      } catch (err) {
        lastErr = err;
        logger.warn(
          { err: (err as Error).message, attempt },
          '[messenger-bot] Claude primary échec, retry',
        );
      }
    }
    // Bascule fallback (1 essai).
    try {
      const response = await call(CLAUDE_MODELS.fallback);
      logger.info('[messenger-bot] bascule sur le modèle fallback');
      return { model: CLAUDE_MODELS.fallback, response };
    } catch (err) {
      logger.error({ err: (err as Error).message }, '[messenger-bot] Claude fallback échec');
      throw lastErr || err;
    }
  }

  private toResult(model: string, resp: Anthropic.Message): ClaudeResult {
    const u = resp.usage;
    const cacheCreate = (u as { cache_creation_input_tokens?: number }).cache_creation_input_tokens || 0;
    const cacheRead = (u as { cache_read_input_tokens?: number }).cache_read_input_tokens || 0;
    // Tarif effectif : écriture cache ×1.25, lecture cache ×0.10 du prix input.
    const billedInput = u.input_tokens + Math.round(cacheCreate * 1.25) + Math.round(cacheRead * 0.1);
    const { costUsd } = computeCost(model, billedInput, u.output_tokens);

    const toolUses: ClaudeToolUse[] = resp.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: (b.input as Record<string, unknown>) || {} }));

    return {
      content: this.extractText(resp.content),
      toolUses,
      rawContent: resp.content,
      tokensInput: u.input_tokens + cacheCreate + cacheRead,
      tokensOutput: u.output_tokens,
      costUsd,
      model,
      stopReason: resp.stop_reason,
    };
  }

  private extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }
}

export const claudeService = new ClaudeService();
