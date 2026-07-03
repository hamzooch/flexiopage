import mongoose, { Document, Schema } from 'mongoose';

/**
 * In-app notification surfaced on the seller's bell dropdown.
 *
 * Created by `notification.service.createNotification()` from three sources:
 *   - `order.created`         — checkout finalised, COD or paid
 *   - `order.status_changed`  — MogaDelivery webhook updates fulfillment
 *   - `team.member_added`     — invited member accepts; also `team.member_removed`
 *
 * Read state is per-user. We keep `meta` loose so each event type can store
 * its own context (orderNumber, status, member email, etc.) without forcing
 * a schema change every time we add an event type.
 */

export type NotificationType =
  | 'order.created'
  | 'order.status_changed'
  | 'team.member_added'
  | 'team.member_removed'
  | 'bot.limit_reached'
  | 'bot.balance_empty';

export interface INotification extends Document {
  /** Owner (seller) who sees this notification. */
  userId: mongoose.Types.ObjectId;
  /** Optional scope — order/team events are usually tied to a store. */
  storeId?: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** Where the bell dropdown should navigate when the item is clicked. */
  link?: string;
  read: boolean;
  readAt?: Date;
  /** Event-specific payload (orderNumber, externalStatus, memberEmail, …). */
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    type: {
      type: String,
      enum: ['order.created', 'order.status_changed', 'team.member_added', 'team.member_removed', 'bot.limit_reached', 'bot.balance_empty'],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Most queries: list latest unread for a user → compound index on (userId, read, createdAt desc).
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
