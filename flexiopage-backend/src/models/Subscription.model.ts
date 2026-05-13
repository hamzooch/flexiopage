import mongoose, { Document, Schema } from 'mongoose';

export type PlanType = 'free' | 'starter' | 'pro' | 'enterprise';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  plan: PlanType;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodEnd?: Date;
  storeLimit: number;
  productLimitPerStore: number;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    plan: { type: String, enum: ['free', 'starter', 'pro', 'enterprise'], default: 'free' },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    status: { type: String, enum: ['active', 'canceled', 'past_due', 'trialing'], default: 'active' },
    currentPeriodEnd: { type: Date },
    storeLimit: { type: Number, default: 3 },
    productLimitPerStore: { type: Number, default: 25 },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ userId: 1 });
export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
