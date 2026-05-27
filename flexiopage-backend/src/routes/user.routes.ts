import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(sanitizeMiddleware);

router.get('/profile', userController.getProfile);
router.patch('/profile', userController.updateProfile);
router.post('/change-password', userController.changePassword);
router.post('/change-email', userController.changeEmail);
router.get('/stores', userController.getStores);

export default router;
