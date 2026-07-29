/**
 * Announcement — un email de communication envoyé en masse aux vendeurs
 * (annonce plateforme, nouvelle feature, alerte, actualité).
 *
 * Cycle de vie :
 *   draft     → en cours d'édition, aucun envoi programmé
 *   scheduled → programmé pour envoi à `scheduledAt` par le job cron
 *   sending   → job cron en cours d'envoi (verrou anti-double-envoi)
 *   sent      → envoyé, `sentAt` + `stats` renseignés
 *   cancelled → annulé avant envoi
 *
 * Audience :
 *   all         — tous les utilisateurs
 *   sellers     — utilisateurs avec ≥1 boutique
 *   active      — connectés < 30 jours
 *   staff       — owner / superadmin / admin / supervisor
 *   verified    — email vérifié uniquement (bonne délivrabilité)
 *
 * Auth : seuls owner/superadmin/admin peuvent créer/programmer, propagé
 * dans les routes via requireAdminWrite.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type AnnouncementStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
export type AnnouncementAudience = 'all' | 'sellers' | 'active' | 'staff' | 'verified';

export interface IAnnouncement extends Document {
  title: string;
  /** Sujet de l'email tel que reçu dans l'inbox. Fallback : `title`. */
  subject?: string;
  /** Corps HTML de l'email (peut contenir des balises simples). */
  bodyHtml: string;
  /** Corps texte fallback (pour les clients qui bloquent le HTML). */
  bodyText?: string;
  audience: AnnouncementAudience;
  status: AnnouncementStatus;
  /** Auteur (userId de l'admin qui a créé). */
  createdBy: mongoose.Types.ObjectId;
  /** Date programmée d'envoi. Null = draft. */
  scheduledAt?: Date;
  /** Date d'envoi effectif — renseigné par le cron. */
  sentAt?: Date;
  /** Stats d'envoi (nb ciblés, nb envoyés OK, nb échoués). */
  stats?: {
    targeted: number;
    sent: number;
    failed: number;
    errors?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subject: { type: String, trim: true, maxlength: 200 },
    bodyHtml: { type: String, required: true },
    bodyText: { type: String },
    audience: {
      type: String,
      enum: ['all', 'sellers', 'active', 'staff', 'verified'],
      required: true,
      default: 'all',
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'],
      required: true,
      default: 'draft',
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheduledAt: { type: Date, index: true },
    sentAt: { type: Date },
    stats: {
      targeted: { type: Number },
      sent: { type: Number },
      failed: { type: Number },
      errors: [{ type: String }],
    },
  },
  { timestamps: true },
);

// Index composite pour le cron : "trouve les scheduled dont scheduledAt < now"
AnnouncementSchema.index({ status: 1, scheduledAt: 1 });

export const Announcement = mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
