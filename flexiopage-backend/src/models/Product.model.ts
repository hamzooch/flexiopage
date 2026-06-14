import mongoose, { Document, Schema } from 'mongoose';

export type ProductType = 'physical' | 'digital';

/**
 * Digital product kinds (chariow-style). Each kind shapes the seller form
 * and the customer download portal:
 *   - download   : one or many files (PDF, ZIP, etc.) to download
 *   - course     : video lessons grouped in modules
 *   - license    : a software license key — generated from a template
 *   - membership : recurring access to a content area (no auto-renewal here yet)
 *   - service    : booking / consultation — manual fulfillment
 */
export type DigitalKind = 'download' | 'course' | 'license' | 'membership' | 'service';

/** Asset attached to a digital product (file, video, image, link). */
export interface IDigitalAsset {
  /** Stable id used by the customer portal. */
  id: string;
  /** Display name (e.g. "Chapitre 1.pdf"). */
  name: string;
  /** Public/private URL; for /uploads/* the storage service serves it. */
  url: string;
  /** Asset kind (drives icon + behavior in the portal). */
  kind: 'file' | 'video' | 'image' | 'audio' | 'link';
  /** Mime type, optional. */
  mimeType?: string;
  /** File size in bytes, optional. */
  size?: number;
  /** Duration in seconds (video/audio). */
  durationSeconds?: number;
  /** Sort order. */
  order: number;
}

/** Course module containing lessons (each lesson is itself a digital asset). */
export interface ICourseModule {
  id: string;
  title: string;
  /** References to asset ids that belong to this module. */
  lessonIds: string[];
  order: number;
}

export interface IProductVariant {
  name: string;
  sku?: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  options?: Record<string, string>;
}

/**
 * Prix + stock par pays. Quand `pricing[]` est non vide pour un produit,
 * c'est la source de vérité pour l'affichage storefront et l'order capture
 * (sélection via le market du buyer). Les champs racine `price`,
 * `compareAtPrice`, `stock`, `available` restent en place comme défaut /
 * fallback pour les produits pré-migration et les marchés non couverts.
 *
 * Voir memory/mogadelivery-multi-pays-architecture.md.
 */
export interface IProductPricing {
  /** ISO 3166-1 alpha-2 — doit correspondre à un market actif du Store. */
  country: string;
  /** Prix de vente dans la devise du market. */
  price: number;
  /** Prix barré optionnel ("compare at"). */
  compareAtPrice?: number;
  /** Devise du market (redondante mais évite un lookup au storefront). */
  currency: string;
  /** Stock indépendant par pays (chaque dashboard MD = un entrepôt distinct). */
  stock?: number;
  /** Désactivable sans supprimer (ex. rupture temporaire). */
  available?: boolean;
}

/**
 * Lien produit ↔ fournisseur. Un même produit peut être sourcé chez plusieurs
 * fournisseurs (prix différents, délais différents). Le drapeau `isPrimary`
 * désigne celui utilisé par défaut quand on crée une importation.
 */
