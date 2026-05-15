import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import { Notification } from '../models/Notification.model';

/**
 * GET /api/notifications
 * Query:
 *   - unreadOnly=1 → only unread
 *   - limit (default 20, max 50)
 */
export async function list(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const unreadOnly = req.query.unreadOnly === '1';
  const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);

  const filter: Record<string, unknown> = { userId };
  if (unreadOnly) filter.read = false;

  const items = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ notifications: items });
}

/** GET /api/notifications/unread-count */
export async function unreadCount(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const count = await Notification.countDocuments({ userId, read: false });
  res.json({ count });
}

/** POST /api/notifications/:id/read */
export async function markRead(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const id = req.params.id;
  const updated = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  if (!updated) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  res.json({ notification: updated });
}

/** POST /api/notifications/read-all */
export async function markAllRead(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const result = await Notification.updateMany(
    { userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  res.json({ updated: result.modifiedCount });
}
