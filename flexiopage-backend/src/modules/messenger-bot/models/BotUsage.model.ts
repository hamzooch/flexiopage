/**
 * Consommation agrégée par vendeur et par mois — alimente les limites de plan
 * (conversations_used_this_month) et le suivi de coût Claude.
 *
 * ⚠️ Aucun schéma n'était fourni dans le spec : conception proposée, à valider.
 * Un document par (vendor_id, period) où period = "YYYY-MM". Les compteurs sont
 * incrémentés via $inc depuis le worker (atomique, idempotent par message).
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IBotUsage extends Document {
  vendor_id: mongoose.Types.ObjectId;
  bot_config_id?: mongoose.Types.ObjectId;
  /** Période mensuelle au format "YYYY-MM" (UTC). */
  period: string;

  conversations_count: number;
  messages_count: number;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  orders_created: number;

  created_at: Date;
  updated_at: Date;
}

const BotUsageSchema = new Schema<IBotUsage>(
  {
    vendor_id: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    bot_config_id: { type: Schema.Types.ObjectId, ref: 'BotConfig' },
    period: { type: String, required: true },

    conversations_count: { type: Number, default: 0 },
    messages_count: { type: Number, default: 0 },
    tokens_input: { type: Number, default: 0 },
    tokens_output: { type: Number, default: 0 },
    cost_usd: { type: Number, default: 0 },
    orders_created: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

// One usage row per vendor per month — also the upsert key.
BotUsageSchema.index({ vendor_id: 1, period: 1 }, { unique: true });

export const BotUsage = mongoose.model<IBotUsage>('BotUsage', BotUsageSchema);
