/**
 * Pure helpers for the storefront product-page reorderable sections.
 * Mirrors /lib/section-order but for the per-product detail page.
 *
 * Keeping this in a dependency-free module (no React, no 'use client')
 * means both the server-rendered product page and the client dashboard
 * editor can import the same source of truth.
 */

export type ProductPageSectionId = 'badges' | 'timer' | 'description' | 'testimonials';

export const DEFAULT_PRODUCT_PAGE_ORDER: ProductPageSectionId[] = [
  'badges',
  'timer',
  'description',
  'testimonials',
];

export function resolveProductPageOrder(saved?: ProductPageSectionId[]): ProductPageSectionId[] {
  const seen = new Set<ProductPageSectionId>();
  const out: ProductPageSectionId[] = [];
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (DEFAULT_PRODUCT_PAGE_ORDER.includes(id) && !seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    }
  }
  for (const id of DEFAULT_PRODUCT_PAGE_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

/** Icon ids accepted on a custom trust badge. */
export type BadgeIcon =
  | 'truck'
  | 'shield'
  | 'refresh'
  | 'lock'
  | 'headset'
  | 'gift'
  | 'clock'
  | 'star'
  | 'leaf'
  | 'banknote';

export interface TrustBadge {
  icon: BadgeIcon;
  label: string;
  sublabel?: string;
}

export interface ProductPageTimer {
  endsAt?: string;
  headline?: string;
  accentColor?: string;
}

/**
 * Visual customization of the storefront product page. Every field is
 * optional — the storefront falls back to the active theme when a value
 * is undefined.
 */
export interface ProductPageStyle {
  /** Color of the product title heading. */
  titleColor?: string;
  /** Color of the price digits (the big number). */
  priceColor?: string;
  /** Accent color used by badges + timer + small decorative hits. */
  accentColor?: string;
  /** CTA button background ("Commander"). Falls back to accentColor / theme primary. */
  buttonColor?: string;
  /** Text color on the CTA button. */
  buttonTextColor?: string;
  /** Page background override. */
  backgroundColor?: string;
  /** Layout of the image gallery on the left column. */
  galleryLayout?: 'single' | 'thumbnails' | 'grid';
  /** Show a 5-star rating row under the title (decorative — no real reviews wired). */
  showRatingStrip?: boolean;
  /** Id of the active preset palette — drives the picker highlight. */
  paletteId?: string;
}

export interface ProductPageSettings {
  showTimer?: boolean;
  timer?: ProductPageTimer;
  showBadges?: boolean;
  badges?: TrustBadge[];
  showTestimonials?: boolean;
  showDescription?: boolean;
  sectionOrder?: ProductPageSectionId[];
  /** Visual style overrides — colors + gallery layout. */
  style?: ProductPageStyle;
}

/** Sensible defaults when the seller hasn't added any badge yet. */
export const DEFAULT_BADGES: TrustBadge[] = [
  { icon: 'truck',   label: 'Livraison rapide',     sublabel: '2 à 5 jours' },
  { icon: 'shield',  label: 'Paiement sécurisé',     sublabel: 'À la livraison' },
  { icon: 'refresh', label: 'Satisfait ou remboursé', sublabel: 'Sous 7 jours' },
];
