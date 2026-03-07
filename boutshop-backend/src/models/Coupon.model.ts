import mongoose, { Document, Schema } from 'mongoose';

export interface ICoupon extends Document {
  storeId: mongoose.Types.ObjectId;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minPurchase?: number;
  maxUses?: number;
  usedCount: number;
  startsAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    value: { type: Number, required: true },
    minPurchase: { type: Number },
    maxUses: { type: Number },
    usedCount: { type: Number, default: 0 },
    startsAt: { type: Date },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CouponSchema.index({ storeId: 1 });
CouponSchema.index({ storeId: 1, code: 1 }, { unique: true });
export const Coupon = mongoose.model<ICoupon>('Coupon', CouponSchema);
