/**
 * Conversation Messenger entre un client (PSID) et le bot d'un vendeur.
 * Porte l'état de collecte de la commande et le lien vers l'Order créé.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type ConversationStatus = 'active' | 'completed' | 'abandoned' | 'human_takeover';
export type ConversationIntent = 'order' | 'question' | 'complaint' | 'other';

export interface IConversation extends Document {
  vendor_id: mongoose.Types.ObjectId;
  bot_config_id: mongoose.Types.ObjectId;
  /** Canal : 'messenger' | 'whatsapp'. */
  channel: 'messenger' | 'whatsapp';
  /** Id client scopé au canal : PSID (Messenger) ou wa_id/numéro (WhatsApp). */
  customer_psid: string;
  customer_name?: string;
  customer_profile_pic?: string;
  customer_phone?: string;
  customer_city?: string;
  customer_address?: string;

  status: ConversationStatus;
  intent: ConversationIntent;

  /** Données de commande partielles collectées au fil de la discussion. */
  order_collected_data: Record<string, unknown>;
  order_id?: mongoose.Types.ObjectId;

  last_message_at?: Date;
  message_count: number;
  total_tokens_used: number;

  created_at: Date;
  updated_at: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    vendor_id: { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    bot_config_id: { type: Schema.Types.ObjectId, ref: 'BotConfig' },
    channel: { type: String, enum: ['messenger', 'whatsapp'], default: 'messenger', index: true },
    customer_psid: { type: String, index: true },
    customer_name: { type: String },
    customer_profile_pic: { type: String },
    customer_phone: { type: String },
    customer_city: { type: String },
    customer_address: { type: String },

    status: { type: String, enum: ['active', 'completed', 'abandoned', 'human_takeover'], default: 'active' },
    intent: { type: String, enum: ['order', 'question', 'complaint', 'other'], default: 'question' },

    order_collected_data: { type: Schema.Types.Mixed, default: {} },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order' },

    last_message_at: { type: Date },
    message_count: { type: Number, default: 0 },
    total_tokens_used: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

// Une conversation active par (page-scoped client, vendeur).
ConversationSchema.index({ vendor_id: 1, customer_psid: 1, status: 1 });
ConversationSchema.index({ vendor_id: 1, last_message_at: -1 });

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
