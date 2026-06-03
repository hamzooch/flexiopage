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
/**
 * Fournisseur pour le canal WhatsApp :
 *   - 'meta'     : WhatsApp Cloud API officielle (par défaut, rétro-compat).
 *   - 'wasender' : WasenderAPI (https://wasenderapi.com) — WhatsApp Web via QR.
 *
 * Ignoré sur le canal Messenger.
 */
export type WhatsAppProvider = 'meta' | 'wasender';

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
  /**
   * Fournisseur WhatsApp ('meta' par défaut). Détermine comment on envoie/reçoit
   * et quels champs `whatsapp_*` / `wasender_*` sont peuplés.
   */
  whatsapp_provider?: WhatsAppProvider;
  /** Messenger : id de la Page FB (absent pour WhatsApp). */
  facebook_page_id?: string;
  /** WhatsApp Cloud API (Meta) : phone number id. */
  whatsapp_phone_number_id?: string;
  /** WhatsApp Business Account id (optionnel). */
  whatsapp_business_account_id?: string;
  /** Numéro affiché de la ligne WhatsApp (optionnel, info). */
  whatsapp_display_number?: string;
  /** WasenderAPI : id (UUID/int) interne de la session — utilisé pour les URLs
   *  `/api/whatsapp-sessions/{id}/qrcode|status|disconnect`. */
  wasender_session_id?: string;
  /**
   * Token de session WasenderAPI chiffré, utilisé comme Bearer dans les appels
   * `/api/send-message` une fois la session connectée (différent du personal
   * access token). Stocké chiffré (AES-256-GCM).
   */
  wasender_session_token_encrypted?: string;
  /**
   * SHA-256 (hex) du session API token. Wasender utilise ce token comme
   * `sessionId` dans les payloads de webhook entrant — on cherche la BotConfig
   * par ce hash plutôt que par le wasender_session_id (UUID interne) qui ne
   * matche pas. Indexé partiellement (unique).
   */
  wasender_session_token_hash?: string;
  /**
   * Identifiant aléatoire (hex 32 chars) inclus dans l'URL de webhook
   * `https://api/.../webhook/wasender/{id}` pour permettre la route
   * multi-vendeur. Chaque BotConfig a son propre `wasender_webhook_id` →
   * l'URL elle-même identifie la session sans ambiguïté.
   */
  wasender_webhook_id?: string;
  /**
   * SHA-256 (hex) du secret de webhook propre à cette session. Wasender envoie
   * la valeur en clair dans `X-Webhook-Signature` à chaque webhook. Chaque
   * BotConfig a son secret unique → vérification d'auth par session, pas un
   * secret partagé global.
   */
  wasender_webhook_secret_hash?: string;
  /**
   * Token d'accès du canal, chiffré.
   *   - Messenger        : Page Access Token Meta.
   *   - WhatsApp (meta)  : access token Meta WhatsApp Cloud.
   *   - WhatsApp (wasender) : Personal Access Token WasenderAPI (utilisé pour
   *     gérer la session — QR, status, disconnect).
   */
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
    // 'meta' = WhatsApp Cloud API officielle ; 'wasender' = WasenderAPI (WhatsApp Web/QR).
    // Optionnel : absent sur les bots Messenger. Défaut historique 'meta' pour
    // ne pas casser les configs existantes.
    whatsapp_provider: { type: String, enum: ['meta', 'wasender'], default: 'meta' },
    // Pas d'index ici — défini plus bas en partial pour ignorer les null
    // (sparse ne suffit pas : MongoDB considère plusieurs null comme des doublons).
    facebook_page_id: { type: String },
    whatsapp_phone_number_id: { type: String },
    whatsapp_business_account_id: { type: String },
    whatsapp_display_number: { type: String },
    wasender_session_id: { type: String },
    wasender_session_token_encrypted: { type: String },
    wasender_session_token_hash: { type: String },
    wasender_webhook_id: { type: String },
    wasender_webhook_secret_hash: { type: String },
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
// Une session Wasender ne peut être rattachée qu'à une boutique.
BotConfigSchema.index(
  { wasender_session_id: 1 },
  { unique: true, partialFilterExpression: { wasender_session_id: { $type: 'string' } } },
);
// Hash du session API token — indexé pour la lookup côté webhook entrant
// (Wasender envoie ce token comme `sessionId` dans le payload).
BotConfigSchema.index(
  { wasender_session_token_hash: 1 },
  { unique: true, partialFilterExpression: { wasender_session_token_hash: { $type: 'string' } } },
);
// ID utilisé dans la route multi-vendeur /webhook/wasender/{id} — un seul bot
// peut posséder un ID donné, indexé pour lookup rapide sur le hot path.
BotConfigSchema.index(
  { wasender_webhook_id: 1 },
  { unique: true, partialFilterExpression: { wasender_webhook_id: { $type: 'string' } } },
);

export const BotConfig = mongoose.model<IBotConfig>('BotConfig', BotConfigSchema);
