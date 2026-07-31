/**
 * Wallet top-up — track une tentative de recharge du solde vendeur via
 * Stripe (carte, worldwide) ou CinetPay (Mobile Money, pays CFA éligibles).
 *
 * Cycle de vie :
 *   1. `pending` — Créé par POST /wallet/top-up/initiate ; le vendeur est
 *      redirigé vers `checkoutUrl` (page hosted du gateway).
 *   2. `paid`    — Webhook confirmé + signature validée. On appelle credit()
 *      avec `gatewayReference` comme paymentReference (idempotent côté wallet).
 *   3. `failed`  — Paiement refusé / annulé côté gateway.
 *   4. `expired` — Session non complétée dans les 24h.
 *
 * `gatewayReference` est UNIQUE par top-up et sert de dedupe key côté wallet :
 * même si le webhook fire 2x, on ne crédite qu'une seule fois. Le webhook
 * retrouve le top-up par `gatewayTxId` (id fourni par le gateway).
 */
import mongoose, { Document, Schema } from 'mongoose';

export type TopUpGateway = 'stripe' | 'cinetpay';
export type TopUpStatus = 'pending' | 'paid' | 'failed' | 'expired';
export type TopUpBucket = 'main' | 'ai';

export interface IWalletTopUp extends Document {
  userId: mongoose.Types.ObjectId;
  /** Montant EN DEVISE DU WALLET (pas en cents). Le service convertit
   *  en cents au moment de l'appel Stripe. */
  amount: number;
  currency: string;
  /** Quel sous-solde recharger. Pour 'ai', on convertit USD→tokens au settle. */
  bucket: TopUpBucket;
  gateway: TopUpGateway;
  status: TopUpStatus;
  /** ID côté gateway (Stripe Session ID / CinetPay transaction_id). */
  gatewayTxId?: string;
  /** Notre reference unique — sert de paymentReference wallet (dedup). */
  gatewayReference: string;
  /** URL de checkout hosted vers laquelle rediriger le vendeur. */
  checkoutUrl?: string;
  /** Erreur gateway éventuelle (raison du fail). */
  failureReason?: string;
  paidAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WalletTopUpSchema = new Schema<IWalletTopUp>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, trim: true, uppercase: true },
    bucket: { type: String, enum: ['main', 'ai'], required: true, default: 'main' },
    gateway: { type: String, enum: ['stripe', 'cinetpay'], required: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'expired'],
      default: 'pending',
      required: true,
    },
    gatewayTxId: { type: String, index: true },
    gatewayReference: { type: String, required: true, unique: true },
    checkoutUrl: { type: String },
    failureReason: { type: String },
    paidAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Recherche des top-ups d'un vendeur (dashboard / support).
WalletTopUpSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Purge auto des top-ups pending expirés (TTL 30j — on garde l'historique
// paid/failed plus longtemps via createdAt normal).
WalletTopUpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { status: 'pending' } },
);

export const WalletTopUp = mongoose.model<IWalletTopUp>('WalletTopUp', WalletTopUpSchema);
