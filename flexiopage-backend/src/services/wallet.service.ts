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
import { getSettings, DEFAULT_AI_PRICING, type AiKind } from '../models/Settings.model';

/**
 * Default commission policy. Tunable per-store later if needed.
 *   3% of order total, capped at 1500 (in the store's currency).
 */
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.03);
const COMMISSION_CAP = Number(process.env.COMMISSION_CAP || 1500);

/**
 * AI generation pricing is stored in MongoDB (Settings singleton) and
 * edited by admins from /admin/settings. Depuis le passage au modèle
 * token (2026-06-18), les prix sont en **tokens** : le wallet AI ne
 * porte plus une monnaie mais un compteur de tokens. Le vendeur achète
 * des tokens via top-up (1 USD = settings.aiPricing.usdToTokens tokens).
 */
export type AI_COSTS = AiKind;

export function commissionFor(orderTotal: number): number {
  if (!orderTotal || orderTotal <= 0) return 0;
  const raw = Math.round(orderTotal * COMMISSION_RATE);
  return Math.min(raw, COMMISSION_CAP);
}

/** Token cost for one AI generation kind (lu depuis Settings, fallback défauts). */
export async function aiCostTokens(kind: AiKind): Promise<number> {
  const s = await getSettings();
  const price = s.aiPricing?.prices?.[kind];
  return typeof price === 'number' && price >= 0
    ? price
    : DEFAULT_AI_PRICING.prices[kind] ?? DEFAULT_AI_PRICING.prices.landing;
}

/** Nombre de tokens reçus pour 1 USD versé (lu depuis Settings). */
export async function usdToTokensRate(): Promise<number> {
  const s = await getSettings();
  const r = s.aiPricing?.usdToTokens;
  return typeof r === 'number' && r > 0 ? r : DEFAULT_AI_PRICING.usdToTokens;
}

/** Convertit un montant USD en tokens via le ratio courant, arrondi. */
export async function usdToTokens(amountUsd: number): Promise<number> {
  const rate = await usdToTokensRate();
  return Math.round(amountUsd * rate);
}

// Alias legacy — appelés par d'anciens contrôleurs avant la refonte tokens.
// Renvoient la même valeur (en tokens) ; on garde les noms le temps que les
// callers basculent, sans casser le runtime.
export const aiCostUSD = aiCostTokens;
export async function aiCostInCurrency(kind: AiKind, _currency?: string): Promise<number> {
  return aiCostTokens(kind);
}

function genId(): string {
  return crypto.randomBytes(12).toString('base64url');
}

/**
 * Wallet currency is pinned to USD platform-wide — both the main and AI
 * balances are denominated in USD regardless of the seller's profile or
 * store currency. Kept as a function so callers don't have to change.
 */
async function inferUserCurrency(_userId: mongoose.Types.ObjectId): Promise<string> {
  return 'USD';
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
 * Charge a fixed-price AI generation, en tokens. Throws 402 when the AI
 * balance (tokens) is too low — caller surfaces it pour proposer un top-up.
 * Le champ `currency` du retour vaut 'TOKENS' : sert juste de marqueur
 * d'unité côté front (anciens callers attendent une string).
 */
export async function chargeAiGeneration(args: {
  userId: string | mongoose.Types.ObjectId;
  kind: AiKind;
  jobId?: string;
  note?: string;
}): Promise<{ amount: number; balanceAfter: number; currency: string }> {
  const wallet = await getOrCreateWallet(args.userId);
  const amount = await aiCostTokens(args.kind);
  if (amount <= 0) {
    return { amount: 0, balanceAfter: wallet.aiBalance, currency: 'TOKENS' };
  }
  const { transaction } = await debit({
    userId: args.userId,
    amount,
    bucket: 'ai',
    kind: 'ai_generation',
    enforceBalance: true,
    note: args.note || `Génération AI · ${args.kind} · ${amount} tokens${args.jobId ? ` · ${args.jobId}` : ''}`,
  });
  return { amount, balanceAfter: transaction.balanceAfter, currency: 'TOKENS' };
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
