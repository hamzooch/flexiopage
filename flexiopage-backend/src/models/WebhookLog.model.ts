import mongoose, { Document, Schema } from 'mongoose';

/**
 * Append-only journal for every delivery webhook exchange with MogaDelivery,
 * both directions:
 *
 *   - `outbound` : a dispatch WE send (order.created → MD). We record the HTTP
 *     status MD answered with (200, 401…), which `store_id` we sent, and which
 *     secret source signed it. This is what makes a 401 debuggable from the
 *     admin panel without grepping prod logs.
 *   - `inbound`  : a status webhook MD sends US. We record whether the HMAC
 *     signature verified and the resulting normalized status.
 *
 * Not uniquely-constrained: dispatches get retried and MD resends status
 * webhooks — we want every attempt on record. Secrets are NEVER stored here,
 * only masked previews / fingerprints live elsewhere.
 */
export type WebhookDirection = 'outbound' | 'inbound';
export type WebhookLogStatus = 'success' | 'error';

export interface IWebhookLog extends Document {
  storeId?: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  orderNumber?: string;
  provider: string; // 'mogadelivery'
  direction: WebhookDirection;
  /** Logical event, e.g. 'order.created' (outbound) or the inbound status. */
  event?: string;
  status: WebhookLogStatus;
  /** Provider HTTP response code for outbound dispatches (200, 401…). */
  httpStatus?: number;
  /** The `store_id` value we put in X-Flexiopage-Store-Id (outbound). */
  storeIdSent?: string;
  /** Which secret signed the outbound request: 'market' | 'legacy'. */
  secretSource?: string;
  /** Inbound HMAC verification result (undefined = not applicable). */
  signatureValid?: boolean;
  /** Error message when status='error'. */
  error?: string;
  /** Truncated request body (for forensics). */
  requestBody?: string;
  /** Truncated response / inbound payload. */
  responseBody?: string;
  createdAt: Date;
}

const WebhookLogSchema = new Schema<IWebhookLog>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    orderNumber: { type: String, trim: true },
    provider: { type: String, required: true, default: 'mogadelivery' },
    direction: { type: String, enum: ['outbound', 'inbound'], required: true },
    event: { type: String, trim: true },
    status: { type: String, enum: ['success', 'error'], required: true },
    httpStatus: { type: Number },
    storeIdSent: { type: String, trim: true },
    secretSource: { type: String, trim: true },
    signatureValid: { type: Boolean },
    error: { type: String, trim: true },
    requestBody: { type: String },
    responseBody: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

WebhookLogSchema.index({ storeId: 1, createdAt: -1 });
WebhookLogSchema.index({ direction: 1, status: 1, createdAt: -1 });
// Auto-prune after 30 days so the journal stays bounded.
WebhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const WebhookLog = mongoose.model<IWebhookLog>('WebhookLog', WebhookLogSchema);

/** Keep stored payloads bounded — never persist megabytes of provider JSON. */
function truncate(value: unknown, max = 4000): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > max ? `${str.slice(0, max)}…[+${str.length - max}]` : str;
}

/** Convenience writer — never throws into the dispatch / webhook path. */
export async function logWebhook(entry: {
  storeId?: mongoose.Types.ObjectId | string;
  orderId?: mongoose.Types.ObjectId | string;
  orderNumber?: string;
  provider?: string;
  direction: WebhookDirection;
  event?: string;
  status: WebhookLogStatus;
  httpStatus?: number;
  storeIdSent?: string;
  secretSource?: string;
  signatureValid?: boolean;
  error?: string;
  requestBody?: unknown;
  responseBody?: unknown;
}): Promise<void> {
  try {
    await WebhookLog.create({
      ...entry,
      provider: entry.provider || 'mogadelivery',
      requestBody: truncate(entry.requestBody),
      responseBody: truncate(entry.responseBody),
    });
  } catch {
    // Journal writes must never break delivery processing.
  }
}
