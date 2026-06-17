import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User, IUser } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';
import { getSettings } from '../models/Settings.model';
import { logActivity } from './activity-log.service';
import { sendVerificationEmail } from './email.service';

// ─────────────────────────────────────────────────────────────────────
// Email verification helpers
// ─────────────────────────────────────────────────────────────────────
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 1 min anti-spam

/** Tirage 32 bytes URL-safe — assez d'entropie pour qu'un brute-force soit irréaliste. */
function generateVerificationToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

/**
 * Best-effort : génère un token, l'enregistre, envoie le mail. N'échoue pas
 * le signup si l'envoi rate (le seller peut renvoyer plus tard via la
 * bannière dashboard).
 */
async function issueVerificationToken(user: IUser): Promise<void> {
  const { raw, hash } = generateVerificationToken();
  user.emailVerificationTokenHash = hash;
  user.emailVerificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  user.emailVerificationLastSentAt = new Date();
  await user.save();
  try {
    await sendVerificationEmail({ to: user.email, name: user.name, token: raw });
  } catch (err) {
    console.error('[auth] verification email send failed', err);
  }
}

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
  // Kill-switch global : si l'admin a désactivé la vérification email
  // depuis /admin/settings (ou si Resend est en panne et qu'on veut éviter
  // de bloquer les nouveaux signups), on auto-marque comme vérifié et on
  // n'envoie rien. Lecture du singleton settings — cached 30s en mémoire.
  const settings = await getSettings();
  const verificationEnabled = settings.auth.emailVerificationEnabled;
  const user = await User.create({
    email: input.email.toLowerCase().trim(),
    password: hashed,
    name: input.name.trim(),
    emailVerified: !verificationEnabled,
  });
  await Subscription.create({
    userId: user._id,
    plan: 'free',
    status: 'active',
    storeLimit: 3,
    productLimitPerStore: 25,
  });
  // Envoie le mail de vérification — best-effort, le compte est créé même
  // si Resend rate (le seller pourra renvoyer depuis la bannière dashboard).
  if (verificationEnabled) {
    await issueVerificationToken(user);
  }
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

// ─────────────────────────────────────────────────────────────────────
// Email verification — clic sur le lien envoyé par mail
// ─────────────────────────────────────────────────────────────────────

/**
 * Valide un token de vérification. Idempotent — un compte déjà vérifié
 * renvoie `alreadyVerified: true` sans erreur (utile si le seller clique
 * deux fois sur le lien depuis deux onglets).
 */
export async function verifyEmail(
  rawToken: string,
): Promise<{ ok: true; alreadyVerified: boolean }> {
  if (!rawToken || typeof rawToken !== 'string') {
    const err = new Error('Token manquant.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  // `select('+...')` parce que les champs de vérif sont en select: false.
  const user = await User.findOne({ emailVerificationTokenHash: hash })
    .select('+emailVerificationTokenHash +emailVerificationTokenExpiresAt');

  if (!user) {
    // Cas spécial : déjà vérifié → le token a été nettoyé, on ne peut pas
    // retrouver le user. Pour ne pas confondre le seller, on renvoie une
    // erreur claire.
    const err = new Error('Lien invalide ou déjà utilisé.') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'invalid_token';
    throw err;
  }
  if (user.emailVerified) {
    // Le hash matche, on était sur le point de re-vérifier — idempotent.
    return { ok: true, alreadyVerified: true };
  }
  if (
    user.emailVerificationTokenExpiresAt &&
    user.emailVerificationTokenExpiresAt.getTime() < Date.now()
  ) {
    const err = new Error('Ce lien a expiré. Demande-en un nouveau.') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'token_expired';
    throw err;
  }
  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationTokenExpiresAt = undefined;
  await user.save();
  void logActivity({
    type: 'user.email.verified',
    message: `Email vérifié : ${user.email}`,
    userId: user._id,
  });
  return { ok: true, alreadyVerified: false };
}

/**
 * Renvoie un nouveau lien de vérification au seller connecté. Throttle à
 * 1 mail par minute pour éviter qu'un script bourrine Resend.
 */
export async function resendVerification(userId: string): Promise<{ ok: true }> {
  // Respect du kill-switch : si l'admin a coupé la vérification, ré-envoi
  // refusé proprement (le seller ne devrait même pas voir le bouton mais
  // ceinture+bretelles si quelqu'un curl directement l'endpoint).
  const settings = await getSettings();
  if (!settings.auth.emailVerificationEnabled) {
    const err = new Error(
      'La vérification email est désactivée par l\'administrateur.',
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'verification_disabled';
    throw err;
  }
  const user = await User.findById(userId)
    .select('+emailVerificationTokenHash +emailVerificationTokenExpiresAt +emailVerificationLastSentAt');
  if (!user) {
    const err = new Error('Utilisateur introuvable.') as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if (user.emailVerified) {
    const err = new Error('Ton email est déjà vérifié.') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'already_verified';
    throw err;
  }
  if (
    user.emailVerificationLastSentAt &&
    Date.now() - user.emailVerificationLastSentAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS
  ) {
    const remaining = Math.ceil(
      (VERIFICATION_RESEND_COOLDOWN_MS - (Date.now() - user.emailVerificationLastSentAt.getTime())) / 1000,
    );
    const err = new Error(
      `Attends ${remaining} secondes avant de renvoyer un mail.`,
    ) as Error & { statusCode?: number; code?: string; retryAfter?: number };
    err.statusCode = 429;
    err.code = 'rate_limited';
    err.retryAfter = remaining;
    throw err;
  }
  await issueVerificationToken(user);
  return { ok: true };
}
