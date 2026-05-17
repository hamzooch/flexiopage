import mongoose, { Document, Schema } from 'mongoose';

/**
 * Platform-wide activity feed shown in /admin/activity. Append-only.
 * Each row captures one business event (signup, order, dispatch, …) with
 * just enough context for an admin to spot trends or anomalies at a glance.
 * Rows auto-expire after 180 days so the collection stays bounded.
 */
export type ActivityType =
  | 'user.signup'
  | 'order.created'
  | 'order.paid'
  | 'store.published'
  | 'delivery.dispatched'
  | 'delivery.dispatch_failed';

export interface IActivityLog extends Document {
  type: ActivityType;
  message: string;
  userId?: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  /** For future admin-initiated events; null for system events. */
  actorId?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    type: { type: String, required: true, index: true },
    message: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ type: 1, createdAt: -1 });
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
