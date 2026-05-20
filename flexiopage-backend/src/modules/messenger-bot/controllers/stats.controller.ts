/**
 * Statistiques du bot (vendeur authentifié). Squelette — agrégations sur
 * Conversation / Message / BotUsage à implémenter.
 */
import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware';

const todo = (res: Response, what: string) =>
  res.status(501).json({ error: 'not_implemented', todo: what });

export function overview(_req: AuthRequest, res: Response): void {
  todo(res, 'GET stats globales (conversations, commandes, taux de conversion)');
}
export function conversationStats(_req: AuthRequest, res: Response): void {
  todo(res, 'GET stats conversations (par jour, par statut/intent)');
}
export function usageStats(_req: AuthRequest, res: Response): void {
  todo(res, 'GET consommation tokens/coût (depuis BotUsage)');
}
