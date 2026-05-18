import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';
import * as storeService from '../services/store.service';
import { currencyForCountry, isKnownCountry } from '../data/countries';
import { effectiveOwnerId } from '../lib/owner';

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
  const { name, avatar, country, currency } = req.body as {
    name?: string;
    avatar?: string;
    country?: string;
    currency?: string;
  };

  const updates: { name?: string; avatar?: string; country?: string; currency?: string } = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (typeof avatar === 'string') updates.avatar = avatar;

  // Country / currency — country picks the default currency, but the seller
  // can override (e.g. Tunisian seller targeting France in EUR).
  if (typeof country === 'string') {
    const c = country.trim().toUpperCase();
    if (c && !isKnownCountry(c)) {
      res.status(400).json({ error: 'Unknown country code', code: 'unknown_country' });
      return;
    }
    updates.country = c || undefined;
    // Auto-derive currency unless the caller is explicitly providing one.
    if (typeof currency !== 'string' && c) {
      const auto = currencyForCountry(c);
      if (auto) updates.currency = auto;
    }
  }
  if (typeof currency === 'string') {
    const cur = currency.trim().toUpperCase();
    if (cur && !/^[A-Z]{3}$/.test(cur)) {
      res.status(400).json({ error: 'Invalid currency code', code: 'invalid_currency' });
      return;
    }
    updates.currency = cur || undefined;
  }

  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true })
    .select('-password');
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Wallet currency is platform-pinned to USD — the profile currency is
  // a display-only preference and no longer drives the wallet. We keep
  // the response shape so the frontend doesn't break.
  res.json({
    user: user.toObject(),
    walletCurrencyUpdated: false,
    walletCurrencyPinned: false,
  });
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
  // Google-only accounts have no local password — they need to set one
  // via a different flow before they can use the change-password screen.
  if (!user.password) {
    res.status(400).json({ error: 'This account uses Google sign-in. No password to change.' });
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
  const stores = await storeService.getStoresByOwner(effectiveOwnerId(req.user));
  res.json({ stores });
}
