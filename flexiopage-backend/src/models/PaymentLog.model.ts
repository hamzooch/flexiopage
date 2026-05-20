import mongoose, { Document, Schema } from 'mongoose';

/**
 * Append-only audit ledger for every payment event (initiate, webhook,
 * verify) across all gateways. Two purposes:
 *
 *   1. Audit / forensics — we keep the raw provider payload verbatim so a
 *      disputed transaction can be reconstructed.
 *   2. Idempotence support — the webhook handler records each delivery here;
 *      the actual "don't double-credit the order" guarantee lives in
 *      finalizePaidOrder (a no-op once an order is already paid), but this
 *      ledger lets us SEE that a webhook was replayed.
 *
 * Intentionally NOT uniquely-constrained: providers legitimately resend
 * webhooks (pending → paid), and we want every delivery on record.
 */
export type PaymentEvent = 'initiate' | 'webhook' | 'verify';
export type PaymentEventStatus = 'pending' | 'paid' | 'failed';

export interface IPaymentLog extends Document {
  orderId?: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId;
  gateway: string; // 'cinetpay' | 'flutterwave' | 'manual'
  /** Provider transaction ref / payment token (our transactionRef). */
  reference?: string;
  event: PaymentEvent;
  status: PaymentEventStatus;
  /** Result of the gateway's signature/HMAC check (undefined = N/A). */
  signatureValid?: boolean;
  /** Raw provider payload, kept verbatim for audit. */
  rawPayload?: Record<string, unknown>;
  /** Free-text note (e.g. "replayed", "amount mismatch"). */
  note?: string;
  createdAt: Date;
}

const PaymentLogSchema = new Schema<IPaymentLog>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    gateway: { type: String, required: true },
    reference: { type: String, index: true },
    event: { type: String, enum: ['initiate', 'webhook', 'verify'], required: true },
    status: { type: String, enum: ['pending', 'paid', 'failed'], required: true },
    signatureValid: { type: Boolean },
    rawPayload: { type: Schema.Types.Mixed },
    note: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PaymentLogSchema.index({ gateway: 1, reference: 1, createdAt: -1 });
// Auto-prune after 365 days so the audit collection stays bounded.
PaymentLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const PaymentLog = mongoose.model<IPaymentLog>('PaymentLog', PaymentLogSchema);

/** Convenience writer — never throws into the request path. */
export async function logPayment(entry: {
  orderId?: mongoose.Types.ObjectId | string;
  storeId?: mongoose.Types.ObjectId | string;
  gateway: string;
  reference?: string;
  event: PaymentEvent;
  status: PaymentEventStatus;
  signatureValid?: boolean;
  rawPayload?: Record<string, unknown>;
  note?: string;
}): Promise<void> {
  try {
    await PaymentLog.create(entry);
  } catch {
    // Audit logging must never break payment processing.
  }
}
