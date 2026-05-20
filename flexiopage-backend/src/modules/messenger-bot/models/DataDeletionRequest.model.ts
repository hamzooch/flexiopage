/**
 * Trace des demandes de suppression de données reçues de Meta (Data Deletion
 * Callback) ou manuelles. Permet à l'utilisateur de suivre le statut via le
 * code de confirmation renvoyé à Meta.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type DeletionStatus = 'pending' | 'completed' | 'failed';

export interface IDataDeletionRequest extends Document {
  psid: string;
  confirmation_code: string;
  status: DeletionStatus;
  conversations_deleted?: number;
  messages_deleted?: number;
  orders_anonymized?: number;
  error?: string;
  created_at: Date;
  completed_at?: Date;
}

const DataDeletionRequestSchema = new Schema<IDataDeletionRequest>(
  {
    psid: { type: String, required: true, index: true },
    confirmation_code: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    conversations_deleted: { type: Number },
    messages_deleted: { type: Number },
    orders_anonymized: { type: Number },
    error: { type: String },
    completed_at: { type: Date },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } },
);

export const DataDeletionRequest = mongoose.model<IDataDeletionRequest>(
  'DataDeletionRequest',
  DataDeletionRequestSchema,
);
