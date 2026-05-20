/**
 * Configuration du bot (vendeur authentifié). Squelette — la logique métier
 * sera complétée à l'étape suivante (résolution du store, validation Zod).
 */
import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware';

const todo = (res: Response, what: string) =>
  res.status(501).json({ error: 'not_implemented', todo: what });

export function getConfig(_req: AuthRequest, res: Response): void {
  todo(res, 'GET config du vendeur connecté');
}
export function updateConfig(_req: AuthRequest, res: Response): void {
  todo(res, 'PUT update config (validation Zod)');
}
export function testBot(_req: AuthRequest, res: Response): void {
  todo(res, 'POST test du bot (réponse Claude de démo)');
}
