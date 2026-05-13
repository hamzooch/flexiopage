/**
 * Réclamation — support / dispute thread between a seller and the platform.
 *
 * The seller opens a complaint from /dashboard/support. Admins triage at
 * /admin/complaints, reply, change status, optionally link to an order. We
 * keep the message thread embedded in the document — a complaint rarely
 * exceeds 20 messages, no need for a separate collection yet.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ComplaintCategory = 'order' | 'payment' | 'wallet' | 'account' | 'delivery' | 'other';
export type ComplaintPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface IComplaintMessage {
  /** Author id — seller or admin user. */
  authorId: mongoose.Types.ObjectId;
  /** Display label, captured at write time so it survives a rename. */
  authorName: string;
  authorRole: 'user' | 'supervisor' | 'admin' | 'superadmin' | 'owner';
  body: string;
  createdAt: Date;
}

export interface IComplaint extends Document {
  /** Seller who opened the complaint. */
  userId: mongoose.Types.ObjectId;
  subject: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  /** Optional links for context. */
  orderId?: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId;
  /** Admin currently in charge — set when status moves to in_progress. */
  assignedTo?: mongoose.Types.ObjectId;
  messages: IComplaintMessage[];
  /** When status moved to resolved/closed — for SLA reporting later. */
  resolvedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IComplaintMessage>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: ['user', 'supervisor', 'admin', 'superadmin', 'owner'], required: true },
    body: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ComplaintSchema = new Schema<IComplaint>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['order', 'payment', 'wallet', 'account', 'delivery', 'other'],
      default: 'other',
    },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    messages: { type: [MessageSchema], default: [] },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

ComplaintSchema.index({ status: 1, createdAt: -1 });
ComplaintSchema.index({ userId: 1, createdAt: -1 });
export const Complaint = mongoose.model<IComplaint>('Complaint', ComplaintSchema);
