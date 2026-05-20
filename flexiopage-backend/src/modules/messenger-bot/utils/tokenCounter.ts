/**
 * Calcul du coût d'un appel Claude à partir des tokens consommés et de la
 * grille tarifaire (USD / million de tokens).
 */
import { CLAUDE_PRICING } from '../config/messengerBot.config';

export interface TokenCost {
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

/** Coût USD d'un appel, arrondi à 6 décimales. */
export function computeCost(model: string, tokensInput: number, tokensOutput: number): TokenCost {
  const price = CLAUDE_PRICING[model] || CLAUDE_PRICING['claude-haiku-4-5-20251001'];
  const costUsd =
    (tokensInput / 1_000_000) * price.input + (tokensOutput / 1_000_000) * price.output;
  return { tokensInput, tokensOutput, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}
