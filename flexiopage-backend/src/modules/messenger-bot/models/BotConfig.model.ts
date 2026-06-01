/**
 * Configuration du bot Messenger pour un vendeur (= boutique Flexiopage).
 *
 * NOTE intégration : `vendor_id` référence le modèle `Store` (l'entité
 * "vendeur" de Flexiopage — il n'existe pas de modèle `Vendor`). Le token de
 * page Facebook est stocké CHIFFRÉ (AES) dans `page_access_token_encrypted`.
 */
import mongoose, { Document, Schema } from 'mongoose';
import { isKnownCountry } from '../../../data/countries';

export type BotLanguage = 'ar' | 'fr' | 'en' | 'darija_ma' | 'darija_dz' | 'darija_tn';
/**
 * Code pays ISO 3166-1 alpha-2. Le bot WhatsApp/Messenger sert des vendeurs dans
 * TOUS les marchés ; on valide donc contre la liste maître `src/data/countries.ts`
 * plutôt qu'un enum Maghreb codé en dur. `MA` reste le défaut historique.
 */
export type BotCountry = string;
export type BotStatus = 'active' | 'paused' | 'disconnected';
export type CatalogSource = 'auto' | 'manual' | 'hybrid';
export type AiPersonality = 'friendly' | 'professional' | 'energetic';
export type BotPlan = 'free' | 'starter' | 'pro' | 'business';
/** Canal de messagerie. Une boutique peut avoir un bot par canal. */
export type BotChannel = 'messenger' | 'whatsapp';

export interface IShippingFee {
  city: string;
  fee: number;
}

export interface ICustomProduct {
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  stock?: number;
  landing_url?: string;
}

export interface IBotConfig extends Document {
  vendor_id: mongoose.Types.ObjectId;
  /** Canal : 'messenger' (défaut) ou 'whatsapp'. */
  channel: BotChannel;
  /** Messenger : id de la Page FB (absent pour WhatsApp). */
  facebook_page_id?: string;
  /** WhatsApp Cloud API : phone number id (absent pour Messenger). */
  whatsapp_phone_number_id?: string;
  /** WhatsApp Business Account id (optionnel). */
  whatsapp_business_account_id?: string;
  /** Numéro affiché de la ligne WhatsApp (optionnel, info). */
  whatsapp_display_number?: string;
  /** Token d'accès du canal, chiffré (Page token Messenger OU token WhatsApp). */
  page_access_token_encrypted: string;
  page_name?: string;
  page_picture_url?: string;

  status: BotStatus;
  language: BotLanguage;
  country: BotCountry;

  welcome_message?: string;
  away_message?: string;
  order_confirmation_message?: string;

  shipping_fees: IShippingFee[];
  default_shipping_fee: number;

  catalog_source: CatalogSource;
  custom_products: ICustomProduct[];

  ai_personality: AiPersonality;
  auto_create_order: boolean;
  ask_confirmation_before_order: boolean;

  notify_on_new_order: boolean;
  notification_email?: string;
  notification_whatsapp?: string;

  plan: BotPlan;
  conversations_limit: number;
  conversations_used_this_month: number;
  month_reset_date?: Date;

  total_conversations: number;
  total_orders_created: number;
  total_tokens_consumed: number;

  created_at: Date;
  updated_at: Date;
}

const ShippingFeeSchema = new Schema<IShippingFee>(
  { city: { type: String, required: true, trim: true }, fee: { type: Number, required: true } },
  { _id: false },
);

const CustomProductSchema = new Schema<ICustomProduct>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    price: { type: Number, required: true },
    image_url: { type: String },
    stock: { type: Number },
    landing_url: { type: String },
  },
  { _id: true },
);

const BotConfigSchema = new Schema<IBotConfig>(
  {
    // "vendor" = boutique Flexiopage → ref Store.
    vendor_id: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    channel: { type: String, enum: ['messenger', 'whatsapp'], default: 'messenger', index: true },
    // Pas d'index ici — défini plus bas en partial pour ignorer les null
    // (sparse ne suffit pas : MongoDB considère plusieurs null comme des doublons).
    facebook_page_id: { type: String },
    whatsapp_phone_number_id: { type: String },
    whatsapp_business_account_id: { type: String },
    whatsapp_display_number: { type: String },
    page_access_token_encrypted: { type: String, required: true },
    page_name: { type: String },
    page_picture_url: { type: String },

    status: { type: String, enum: ['active', 'paused', 'disconnected'], default: 'active' },
    language: { type: String, enum: ['ar', 'fr', 'en', 'darija_ma', 'darija_dz', 'darija_tn'], default: 'darija_ma' },
    country: {
      type: String,
      default: 'MA',
      uppercase: true,
      validate: { validator: (v: string) => isKnownCountry(v), message: 'Pays non reconnu (code ISO-2 attendu).' },
    },

    welcome_message: { type: String },
    away_message: { type: String },
    order_confirmation_message: { type: String },

    shipping_fees: { type: [ShippingFeeSchema], default: [] },
    default_shipping_fee: { type: Number, default: 30 },

    catalog_source: { type: String, enum: ['auto', 'manual', 'hybrid'], default: 'auto' },
    custom_products: { type: [CustomProductSchema], default: [] },

    ai_personality: { type: String, enum: ['friendly', 'professional', 'energetic'], default: 'friendly' },
    auto_create_order: { type: Boolean, default: true },
    ask_confirmation_before_order: { type: Boolean, default: true },

    notify_on_new_order: { type: Boolean, default: true },
    notification_email: { type: String },
    notification_whatsapp: { type: String },

    plan: { type: String, enum: ['free', 'starter', 'pro', 'business'], default: 'free' },
    conversations_limit: { type: Number, default: 50 },
    // Denormalized cache of the current month's BotUsage.conversations_count —
    // kept here for fast plan-limit checks on the webhook hot path. BotUsage is
    // the authoritative ledger.
    conversations_used_this_month: { type: Number, default: 0 },
    month_reset_date: { type: Date },

    total_conversations: { type: Number, default: 0 },
    total_orders_created: { type: Number, default: 0 },
    total_tokens_consumed: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

BotConfigSchema.index({ vendor_id: 1, status: 1 });
// Au plus un bot par (boutique, canal).
BotConfigSchema.index({ vendor_id: 1, channel: 1 }, { unique: true });
// Index uniques partiels : un Facebook page_id (resp. WhatsApp phone_number_id)
// ne peut être rattaché qu'à une boutique. On indexe SEULEMENT les docs où le
// champ est une chaîne — les autres (null/absents) sont ignorés par l'index,
// donc plusieurs configs WhatsApp peuvent coexister sans collision sur
// facebook_page_id, et inversement.
BotConfigSchema.index(
  { facebook_page_id: 1 },
  { unique: true, partialFilterExpression: { facebook_page_id: { $type: 'string' } } },
);
BotConfigSchema.index(
  { whatsapp_phone_number_id: 1 },
  { unique: true, partialFilterExpression: { whatsapp_phone_number_id: { $type: 'string' } } },
);

export const BotConfig = mongoose.model<IBotConfig>('BotConfig', BotConfigSchema);
