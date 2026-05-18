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
