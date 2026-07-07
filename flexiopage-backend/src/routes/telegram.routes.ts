import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getTelegramStatus, startTelegramLink, unlinkTelegram } from '../controllers/telegram.controller';

// Endpoints vendeur (authentifiés). Le webhook Telegram lui-même est monté
// sous /api/webhooks/telegram (non authentifié, cf. webhooks.routes.ts).
const router = Router();

router.use(authMiddleware);
router.get('/status', getTelegramStatus);
router.post('/link', startTelegramLink);
router.post('/unlink', unlinkTelegram);

export default router;
