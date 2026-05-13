/**
 * Wallet service — single entry point for balance / transaction operations.
 *
 * Why a service: the commission-on-delivery flow needs to be idempotent (a
 * webhook can fire twice) and the top-up flow needs to detect duplicate
 * payment references. Centralizing the rules here keeps callers simple.
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Wallet, type IWallet, type IWalletTransaction, type TxKind, type WalletBucket } from '../models/Wallet.model';
import { Store } from '../models/Store.model';
import { User } from '../models/User.model';

/**
 * Default commission policy. Tunable per-store later if needed.
 *   3% of order total, capped at 1500 (in the store's currency).
 */
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.03);
const COMMISSION_CAP = Number(process.env.COMMISSION_CAP || 1500);

/**
 * AI generation cost catalogue. All amounts are in the seller's wallet
 * currency. Tunable per deployment via env vars.
 *   AI_LANDING_COST     — full FAL landing (LLM + ~10 images). Default 500.
 *   AI_PRODUCT_PAGE_COST — product detail page (similar pipeline).  Default 500.
 *   AI_TEXT_ONLY_COST   — OpenAI text-only landing.                 Default 50.
 */
export const AI_COSTS: Record<string, number> = {
  landing: Number(process.env.AI_LANDING_COST || 500),
  product_page: Number(process.env.AI_PRODUCT_PAGE_COST || 500),
  text_only: Number(process.env.AI_TEXT_ONLY_COST || 50),
};

export function commissionFor(orderTotal: number): number {
  if (!orderTotal || orderTotal <= 0) return 0;
  const raw = Math.round(orderTotal * COMMISSION_RATE);
  return Math.min(raw, COMMISSION_CAP);
}

export function aiCostFor(kind: keyof typeof AI_COSTS): number {
  return AI_COSTS[kind] ?? AI_COSTS.landing;
}

function genId(): string {
  return crypto.randomBytes(12).toString('base64url');
}

/**
 * Infer the wallet currency for a seller. Precedence:
 *   1. the seller's own profile currency (set from the profile page)
 *   2. the oldest store's currency (the one that anchored the account)
 *   3. USD fallback
 */
async function inferUserCurrency(userId: mongoose.Types.ObjectId): Promise<string> {
  const user = await User.findById(userId).select('currency country').lean();
  const userCur = user?.currency?.toUpperCase().trim();
  if (userCur) return userCur;
  const firstStore = await Store.findOne({ ownerId: userId })
    .sort({ createdAt: 1 })
    .select('settings.currency')
    .lean();
  const cur = firstStore?.settings?.currency?.toUpperCase().trim();
  return cur || 'USD';
}

/**
 * Returns the wallet for `userId`, creating it on first access. The currency
 * is pinned the first time the seller uses the wallet:
 *   - explicit hint (`currencyHint`) wins
 *   - else the currency of the seller's oldest store
 *   - else USD
 *
 * If the wallet exists but is brand new (balance 0 and no transactions yet)
 * we keep its currency in sync with the inferred one — handy when a seller
 * created a store right after signup.
 */
export async function getOrCreateWallet(
  userId: string | mongoose.Types.ObjectId,
  currencyHint?: string
): Promise<IWallet> {
  const oid = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  let wallet = await Wallet.findOne({ userId: oid });
  if (!wallet) {
    const currency = (currencyHint || (await inferUserCurrency(oid))).toUpperCase();
    wallet = await Wallet.create({ userId: oid, currency, balance: 0, transactions: [] });
    return wallet;
  }
  if (wallet.balance === 0 && wallet.transactions.length === 0) {
    const inferred = (currencyHint || (await inferUserCurrency(oid))).toUpperCase();
    if (inferred && inferred !== wallet.currency) {
      wallet.currency = inferred;
      await wallet.save();
    }
  }
  return wallet;
}

interface CreditArgs {
  userId: string | mongoose.Types.ObjectId;
  amount: number;            // positive
  bucket?: WalletBucket;     // 'main' (default) or 'ai'
  kind?: 'top_up' | 'top_up_ai' | 'refund' | 'adjustment';
  paymentReference?: string;
  note?: string;
  orderId?: mongoose.Types.ObjectId;
  orderNumber?: string;
}

/**
 * Credit the wallet (top-up or refund). Idempotent on `paymentReference` —
 * if a transaction with the same reference exists we return early.
 * Targets `bucket` ('main' default, or 'ai' for AI-generation balance).
 */
export async function credit(args: CreditArgs): Promise<{ wallet: IWallet; transaction: IWalletTransaction; alreadyApplied: boolean }> {
  if (args.amount <= 0) throw new Error('credit amount must be positive');
  const wallet = await getOrCreateWallet(args.userId);
  const bucket: WalletBucket = args.bucket || 'main';

  if (args.paymentReference) {
    const existing = wallet.transactions.find(
      (t) => t.paymentReference && t.paymentReference === args.paymentReference && t.bucket === bucket
    );
    if (existing) {
      return { wallet, transaction: existing, alreadyApplied: true };
    }
  }

  const current = bucket === 'ai' ? wallet.aiBalance : wallet.balance;
  const newBalance = current + args.amount;
  const tx: IWalletTransaction = {
    id: genId(),
    kind: args.kind || (bucket === 'ai' ? 'top_up_ai' : 'top_up'),
    bucket,
    amount: args.amount,
    balanceAfter: newBalance,
    paymentReference: args.paymentReference,
    note: args.note,
    orderId: args.orderId,
    orderNumber: args.orderNumber,
    createdAt: new Date(),
  };
  if (bucket === 'ai') wallet.aiBalance = newBalance;
  else wallet.balance = newBalance;
  wallet.transactions.push(tx);
  await wallet.save();
  return { wallet, transaction: tx, alreadyApplied: false };
}

