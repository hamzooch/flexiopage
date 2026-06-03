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
import type { BotLanguage } from '../models/BotConfig.model';

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
  /**
   * Langue de la conversation. Sert au routing provider : darija + arabe →
   * Anthropic Claude (meilleur sur dialectes maghrébins) ; français + anglais
   * + autres → OpenRouter (moins cher, qualité suffisante).
   */
  language?: BotLanguage;
}

type Provider = 'anthropic' | 'openrouter';

/**
 * Langues qui DOIVENT utiliser Anthropic Claude (qualité supérieure sur
 * dialectes maghrébins + arabe standard). Pour le reste, on autorise le
 * routing vers OpenRouter si disponible.
 */
const ANTHROPIC_PREFERRED_LANGUAGES = new Set<BotLanguage>([
  'ar',
  'darija_ma',
  'darija_dz',
  'darija_tn',
]);

/**
 * Choisit le provider pour une conversation donnée.
 *   1. Si la langue fait partie des "Anthropic preferred" → Anthropic (si clé).
 *   2. Sinon → OpenRouter (si clé), à défaut Anthropic.
 *   3. Si aucune clé → throw plus tard.
 */
function pickProvider(language?: BotLanguage): Provider {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  if (language && ANTHROPIC_PREFERRED_LANGUAGES.has(language) && hasAnthropic) {
    return 'anthropic';
  }
  if (hasOpenRouter) return 'openrouter';
  return 'anthropic';
}

const clients: { anthropic?: Anthropic; openrouter?: Anthropic } = {};

function getClient(provider: Provider): Anthropic {
  if (provider === 'openrouter') {
    if (!clients.openrouter) {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY manquant pour le provider openrouter.');
      }
      clients.openrouter = new Anthropic({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.FRONTEND_URL?.split(',')[0] || 'https://flexiopage.com',
          'X-Title': 'FlexioPage',
        },
      });
    }
    return clients.openrouter;
  }
  if (!clients.anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY manquant pour le provider anthropic.');
    }
    clients.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return clients.anthropic;
}

/**
 * Map du nom de modèle vers ce que le provider attend. OpenRouter exige le
 * préfixe `anthropic/` et un format différent (claude-haiku-4.5 vs
 * claude-haiku-4-5-20251001). Sur OpenRouter, on peut aussi pointer vers
 * d'autres providers (ex: openai/gpt-4o-mini) via un override env.
 */
function modelForProvider(model: string, provider: Provider): string {
  if (provider !== 'openrouter') return model;
  // Override explicite via env (priorité maximale). Pratique car les slugs
  // OpenRouter ne suivent pas toujours l'auto-convert (claude-haiku-4.5
  // pourrait ne pas exister encore alors que claude-3-5-haiku existe).
  if (model === CLAUDE_MODELS.primary && process.env.OPENROUTER_MODEL_PRIMARY) {
    return process.env.OPENROUTER_MODEL_PRIMARY;
  }
  if (model === CLAUDE_MODELS.fallback && process.env.OPENROUTER_MODEL_FALLBACK) {
    return process.env.OPENROUTER_MODEL_FALLBACK;
  }
  if (model.includes('/')) return model; // déjà préfixé → tel quel
  const m = model.match(/^claude-(haiku|sonnet|opus)-(\d+)-(\d+)/i);
  if (m) return `anthropic/claude-${m[1].toLowerCase()}-${m[2]}.${m[3]}`;
  return `anthropic/${model}`;
}

export class ClaudeService {
  /** Génère la réponse du bot pour l'historique fourni. */
  async generateResponse(args: GenerateResponseArgs): Promise<ClaudeResult> {
    const { conversationHistory, systemPrompt, tools, maxTokens = MAX_OUTPUT_TOKENS, language } = args;

    // Routing par langue : arabe/darija → Anthropic ; autres → OpenRouter (si dispo).
    const provider = pickProvider(language);

    // Le system prompt est mis en cache (préfixe stable de la conversation).
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ];

    const callWith = (p: Provider) => (model: string) =>
      getClient(p).messages.create({
        model: modelForProvider(model, p),
        max_tokens: maxTokens,
        system,
        tools: tools && tools.length ? tools : undefined,
        messages: conversationHistory as Anthropic.MessageParam[],
      });

    try {
      const resp = await this.withRetryAndFallback(callWith(provider), provider);
      return this.toResult(resp.model, resp.response);
    } catch (primaryErr) {
      // Fallback inter-provider : si on était sur OpenRouter et qu'il a tout
      // rejeté (typique : 404 sur un slug de modèle inconnu chez eux), on
      // tente Anthropic direct comme dernier recours.
      if (provider === 'openrouter' && process.env.ANTHROPIC_API_KEY) {
        logger.warn(
          { err: (primaryErr as Error).message },
          '[messenger-bot] OpenRouter en échec — bascule sur Anthropic direct',
        );
        const resp = await this.withRetryAndFallback(callWith('anthropic'), 'anthropic');
        return this.toResult(resp.model, resp.response);
      }
      throw primaryErr;
    }
  }

  /**
   * Classification d'intention rapide pour le routing (réponse en un mot).
   * Best-effort : en cas d'échec, retourne 'other'.
   */
  async classifyIntent(message: string): Promise<'order' | 'question' | 'complaint' | 'greeting' | 'other'> {
    try {
      const provider = pickProvider();
      const resp = await getClient(provider).messages.create({
        model: modelForProvider(CLAUDE_MODELS.primary, provider),
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
    provider: Provider,
  ): Promise<{ model: string; response: Anthropic.Message }> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
      try {
        const response = await call(CLAUDE_MODELS.primary);
        return { model: CLAUDE_MODELS.primary, response };
      } catch (err) {
        lastErr = err;
        logger.warn(
          { err: (err as Error).message, attempt, provider },
          '[messenger-bot] LLM primary échec, retry',
        );
      }
    }
    // Bascule fallback (1 essai).
    try {
      const response = await call(CLAUDE_MODELS.fallback);
      logger.info({ provider }, '[messenger-bot] bascule sur le modèle fallback');
      return { model: CLAUDE_MODELS.fallback, response };
    } catch (err) {
      logger.error({ err: (err as Error).message, provider }, '[messenger-bot] LLM fallback échec');
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
