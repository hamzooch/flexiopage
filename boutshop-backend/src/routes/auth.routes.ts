import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, sanitizeMiddleware, authController.register);
router.post('/login', authRateLimiter, sanitizeMiddleware, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: (req as import('../middleware/auth.middleware').AuthRequest).user });
});

export default router;
