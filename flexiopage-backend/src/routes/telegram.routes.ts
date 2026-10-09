import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getTelegramStatus,
  openTelegramSession,
  startTelegramLink,
  unlinkTelegram,
  setTelegramPreferences,
  testTelegram,
} from '../controllers/telegram.controller';

// Endpoints vendeur (authentifiés). Le webhook Telegram lui-même est monté
// sous /api/webhooks/telegram (non authentifié, cf. webhooks.routes.ts).
const router = Router();

router.post('/open', openTelegramSession);
router.use(authMiddleware);
router.get('/status', getTelegramStatus);
router.post('/link', startTelegramLink);
router.post('/unlink', unlinkTelegram);
router.patch('/preferences', setTelegramPreferences);
router.post('/test', testTelegram);

export default router;
