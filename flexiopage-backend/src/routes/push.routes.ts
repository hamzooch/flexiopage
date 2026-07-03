import { Router } from 'express';
import * as push from '../controllers/push.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/sounds', push.getSounds);
router.post('/register', push.registerToken);
router.post('/unregister', push.unregisterToken);
router.patch('/sound', push.setSound);
router.post('/test', push.sendTest);

export default router;
