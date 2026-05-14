import { Response, NextFunction } from 'express';
import { Store } from '../models/Store.model';
import { AuthRequest } from './auth.middleware';
import { effectiveOwnerId } from '../lib/owner';

/** Ensure user owns the store or is admin. req.params.storeId must be set. */
export async function requireStoreAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const storeId = req.params.storeId;
  if (!storeId) {
    res.status(400).json({ error: 'Store ID required' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const store = await Store.findById(storeId);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  // Team members operate inside their seller's account — match on the
  // effective owner (seller id) rather than the team member's own id.
  if (store.ownerId.toString() !== effectiveOwnerId(req.user) && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied to this store' });
    return;
  }
  req.store = store;
  next();
}
