/**
 * Discount code (Shopify-style) tied to a store. Sellers issue them, buyers
 * paste them in the COD form, the public endpoint validates + applies at
 * checkout. The order keeps the textual `couponCode` so we can audit later.
 *
 * Scopes:
 *   - all          : applies to every product in the store (default)
 *   - products     : only when the order line items are in `productIds`
 *   - collections  : only when the line items belong to one of `collectionIds`
 */
import mongoose, { Document, Schema } from 'mongoose';

export type CouponType = 'percent' | 'fixed';
export type CouponScope = 'all' | 'products' | 'collections';

export interface ICoupon extends Document {
  storeId: mongoose.Types.ObjectId;
  code: string;
  /** Optional human-readable description shown only in the dashboard. */
  description?: string;
  type: CouponType;
  /** Percent (0-100) when type='percent', currency amount when type='fixed'. */
  value: number;
  /** Minimum cart subtotal required for the coupon to apply. */
  minPurchase?: number;
  /** Hard cap on total redemptions across all buyers (undef = unlimited). */
  maxUses?: number;
  /** Atomically incremented every time the coupon is applied at checkout. */
  usedCount: number;
  startsAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  /** Default 'all' — restricts which products this coupon can discount. */
  appliesTo: CouponScope;
  productIds?: mongoose.Types.ObjectId[];
  collectionIds?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, trim: true },
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    value: { type: Number, required: true, min: 0 },
    minPurchase: { type: Number, min: 0 },
    maxUses: { type: Number, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    appliesTo: { type: String, enum: ['all', 'products', 'collections'], default: 'all', required: true },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    collectionIds: [{ type: Schema.Types.ObjectId, ref: 'Collection' }],
  },
  { timestamps: true }
);

CouponSchema.index({ storeId: 1 });
CouponSchema.index({ storeId: 1, code: 1 }, { unique: true });
export const Coupon = mongoose.model<ICoupon>('Coupon', CouponSchema);
