/**
 * Platform-admin routes. Two tiers:
 *   - requireAdmin (admin OR superadmin) for read + most mutations
 *   - requireSuperAdmin for sensitive ops:
 *       · changing roles
 *       · funding wallets (top-up)
 *       · deleting users
 */
import { Router } from 'express';
import { authMiddleware, requireAdmin, requireSuperAdmin } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import * as admin from '../controllers/admin.controller';
import * as complaint from '../controllers/complaint.controller';

const router = Router();

router.use(authMiddleware);
router.use(sanitizeMiddleware);
router.use(requireAdmin);

// Read endpoints (admin + superadmin)
router.get('/overview', admin.getOverview);
router.get('/users', admin.listUsers);
router.get('/users/:userId', admin.getUserDetail);
router.get('/stores', admin.listStores);
router.get('/orders', admin.listOrders);
router.get('/wallets', admin.listWallets);

// Mutations open to admin (general user updates excluding role)
router.patch('/users/:userId', admin.patchUser);
router.post('/wallets/:userId/adjust', admin.adjustWallet);

// Superadmin-only — sensitive operations
router.patch('/users/:userId/role', requireSuperAdmin, admin.updateUserRole);
router.post('/wallets/:userId/credit', requireSuperAdmin, admin.creditWallet);
router.post('/users/:userId/reset-password', requireSuperAdmin, admin.resetUserPassword);
router.delete('/users/:userId', requireSuperAdmin, admin.deleteUser);

// Réclamations — admin tier (read + reply + state)
router.get('/complaints', complaint.listComplaintsAdmin);
router.get('/complaints/:id', complaint.getComplaintAdmin);
router.patch('/complaints/:id', complaint.patchComplaintAdmin);
router.post('/complaints/:id/messages', complaint.postAdminMessage);

export default router;
