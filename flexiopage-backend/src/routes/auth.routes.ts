import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, sanitizeMiddleware, authController.register);
router.post('/login', authRateLimiter, sanitizeMiddleware, authController.login);
// Google OAuth — rate-limited like /login since it's an unauthenticated
// entry point exposed to the public internet.
router.post('/google', authRateLimiter, authController.googleSignIn);
router.post('/logout', authController.logout);
// Email verification — clic sur le lien dans le mail Resend. Rate-limit
// pour bloquer un brute-force du token de 32 bytes (ceinture+bretelles,
// l'entropie suffit déjà).
router.post('/verify-email', authRateLimiter, authController.verifyEmail);
// Renvoyer le mail de vérification. Auth required pour éviter qu'un
// inconnu spam Resend en envoyant des mails à toutes nos adresses.
router.post('/resend-verification', authMiddleware, authController.resendVerification);
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: (req as import('../middleware/auth.middleware').AuthRequest).user });
});

export default router;
