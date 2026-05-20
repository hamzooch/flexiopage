/**
 * OAuth Facebook + gestion des pages (vendeur authentifié). Squelette — l'OAuth
 * complet (échange code → token, /me/accounts, chiffrement & sauvegarde) sera
 * implémenté à la session "OAuth Facebook".
 */
import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware';

const todo = (res: Response, what: string) =>
  res.status(501).json({ error: 'not_implemented', todo: what });

export function getAuthUrl(_req: AuthRequest, res: Response): void {
  todo(res, 'GET génère l’URL OAuth Facebook (scopes pages_messaging, pages_show_list)');
}
export function oauthCallback(_req: AuthRequest, res: Response): void {
  todo(res, 'POST callback OAuth : échange code → user token → page tokens (chiffrés)');
}
export function disconnect(_req: AuthRequest, res: Response): void {
  todo(res, 'POST déconnexion page (status → disconnected, purge token)');
}
export function listPages(_req: AuthRequest, res: Response): void {
  todo(res, 'GET liste des pages FB du vendeur (/me/accounts)');
}
