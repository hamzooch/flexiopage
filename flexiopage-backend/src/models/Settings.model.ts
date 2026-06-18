/**
 * Platform-wide settings — single document keyed by `key='global'`.
 *
 * Stores admin-tunable AI generation pricing. Depuis le passage au modèle
 * token (2026-06-18, ratio 1 USD = 1.5 token), `prices` est exprimé en
 * **tokens** consommés par génération, et `usdToTokens` définit combien
 * de tokens le vendeur reçoit quand il recharge 1 USD.
 *
 * `rates` est gardé pour le script de migration historique (legacy local-
 * currency → USD) mais n'est plus utilisé en runtime — le wallet AI est
 * en tokens, plus en monnaie locale.
 *
 * Read via `getSettings()`; write via the admin pricing endpoints.
 */
import mongoose, { Schema, Document } from 'mongoose';

export type AiKind = 'landing' | 'poster' | 'product_page' | 'text_only';

export interface IAiPricing {
  /** Tokens consommés par génération (par kind). */
  prices: Record<AiKind, number>;
  /** Nombre de tokens crédités au vendeur par 1 USD versé. */
  usdToTokens: number;
  /** Legacy: USD → currency multiplier, utilisé uniquement par le script
   *  migrate-wallets-to-usd.ts. Plus consulté au runtime. */
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
    landing:      3,   // tokens per full landing generation
    poster:       3,   // tokens per poster generation
    product_page: 3,   // tokens per product-detail page
    text_only:    1,   // tokens per copy-only landing (no images)
  },
  // 10 USD top-up = 15 tokens (ratio confirmé 2026-06-18). L'admin peut
  // ajuster depuis /admin/settings sans redéploiement.
  usdToTokens: 1.5,
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
      usdToTokens: { type: Number, default: DEFAULT_AI_PRICING.usdToTokens, min: 0.01 },
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
  } else {
    // Migrations douces : le doc existe mais peut manquer des champs
    // ajoutés après sa création. On remplit avec les défauts sans écraser.
    let dirty = false;
    if (!doc.auth) {
      doc.auth = { ...DEFAULT_AUTH_SETTINGS };
      dirty = true;
    }
    if (!doc.aiPricing?.usdToTokens) {
      // Doc créé avant le passage au modèle token (juin 2026). On met le
      // ratio par défaut, l'admin pourra l'ajuster.
      doc.aiPricing.usdToTokens = DEFAULT_AI_PRICING.usdToTokens;
      dirty = true;
    }
    if (dirty) await doc.save();
  }
  cache = { value: doc, expiresAt: Date.now() + CACHE_MS };
  return doc;
}

export function invalidateSettingsCache(): void {
  cache = null;
}
