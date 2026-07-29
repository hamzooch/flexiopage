/**
 * Authenticated wallet endpoints used by the dashboard "Solde" page.
 *   GET  /api/wallet                  — balance + last 50 transactions
 *   POST /api/wallet/top-up           — manual top-up (dev/admin); will be
 *                                       superseded by a payment-provider hook
 *                                       once integrated.
 */
import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware, type AuthRequest } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import { getOrCreateWallet, credit, commissionFor, aiCostTokens, usdToTokensRate, usdToTokens } from '../services/wallet.service';
import { getSettings, type AiKind } from '../models/Settings.model';
import { Payout, type PayoutMethod } from '../models/Payout.model';
import { Store } from '../models/Store.model';
import { Order } from '../models/Order.model';
import { PaymentLog } from '../models/PaymentLog.model';

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
  const settings = await getSettings();
  // Payout currency isn't the wallet currency (which is pinned to USD for the
  // AI/top-up bucket). It's the currency of the seller's primary store — that's
  // the currency his customers pay in, so that's what makes sense to display
  // for the payout balance. Fallback to wallet.currency if the seller has no
  // store yet (edge case, staff accounts, etc.).
  const primaryStore = await Store.findOne({ ownerId: userId })
    .sort({ createdAt: 1 })
    .select('settings.currency storeType')
    .lean();
  const payoutCurrency = primaryStore?.settings?.currency || wallet.currency;
  const minForCur = settings.platform?.payoutMinimums?.[payoutCurrency] ?? 0;
  // Commission affichée selon le type du store principal (digital / physical).
  // Fallback : commissionRate legacy si le taux type-spécifique n'est pas défini.
  const storeType: 'digital' | 'physical' = primaryStore?.storeType === 'physical' ? 'physical' : 'digital';
  const displayedCommissionRate =
    storeType === 'digital'
      ? settings.platform?.commissionRateDigital ?? settings.platform?.commissionRate ?? 0.15
      : settings.platform?.commissionRatePhysical ?? settings.platform?.commissionRate ?? 0.05;
  res.json({
    wallet: {
      balance: wallet.balance,
      aiBalance: wallet.aiBalance,
      payoutBalance: wallet.payoutBalance || 0,
      currency: wallet.currency,
      /** Devise dans laquelle le payoutBalance doit être affiché (currency du store principal). */
      payoutCurrency,
      commissionRate: Number(process.env.COMMISSION_RATE || 0.03),
      commissionCap: Number(process.env.COMMISSION_CAP || 1500),
      /**
       * Platform commission on online paid orders (0.15 = 15%). Résolue selon
       * le type du store principal (digital vs physical) pour que le vendeur
       * voie EXACTEMENT le taux qui lui sera appliqué.
       */
      platformCommissionRate: displayedCommissionRate,
      /** Type du store principal — utile pour l'UI (ex: mention "digital"). */
      storeType,
      /** Min amount required to request a payout in the payout currency. */
      payoutMinimum: minForCur,
      aiCosts,
      aiTokenCosts: aiCosts,
      usdToTokens: rate,
      transactions,
      updatedAt: wallet.updatedAt,
    },
  });
});

/**
 * GET /api/wallet/sales-breakdown — where the seller's earnings came from.
 *
 * The generic /api/wallet endpoint only exposes the payout balance and the
 * wallet ledger (sale_credit / payout_debit entries), which doesn't say
 * which mobile-money rail funded each sale. Sellers want to know if their
 * customers pay via Wave, OM, MTN… so this endpoint joins recent orders
 * with the CinetPay webhook PaymentLog to surface the actual method used
 * per transaction, plus a monthly per-method breakdown for the KPI cards.
 */
