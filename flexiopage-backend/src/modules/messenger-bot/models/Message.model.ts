/**
 * Un message dans une conversation Messenger (client, bot, ou agent humain).
 * Les messages "bot" portent le détail de consommation Claude (tokens, coût,
 * tool calls) pour l'audit et le suivi de facturation.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type MessageSender = 'customer' | 'bot' | 'human';

export interface IMessageAttachment {
  type: string; // image | video | file | audio
  url: string;
}

export interface IMessage extends Document {
  conversation_id: mongoose.Types.ObjectId;
  vendor_id: mongoose.Types.ObjectId;
  sender: MessageSender;
  content: string;
  attachments: IMessageAttachment[];

  // Renseigné uniquement pour les messages générés par le bot.
  claude_model?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
  tool_calls?: Record<string, unknown>[];

  messenger_message_id?: string;
  /**
   * Clé déterministe pour la déduplication atomique au niveau DB. Calculée par
   * le webhook entrant comme SHA-256(conversation_id + sender + content +
   * timeBucket60s). Un index unique partiel rejette toute insertion en
   * doublon, ce qui évite les conditions de course (check-then-write) quand
   * Wasender renvoie plusieurs events pour le même message client.
   */
  dedup_key?: string;
  delivered?: boolean;
  read?: boolean;

  timestamp: Date;
}

const AttachmentSchema = new Schema<IMessageAttachment>(
  { type: { type: String, required: true }, url: { type: String, required: true } },
  { _id: false },
);

const MessageSchema = new Schema<IMessage>(
  {
    conversation_id: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    vendor_id: { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    sender: { type: String, enum: ['customer', 'bot', 'human'], required: true },
    content: { type: String, required: true },
    attachments: { type: [AttachmentSchema], default: [] },

    claude_model: { type: String },
    tokens_input: { type: Number },
    tokens_output: { type: Number },
    cost_usd: { type: Number },
    tool_calls: { type: [Schema.Types.Mixed], default: undefined },

    messenger_message_id: { type: String },
    dedup_key: { type: String },
    delivered: { type: Boolean },
    read: { type: Boolean },

    timestamp: { type: Date, default: Date.now, index: true },
  },
  // The spec uses a single `timestamp` field — disable mongoose's auto
  // createdAt/updatedAt to avoid duplication.
  { timestamps: false },
);

MessageSchema.index({ conversation_id: 1, timestamp: 1 });
// Idempotence : un même message provider (Meta) n'est inséré qu'une fois.
// Index partiel — les messages bot/humain n'ont pas de messenger_message_id.
MessageSchema.index(
  { messenger_message_id: 1 },
  { unique: true, partialFilterExpression: { messenger_message_id: { $type: 'string' } } },
);
// Dedup atomique : si plusieurs webhooks Wasender (messages.received +
// messages.upsert + messages-personal.received) arrivent simultanément pour
// le même message client, le 2e insert lèvera 11000 et sera ignoré
// silencieusement par le controller.
MessageSchema.index(
  { dedup_key: 1 },
  { unique: true, partialFilterExpression: { dedup_key: { $type: 'string' } } },
);

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
