/**
 * Payout — a seller's request to receive their accumulated online sale earnings.
 *
 * Flow:
 *   1. Online paid order → wallet.payoutBalance credited (total minus platform
 *      commission). See order-finalize.service.
 *   2. Seller requests a payout from their dashboard. We snapshot the amount
 *      and freeze it (subtract from payoutBalance immediately) so they can't
 *      double-spend the same balance.
 *   3. Admin sees the request in /admin/payouts, transfers the money out-of-band
 *      (Wave, Orange Money, MTN, bank), and marks it as paid.
 *   4. On mark-paid: record a payout_debit wallet transaction for the audit
 *      trail — the balance was already frozen at step 2.
 *   5. On admin reject: refund the frozen amount back to payoutBalance.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type PayoutMethod = 'wave' | 'orange_money' | 'mtn_momo' | 'bank_transfer';

export type PayoutStatus =
  | 'pending'   // seller requested, awaiting admin action
  | 'paid'      // admin confirmed the transfer was sent
  | 'rejected'; // admin rejected (refund to payoutBalance)

export interface IPayout extends Document {
  userId: mongoose.Types.ObjectId;
  /** Store currency at time of request (snapshotted). */
  currency: string;
  /** Amount frozen from the payout balance when the request was created. */
  amount: number;
  method: PayoutMethod;
  /**
   * Destination coordinates. Structure depends on `method`:
   *   - mobile money: { phone: '+221...' }
   *   - bank: { bankName, accountName, iban, swift }
   */
  destination: Record<string, string>;
  status: PayoutStatus;
  /** Free-form note from the seller when creating the request. */
  sellerNote?: string;
  /** Admin note attached when marking paid or rejected. */
  adminNote?: string;
  /** Admin who processed the request (userId). */
  processedBy?: mongoose.Types.ObjectId;
  /** External reference of the actual transfer (e.g. Wave transaction id). */
  externalRef?: string;
  requestedAt: Date;
  processedAt?: Date;
}

const PayoutSchema = new Schema<IPayout>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    currency: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ['wave', 'orange_money', 'mtn_momo', 'bank_transfer'],
      required: true,
    },
    destination: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending', index: true },
    sellerNote: { type: String },
    adminNote: { type: String },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    externalRef: { type: String },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

PayoutSchema.index({ userId: 1, status: 1 });
PayoutSchema.index({ status: 1, requestedAt: -1 });

export const Payout = mongoose.model<IPayout>('Payout', PayoutSchema);
