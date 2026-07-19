/**
 * Seller wallet — stores the prepaid balance and the ledger of transactions.
 *
 * Business model:
 *   - 0 € subscription. Sellers top up the wallet via Wave / Orange Money /
 *     bank transfer.
 *   - On every order MogaDelivery confirms as delivered, we debit a small
 *     commission (default 3% of order total, capped at 1500 in store currency).
 *   - When the balance reaches 0 the seller can no longer dispatch new orders
 *     until they top up. (Soft-fail: orders can still be created so the buyer
 *     experience isn't broken — they just queue locally.)
 *
 * The transactions array is an embedded ledger. We keep it simple here; if it
 * grows we'll move it to a dedicated WalletTransaction collection.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type TxKind =
  | 'top_up'         // credit to the main balance
  | 'top_up_ai'      // credit to the AI balance
  | 'commission'     // debit from main on order delivery
  | 'ai_generation'  // debit from AI balance per AI generation
  | 'refund'
  | 'adjustment'
  | 'sale_credit'    // credit to payout balance after online paid order (minus platform commission)
  | 'payout_debit';  // debit from payout balance when a payout is marked as paid

/** Which sub-balance this transaction touched. */
export type WalletBucket = 'main' | 'ai' | 'payout';

export interface IWalletTransaction {
  /** ISO uuid-like id used in the API. */
  id: string;
  kind: TxKind;
  /** Which balance this affected. Drives the `balanceAfter` interpretation. */
  bucket: WalletBucket;
  /** Positive = credit, negative = debit. Always in `currency`. */
  amount: number;
  /** Balance of the affected bucket immediately after this transaction. */
  balanceAfter: number;
  /** Optional order reference (set for `commission` and `refund`). */
  orderId?: mongoose.Types.ObjectId;
  orderNumber?: string;
  /** Optional payment reference (Wave, OM, bank — set for `top_up`). */
  paymentReference?: string;
  /** Free-form note shown on the statement. */
  note?: string;
  createdAt: Date;
}

export interface IWallet extends Document {
  userId: mongoose.Types.ObjectId;
  /** Currency the balances are denominated in. Pinned at first activity. */
  currency: string;
  /** Main balance — debited 3% on every order delivery. */
  balance: number;
  /** AI balance — debited per AI generation (landing pages, product pages, images). */
  aiBalance: number;
  /**
   * Unité du compteur aiBalance.
   *   - 'tokens'  : modèle actuel (depuis juin 2026). aiBalance = nombre de
   *                 tokens, 1 USD top-up = settings.aiPricing.usdToTokens.
   *   - 'usd'     : modèle historique (USD comme la commission). Marquage
   *                 utilisé par le script migrate-ai-balance-to-tokens pour
   *                 savoir quels wallets ont déjà été convertis et éviter
   *                 le double-comptage. Les nouveaux wallets démarrent en
   *                 'tokens' directement.
   */
  aiBalanceUnit: 'usd' | 'tokens';
  /**
   * Payout balance — accumulates seller earnings from online paid orders
   * (order total minus platform commission). Debited when a payout request
   * is marked as paid by an admin. In the store currency.
   */
  payoutBalance: number;
  /** Embedded ledger (chronological, append-only). */
  transactions: IWalletTransaction[];
  createdAt: Date;
  updatedAt: Date;
}

const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    id: { type: String, required: true },
    kind: {
      type: String,
      enum: ['top_up', 'top_up_ai', 'commission', 'ai_generation', 'refund', 'adjustment', 'sale_credit', 'payout_debit'],
      required: true,
    },
    bucket: { type: String, enum: ['main', 'ai', 'payout'], required: true, default: 'main' },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: { type: String },
    paymentReference: { type: String },
    note: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const WalletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currency: { type: String, default: 'USD' },
    balance: { type: Number, default: 0, min: 0 },
    aiBalance: { type: Number, default: 0, min: 0 },
    aiBalanceUnit: { type: String, enum: ['usd', 'tokens'], default: 'tokens' },
    payoutBalance: { type: Number, default: 0, min: 0 },
    transactions: { type: [WalletTransactionSchema], default: [] },
  },
  { timestamps: true }
);

// `userId` a déjà `unique: true` sur le champ (crée l'index) — pas de doublon.
export const Wallet = mongoose.model<IWallet>('Wallet', WalletSchema);
