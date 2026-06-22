import mongoose, { Document, Schema } from 'mongoose';

/**
 * Audit log — append-only trail of admin mutations. Distinct de ActivityLog
 * qui agrège tous les événements business : ici on ne stocke QUE des actions
 * initiées par un staff (admin/superadmin/owner) sur des ressources sensibles.
 * Sert au panel /admin/audit pour répondre à "qui a fait quoi, quand".
 *
 * Rétention 365 jours.
 */
export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.role_change'
  | 'user.suspend'
  | 'user.unsuspend'
  | 'user.reset_password'
  | 'user.resend_verification'
  | 'user.bulk_update'
  | 'wallet.adjust'
  | 'wallet.credit'
  | 'store.commission_override'
  | 'complaint.update'
  | 'complaint.assign'
  | 'settings.ai_pricing'
  | 'settings.auth';

export interface IAuditLog extends Document {
  action: AuditAction;
  actorId: mongoose.Types.ObjectId;
  actorEmail: string;
  actorRole: string;
  /** Subject of the action — user/store/complaint id (string for flexibility). */
  targetId?: string;
  targetType?: 'user' | 'store' | 'wallet' | 'complaint' | 'settings';
  summary: string;
  /** Free-form context (before/after, amounts, reasons). */
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorEmail: { type: String, required: true },
    actorRole: { type: String, required: true },
    targetId: { type: String, index: true },
    targetType: { type: String, enum: ['user', 'store', 'wallet', 'complaint', 'settings'] },
    summary: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
