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
import * as adminExtras from '../controllers/admin-extras.controller';
import * as complaint from '../controllers/complaint.controller';
import * as payments from '../controllers/payments.controller';

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
router.get('/activity', admin.listActivity);

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

// Auth toggles — kill-switch vérification email. Lecture admin, mutation
// superadmin parce que ça touche à un mécanisme de sécurité du signup.
router.get('/settings/auth', admin.getAuthSettings);
router.patch('/settings/auth', requireSuperAdmin, admin.updateAuthSettings);

// Renvoi manuel du mail de vérification depuis le panel admin (cas support
// quand Resend a raté ou que le mail est tombé en spam et a été supprimé).
router.post('/users/:userId/resend-verification', requireAdminWrite, admin.adminResendVerification);

// Réclamations — admin tier (read + reply + state)
router.get('/complaints', complaint.listComplaintsAdmin);
router.get('/complaints/:id', complaint.getComplaintAdmin);
router.patch('/complaints/:id', complaint.patchComplaintAdmin);
router.post('/complaints/:id/messages', complaint.postAdminMessage);

// ── Quality-of-life admin endpoints ──
router.get('/audit', adminExtras.listAuditLogs);
router.get('/staff', adminExtras.listStaff);
router.get('/health', adminExtras.getHealth);
router.get('/reports', adminExtras.getReports);
router.get('/exports/:type', adminExtras.exportCsv);
router.post('/users/bulk', requireAdminWrite, adminExtras.bulkUserAction);
router.patch('/stores/:storeId/commission', requireSuperAdmin, adminExtras.setStoreCommission);
router.get('/stores/:storeId/delivery-config', adminExtras.getStoreDeliveryConfig);
router.patch('/stores/:storeId/delivery-config', requireAdminWrite, adminExtras.patchStoreDeliveryConfig);

// ── Store limits (comptes autorisés à dépasser la limite par défaut) ──
router.get('/store-limits', adminExtras.getStoreLimits);
router.patch('/users/:userId/store-limit', requireAdminWrite, adminExtras.setUserStoreLimit);

// ── Limites de messages chatbot (plafond admin ; l'owner ajuste dessous) ──
router.get('/bot-limits', adminExtras.listBotLimits);
router.get('/stores/:storeId/bot-limits', adminExtras.getStoreBotLimits);
router.patch('/stores/:storeId/bot-limits', requireAdminWrite, adminExtras.setStoreBotLimits);

// ── Delivery / webhooks dashboard (cross-store) ──
router.get('/delivery/overview', adminExtras.getDeliveryOverview);
router.get('/delivery/logs', adminExtras.getWebhookLogs);
router.get('/stores/:storeId/delivery/fingerprint', adminExtras.getStoreDeliveryFingerprint);
router.post('/stores/:storeId/orders/:orderId/redispatch', requireAdminWrite, adminExtras.redispatchOrder);

// ── Payment gateways (Moneróo, etc.) ──
router.get('/payments/config', payments.getPaymentConfig);
router.post('/payments/config', requireAdminWrite, payments.updatePaymentConfig);
router.get('/payments/transactions', payments.listPaymentTransactions);
router.get('/payments/webhooks', payments.listWebhookLogs);
router.get('/payments/stats', payments.getPaymentStats);
router.post('/payments/test', requireAdminWrite, payments.testPaymentFlow);
router.post('/payments/webhooks/:logId/retry', requireAdminWrite, payments.retryWebhook);

export default router;