router.get('/sales-breakdown', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Find every store this seller owns — sales are aggregated across all of them.
  const stores = await Store.find({ ownerId: userId }).select('_id name slug').lean();
  if (stores.length === 0) {
    res.json({
      recentSales: [],
      methodBreakdown: [],
      thisMonth: { revenue: 0, txCount: 0, paidOutTotal: 0 },
    });
    return;
  }
  const storeIds = stores.map((s) => s._id);
  const storeMap = new Map(stores.map((s) => [String(s._id), s]));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Pull the last 20 paid orders across all the seller's stores. We fetch a
  // wider window than strictly needed so joining with PaymentLog doesn't
  // leave the table sparse when some orders lack a webhook log.
  const recentOrders = await Order.find({
    storeId: { $in: storeIds },
    paymentStatus: 'paid',
    paymentProvider: { $in: ['cinetpay', 'moneróo', 'flutterwave'] },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select({
      orderNumber: 1, total: 1, currency: 1, email: 1, paymentReference: 1,
      paymentProvider: 1, createdAt: 1, storeId: 1,
    })
    .lean();

  // Map order → payment_method via the webhook payload. The reference
  // stored on Order is the CinetPay transactionId, which is what we log
  // in rawPayload.transaction_id — index-friendly lookup.
  const refs = recentOrders.map((o) => o.paymentReference).filter(Boolean) as string[];
  const webhookLogs = refs.length
    ? await PaymentLog.find({
        event: 'webhook',
        status: 'paid',
        reference: { $in: refs },
      })
        .select({ reference: 1, rawPayload: 1 })
        .lean()
    : [];
  const methodByRef = new Map<string, string>();
  for (const log of webhookLogs) {
    const method = (log.rawPayload as { payment_method?: string })?.payment_method;
    if (log.reference && method) methodByRef.set(log.reference, method);
  }

  const commissionRate = Number(process.env.COMMISSION_RATE || 0.03);
  const recentSales = recentOrders.map((o) => {
    const store = storeMap.get(String(o.storeId));
    const gross = o.total || 0;
    const commission = commissionFor(gross);
    return {
      orderId: String(o._id),
      orderNumber: o.orderNumber,
      gross,
      commission,
      net: gross - commission,
      currency: o.currency,
      buyerEmail: o.email,
      paymentProvider: o.paymentProvider,
      paymentMethod: o.paymentReference ? methodByRef.get(o.paymentReference) : undefined,
      createdAt: o.createdAt,
      storeName: store?.name,
      storeSlug: store?.slug,
    };
  });

  // Monthly per-method breakdown — same join, but scoped to current month
  // and computed as an aggregation for scale.
  const paidThisMonth = await Order.find({
    storeId: { $in: storeIds },
    paymentStatus: 'paid',
    createdAt: { $gte: startOfMonth },
  })
    .select({ total: 1, paymentReference: 1 })
    .lean();

  let monthlyRevenue = 0;
  const methodCounts = new Map<string, { count: number; revenue: number }>();
  const monthRefs = paidThisMonth.map((o) => o.paymentReference).filter(Boolean) as string[];
  const monthMethodLogs = monthRefs.length
    ? await PaymentLog.find({
        event: 'webhook',
        status: 'paid',
        reference: { $in: monthRefs },
      })
        .select({ reference: 1, rawPayload: 1 })
        .lean()
    : [];
  const monthMethodByRef = new Map<string, string>();
  for (const log of monthMethodLogs) {
    const method = (log.rawPayload as { payment_method?: string })?.payment_method;
    if (log.reference && method) monthMethodByRef.set(log.reference, method);
  }
  for (const o of paidThisMonth) {
    monthlyRevenue += o.total || 0;
    const method =
      (o.paymentReference && monthMethodByRef.get(o.paymentReference)) || 'AUTRE';
    const prev = methodCounts.get(method) || { count: 0, revenue: 0 };
    methodCounts.set(method, { count: prev.count + 1, revenue: prev.revenue + (o.total || 0) });
  }
  const txCount = paidThisMonth.length;
  const methodBreakdown = Array.from(methodCounts.entries())
    .map(([method, v]) => ({
      method,
      count: v.count,
      revenue: v.revenue,
      share: txCount > 0 ? v.count / txCount : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Already paid out by admin — sum of Payout.status='paid' for this user.
  const paidOutAgg = await Payout.aggregate<{ _id: null; total: number }>([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  res.json({
    recentSales,
    methodBreakdown,
    thisMonth: {
      revenue: monthlyRevenue,
      txCount,
      commissionRate,
      paidOutTotal: paidOutAgg[0]?.total || 0,
    },
  });
});

// ── Payouts (versements des ventes en ligne au vendeur) ───────────────

/** POST /api/wallet/payouts — le vendeur demande un versement. */
router.post('/payouts', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { amount, method, destination, sellerNote } = (req.body || {}) as {
    amount?: number;
    method?: PayoutMethod;
    destination?: Record<string, string>;
    sellerNote?: string;
  };
  const value = Number(amount);
  if (!value || value <= 0) {
    res.status(400).json({ error: 'amount must be positive' });
    return;
  }
  const allowedMethods: PayoutMethod[] = ['wave', 'orange_money', 'mtn_momo', 'bank_transfer'];
  if (!method || !allowedMethods.includes(method)) {
    res.status(400).json({ error: 'method must be one of ' + allowedMethods.join(', ') });
    return;
  }
  if (!destination || Object.keys(destination).length === 0) {
    res.status(400).json({ error: 'destination required' });
    return;
  }
  // Mobile money → require phone; bank transfer → require accountName + iban
  if (method === 'bank_transfer') {
    if (!destination.accountName || !destination.iban) {
      res.status(400).json({ error: 'bank_transfer requires accountName and iban' });
      return;
    }
  } else if (!destination.phone) {
    res.status(400).json({ error: 'mobile money requires phone' });
    return;
  }

  const wallet = await getOrCreateWallet(userId);
  const settings = await getSettings();
  const minForCur = settings.platform?.payoutMinimums?.[wallet.currency] ?? 0;
  if (value < minForCur) {
    res.status(400).json({
      error: `Minimum de retrait: ${minForCur} ${wallet.currency}`,
      code: 'below_minimum',
      minimum: minForCur,
    });
    return;
  }
  if (value > (wallet.payoutBalance || 0)) {
    res.status(400).json({
      error: 'Solde insuffisant',
      code: 'insufficient_balance',
      available: wallet.payoutBalance || 0,
    });
    return;
  }

  // Freeze the amount now — subtract from payoutBalance so the seller can't
  // double-spend it. If admin rejects later, we refund.
  wallet.payoutBalance = (wallet.payoutBalance || 0) - value;
  await wallet.save();

  const payout = await Payout.create({
    userId,
    currency: wallet.currency,
    amount: value,
    method,
    destination,
    sellerNote: sellerNote?.trim() || undefined,
    status: 'pending',
    requestedAt: new Date(),
  });

  res.json({ ok: true, payout });
});

/** GET /api/wallet/payouts — l'historique des demandes de payout du vendeur. */
router.get('/payouts', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const payouts = await Payout.find({ userId })
    .sort({ requestedAt: -1 })
    .limit(100)
    .lean();
  res.json({ payouts });
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
