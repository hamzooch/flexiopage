import mongoose, { Document, Schema } from 'mongoose';

/**
 * Anonymous storefront funnel event. Powers the seller's "Suivi" dashboard:
 * product views, add-to-cart, purchases — and abandoned carts (a session with
 * an add_to_cart but no purchase).
 *
 *   product_view — the public product page was opened
 *   add_to_cart  — the visitor started filling the COD order form
 *   purchase     — a COD order was created (recorded server-side)
 *
 * `sessionId` is an anonymous per-visitor id (localStorage) used only to
 * correlate add_to_cart -> purchase. No PII is stored. Rows auto-expire after
 * 180 days so the collection stays bounded.
 */
export type StoreEventType = 'product_view' | 'add_to_cart' | 'purchase';

export interface IStoreEvent extends Document {
  storeId: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;
  type: StoreEventType;
  /** Anonymous visitor session id (correlates add_to_cart -> purchase). */
  sessionId: string;
  /** Order value — only set on `purchase`. */
  value?: number;
  currency?: string;
  createdAt: Date;
}

const StoreEventSchema = new Schema<IStoreEvent>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    type: { type: String, enum: ['product_view', 'add_to_cart', 'purchase'], required: true },
    sessionId: { type: String, required: true, index: true },
    value: { type: Number },
    currency: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

StoreEventSchema.index({ storeId: 1, createdAt: -1 });
StoreEventSchema.index({ storeId: 1, type: 1, createdAt: -1 });
// Auto-prune after 180 days.
StoreEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const StoreEvent = mongoose.model<IStoreEvent>('StoreEvent', StoreEventSchema);
