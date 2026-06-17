/**
 * Platform-wide settings — single document keyed by `key='global'`.
 *
 * Currently stores admin-tunable AI generation pricing (in USD) and the
 * USD → seller-wallet-currency conversion table used at debit time.
 * Read via `getSettings()`; write via the admin pricing endpoints.
 *
 * Why a singleton document instead of env vars? Admin can tune prices
 * live from the dashboard, without a redeploy, without losing audit
 * trail (Mongoose timestamps record who last changed what).
 */
import mongoose, { Schema, Document } from 'mongoose';

export type AiKind = 'landing' | 'poster' | 'product_page' | 'text_only';

export interface IAiPricing {
  /** Price in USD per generation kind. */
  prices: Record<AiKind, number>;
  /** USD → currency multiplier (1 USD * rate = price in that currency). */
  rates: Record<string, number>;
}

/**
 * Auth-related platform toggles. Tunable depuis /admin/settings.
 */
export interface IAuthSettings {
  /**
   * Kill-switch global pour la vérification d'email au signup.
   *  - true  (défaut)  : signup email/password envoie un mail Resend, le
   *    user reste `emailVerified: false` jusqu'au clic sur le lien.
   *  - false           : signup auto-marque `emailVerified: true` et n'envoie
   *    rien. Pratique si Resend rate, si tu testes en local sans clé API,
   *    ou pour une période de promo où tu veux pas friction à l'inscription.
   */
  emailVerificationEnabled: boolean;
}

export interface ISettings extends Document {
  key: 'global';
  aiPricing: IAiPricing;
  auth: IAuthSettings;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_AUTH_SETTINGS: IAuthSettings = {
  emailVerificationEnabled: true,
};

/**
 * Defaults baked in if no row exists yet. Admin can override every value
 * from /admin/pricing — these are just the safety net.
 *
 * Rates are mid-market estimates as of early 2026. Update them when
 * the local currencies drift more than ~10% from these values.
 */
export const DEFAULT_AI_PRICING: IAiPricing = {
  prices: {
    landing:      3,   // USD per full landing generation
    poster:       3,   // USD per poster generation
    product_page: 3,   // USD per product-detail page
    text_only:    1,   // USD per copy-only landing (no images)
  },
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    MAD: 10,        // Moroccan dirham
    TND: 3.1,       // Tunisian dinar
    DZD: 135,       // Algerian dinar
    XOF: 600,       // CFA franc (Senegal, Côte d'Ivoire, …)
    EGP: 49,        // Egyptian pound
    SAR: 3.75,      // Saudi riyal
    AED: 3.67,      // UAE dirham
    QAR: 3.64,      // Qatari riyal
    KWD: 0.31,      // Kuwaiti dinar
    NGN: 1500,      // Nigerian naira
    CAD: 1.36,
  },
};

const SettingsSchema = new Schema<ISettings>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    aiPricing: {
      prices: {
        landing:      { type: Number, default: DEFAULT_AI_PRICING.prices.landing },
        poster:       { type: Number, default: DEFAULT_AI_PRICING.prices.poster },
        product_page: { type: Number, default: DEFAULT_AI_PRICING.prices.product_page },
        text_only:    { type: Number, default: DEFAULT_AI_PRICING.prices.text_only },
      },
      rates: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_AI_PRICING.rates }) },
    },
    auth: {
      emailVerificationEnabled: { type: Boolean, default: DEFAULT_AUTH_SETTINGS.emailVerificationEnabled },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Settings = mongoose.model<ISettings>('Settings', SettingsSchema);

/**
 * Read the singleton — creates it with defaults if it doesn't exist yet.
 * Memoized for 30 s so we don't hit Mongo on every AI-generation call.
 */
let cache: { value: ISettings; expiresAt: number } | null = null;
const CACHE_MS = 30_000;

export async function getSettings(force = false): Promise<ISettings> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.value;
  let doc = await Settings.findOne({ key: 'global' });
  if (!doc) {
    doc = await Settings.create({
      key: 'global',
      aiPricing: DEFAULT_AI_PRICING,
      auth: DEFAULT_AUTH_SETTINGS,
    });
  } else if (!doc.auth) {
    // Migration douce : le doc existe (créé avant qu'on ajoute auth),
    // on remplit avec les défauts sans écraser le reste.
    doc.auth = { ...DEFAULT_AUTH_SETTINGS };
    await doc.save();
  }
  cache = { value: doc, expiresAt: Date.now() + CACHE_MS };
  return doc;
}

export function invalidateSettingsCache(): void {
  cache = null;
}
