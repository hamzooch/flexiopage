/**
 * Product review left by a customer. Lightweight by design: no auth,
 * no email verification, just a moderation gate via `isPublished`.
 *
 * Storefront only renders reviews where `isPublished === true`; the
 * seller decides what's shown from the dashboard. The `verified` flag
 * is set automatically when the review is attached to an existing
 * order email — UI displays a "Achat vérifié" badge when true.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IReview extends Document {
  storeId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  /** Free-form display name (e.g. "Aïssatou D."). */
  name: string;
  /** Used for de-duplication + the verified-purchase check. */
  email?: string;
  rating: number;
  title?: string;
  content: string;
  /** True when an order with the same email exists on this store. */
  verified: boolean;
  /** Default false — seller approves from the dashboard before publishing. */
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true },
    content: { type: String, required: true, trim: true },
    verified: { type: Boolean, default: false },
    // Default to PUBLISHED so the first review shows up without a
    // moderation hop — keeps the storefront alive even when the seller
    // forgets to log in. Sellers can flip moderation policy later.
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ReviewSchema.index({ storeId: 1, productId: 1, createdAt: -1 });
ReviewSchema.index({ storeId: 1, productId: 1, isPublished: 1 });

export const Review = mongoose.model<IReview>('Review', ReviewSchema);
