import mongoose, { Document, Schema } from 'mongoose';

export type SectionType =
  | 'hero'
  | 'features'
  | 'stats'
  | 'gallery'
  | 'product'
  | 'products'
  | 'brands'
  | 'video'
  | 'pricing'
  | 'testimonials'
  | 'steps'
  | 'cta'
  | 'faq'
  | 'footer'
  /** Inline cash-on-delivery order form (physical-product landing pages). */
  | 'cod-form'
  | 'custom';

export const ALLOWED_SECTION_TYPES: SectionType[] = [
  'hero',
  'features',
  'stats',
  'gallery',
  'product',
  'products',
  'brands',
  'video',
  'pricing',
  'testimonials',
  'steps',
  'cta',
  'faq',
  'footer',
  'cod-form',
  'custom',
];

export type Direction = 'ltr' | 'rtl';

export interface IPageSection {
  id: string;
  type: SectionType;
  order: number;
  props: Record<string, unknown>;
}

export interface ILandingPage extends Document {
  storeId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  sections: IPageSection[];
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  language?: string;
  country?: string;
  currency?: string;
  direction?: Direction;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PageSectionSchema = new Schema<IPageSection>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ALLOWED_SECTION_TYPES, required: true },
    order: { type: Number, required: true },
    props: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const LandingPageSchema = new Schema<ILandingPage>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    sections: [PageSectionSchema],
    seoTitle: { type: String },
    seoDescription: { type: String },
    ogImage: { type: String },
    language: { type: String, trim: true, lowercase: true },
    country: { type: String, trim: true, uppercase: true },
    currency: { type: String, trim: true, uppercase: true },
    direction: { type: String, enum: ['ltr', 'rtl'], default: 'ltr' },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

LandingPageSchema.index({ storeId: 1 });
LandingPageSchema.index({ storeId: 1, slug: 1 }, { unique: true });
export const LandingPage = mongoose.model<ILandingPage>('LandingPage', LandingPageSchema);
