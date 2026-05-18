/**
 * Newsletter subscriber — distinct from Customer (which models people
 * who actually ordered). A Subscriber is a lead: an email collected from
 * the welcome popup, an embedded form, or a manual import. When the same
 * email later places an order, both records co-exist keyed by email so
 * we keep the marketing source intact.
 *
 * Stored per-store (unique on storeId+email) so deleting a store cleanly
 * cascades and exporting subscribers is scoped naturally.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type SubscriberSource = 'newsletter_popup' | 'manual' | 'import';

export interface ISubscriber extends Document {
  storeId: mongoose.Types.ObjectId;
  email: string;
  /** Where the email came from — drives reporting in the dashboard. */
  source: SubscriberSource;
  /** The coupon code (if any) that was handed out to thank the subscriber. */
  rewardCouponCode?: string;
  /** Buyer-supplied name when the popup form collects it (optional). */
  name?: string;
  /** Set to true once the subscriber unsubs — kept for audit + dedupe. */
  isUnsubscribed: boolean;
  unsubscribedAt?: Date;
  /** Free-form bag for future fields (utm params, locale, etc.). */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriberSchema = new Schema<ISubscriber>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    source: {
      type: String,
      enum: ['newsletter_popup', 'manual', 'import'],
      default: 'newsletter_popup',
      required: true,
    },
    rewardCouponCode: { type: String, trim: true, uppercase: true },
    name: { type: String, trim: true },
    isUnsubscribed: { type: Boolean, default: false },
    unsubscribedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

SubscriberSchema.index({ storeId: 1, createdAt: -1 });
SubscriberSchema.index({ storeId: 1, email: 1 }, { unique: true });
export const Subscriber = mongoose.model<ISubscriber>('Subscriber', SubscriberSchema);
