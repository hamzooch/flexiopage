import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User.model';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export interface AuthRequest extends Request {
  user?: IUser;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token =
    req.cookies?.token ||
    req.headers.authorization?.replace('Bearer ', '') ||
    req.headers['x-access-token'];

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    User.findById(decoded.userId)
      .then((user) => {
        if (!user) {
          res.status(401).json({ error: 'User not found' });
          return;
        }
        req.user = user;
        next();
      })
      .catch(() => {
        res.status(401).json({ error: 'Invalid token' });
      });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Optional auth: attach user if token present, don't fail if missing */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token =
    req.cookies?.token ||
    req.headers.authorization?.replace('Bearer ', '') ||
    req.headers['x-access-token'];

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    User.findById(decoded.userId)
      .then((user) => {
        if (user) req.user = user;
        next();
      })
      .catch(() => next());
  } catch {
    next();
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions', requiredRole: roles });
      return;
    }
    next();
  };
}

/** Convenience helpers for the admin / superadmin tiers. */
export const requireAdmin = requireRole('admin', 'superadmin');
export const requireSuperAdmin = requireRole('superadmin');
