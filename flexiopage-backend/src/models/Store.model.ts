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
  customDomainVerified?: boolean;
  customDomainVerifiedAt?: Date;
  customDomainTarget?: string;
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
      /**
       * Flat per-store shipping fee added on top of the product subtotal in
       * the COD checkout. 0 (or unset) = no fee. Always trusted from this
       * server-side value — the storefront only displays it.
       */
      shippingFee?: number;
      /** ── Visual customization (overrides the active theme on the COD form) ── */
      /** Background fill of the form card (hex). Defaults to theme.surface. */
      backgroundColor?: string;
      /** Hex color for the submit button. Defaults to theme.primary. */
      buttonColor?: string;
      /** Hex color for text rendered on the submit button. Defaults to theme.primaryFg. */
      buttonTextColor?: string;
      /** Border-radius style for the submit button. */
      buttonShape?: 'pill' | 'rounded' | 'square';
      /** When true, the submit button gets a subtle pulse animation. */
      buttonAnimated?: boolean;
      /** Animation flavor. */
      buttonAnimation?: 'pulse' | 'shimmer' | 'bounce' | 'none';
    };
    /**
     * Welcome popup that collects an email lead on first visit. When a
     * coupon code is configured, the buyer receives it on success (we
     * just echo it back — no email send yet, the seller is expected to
     * pair it with their own ESP or use the visible code on the spot).
     */
    newsletter?: {
      enabled?: boolean;
      headline?: string;          // "Profite de 10% sur ta première commande"
      subheadline?: string;       // small print under the headline
      ctaLabel?: string;          // submit button text
      image?: string;             // optional left-column visual
      delaySeconds?: number;      // wait N seconds before showing (0 = immediate)
      exitIntent?: boolean;       // also trigger on mouse-leave-top (desktop only)
      rewardCouponCode?: string;  // existing coupon to hand out on success
      dismissalDays?: number;     // suppress popup for N days after dismissal
      successMessage?: string;    // overrides default "Merci, ton code est"
    };
    /**
     * Floating WhatsApp button shown on every storefront page. Lets the
     * buyer open a wa.me chat with the seller in one tap. Replaces the
     * previous in-store chatbot — same goal, simpler UX.
     */
    whatsapp?: {
      enabled?: boolean;          // default false
      /** E.164 phone (e.g. "+216551234"). Required when enabled. */
      phoneNumber?: string;
      /** Pre-filled message opened in WhatsApp (encoded into wa.me URL). */
      message?: string;
      /** Where the floating button sits on the page. */
      position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
      /** Brand accent (hex). Defaults to WhatsApp green (#25D366). */
      accentColor?: string;
      /** When true, a subtle pulse ring draws the eye. */
      pulse?: boolean;
    };
    /**
     * Storefront sections — what to render on the public store page.
     * Sellers toggle each section on/off and customize hero copy.
     */
    storefront?: {
      /**
       * Thin promo bar above the navbar. Either a fixed centered message or
       * a scrolling ticker that cycles through `messages[]`.
       */
      announcementBar?: {
        enabled?: boolean;          // default false
        messages?: string[];        // short promo lines
        mode?: 'fixed' | 'animated';
      };
      /**
       * Navbar (sticky top bar). Logo + optional menu links. Sellers add
       * their own links (Catalogue, À propos, Contact, etc.). Always visible.
       */
      navbar?: {
        showSearch?: boolean;       // default false
        menuLinks?: Array<{ label: string; url: string }>;
        /** How the brand shows in the navbar: logo+name, logo only, or name only. */
        brandDisplay?: 'logo+name' | 'logo' | 'name';
        /** Logo height tier (drives the bar height too on lg/xl). */
        logoSize?: 'sm' | 'md' | 'lg' | 'xl';
        /** Show the storefront language switcher in the navbar. Default false — opt-in. */
        showLanguageSwitcher?: boolean;
      };
      showHero?: boolean;            // default true
      heroTitle?: string;            // overrides store.name when set
      heroSubtitle?: string;         // overrides store.description when set
      heroImage?: string;            // background image URL
      /**
       * Optional video URL — wins over `heroImage` when set. Accepts a
       * direct mp4/webm/mov path or a YouTube/Vimeo URL (we detect and
       * embed iframe-style). Autoplay muted loop, no controls.
       */
      heroVideo?: string;
      showProductsGrid?: boolean;    // default true
      productsGridTitle?: string;    // default "Nos produits"
      showFeatures?: boolean;        // default true (3 reassurance pills)
      /**
       * Render order of the four movable body sections. Unknown / missing
       * entries are appended at the end in their default position. The
       * fixed-position sections (announcement, navbar, footer) are NOT in
       * this array — they always stay at their canonical position.
       */
      sectionOrder?: Array<'hero' | 'slider' | 'products' | 'testimonials'>;
      /**
       * Per-store product-page configuration. Lets the seller compose a
       * high-converting product detail page with movable sections, a
       * countdown timer, trust badges and (optional) testimonials.
       */
      productPage?: {
        /** Show the urgency countdown above the COD form. */
        showTimer?: boolean;
        timer?: {
          /** ISO date string — when the countdown reaches zero. */
          endsAt?: string;
          /** Short headline shown next to the digits (eg "Offre limitée"). */
          headline?: string;
          /** Accent color (hex). Defaults to theme primary. */
          accentColor?: string;
        };
        /** Show the trust-badges row (livraison / garantie / etc.). */
        showBadges?: boolean;
        /**
         * Custom trust badges. Each item picks an icon from a curated list
         * and adds a short label + optional sublabel. If empty, the
         * storefront renders 3 sensible defaults.
         */
        badges?: Array<{
          icon: 'truck' | 'shield' | 'refresh' | 'lock' | 'headset' | 'gift' | 'clock' | 'star' | 'leaf' | 'banknote';
          label: string;
          sublabel?: string;
        }>;
        /** Show the testimonials block on the product page. */
        showTestimonials?: boolean;
        /** Show the long description section (already supported per-product, this is a store-wide default). */
        showDescription?: boolean;
        /** Render order of the movable body sections of the product page. */
        sectionOrder?: Array<'badges' | 'timer' | 'description' | 'testimonials'>;
        /** Visual style overrides — colors + gallery layout. */
        style?: {
          titleColor?: string;
          priceColor?: string;
          accentColor?: string;
          /** CTA button background (Commander). Falls back to accentColor / theme primary. */
          buttonColor?: string;
          /** Text color on the CTA button. */
          buttonTextColor?: string;
          /** Page background override. */
          backgroundColor?: string;
          galleryLayout?: 'single' | 'thumbnails' | 'grid';
          showRatingStrip?: boolean;
          /** Id of the preset palette currently active (for the picker UI). */
          paletteId?: string;
        };
      };
      /**
       * Customer testimonials / reviews section managed by the seller.
       * Each testimonial has the buyer's name, optional photo, rating 1-5
       * and a short quote.
       */
      testimonials?: {
        enabled?: boolean;          // default false
        title?: string;             // default "Ils nous font confiance"
        subtitle?: string;
        items?: Array<{
          author: string;
          role?: string;            // optional sub-line (city, role, age, etc.)
          rating?: number;          // 1..5 stars
          content: string;
          avatar?: string;          // optional photo URL
          productName?: string;     // optional — "Acheté: X"
          verified?: boolean;       // shows a "Vérifié" badge
        }>;
      };
      showFooter?: boolean;          // default true
      footerNote?: string;
      /**
       * Extended footer fields. Toggled on/off implicitly when any value is
       * present — no separate enabled flag needed.
       */
      footer?: {
        social?: {
          instagram?: string;
          facebook?: string;
          tiktok?: string;
          youtube?: string;
          x?: string;                // formerly twitter
          whatsapp?: string;
        };
        contact?: {
          email?: string;
          phone?: string;
          address?: string;
        };
        links?: Array<{ label: string; url: string }>;
        /**
         * Grouped link columns rendered in the storefront footer — replaces
         * the flat `links` array when set. Each column is a titled group of
         * links. Seeded with 3 standard columns at store creation (Termes,
         * Contact, Information) and fully editable by the seller.
         */
        columns?: Array<{
          title: string;
          links: Array<{ label: string; url: string }>;
        }>;
        /** How the brand shows in the footer about-block. */
        brandDisplay?: 'logo+name' | 'logo' | 'name';
        /** Logo size when brandDisplay includes the logo. */
        logoSize?: 'sm' | 'md' | 'lg' | 'xl';
      };
      /**
       * Carousel/slider displayed right under the navbar.
       * Sellers add their own slides (image, title, subtitle, CTA).
       */
      slider?: {
        enabled?: boolean;           // default false
        autoplay?: boolean;          // default true
        autoplayMs?: number;         // default 5000
        height?: 'sm' | 'md' | 'lg' | 'xl'; // default 'lg'
        slides?: Array<{
          image: string;             // required — background image URL
          title?: string;
          subtitle?: string;
          ctaLabel?: string;
          ctaUrl?: string;
          textAlign?: 'left' | 'center' | 'right';  // default 'center'
          overlay?: 'none' | 'light' | 'dark';      // default 'dark'
        }>;
      };
    };
  };
  /**
   * Third-party integrations. For physical-product stores, the delivery
   * provider receives every paid order automatically.
   */
  integrations?: {
    delivery?: {
      provider: 'mogadelivery' | 'yalidine' | 'noest' | 'aramex' | 'manual' | 'other';
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
    /**
     * 3PL / logistics provider — stores and ships inventory on the seller's
     * behalf (ShipBob, Cubyn, Amazon MCF, etc.). Independent from `delivery`
     * (last-mile carrier): a seller can use a 3PL that itself selects a carrier.
     */
    logistics?: {
      provider: 'mogadelivery' | 'shipbob' | 'cubyn' | 'amazon-mcf' | 'sendcloud' | 'easyship' | 'manual' | 'other';
      enabled: boolean;
      apiKey?: string;
      baseUrl?: string;
      webhookSecret?: string;
      /** Warehouse / fulfillment center identifier on the provider side. */
      warehouseId?: string;
      /** Auto-forward every paid order to the 3PL. */
      autoForward?: boolean;
    };
    /**
     * Push every new order to a Google Apps Script webhook that appends a row
     * to the seller's Google Sheet. The seller pastes the deployed Apps Script
     * URL — no OAuth required.
     */
    googleSheets?: {
      enabled: boolean;
      webhookUrl?: string;
      lastSyncAt?: Date;
      lastError?: string;
    };
    /**
     * Marketing pixels injected into the public storefront. The seller pastes
     * their pixel IDs and FlexioPage emits PageView / ViewContent /
     * InitiateCheckout / Purchase events automatically.
     */
    marketing?: {
      facebookPixelId?: string;
      facebookConversionsApiToken?: string;
      facebookTestEventCode?: string;
      googleAnalyticsId?: string;
      tiktokPixelId?: string;
      snapchatPixelId?: string;
      googleAdsConversionId?: string;
      googleAdsConversionLabel?: string;
      /** Arbitrary HTML/JS injected into <head> (use with caution). */
      customHeadCode?: string;
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
    customDomain: { type: String, trim: true, lowercase: true },
    customDomainVerified: { type: Boolean, default: false },
    customDomainVerifiedAt: { type: Date },
    customDomainTarget: { type: String, trim: true, lowercase: true },
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
        shippingFee: { type: Number, default: 0, min: 0 },
        backgroundColor: { type: String, trim: true },
        buttonColor: { type: String, trim: true },
        buttonTextColor: { type: String, trim: true },
        buttonShape: { type: String, enum: ['pill', 'rounded', 'square'], default: 'pill' },
        buttonAnimated: { type: Boolean, default: false },
        buttonAnimation: { type: String, enum: ['pulse', 'shimmer', 'bounce', 'none'], default: 'pulse' },
      },
      newsletter: {
        enabled: { type: Boolean, default: false },
        headline: { type: String, trim: true },
        subheadline: { type: String, trim: true },
        ctaLabel: { type: String, trim: true },
        image: { type: String, trim: true },
        delaySeconds: { type: Number, default: 5, min: 0 },
        exitIntent: { type: Boolean, default: true },
        rewardCouponCode: { type: String, trim: true, uppercase: true },
        dismissalDays: { type: Number, default: 7, min: 0 },
        successMessage: { type: String, trim: true },
      },
      whatsapp: {
        enabled: { type: Boolean, default: false },
        phoneNumber: { type: String, trim: true },
        message: { type: String, trim: true },
        position: {
          type: String,
          enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
          default: 'bottom-right',
        },
        accentColor: { type: String, trim: true },
        pulse: { type: Boolean, default: true },
      },
      storefront: {
        announcementBar: {
          enabled: { type: Boolean, default: false },
          messages: [{ type: String }],
          mode: { type: String, enum: ['fixed', 'animated'], default: 'fixed' },
        },
        navbar: {
          showSearch: { type: Boolean, default: false },
          menuLinks: [
            {
              label: { type: String, required: true },
              url: { type: String, required: true },
            },
          ],
          brandDisplay: { type: String, enum: ['logo+name', 'logo', 'name'], default: 'logo+name' },
          logoSize: { type: String, enum: ['sm', 'md', 'lg', 'xl'], default: 'md' },
          showLanguageSwitcher: { type: Boolean, default: false },
        },
        showHero: { type: Boolean, default: true },
        heroTitle: { type: String },
        heroSubtitle: { type: String },
        heroImage: { type: String },
        heroVideo: { type: String, trim: true },
        showProductsGrid: { type: Boolean, default: true },
        productsGridTitle: { type: String },
        showFeatures: { type: Boolean, default: true },
        sectionOrder: [{ type: String, enum: ['hero', 'slider', 'products', 'testimonials'] }],
        productPage: {
          showTimer: { type: Boolean, default: false },
          timer: {
            endsAt: { type: String, trim: true },
            headline: { type: String, trim: true },
            accentColor: { type: String, trim: true },
          },
          showBadges: { type: Boolean, default: true },
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
          showTestimonials: { type: Boolean, default: false },
          showDescription: { type: Boolean, default: true },
          sectionOrder: [{ type: String, enum: ['badges', 'timer', 'description', 'testimonials'] }],
          style: {
            titleColor: { type: String, trim: true },
            priceColor: { type: String, trim: true },
            accentColor: { type: String, trim: true },
            buttonColor: { type: String, trim: true },
            buttonTextColor: { type: String, trim: true },
            backgroundColor: { type: String, trim: true },
            galleryLayout: { type: String, enum: ['single', 'thumbnails', 'grid'], default: 'thumbnails' },
            showRatingStrip: { type: Boolean, default: false },
            paletteId: { type: String, trim: true },
          },
        },
        testimonials: {
          enabled: { type: Boolean, default: false },
          title: { type: String },
          subtitle: { type: String },
          items: [
            {
              author: { type: String, required: true },
              role: { type: String },
              rating: { type: Number, min: 1, max: 5 },
              content: { type: String, required: true },
              avatar: { type: String },
              productName: { type: String },
              verified: { type: Boolean, default: false },
            },
          ],
        },
        showFooter: { type: Boolean, default: true },
        footerNote: { type: String },
        footer: {
          social: {
            instagram: { type: String },
            facebook: { type: String },
            tiktok: { type: String },
            youtube: { type: String },
            x: { type: String },
            whatsapp: { type: String },
          },
          contact: {
            email: { type: String },
            phone: { type: String },
            address: { type: String },
          },
          links: [
            {
              label: { type: String, required: true },
              url: { type: String, required: true },
            },
          ],
          columns: [
            {
              title: { type: String, required: true },
              links: [
                {
                  label: { type: String, required: true },
                  url: { type: String, required: true },
                },
              ],
            },
          ],
          brandDisplay: { type: String, enum: ['logo+name', 'logo', 'name'], default: 'name' },
          logoSize: { type: String, enum: ['sm', 'md', 'lg', 'xl'], default: 'md' },
        },
        slider: {
          enabled: { type: Boolean, default: false },
          autoplay: { type: Boolean, default: true },
          autoplayMs: { type: Number, default: 5000 },
          height: { type: String, enum: ['sm', 'md', 'lg', 'xl'], default: 'lg' },
          slides: [
            {
              image: { type: String, required: true },
              title: { type: String },
              subtitle: { type: String },
              ctaLabel: { type: String },
              ctaUrl: { type: String },
              textAlign: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
              overlay: { type: String, enum: ['none', 'light', 'dark'], default: 'dark' },
            },
          ],
        },
      },
    },
    integrations: {
      delivery: {
        provider: { type: String, enum: ['mogadelivery', 'yalidine', 'noest', 'aramex', 'manual', 'other'] },
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
      logistics: {
        provider: { type: String, enum: ['mogadelivery', 'shipbob', 'cubyn', 'amazon-mcf', 'sendcloud', 'easyship', 'manual', 'other'] },
        enabled: { type: Boolean, default: false },
        apiKey: { type: String },
        baseUrl: { type: String },
        webhookSecret: { type: String },
        warehouseId: { type: String },
        autoForward: { type: Boolean, default: true },
      },
      googleSheets: {
        enabled: { type: Boolean, default: false },
        webhookUrl: { type: String, trim: true },
        lastSyncAt: { type: Date },
        lastError: { type: String },
      },
      marketing: {
        facebookPixelId: { type: String, trim: true },
        facebookConversionsApiToken: { type: String, trim: true },
        facebookTestEventCode: { type: String, trim: true },
        googleAnalyticsId: { type: String, trim: true },
        tiktokPixelId: { type: String, trim: true },
        snapchatPixelId: { type: String, trim: true },
        googleAdsConversionId: { type: String, trim: true },
        googleAdsConversionLabel: { type: String, trim: true },
        customHeadCode: { type: String },
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
