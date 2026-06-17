import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password and name are required' });
    return;
  }
  const result = await authService.register({ email, password, name });
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
  try {
    const result = await authService.login({ email, password, ip });
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    // SameSite=strict in production blocks the cookie on ALL cross-site requests
    // (CSRF defence). Dev uses lax so localhost ports can talk to each other.
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('token', result.token, {
      httpOnly: true,
      maxAge,
      sameSite: isProd ? 'strict' : 'lax',
      secure: isProd,
      path: '/',
    });
    res.json(result);
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    res.status(e.statusCode || 500).json({
      error: e.message || 'Login failed',
      code: e.code,
    });
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
}

/**
 * POST /api/auth/google — sign in (or sign up) using a Google ID token.
 * Body: { credential: "<JWT issued by Google Identity Services>" }
 *
 * Mirrors the cookie + body behaviour of /login so the frontend can
 * treat the response identically. A failed verification returns 401.
 */
/**
 * POST /api/auth/verify-email — public. Body: { token: "<raw token from email link>" }.
 * Marque l'utilisateur correspondant comme vérifié, idempotent.
 */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Token manquant.' });
    return;
  }
  try {
    const result = await authService.verifyEmail(token);
    res.json(result);
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    res.status(e.statusCode || 500).json({
      error: e.message || 'Vérification échouée.',
      code: e.code,
    });
  }
}

/**
 * POST /api/auth/resend-verification — auth required. Re-génère un token et
 * renvoie un mail. Throttle 1/min côté service.
 */
export async function resendVerification(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { _id: string } }).user?._id;
  if (!userId) {
    res.status(401).json({ error: 'Non authentifié.' });
    return;
  }
  try {
    const result = await authService.resendVerification(userId);
    res.json(result);
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string; retryAfter?: number };
    if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
    res.status(e.statusCode || 500).json({
      error: e.message || 'Renvoi échoué.',
      code: e.code,
      retryAfter: e.retryAfter,
    });
  }
}

export async function googleSignIn(req: Request, res: Response): Promise<void> {
  const { credential } = req.body as { credential?: string };
  if (!credential || typeof credential !== 'string') {
    res.status(400).json({ error: 'Le champ "credential" est obligatoire.' });
    return;
  }
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
  try {
    const result = await authService.signInWithGoogle({ credential, ip });
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('token', result.token, {
      httpOnly: true,
      maxAge,
      sameSite: isProd ? 'strict' : 'lax',
      secure: isProd,
      path: '/',
    });
    res.json(result);
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    res.status(e.statusCode || 500).json({
      error: e.message || 'Google sign-in failed',
      code: e.code,
    });
  }
}
