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
  cost?: number;
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
  createdAt: Date;
  updatedAt: Date;
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
  },
  { timestamps: true }
);

ProductSchema.index({ storeId: 1 });
ProductSchema.index({ storeId: 1, slug: 1 }, { unique: true });
export const Product = mongoose.model<IProduct>('Product', ProductSchema);