export interface IProductSupplier {
  supplierId: mongoose.Types.ObjectId;
  /** Référence/SKU côté fournisseur. */
  supplierSku?: string;
  /** Prix d'achat unitaire chez ce fournisseur. */
  costPrice?: number;
  /** Devise du costPrice (peut différer de la devise de vente). */
  currency?: string;
  /** Délai d'approvisionnement spécifique (override du défaut du fournisseur). */
  leadTimeDays?: number;
  /** Quantité minimum à commander chez ce fournisseur. */
  minOrderQty?: number;
  /** Lien direct du produit chez le fournisseur (AliExpress, etc). */
  productUrl?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface IProduct extends Document {
  storeId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  type: ProductType;
  price: number;
  compareAtPrice?: number;
  /** Unit cost of the product (COGS) — what it costs the seller to acquire one. */
  cost?: number;
  /** Per-order shipping cost paid by the seller (carrier fee). */
  shippingCost?: number;
  /** Per-order packaging cost (box, tape, label, etc.). */
  packagingCost?: number;
  /** Average marketing cost per sale (CPA) — total ad spend / paid orders. */
  marketingCost?: number;
  /** Payment processor percentage fee (e.g. 2.9 for 2.9%). */
  paymentFeePct?: number;
  /** Payment processor fixed fee per transaction. */
  paymentFeeFixed?: number;
  sku?: string;
  barcode?: string;
  stock: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  /**
   * Prix + stock par pays activé sur la boutique. Optionnel — si vide ou
   * absent, le storefront/checkout retombent sur `price`/`compareAtPrice`/
   * `stock` racine. Voir IProductPricing.
   */
  pricing?: IProductPricing[];
  variants: IProductVariant[];
  /** Sourcing : liste des fournisseurs qui fournissent ce produit, avec
   *  leurs conditions (prix d'achat, délai, MOQ). Optionnel — utilisé par
   *  le module de gestion du stock et des importations. */
  suppliers?: IProductSupplier[];
  images: string[];

  /** Legacy single-file fields — kept for backward compatibility. */
  digitalFileUrl?: string;
  digitalFileName?: string;

  // ── New digital fields (chariow-style) ──
  /** Kind of digital product. */
  digitalKind?: DigitalKind;
  /** All deliverables. For "download" / "course" / "membership". */
  digitalAssets?: IDigitalAsset[];
  /** Course module structure when digitalKind === 'course'. */
  courseModules?: ICourseModule[];
  /**
   * License key template (string). Tokens replaced at delivery:
   *   {random}       — 16-char base32
   *   {productSlug}  — slug of the product
   *   {orderNumber}  — order number
   * Example: "BOUT-{productSlug}-{random}".
   */
  licenseKeyTemplate?: string;
  /** Lifetime access vs limited (in days). */
  accessType?: 'lifetime' | 'limited';
  accessDays?: number;
  /** Max downloads per asset per order (0 = unlimited). */
  downloadLimit?: number;

  weight?: number;
  weightUnit?: string;
  isPublished: boolean;
  /** Free-form tags used by auto-collections + merchandising filters. */
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  /** Per-product storefront page customization (set by the seller). */
  pageSettings?: IProductPageSettings;
  /** Quantity-tier bundle offer ("buy 2 for X"). */
  bundle?: IProductBundle;
  /** Upsell suggestions — surfaced on the product page / in the COD form. */
  upsells?: IRelatedOffer[];
  /** Cross-sell suggestions — surfaced as "related products" on the product page. */
  crossSells?: IRelatedOffer[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Seller-editable options for the public product page. Every toggle defaults
 * to "shown" — the storefront treats `undefined` / `true` the same.
 *
 * Per-product overrides for badges / timer / testimonials win over the
 * store-wide configuration when set. Unset (undefined) = inherit from store.
 */
export interface IProductPageSettings {
  /** Thumbnail image strip under the main photo. */
  showGallery?: boolean;
  /** Full "Description" section below the fold. */
  showDescription?: boolean;
  /** Trust badges row. */
  showTrustBadges?: boolean;
  /** Overrides the COD form title for this product. */
  codFormTitle?: string;
  /** Overrides the reassurance line under the COD form for this product. */
  reassuranceText?: string;
  /** Per-product timer override (e.g. flash sale on one product only). */
  timer?: {
    endsAt?: string;     // ISO date
    headline?: string;
    accentColor?: string;
  };
  /** Per-product custom trust badges (overrides store-wide list when set). */
  badges?: Array<{
    icon: 'truck' | 'shield' | 'refresh' | 'lock' | 'headset' | 'gift' | 'clock' | 'star' | 'leaf' | 'banknote';
    label: string;
    sublabel?: string;
  }>;
  /** Show 5-star rating strip under the title (visual social proof). */
  showRatingStrip?: boolean;
  /** Per-product accent color used by badges/timer/strip (hex). */
  accentColor?: string;

  // ── Sections "conversion" (phase 1) ─────────────────────────────────
  // Toutes les sections suivantes sont optionnelles. Si non définies →
  // la section ne s'affiche pas. Le rendu côté storefront respecte les
  // tokens du thème actif (couleurs, typo, radius) pour ne pas casser
  // la cohérence visuelle quel que soit le template choisi.

  /**
   * USPs (Unique Selling Points) — bullets avec icône + titre + sous-titre.
   * 3 à 6 entries idéalement. Sert à scanner les bénéfices avant lecture.
   */
  features?: Array<{
    icon: 'sparkles' | 'shield' | 'leaf' | 'zap' | 'heart' | 'award' | 'gift' | 'truck' | 'clock' | 'check' | 'star' | 'recycle';
    title: string;
    subtitle?: string;
  }>;

  /**
   * Foire aux questions produit. Levier de conversion massif en COD :
   * lève les objections AVANT le formulaire de commande.
   */
  faq?: Array<{
    question: string;
    answer: string;
  }>;

  /**
   * Spécifications techniques. Table clé/valeur (matière, dimensions,
   * poids, contenu de la boîte, garantie…). Indispensable cosmétique/déco.
   */
  specs?: Array<{
    key: string;
    value: string;
  }>;

  /**
   * Bloc livraison & retours détaillé (vs juste les badges). En COD-heavy
   * les 3 questions vitales : combien de temps, quels frais, possibilité
   * de retour. Réponses claires → +confiance → +conversion.
   */
  shippingInfo?: {
    deliveryTime?: string;       // ex: "2 à 5 jours ouvrés"
    deliveryNote?: string;        // ex: "Livraison gratuite à partir de 200 TND"
    returnDays?: number;          // ex: 14
    returnNote?: string;          // ex: "Sans question, sans frais"
  };
}

/**
 * Quantity-tier bundle — "buy more, save more". The seller defines tiers
 * (quantity -> total price). Quantity 1 is implicit and always `product.price`.
 * Tiers cover quantity >= 2. The order's effective unit price for a matched
 * tier is `totalPrice / quantity`.
 */
export interface IProductBundleTier {
  /** Quantity that unlocks this price (>= 2). */
  quantity: number;
  /** Total price for that whole quantity, in the store currency. */
  totalPrice: number;
  /** Optional badge text, e.g. "−15%" or "الأكثر طلباً". */
  label?: string;
}

/**
 * Visual styling for the bundle block on the storefront. Seller-tweakable
 * so the bundle can match the product page's vibe instead of always
 * inheriting the active theme primary.
 */
export interface IProductBundleStyle {
  /** Layout variant. */
  layout?: 'list' | 'grid' | 'compact';
  /** Accent color (hex) used for the selected-tier ring + badges. Defaults to theme primary. */
  accentColor?: string;
  /** Badge color (hex) for the tier label pill. Defaults to accentColor. */
  badgeColor?: string;
  /** Show the "save %" pill next to each tier. */
  showSavings?: boolean;
  /** Highlight the most popular tier (visually). When set, that quantity is auto-pre-selected. */
  highlightQuantity?: number;
}

export interface IProductBundle {
  enabled: boolean;
  /** Block title shown on the storefront, e.g. "Offre spéciale". */
  title?: string;
  tiers: IProductBundleTier[];
  /** Visual customization for the bundle block. */
  style?: IProductBundleStyle;
}

/**
 * Upsell — extra suggestion shown ON the product page (e.g. "Ajoute aussi…").
 * Each entry references another product in the same store + an optional
 * discount applied only when the upsell is accepted at checkout.
 *
 * Cross-sell uses the same shape but is rendered as "related products"
 * on the product page (less aggressive, no price override at checkout).
 */
export interface IRelatedOffer {
  /** Target product id (must belong to the same store). */
  productId: mongoose.Types.ObjectId;
  /** Optional override label — defaults to the target product's name. */
  label?: string;
  /** Optional discount % (1-99) applied to the target when the buyer takes it. */
  discountPct?: number;
  /** Optional sort weight (lower = shown first). */
  order?: number;
}

const ProductSupplierSchema = new Schema<IProductSupplier>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierSku: { type: String, trim: true },
    costPrice: { type: Number, min: 0 },
    currency: { type: String, trim: true, uppercase: true },
    leadTimeDays: { type: Number, min: 0 },
    minOrderQty: { type: Number, min: 1 },
    productUrl: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const ProductVariantSchema = new Schema<IProductVariant>(
  {
    name: { type: String, required: true },
    sku: { type: String },
    price: { type: Number, required: true },
    compareAtPrice: { type: Number },
    stock: { type: Number, default: 0 },
    options: { type: Schema.Types.Mixed },
  },
  { _id: true }
);

const DigitalAssetSchema = new Schema<IDigitalAsset>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    kind: { type: String, enum: ['file', 'video', 'image', 'audio', 'link'], default: 'file' },
    mimeType: { type: String },
    size: { type: Number },
    durationSeconds: { type: Number },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const CourseModuleSchema = new Schema<ICourseModule>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    lessonIds: [{ type: String }],
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const ProductSchema = new Schema<IProduct>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    description: { type: String },
    type: { type: String, enum: ['physical', 'digital'], default: 'physical' },
    price: { type: Number, required: true },
    compareAtPrice: { type: Number },
    cost: { type: Number },
    shippingCost: { type: Number },
    packagingCost: { type: Number },
    marketingCost: { type: Number },
    paymentFeePct: { type: Number },
    paymentFeeFixed: { type: Number },
    sku: { type: String },
    barcode: { type: String },
    stock: { type: Number, default: 0 },
    trackInventory: { type: Boolean, default: true },
    allowBackorder: { type: Boolean, default: false },
    pricing: [
      {
        _id: false,
        country: { type: String, required: true, trim: true, uppercase: true },
        price: { type: Number, required: true, min: 0 },
        compareAtPrice: { type: Number, min: 0 },
        currency: { type: String, required: true, trim: true, uppercase: true },
        stock: { type: Number, default: 0, min: 0 },
        available: { type: Boolean, default: true },
      },
    ],
    variants: [ProductVariantSchema],
    suppliers: [ProductSupplierSchema],
    images: [{ type: String }],

    digitalFileUrl: { type: String },
    digitalFileName: { type: String },
    digitalKind: { type: String, enum: ['download', 'course', 'license', 'membership', 'service'] },
    digitalAssets: [DigitalAssetSchema],
    courseModules: [CourseModuleSchema],
    licenseKeyTemplate: { type: String, trim: true },
    accessType: { type: String, enum: ['lifetime', 'limited'], default: 'lifetime' },
    accessDays: { type: Number },
    downloadLimit: { type: Number, default: 0 },

    weight: { type: Number },
    weightUnit: { type: String, default: 'kg' },
    isPublished: { type: Boolean, default: false },
    tags: [{ type: String, trim: true, lowercase: true }],
    seoTitle: { type: String },
    seoDescription: { type: String },
    pageSettings: {
      showGallery: { type: Boolean },
      showDescription: { type: Boolean },
      showTrustBadges: { type: Boolean },
      codFormTitle: { type: String, trim: true },
      reassuranceText: { type: String, trim: true },
      timer: {
        endsAt: { type: String, trim: true },
        headline: { type: String, trim: true },
        accentColor: { type: String, trim: true },
      },
      badges: [
        {
          _id: false,
          icon: {
            type: String,
            enum: ['truck', 'shield', 'refresh', 'lock', 'headset', 'gift', 'clock', 'star', 'leaf', 'banknote'],
            required: true,
          },
          label: { type: String, required: true, trim: true },
          sublabel: { type: String, trim: true },
        },
      ],
      showRatingStrip: { type: Boolean },
      accentColor: { type: String, trim: true },
      // ── Phase 1 conversion sections ────────────────────────────────
      features: [
        {
          _id: false,
          icon: {
            type: String,
            enum: ['sparkles', 'shield', 'leaf', 'zap', 'heart', 'award', 'gift', 'truck', 'clock', 'check', 'star', 'recycle'],
            required: true,
          },
          title: { type: String, required: true, trim: true },
          subtitle: { type: String, trim: true },
        },
      ],
      faq: [
        {
          _id: false,
          question: { type: String, required: true, trim: true },
          answer: { type: String, required: true, trim: true },
        },
      ],
      specs: [
        {
          _id: false,
          key: { type: String, required: true, trim: true },
          value: { type: String, required: true, trim: true },
        },
      ],
      shippingInfo: {
        deliveryTime: { type: String, trim: true },
        deliveryNote: { type: String, trim: true },
        returnDays: { type: Number },
        returnNote: { type: String, trim: true },
      },
    },
    bundle: {
      enabled: { type: Boolean, default: false },
      title: { type: String, trim: true },
      tiers: [
        {
          _id: false,
          quantity: { type: Number, required: true },
          totalPrice: { type: Number, required: true },
          label: { type: String, trim: true },
        },
      ],
      style: {
        layout: { type: String, enum: ['list', 'grid', 'compact'], default: 'list' },
        accentColor: { type: String, trim: true },
        badgeColor: { type: String, trim: true },
        showSavings: { type: Boolean, default: true },
        highlightQuantity: { type: Number },
      },
    },
    upsells: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        label: { type: String, trim: true },
        discountPct: { type: Number, min: 1, max: 99 },
        order: { type: Number, default: 0 },
      },
    ],
    crossSells: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        label: { type: String, trim: true },
        discountPct: { type: Number, min: 1, max: 99 },
        order: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

ProductSchema.index({ storeId: 1 });
ProductSchema.index({ storeId: 1, slug: 1 }, { unique: true });
// Tag-based lookups for auto-collections + tag filters.
ProductSchema.index({ storeId: 1, tags: 1 });
export const Product = mongoose.model<IProduct>('Product', ProductSchema);
