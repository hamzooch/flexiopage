import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { uploadSingle } from '../controllers/media.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);

router.get('/profile', sanitizeMiddleware, userController.getProfile);
router.patch('/profile', sanitizeMiddleware, userController.updateProfile);
router.post('/change-password', sanitizeMiddleware, userController.changePassword);
router.post('/change-email', sanitizeMiddleware, userController.changeEmail);
router.get('/stores', sanitizeMiddleware, userController.getStores);
// Avatar upload is multipart and must NOT go through sanitizeMiddleware
// (would corrupt the binary body). It runs the multer single-file middleware
// first to populate req.file.
router.post('/avatar', uploadSingle, userController.uploadAvatar);

export default router;
