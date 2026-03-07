import { Response, NextFunction } from 'express';
import { Store } from '../models/Store.model';
import { AuthRequest } from './auth.middleware';

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
  if (store.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied to this store' });
    return;
  }
  (req as AuthRequest & { store: typeof store }).store = store;
  next();
}
