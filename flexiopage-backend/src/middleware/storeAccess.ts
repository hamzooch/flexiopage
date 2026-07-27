import { Response, NextFunction } from 'express';
import { Store } from '../models/Store.model';
import { AuthRequest } from './auth.middleware';
import { effectiveOwnerId } from '../lib/owner';

// Strict 24-hex check — mongoose.isValidObjectId also returns true for any
// 12-char string, which would false-positive short slugs.
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * Ensure user owns the store or is admin. req.params.storeId must be set.
 * Accepts either a Mongo ObjectId or the store's slug, so dashboard URLs can
 * use a human-readable slug while downstream controllers keep receiving the
 * canonical ObjectId via req.params.storeId.
 */
export async function requireStoreAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const idOrSlug = req.params.storeId;
  if (!idOrSlug) {
    res.status(400).json({ error: 'Store ID required' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const store = OBJECT_ID_RE.test(idOrSlug)
    ? await Store.findById(idOrSlug)
    : await Store.findOne({ slug: idOrSlug.toLowerCase() });
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  req.params.storeId = store._id.toString();
  // Team members operate inside their seller's account — match on the
  // effective owner (seller id) rather than the team member's own id.
  if (store.ownerId.toString() !== effectiveOwnerId(req.user) && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied to this store' });
    return;
  }
  req.store = store;
  next();
}
