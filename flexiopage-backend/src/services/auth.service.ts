import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User, IUser } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';
import { logActivity } from './activity-log.service';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES = (process.env.JWT_EXPIRES || '7d') as SignOptions['expiresIn'];
const SALT_ROUNDS = 12;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// Single shared client instance — verifyIdToken is stateless so this is fine.
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

/** Build the JWT the rest of the app expects after any successful sign-in. */
function signSessionToken(user: IUser): string {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/** Serialize a user for the API response, stripping the password hash. */
function toSafeUser(user: IUser): Omit<IUser, 'password'> {
  const obj = (user.toJSON ? user.toJSON() : user) as Record<string, unknown>;
  delete obj.password;
  return obj as unknown as Omit<IUser, 'password'>;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
  /** Optional client IP, recorded for the admin "last activity" view. */
  ip?: string;
}

export interface AuthResult {
  user: Omit<IUser, 'password'>;
  token: string;
  subscription?: { plan: string; storeLimit: number };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    const err = new Error('Email already registered') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await User.create({
    email: input.email.toLowerCase().trim(),
    password: hashed,
    name: input.name.trim(),
  });
  await Subscription.create({
    userId: user._id,
    plan: 'free',
    status: 'active',
    storeLimit: 3,
    productLimitPerStore: 25,
  });
  void logActivity({
    type: 'user.signup',
    message: `Nouveau seller : ${user.email}`,
    userId: user._id,
    metadata: { name: user.name },
  });
  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
  const sub = await Subscription.findOne({ userId: user._id });
  return {
    user: (user.toJSON ? user.toJSON() : user) as unknown as Omit<IUser, 'password'>,
    token,
    subscription: sub
      ? { plan: sub.plan, storeLimit: sub.storeLimit }
      : undefined,
  };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email.toLowerCase() }).select('+password');
  if (!user) {
    const err = new Error('Invalid email or password') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  // Google-only user — no local password to compare against. Tell them
  // clearly so they don't keep trying email/password.
  if (!user.password) {
    const err = new Error(
      'Ce compte utilise Google. Continue avec le bouton « Continuer avec Google ».'
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 401;
    err.code = 'use_google_signin';
    throw err;
  }
  const match = await bcrypt.compare(input.password, user.password);
  if (!match) {
    const err = new Error('Invalid email or password') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  // Suspended account — reject login but signal it clearly.
  if (user.suspended) {
    const err = new Error(
      user.suspendedReason
        ? `Compte suspendu: ${user.suspendedReason}`
        : 'Compte suspendu. Contacte le support.'
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 403;
    err.code = 'account_suspended';
    throw err;
  }
  // Best-effort tracking — never block login on a write failure.
  user.lastLoginAt = new Date();
  if (input.ip) user.lastLoginIp = input.ip;
  user.save().catch(() => undefined);

  const token = signSessionToken(user);
  const sub = await Subscription.findOne({ userId: user._id });
  const { password: _p, ...safeUser } = user.toObject();
  return {
    user: safeUser as unknown as Omit<IUser, 'password'>,
    token,
    subscription: sub
      ? { plan: sub.plan, storeLimit: sub.storeLimit }
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Google OAuth — ID-token flow
// ─────────────────────────────────────────────────────────────────────

export interface GoogleSignInInput {
  /** Google-issued ID token (JWT). Comes from the @react-oauth/google
   *  GoogleLogin button credential. The backend MUST verify it — never
   *  trust client-decoded payloads. */
  credential: string;
  /** Optional client IP for the audit trail. */
  ip?: string;
}

/**
 * Sign in (or sign up) with a Google ID token. Three branches:
 *   1. We've seen this googleId before  → load + return.
 *   2. Email matches an existing user   → link googleId to that user
 *                                         (avoids the "I had an account
 *                                         with the same email" gotcha).
 *   3. Neither                          → create a brand-new user.
 *
 * In all cases the returned JWT is signed with the same key as a normal
 * /login response, so the rest of the app treats Google sessions
 * identically to email/password ones.
 */
export async function signInWithGoogle(input: GoogleSignInInput): Promise<AuthResult> {
  if (!googleClient) {
    const err = new Error('Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the server.') as Error & { statusCode?: number };
    err.statusCode = 500;
    throw err;
  }

  // Verify the token. This checks the signature, expiry, and that the
  // audience equals our client ID. Any tampering or expired token throws.
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: input.credential,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch {
    const err = new Error('Token Google invalide.') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    const err = new Error('Token Google sans identité — impossible de te connecter.') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  // Google says the email isn't verified — paranoid stop so we never
  // accidentally trust an unverified address that could collide with
  // another seller's account.
  if (payload.email_verified === false) {
    const err = new Error('Ton email Google n\'est pas vérifié.') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase().trim();
  const name = payload.name?.trim() || email.split('@')[0];
  const avatar = payload.picture || undefined;

  // ── Branch 1 — known googleId
  let user = await User.findOne({ googleId });

  // ── Branch 2 — existing email-only account, link it
  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      // Mark verified now that Google has confirmed the email.
      user.emailVerified = true;
      if (!user.avatar && avatar) user.avatar = avatar;
      await user.save();
      void logActivity({
        type: 'user.link.google',
        message: `Compte ${email} lié à Google`,
        userId: user._id,
      });
    }
  }

  // ── Branch 3 — fresh sign-up
  let createdSubscription = false;
  if (!user) {
    user = await User.create({
      email,
      googleId,
      name,
      avatar,
      emailVerified: true,
      // password intentionally absent — Google-only account
    });
    await Subscription.create({
      userId: user._id,
      plan: 'free',
      status: 'active',
      storeLimit: 3,
      productLimitPerStore: 25,
    });
    createdSubscription = true;
    void logActivity({
      type: 'user.signup',
      message: `Nouveau seller (Google) : ${user.email}`,
      userId: user._id,
      metadata: { name: user.name, provider: 'google' },
    });
  }

  // Suspended account — same gate as the email/password login.
  if (user.suspended) {
    const err = new Error(
      user.suspendedReason
        ? `Compte suspendu: ${user.suspendedReason}`
        : 'Compte suspendu. Contacte le support.'
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 403;
    err.code = 'account_suspended';
    throw err;
  }

  // Track the login. Best-effort.
  user.lastLoginAt = new Date();
  if (input.ip) user.lastLoginIp = input.ip;
  user.save().catch(() => undefined);

  const token = signSessionToken(user);
  const sub = createdSubscription
    ? await Subscription.findOne({ userId: user._id })
    : await Subscription.findOne({ userId: user._id });
  return {
    user: toSafeUser(user),
    token,
    subscription: sub ? { plan: sub.plan, storeLimit: sub.storeLimit } : undefined,
  };
}
