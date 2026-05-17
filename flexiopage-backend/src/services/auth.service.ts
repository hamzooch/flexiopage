import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { User, IUser } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';
import { logActivity } from './activity-log.service';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES = (process.env.JWT_EXPIRES || '7d') as SignOptions['expiresIn'];
const SALT_ROUNDS = 12;

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

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
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
