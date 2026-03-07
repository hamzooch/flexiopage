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
    res.cookie('token', result.token, { httpOnly: true, maxAge, sameSite: 'lax' });
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
