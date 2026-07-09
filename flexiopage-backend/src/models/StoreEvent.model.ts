import mongoose, { Document, Schema } from 'mongoose';

/**
 * Anonymous storefront funnel event. Powers the seller's "Suivi" dashboard:
 * product views, add-to-cart, purchases — and abandoned carts (a session with
 * an add_to_cart but no purchase).
 *
 *   page_view    — any public storefront page was opened (landing, info, product)
 *   product_view — the public product page was opened (subset of page_view)
 *   add_to_cart  — the visitor started filling the COD order form
 *   purchase     — a COD order was created (recorded server-side)
 *
 * `sessionId` is an anonymous per-visitor id (localStorage) used only to
 * correlate add_to_cart -> purchase. No PII is stored. Rows auto-expire after
 * 180 days so the collection stays bounded.
 */
export type StoreEventType = 'page_view' | 'product_view' | 'add_to_cart' | 'purchase';

/**
 * Source de trafic classée à l'ingestion : d'où vient le visiteur.
 * On ne stocke jamais le Referer brut ni les paramètres UTM (pas de PII).
 * Absent sur les events antérieurs à cette feature.
 */
export type StoreEventSource =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'google'
  | 'youtube'
  | 'twitter'
  | 'snapchat'
  | 'whatsapp'
  | 'direct'
  | 'other';

export interface IStoreEvent extends Document {
  storeId: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;
  type: StoreEventType;
  /** Anonymous visitor session id (correlates add_to_cart -> purchase). */
  sessionId: string;
  /**
   * Type d'appareil du visiteur, classé côté serveur depuis le User-Agent au
   * moment de l'ingestion. On ne stocke PAS l'UA brut (pas de PII), juste la
   * classe. Absent sur les events antérieurs à cette feature.
   */
  device?: 'mobile' | 'desktop';
  /** Origine du trafic (classée côté serveur — pas d'URL brute stockée). */
  source?: StoreEventSource;
  /** Order value — only set on `purchase`. */
  value?: number;
  currency?: string;
  createdAt: Date;
}

const StoreEventSchema = new Schema<IStoreEvent>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    type: { type: String, enum: ['page_view', 'product_view', 'add_to_cart', 'purchase'], required: true },
    sessionId: { type: String, required: true, index: true },
    device: { type: String, enum: ['mobile', 'desktop'] },
    source: {
      type: String,
      enum: ['facebook', 'instagram', 'tiktok', 'google', 'youtube', 'twitter', 'snapchat', 'whatsapp', 'direct', 'other'],
    },
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
