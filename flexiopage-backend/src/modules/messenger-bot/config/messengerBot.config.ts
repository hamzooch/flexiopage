/**
 * Constantes centrales du module Messenger Bot : modèles Claude, tarifs,
 * limites de plan, fenêtre d'historique, version Graph API.
 */
import type { BotPlan } from '../models/BotConfig.model';

export const CLAUDE_MODELS = {
  primary: process.env.CLAUDE_MODEL_PRIMARY || 'claude-haiku-4-5-20251001',
  fallback: process.env.CLAUDE_MODEL_FALLBACK || 'claude-sonnet-4-5',
} as const;

/** Tarifs USD par million de tokens (input / output). */
export const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
};

/** Nombre de messages d'historique réinjectés dans le prompt. */
export const HISTORY_WINDOW = 10;

/** Tokens de sortie max par réponse du bot. */
export const MAX_OUTPUT_TOKENS = 1024;

/** Re-essais Claude avant bascule vers le modèle fallback. */
export const CLAUDE_MAX_RETRIES = 2;

/** Quota mensuel de conversations par plan. */
export const PLAN_CONVERSATION_LIMITS: Record<BotPlan, number> = {
  free: 50,
  starter: 500,
  pro: 2000,
  business: 10000,
};

/** Version de la Meta Graph API. */
export const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v19.0';
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** TTL du cache catalogue (Redis), en secondes. */
export const CATALOG_CACHE_TTL = 5 * 60;

export const SUPPORTED_COUNTRIES = ['MA', 'DZ', 'TN'] as const;
