/**
 * Authenticated wallet endpoints used by the dashboard "Solde" page.
 *   GET  /api/wallet                  — balance + last 50 transactions
 *   POST /api/wallet/top-up           — manual top-up (dev/admin); will be
 *                                       superseded by a payment-provider hook
 *                                       once integrated.
 */
import { Router, Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import { getOrCreateWallet, credit, commissionFor, AI_COSTS } from '../services/wallet.service';

const router = Router();
router.use(authMiddleware);
router.use(sanitizeMiddleware);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const wallet = await getOrCreateWallet(userId);
  // Return the most recent 50 transactions, newest first
  const transactions = [...wallet.transactions]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 50);
  res.json({
    wallet: {
      balance: wallet.balance,
      aiBalance: wallet.aiBalance,
      currency: wallet.currency,
      commissionRate: Number(process.env.COMMISSION_RATE || 0.03),
      commissionCap: Number(process.env.COMMISSION_CAP || 1500),
      aiCosts: AI_COSTS,
      transactions,
      updatedAt: wallet.updatedAt,
    },
  });
});

router.post('/top-up', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { amount, paymentReference, note, target } = (req.body || {}) as {
    amount?: number;
    paymentReference?: string;
    note?: string;
    target?: 'main' | 'ai';
  };
  const value = Number(amount);
  if (!value || value <= 0) {
    res.status(400).json({ error: 'amount must be positive' });
    return;
  }
  const bucket = target === 'ai' ? 'ai' : 'main';
  const result = await credit({
    userId,
    amount: value,
    bucket,
    kind: bucket === 'ai' ? 'top_up_ai' : 'top_up',
    paymentReference: paymentReference?.trim() || undefined,
    note: note?.trim() || (bucket === 'ai' ? 'Recharge solde IA' : 'Recharge'),
  });
  res.json({
    ok: true,
    alreadyApplied: result.alreadyApplied,
    bucket,
    balance: result.wallet.balance,
    aiBalance: result.wallet.aiBalance,
    transaction: result.transaction,
  });
});

router.get('/preview-commission', async (req: AuthRequest, res: Response): Promise<void> => {
  const total = Number(req.query.total);
  res.json({ commission: commissionFor(total) });
});

export default router;
