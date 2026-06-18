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
import { getOrCreateWallet, credit, commissionFor, aiCostTokens, usdToTokensRate, usdToTokens } from '../services/wallet.service';
import type { AiKind } from '../models/Settings.model';

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
  // Coût par kind en tokens (le wallet AI est désormais un compteur de
  // tokens, pas une monnaie). Conservé sous la clé `aiCosts` pour ne pas
  // casser le frontend existant ; ajout de `aiTokenCosts` comme alias
  // explicite + `usdToTokens` pour que le formulaire de top-up affiche
  // « 10 USD → 15 tokens » sans recoder le ratio côté client.
  const KINDS: AiKind[] = ['landing', 'poster', 'product_page', 'text_only'];
  const aiCosts: Record<string, number> = {};
  for (const k of KINDS) {
    aiCosts[k] = await aiCostTokens(k);
  }
  const rate = await usdToTokensRate();
  res.json({
    wallet: {
      balance: wallet.balance,
      aiBalance: wallet.aiBalance,
      currency: wallet.currency,
      commissionRate: Number(process.env.COMMISSION_RATE || 0.03),
      commissionCap: Number(process.env.COMMISSION_CAP || 1500),
      aiCosts,
      aiTokenCosts: aiCosts,
      usdToTokens: rate,
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
  // Pour le bucket AI, le vendeur saisit un montant en USD ; on crédite
  // l'équivalent en tokens (1 USD = settings.aiPricing.usdToTokens). Le
  // bucket main reste en USD (1:1) — c'est la balance commission.
  const creditAmount = bucket === 'ai' ? await usdToTokens(value) : value;
  const rate = bucket === 'ai' ? await usdToTokensRate() : 1;
  const result = await credit({
    userId,
    amount: creditAmount,
    bucket,
    kind: bucket === 'ai' ? 'top_up_ai' : 'top_up',
    paymentReference: paymentReference?.trim() || undefined,
    note:
      note?.trim() ||
      (bucket === 'ai'
        ? `Recharge solde IA · ${value} USD → ${creditAmount} tokens`
        : 'Recharge'),
  });
  res.json({
    ok: true,
    alreadyApplied: result.alreadyApplied,
    bucket,
    balance: result.wallet.balance,
    aiBalance: result.wallet.aiBalance,
    // Pour le front : combien a-t-on réellement crédité (tokens si AI, USD
    // sinon) à partir de l'amount USD saisi, et quel ratio a été appliqué.
    credited: creditAmount,
    rate,
    transaction: result.transaction,
  });
});

router.get('/preview-commission', async (req: AuthRequest, res: Response): Promise<void> => {
  const total = Number(req.query.total);
  res.json({ commission: commissionFor(total) });
});

export default router;
