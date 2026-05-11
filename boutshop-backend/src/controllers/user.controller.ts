import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { Wallet } from '../models/Wallet.model';
import { Subscription } from '../models/Subscription.model';
import * as storeService from '../services/store.service';
import { currencyForCountry, isKnownCountry } from '../data/countries';

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

  // Propagate to the wallet ONLY if it has no transactions yet — once the
  // wallet is in use we can't safely change its currency.
  let walletUpdated = false;
  let walletPinned = false;
  if (updates.currency) {
    const wallet = await Wallet.findOne({ userId: user._id });
    if (wallet) {
      if (wallet.transactions.length === 0 && wallet.balance === 0 && wallet.aiBalance === 0) {
        if (wallet.currency.toUpperCase() !== updates.currency) {
          wallet.currency = updates.currency;
          await wallet.save();
          walletUpdated = true;
        }
      } else if (wallet.currency.toUpperCase() !== updates.currency) {
        walletPinned = true;
      }
    }
  }

  res.json({
    user: user.toObject(),
    walletCurrencyUpdated: walletUpdated,
    walletCurrencyPinned: walletPinned,
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
