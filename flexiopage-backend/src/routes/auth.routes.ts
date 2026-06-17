import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { getSettings } from '../models/Settings.model';

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
router.get('/me', authMiddleware, async (req, res) => {
  const user = (req as import('../middleware/auth.middleware').AuthRequest).user;
  // Pousse les toggles plateforme avec le user pour que le frontend dashboard
  // sache notamment si la bannière « confirme ton email » doit s'afficher
  // (kill-switch admin). Cache 30 s côté Settings → coût négligeable.
  const settings = await getSettings();
  res.json({
    user,
    platform: {
      emailVerificationEnabled: settings.auth.emailVerificationEnabled,
    },
  });
});

export default router;
