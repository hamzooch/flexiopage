/**
 * Product Collection — groups products into a labelled subset (e.g. "Bestsellers",
 * "Cosmétiques", "Mode homme"). Modelled after Shopify's two collection types:
 *
 *   - manual  : the seller hand-picks the products via productIds[]
 *   - auto    : the seller defines rules (price range, tag match) and we resolve
 *               the matching products at read-time. No cron — we re-query Mongo.
 *
 * Each collection has its own public storefront URL (`/:storeSlug/c/:collectionSlug`).
 * Slugs are unique per store.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type CollectionType = 'manual' | 'auto';

/** Auto-collection rule shape. A product matches when ALL active rules pass. */
export interface ICollectionRules {
  /** Match products whose `tags[]` includes any of these (OR). */
  anyTags?: string[];
  /** Match products with price >= minPrice (in store currency). */
  minPrice?: number;
  /** Match products with price <= maxPrice. */
  maxPrice?: number;
  /** Match only published products (default true). */
  publishedOnly?: boolean;
}

export interface ICollection extends Document {
  storeId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  /** Banner image displayed at the top of the collection page. */
  image?: string;
  type: CollectionType;
  /** Manual collections only: explicit list of products in display order. */
  productIds: mongoose.Types.ObjectId[];
  /** Auto collections only: matching rules. */
  rules?: ICollectionRules;
  /** Display order in seller-facing lists & navbar suggestions (asc). */
  sortOrder: number;
  isPublished: boolean;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CollectionSchema = new Schema<ICollection>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    image: { type: String, trim: true },
    type: { type: String, enum: ['manual', 'auto'], default: 'manual', required: true },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    rules: {
      anyTags: [{ type: String, trim: true }],
      minPrice: { type: Number, min: 0 },
      maxPrice: { type: Number, min: 0 },
      publishedOnly: { type: Boolean, default: true },
    },
    sortOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    seoTitle: { type: String, trim: true },
    seoDescription: { type: String, trim: true },
  },
  { timestamps: true }
);

// Slug is unique per store — same name in different stores is fine.
CollectionSchema.index({ storeId: 1, slug: 1 }, { unique: true });
// Fast list / sort by storeId.
CollectionSchema.index({ storeId: 1, sortOrder: 1 });

export const Collection = mongoose.model<ICollection>('Collection', CollectionSchema);
