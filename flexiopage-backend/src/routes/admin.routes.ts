/**
 * Platform-admin routes. Four tiers:
 *   - requireAdmin       (supervisor + admin + superadmin + owner) — read access
 *   - requireAdminWrite  (admin + superadmin + owner) — user/wallet mutations
 *   - requireSuperAdmin  (superadmin + owner) — role changes, top-ups, deletes,
 *                        creating new staff accounts
 *   - requireOwner       (owner) — granting the 'owner' role (enforced inside
 *                        the controllers)
 */
import { Router } from 'express';
import {
  authMiddleware,
  requireAdmin,
  requireAdminWrite,
  requireSuperAdmin,
} from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import * as admin from '../controllers/admin.controller';
import * as complaint from '../controllers/complaint.controller';

const router = Router();

router.use(authMiddleware);
router.use(sanitizeMiddleware);
router.use(requireAdmin);

// Read endpoints (any staff role, including supervisor)
router.get('/overview', admin.getOverview);
router.get('/overview/rich', admin.getOverviewRich);
router.get('/users', admin.listUsers);
router.get('/users/:userId', admin.getUserDetail);
router.get('/stores', admin.listStores);
router.get('/stores/:storeId/analytics', admin.getStoreDrilldown);
router.get('/orders', admin.listOrders);
router.get('/wallets', admin.listWallets);

// Mutations open to admin+ (excludes supervisor)
router.patch('/users/:userId', requireAdminWrite, admin.patchUser);
router.post('/wallets/:userId/adjust', requireAdminWrite, admin.adjustWallet);

// Superadmin+ — sensitive operations
router.post('/users', requireSuperAdmin, admin.createUser);
router.patch('/users/:userId/role', requireSuperAdmin, admin.updateUserRole);
router.post('/wallets/:userId/credit', requireSuperAdmin, admin.creditWallet);
router.post('/users/:userId/reset-password', requireSuperAdmin, admin.resetUserPassword);
router.delete('/users/:userId', requireSuperAdmin, admin.deleteUser);

// Pricing — admin reads, superadmin writes
router.get('/settings/ai-pricing', admin.getAiPricing);
router.put('/settings/ai-pricing', requireSuperAdmin, admin.updateAiPricing);

// Réclamations — admin tier (read + reply + state)
router.get('/complaints', complaint.listComplaintsAdmin);
router.get('/complaints/:id', complaint.getComplaintAdmin);
router.patch('/complaints/:id', complaint.patchComplaintAdmin);
router.post('/complaints/:id/messages', complaint.postAdminMessage);

export default router;
