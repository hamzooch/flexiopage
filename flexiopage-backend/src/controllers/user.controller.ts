import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';
import * as storeService from '../services/store.service';
import * as storageService from '../services/storage.service';
import { currencyForCountry, isKnownCountry } from '../data/countries';
import { effectiveOwnerId } from '../lib/owner';
import { logger } from '../lib/logger';

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
  const { name, avatar, country, currency, whatsapp } = req.body as {
    name?: string;
    avatar?: string;
    country?: string;
    currency?: string;
    whatsapp?: string;
  };

  const updates: { name?: string; avatar?: string; country?: string; currency?: string; whatsapp?: string } = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (typeof avatar === 'string') updates.avatar = avatar;

  // Numéro WhatsApp — format international E.164 (+ suivi de 7 à 15 chiffres).
  // Permet aux comptes créés avant l'ajout du champ de renseigner leur numéro.
  if (typeof whatsapp === 'string') {
    const wa = whatsapp.replace(/\s+/g, '');
    if (wa && !/^\+[1-9]\d{6,14}$/.test(wa)) {
      res.status(400).json({ error: 'Numéro WhatsApp invalide. Format international attendu, ex : +212600000000', code: 'invalid_whatsapp' });
      return;
    }
    updates.whatsapp = wa || undefined;
  }

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

/** POST /api/users/change-email — body: { newEmail, currentPassword }
 * Direct change guarded by the account password (no email-ownership
 * verification step). Google-only accounts can't use this — they have no
 * local password to confirm with. */
export async function changeEmail(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const { newEmail, currentPassword } = (req.body || {}) as {
    newEmail?: string;
    currentPassword?: string;
  };
  if (!newEmail || !currentPassword) {
    res.status(400).json({ error: 'newEmail and currentPassword required' });
    return;
  }
  const email = newEmail.trim().toLowerCase();
  // Pragmatic RFC-lite check — same shape the rest of the app accepts.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Adresse email invalide', code: 'invalid_email' });
    return;
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (!user.password) {
    res.status(400).json({ error: 'This account uses Google sign-in. No password to confirm.' });
    return;
  }
  if (email === user.email) {
    res.status(400).json({ error: 'C’est déjà ton adresse actuelle.', code: 'same_email' });
    return;
  }
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    res.status(403).json({ error: 'Mot de passe incorrect' });
    return;
  }
  // Reject if another account already owns this email.
  const taken = await User.findOne({ email, _id: { $ne: user._id } }).select('_id').lean();
  if (taken) {
    res.status(409).json({ error: 'Cette adresse email est déjà utilisée.', code: 'email_taken' });
    return;
  }

  user.email = email;
  // The new address hasn't been proven — drop verified status.
  user.emailVerified = false;
  await user.save();

  const { password: _p, ...safe } = user.toObject();
  res.json({ user: safe });
}

export async function getStores(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const stores = await storeService.getStoresByOwner(effectiveOwnerId(req.user));
  res.json({ stores });
}

/** POST /api/users/avatar — multipart, field name "file".
 *  Uploads the image to the configured storage backend (Cloudinary in prod,
 *  local in dev) and saves the resulting URL on the user's profile. */
export async function uploadAvatar(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  if (!file.mimetype.startsWith('image/')) {
    res.status(400).json({ error: 'Only image files are accepted for avatars' });
    return;
  }
  try {
    const result = await storageService.uploadFile(
      file.buffer,
      file.originalname,
      `avatars/${req.user._id}`,
      file.mimetype,
    );
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatar: result.url } },
      { new: true }
    );
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { password: _p, ...safe } = updated.toObject();
    res.json({ user: safe, avatar: result.url });
  } catch (err) {
    logger.error({ err, userId: req.user._id.toString() }, 'avatar upload failed');
    res.status(500).json({ error: 'Storage failed to persist the avatar' });
  }
}
