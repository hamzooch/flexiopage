import { Router } from 'express';
import * as calculatorController from '../controllers/calculator.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/history', calculatorController.listHistory);
router.post('/save', calculatorController.saveSnapshot);
router.delete('/:id', calculatorController.deleteSnapshot);

export default router;
