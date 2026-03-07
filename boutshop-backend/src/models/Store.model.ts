import mongoose, { Document, Schema } from 'mongoose';

export type StoreType = 'physical' | 'digital';

export interface IStore extends Document {
  ownerId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  storeType: StoreType;
  description?: string;
  logo?: string;
  favicon?: string;
  customDomain?: string;
  subdomain: string;
  theme?: Record<string, unknown>;
  settings: {
    currency: string;
    timezone: string;
    maintenanceMode: boolean;
    /** Default language for AI landing pages (ISO 639-1, e.g. 'fr', 'ar', 'en'). */
    language?: string;
    /** Target country (ISO 3166-1 alpha-2, e.g. 'TN', 'DZ', 'SA'). */
    country?: string;
    /** Text direction derived from language ('rtl' for ar/he/fa/ur). */
    direction?: 'ltr' | 'rtl';
    seoTitle?: string;
    seoDescription?: string;
    /**
     * Editable cash-on-delivery form shown on each product page.
     * The seller chooses which fields appear and customizes the labels.
     */
    codForm?: {
      headline?: string;          // default "Commander · Paiement à la livraison"
      submitLabel?: string;       // default "Commander"
      showEmail?: boolean;        // default true
      requireEmail?: boolean;     // default false
      showPostalCode?: boolean;   // default false
      showState?: boolean;        // default false
      showNotes?: boolean;        // default true
      showQuantity?: boolean;     // default true
      reassurance?: string;       // bullet shown under the button
    };
    /**
     * Storefront sections — what to render on the public store page.
     * Sellers toggle each section on/off and customize hero copy.
     */
    storefront?: {
      showHero?: boolean;            // default true
      heroTitle?: string;            // overrides store.name when set
      heroSubtitle?: string;         // overrides store.description when set
      heroImage?: string;            // background image URL
      showProductsGrid?: boolean;    // default true
      productsGridTitle?: string;    // default "Nos produits"
      showFeatures?: boolean;        // default true (3 reassurance pills)
      showFooter?: boolean;          // default true
      footerNote?: string;
    };
  };
  /**
   * Third-party integrations. For physical-product stores, the delivery
   * provider receives every paid order automatically.
   */
  integrations?: {
    delivery?: {
      provider: 'mogadelivery' | 'manual' | 'other';
      enabled: boolean;
      /** API key issued by the provider (server-side only). */
      apiKey?: string;
      /** Override the default base URL. */
      baseUrl?: string;
      /** Optional secret used to verify inbound webhooks (HMAC-SHA256). */
      webhookSecret?: string;
      /** Pickup origin used by the courier when collecting the package. */
      pickupAddress?: {
        contactName?: string;
        contactPhone?: string;
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
      };
      /** Auto-dispatch every paid order. If false, the seller dispatches manually. */
      autoDispatch?: boolean;
    };
  };
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StoreSchema = new Schema<IStore>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    storeType: { type: String, enum: ['physical', 'digital'], required: true, default: 'physical' },
    description: { type: String },
    logo: { type: String },
    favicon: { type: String },
    customDomain: { type: String, trim: true },
    subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true },
    theme: { type: Schema.Types.Mixed },
    settings: {
      currency: { type: String, default: 'USD' },
      timezone: { type: String, default: 'UTC' },
      maintenanceMode: { type: Boolean, default: false },
      language: { type: String, trim: true, lowercase: true },
      country: { type: String, trim: true, uppercase: true },
      direction: { type: String, enum: ['ltr', 'rtl'], default: 'ltr' },
      seoTitle: { type: String },
      seoDescription: { type: String },
      codForm: {
        headline: { type: String },
        submitLabel: { type: String },
        showEmail: { type: Boolean, default: true },
        requireEmail: { type: Boolean, default: false },
        showPostalCode: { type: Boolean, default: false },
        showState: { type: Boolean, default: false },
        showNotes: { type: Boolean, default: true },
        showQuantity: { type: Boolean, default: true },
        reassurance: { type: String },
      },
      storefront: {
        showHero: { type: Boolean, default: true },
        heroTitle: { type: String },
        heroSubtitle: { type: String },
        heroImage: { type: String },
        showProductsGrid: { type: Boolean, default: true },
        productsGridTitle: { type: String },
        showFeatures: { type: Boolean, default: true },
        showFooter: { type: Boolean, default: true },
        footerNote: { type: String },
      },
    },
    integrations: {
      delivery: {
        provider: { type: String, enum: ['mogadelivery', 'manual', 'other'] },
        enabled: { type: Boolean, default: false },
        apiKey: { type: String },
        baseUrl: { type: String },
        webhookSecret: { type: String },
        pickupAddress: {
          contactName: { type: String },
          contactPhone: { type: String },
          line1: { type: String },
          line2: { type: String },
          city: { type: String },
          state: { type: String },
          postalCode: { type: String },
          country: { type: String },
        },
        autoDispatch: { type: Boolean, default: true },
      },
    },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

StoreSchema.index({ ownerId: 1 });
StoreSchema.index({ slug: 1 });
StoreSchema.index({ subdomain: 1 });
StoreSchema.index({ customDomain: 1 }, { sparse: true });
export const Store = mongoose.model<IStore>('Store', StoreSchema);