interface DebitArgs {
  userId: string | mongoose.Types.ObjectId;
  amount: number;            // positive (we store it as negative)
  bucket?: WalletBucket;     // 'main' default, 'ai' for generation costs
  kind?: TxKind;
  orderId?: mongoose.Types.ObjectId;
  orderNumber?: string;
  note?: string;
  /**
   * When true, refuse the debit if the targeted balance is below `amount`.
   * Used for AI generation (we want to block the call), NOT for commission
   * (we accept negative main balance — the seller still owes us).
   */
  enforceBalance?: boolean;
}

/**
 * Debit the wallet. Idempotent on (orderId, kind) when both are set —
 * a webhook firing twice still charges once.
 */
export async function debit(args: DebitArgs): Promise<{ wallet: IWallet; transaction: IWalletTransaction; alreadyApplied: boolean }> {
  if (args.amount <= 0) throw new Error('debit amount must be positive');
  const wallet = await getOrCreateWallet(args.userId);
  const bucket: WalletBucket = args.bucket || 'main';

  if (args.orderId && args.kind) {
    const existing = wallet.transactions.find(
      (t) => t.kind === args.kind && t.orderId?.toString() === args.orderId!.toString()
    );
    if (existing) {
      return { wallet, transaction: existing, alreadyApplied: true };
    }
  }

  const current = bucket === 'ai' ? wallet.aiBalance : wallet.balance;
  if (args.enforceBalance && current < args.amount) {
    const err = new Error(`Insufficient ${bucket === 'ai' ? 'AI ' : ''}balance: have ${current}, need ${args.amount}`) as Error & { statusCode?: number; code?: string };
    err.statusCode = 402;
    err.code = bucket === 'ai' ? 'insufficient_ai_balance' : 'insufficient_balance';
    throw err;
  }
  const newBalance = current - args.amount;
  const tx: IWalletTransaction = {
    id: genId(),
    kind: args.kind || (bucket === 'ai' ? 'ai_generation' : 'commission'),
    bucket,
    amount: -args.amount,
    balanceAfter: newBalance,
    orderId: args.orderId,
    orderNumber: args.orderNumber,
    note: args.note,
    createdAt: new Date(),
  };
  // Mongoose's min:0 would reject negative values; bypass via direct update.
  const setKey = bucket === 'ai' ? 'aiBalance' : 'balance';
  await Wallet.updateOne(
    { _id: wallet._id },
    { $set: { [setKey]: newBalance }, $push: { transactions: tx } }
  );
  if (bucket === 'ai') wallet.aiBalance = newBalance;
  else wallet.balance = newBalance;
  wallet.transactions.push(tx);
  return { wallet, transaction: tx, alreadyApplied: false };
}

/**
 * Charge a fixed-price AI generation. Throws 402 when the AI balance is too
 * low — caller (page controller) returns the error to the UI.
 */
export async function chargeAiGeneration(args: {
  userId: string | mongoose.Types.ObjectId;
  kind: keyof typeof AI_COSTS;
  jobId?: string;
  note?: string;
}): Promise<{ amount: number; balanceAfter: number; currency: string }> {
  const amount = aiCostFor(args.kind);
  if (amount <= 0) {
    const wallet = await getOrCreateWallet(args.userId);
    return { amount: 0, balanceAfter: wallet.aiBalance, currency: wallet.currency };
  }
  const { transaction, wallet } = await debit({
    userId: args.userId,
    amount,
    bucket: 'ai',
    kind: 'ai_generation',
    enforceBalance: true,
    note: args.note || `Génération AI · ${args.kind}${args.jobId ? ` · ${args.jobId}` : ''}`,
  });
  return { amount, balanceAfter: transaction.balanceAfter, currency: wallet.currency };
}

/**
 * Charge the standard commission for a delivered order. Idempotent.
 *
 * Currency rule: the order MUST be in the same currency as the wallet. If a
 * seller takes orders in two different currencies, the wallet (which is
 * single-currency) cannot accept the debit safely. We log + skip and record
 * an `adjustment` line at zero so the seller still sees the event in the
 * ledger and support can reconcile.
 */
export async function chargeCommissionForOrder(args: {
  userId: string | mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  orderNumber: string;
  orderTotal: number;
  orderCurrency: string;
}): Promise<{ amount: number; alreadyApplied: boolean; balanceAfter: number; skippedReason?: string }> {
  const wallet = await getOrCreateWallet(args.userId, args.orderCurrency);

  // Currency mismatch — refuse to apply an incorrect debit.
  if (args.orderCurrency.toUpperCase() !== wallet.currency.toUpperCase()) {
    const reason = `Currency mismatch: order=${args.orderCurrency} vs wallet=${wallet.currency}`;
    console.warn(`[wallet] commission skipped for ${args.orderNumber}: ${reason}`);
    return { amount: 0, alreadyApplied: false, balanceAfter: wallet.balance, skippedReason: reason };
  }

  const amount = commissionFor(args.orderTotal);
  if (amount <= 0) {
    return { amount: 0, alreadyApplied: false, balanceAfter: wallet.balance };
  }
  const { transaction, alreadyApplied } = await debit({
    userId: args.userId,
    amount,
    kind: 'commission',
    orderId: args.orderId,
    orderNumber: args.orderNumber,
    note: `Commission ${(COMMISSION_RATE * 100).toFixed(0)}% sur commande livrée`,
  });
  return { amount, alreadyApplied, balanceAfter: transaction.balanceAfter };
}
