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
  /**
   * URL d'image custom (uploadée par le vendeur, ex. /uploads/badge-xxx.png).
   * Quand présente, elle prend le pas sur l'icône Lucide dans le rendu — utile
   * pour utiliser un logo de partenaire (banque, transporteur) ou un badge
   * dessiné maison. L'icône reste comme fallback si l'image casse.
   */
  imageUrl?: string;
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
  /** Master toggle — when false or undefined, the storefront ignores every
   *  palette color below and uses the active theme. Lets the seller flip
   *  custom styling on/off without losing their chosen colors. */
  useCustomPalette?: boolean;
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
  /** Long description body text color (under-the-fold "Description" section). */
  descriptionColor?: string;
  /** Navbar background override — applies only on product pages so palettes
   *  can give product pages their own vibe without touching the homepage. */
  navbarColor?: string;
  /** Navbar text/icon color override paired with navbarColor. */
  navbarTextColor?: string;
  /** CTA button shape — wins over codForm.buttonShape on the product page. */
  buttonShape?: 'pill' | 'rounded' | 'square';
  /** CTA button animation — wins over codForm.buttonAnimated/Animation. */
  buttonAnimated?: boolean;
  buttonAnimation?: 'pulse' | 'shimmer' | 'bounce' | 'none';
  /** Layout of the image gallery on the left column. */
  galleryLayout?: 'single' | 'thumbnails' | 'grid';
  /** Show a 5-star rating row under the title (décoratif — pas de vrais avis branchés). */
  showRatingStrip?: boolean;
  /** Note affichée (étoiles pleines) — de 1 à 5, accepte les demi-étoiles
   *  (4.5). Défaut : 5. */
  ratingStripStars?: number;
  /** Nombre d'avis affiché en parenthèses, ex. "(247 avis)". Défaut : 127. */
  ratingStripReviews?: number;
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
  /** Show the "Ajouter au panier" CTA on the product page. Default true. */
  showAddToCart?: boolean;
  sectionOrder?: ProductPageSectionId[];
  /** Visual style overrides — colors + gallery layout. */
  style?: ProductPageStyle;
}

/**
 * Sensible defaults when the seller hasn't added any badge yet.
 *
 * Two variants because the trust signals that convert are radically different
 * between physical (waiting days for a courier) and digital (instant delivery,
 * no shipping to worry about). The store type is known at render time so the
 * storefront picks the right set — sellers can still override.
 */
export const DEFAULT_BADGES_PHYSICAL: TrustBadge[] = [
  { icon: 'truck',   label: 'Livraison rapide',     sublabel: '2 à 5 jours' },
  { icon: 'shield',  label: 'Paiement sécurisé',     sublabel: 'À la livraison' },
  { icon: 'refresh', label: 'Satisfait ou remboursé', sublabel: 'Sous 7 jours' },
];

export const DEFAULT_BADGES_DIGITAL: TrustBadge[] = [
  { icon: 'clock',   label: 'Accès instantané',     sublabel: 'Dès le paiement' },
  { icon: 'lock',    label: 'Paiement sécurisé',     sublabel: 'Moneroo · SSL' },
  { icon: 'refresh', label: 'Satisfait ou remboursé', sublabel: '14 jours' },
];

/** @deprecated — Import DEFAULT_BADGES_PHYSICAL / DEFAULT_BADGES_DIGITAL,
 *  or use defaultBadgesForStoreType(). Kept for backward-compat with older
 *  imports (dashboard editors created before 2026-07-13). */
export const DEFAULT_BADGES = DEFAULT_BADGES_PHYSICAL;

export function defaultBadgesForStoreType(storeType?: 'physical' | 'digital'): TrustBadge[] {
  return storeType === 'digital' ? DEFAULT_BADGES_DIGITAL : DEFAULT_BADGES_PHYSICAL;
}
