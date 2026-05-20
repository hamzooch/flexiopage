/**
 * Résolution + autorisation de la boutique (vendeur) pour les routes du bot.
 * Le bot est scopé par `vendor_id` = Store. On vérifie que le user authentifié
 * possède bien le store demandé (via effectiveOwnerId pour gérer les membres
 * d'équipe).
 */
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { Store } from '../../../models/Store.model';
import { effectiveOwnerId } from '../../../lib/owner';

/** Lit storeId (query ou body) et vérifie la propriété. Retourne null si interdit. */
export async function getOwnedStoreId(req: AuthRequest): Promise<string | null> {
  if (!req.user) return null;
  const storeId = String(req.query.storeId || (req.body as { storeId?: string })?.storeId || '');
  if (!storeId) return null;
  const owner = effectiveOwnerId(req.user);
  const store = await Store.findOne({ _id: storeId, ownerId: owner }).select('_id').lean();
  return store ? storeId : null;
}
