/**
 * Seller-facing complaint endpoints (a seller manages their own threads).
 * Admin-side lives under /api/admin/complaints (mounted in admin.routes.ts).
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import * as complaint from '../controllers/complaint.controller';

const router = Router();
router.use(authMiddleware);
router.use(sanitizeMiddleware);

router.post('/', complaint.createComplaint);
router.get('/', complaint.listMyComplaints);
router.get('/:id', complaint.getMyComplaint);
router.post('/:id/messages', complaint.postMyMessage);

export default router;
