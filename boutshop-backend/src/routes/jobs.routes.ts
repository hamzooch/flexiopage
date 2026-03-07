import { Router } from 'express';
import * as pageController from '../controllers/page.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(sanitizeMiddleware);

// Generic job poll — currently used by landing-page generation jobs
router.get('/:jobId', pageController.getGenerationJob);

export default router;
