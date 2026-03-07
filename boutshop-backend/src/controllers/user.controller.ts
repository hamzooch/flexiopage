import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';
import * as storeService from '../services/store.service';

export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const sub = await Subscription.findOne({ userId: req.user._id }).lean();
  const { password: _p, ...user } = req.user.toObject();
  res.json({
    user: user,
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          storeLimit: sub.storeLimit,
          productLimitPerStore: sub.productLimitPerStore,
          currentPeriodEnd: sub.currentPeriodEnd,
        }
      : null,
  });
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const { name, avatar } = req.body;
  const updates: { name?: string; avatar?: string } = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (typeof avatar === 'string') updates.avatar = avatar;
  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true })
    .select('-password')
    .lean();
  res.json({ user });
}

/** POST /api/users/change-password — body: { currentPassword, newPassword } */
export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const { currentPassword, newPassword } = (req.body || {}) as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword required' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  const user = await User.findById(req.user._id).select('+password');
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    res.status(403).json({ error: 'Current password is incorrect' });
    return;
  }
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.json({ ok: true });
}

export async function getStores(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const stores = await storeService.getStoresByOwner(req.user._id.toString());
  res.json({ stores });
}
