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
  variants: IProductVariant[];
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
  seoTitle?: string;
  seoDescription?: string;
  /** Per-product storefront page customization (set by the seller). */
  pageSettings?: IProductPageSettings;
  /** Quantity-tier bundle offer ("buy 2 for X"). */
  bundle?: IProductBundle;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Seller-editable options for the public product page. Every toggle defaults
 * to "shown" — the storefront treats `undefined` / `true` the same.
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

export interface IProductBundle {
  enabled: boolean;
  /** Block title shown on the storefront, e.g. "Offre spéciale". */
  title?: string;
  tiers: IProductBundleTier[];
}

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
    variants: [ProductVariantSchema],
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
    seoTitle: { type: String },
    seoDescription: { type: String },
    pageSettings: {
      showGallery: { type: Boolean },
      showDescription: { type: Boolean },
      showTrustBadges: { type: Boolean },
      codFormTitle: { type: String, trim: true },
      reassuranceText: { type: String, trim: true },
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
    },
  },
  { timestamps: true }
);

ProductSchema.index({ storeId: 1 });
ProductSchema.index({ storeId: 1, slug: 1 }, { unique: true });
export const Product = mongoose.model<IProduct>('Product', ProductSchema);
