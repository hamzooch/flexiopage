/**
 * Abandoned cart — captured when a buyer fills in identifying info on
 * the COD form but leaves without submitting. Stored deduped per
 * (storeId, sessionId) so a refresh + retry doesn't create a second row.
 *
 * Marked `recovered: true` once the same email/phone places a real
 * order — auto-set by the COD checkout endpoint.
 *
 * TTL: 30 days. After that the lead is too cold to recover, so we
 * auto-expire rows to keep the collection bounded.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IAbandonedCart extends Document {
  storeId: mongoose.Types.ObjectId;
  /** Anonymous session id matching the StoreEvent funnel tracker. */
  sessionId: string;
  /** Optional product slug the buyer was viewing when they filled the form. */
  productSlug?: string;
  productName?: string;
  productPrice?: number;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
  /** Flipped to true once an order with matching email/phone lands. */
  recovered: boolean;
  recoveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AbandonedCartSchema = new Schema<IAbandonedCart>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    sessionId: { type: String, required: true, trim: true },
    productSlug: { type: String, trim: true },
    productName: { type: String, trim: true },
    productPrice: { type: Number },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true, uppercase: true },
    recovered: { type: Boolean, default: false },
    recoveredAt: { type: Date },
  },
  { timestamps: true }
);

// Dedupe per (store, session) — upsert on save instead of multiple rows.
AbandonedCartSchema.index({ storeId: 1, sessionId: 1 }, { unique: true });
AbandonedCartSchema.index({ storeId: 1, createdAt: -1 });
// Auto-expire after 30 days so the dashboard stays useful.
AbandonedCartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const AbandonedCart = mongoose.model<IAbandonedCart>('AbandonedCart', AbandonedCartSchema);
