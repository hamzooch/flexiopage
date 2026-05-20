/**
 * Conversations & inbox (vendeur authentifié). Squelette.
 */
import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware';

const todo = (res: Response, what: string) =>
  res.status(501).json({ error: 'not_implemented', todo: what });

export function listConversations(_req: AuthRequest, res: Response): void {
  todo(res, 'GET liste paginée des conversations');
}
export function getConversation(_req: AuthRequest, res: Response): void {
  todo(res, 'GET détail conversation + messages');
}
export function takeover(_req: AuthRequest, res: Response): void {
  todo(res, 'POST prise de relais humain (status → human_takeover)');
}
export function sendManual(_req: AuthRequest, res: Response): void {
  todo(res, 'POST envoi message manuel via Messenger Send API');
}
