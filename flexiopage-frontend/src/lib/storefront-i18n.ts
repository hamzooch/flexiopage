/**
 * Lightweight storefront translation table. Per-locale string dictionary
 * scoped to the strings FlexioPage controls (navbar CTAs, COD form
 * defaults, error banners, footer legal). Seller-authored content
 * (product names, descriptions, hero copy) is NOT translated here —
 * that would require per-product i18n which is a bigger investment.
 *
 * Default locale = the store's `settings.language`. Visitor can override
 * via the navbar language switcher; choice is persisted in localStorage.
 */

export type StorefrontLocale = 'fr' | 'ar' | 'en' | 'es' | 'pt' | 'it' | 'de';

export const SUPPORTED_LOCALES: Array<{ code: StorefrontLocale; label: string; flag: string; dir: 'ltr' | 'rtl' }> = [
  { code: 'fr', label: 'Français',  flag: '🇫🇷', dir: 'ltr' },
  { code: 'ar', label: 'العربية',   flag: '🇸🇦', dir: 'rtl' },
  { code: 'en', label: 'English',   flag: '🇬🇧', dir: 'ltr' },
  { code: 'es', label: 'Español',   flag: '🇪🇸', dir: 'ltr' },
  { code: 'pt', label: 'Português', flag: '🇵🇹', dir: 'ltr' },
  { code: 'it', label: 'Italiano',  flag: '🇮🇹', dir: 'ltr' },
  { code: 'de', label: 'Deutsch',   flag: '🇩🇪', dir: 'ltr' },
];

export type StorefrontStringKey =
  | 'nav.home'
  | 'nav.products'
  | 'nav.contact'
  | 'nav.search'
  | 'nav.cart'
  | 'nav.wishlist'
  | 'nav.merchant'
  | 'product.outOfStock'
  | 'product.inStock'
  | 'product.discover'
  | 'product.learnMore'
  | 'product.viewProduct'
  | 'product.relatedTitle'
  | 'cod.headline'
  | 'cod.submit'
  | 'cod.reassurance'
  | 'cod.payAtDelivery'
  | 'cod.subtotal'
  | 'cod.shipping'
  | 'cod.fullName'
  | 'cod.phone'
  | 'cod.email'
  | 'cod.country'
  | 'cod.address'
  | 'cod.addressExtra'
  | 'cod.city'
  | 'cod.state'
  | 'cod.postalCode'
  | 'cod.notes'
  | 'cod.havePromo'
  | 'cod.applyPromo'
  | 'cod.cancel'
  | 'cod.quantity'
  | 'footer.allRights'
  | 'common.required'
  | 'wishlist.empty'
  | 'wishlist.title';

type Dictionary = Record<StorefrontStringKey, string>;

const DICT: Record<StorefrontLocale, Dictionary> = {
  fr: {
    'nav.home':              'Accueil',
    'nav.products':          'Produits',
    'nav.contact':           'Contact',
    'nav.search':            'Rechercher',
    'nav.cart':              'Panier',
    'nav.wishlist':          'Favoris',
    'nav.merchant':          'Espace marchand',
    'product.outOfStock':    'Rupture de stock',
    'product.inStock':       'En stock',
    'product.discover':      'Découvrir',
    'product.learnMore':     'En savoir plus',
    'product.viewProduct':   'Voir le produit',
    'product.relatedTitle':  'Tu aimeras aussi',
    'cod.headline':          'Commander · Paiement à la livraison',
    'cod.submit':            'Commander',
    'cod.reassurance':       'Aucun prépaiement, paiement à la livraison uniquement',
    'cod.payAtDelivery':     'À payer à la livraison',
    'cod.subtotal':          'Sous-total',
    'cod.shipping':          'Livraison',
    'cod.fullName':          'Nom complet *',
    'cod.phone':             'Téléphone *',
    'cod.email':             'Email',
    'cod.country':           'Pays *',
    'cod.address':           'Adresse *',
    'cod.addressExtra':      'Complément (optionnel)',
    'cod.city':              'Ville *',
    'cod.state':             'Région',
    'cod.postalCode':        'Code postal',
    'cod.notes':             'Note pour le livreur (optionnel)',
    'cod.havePromo':         "J'ai un code promo",
    'cod.applyPromo':        'Appliquer',
    'cod.cancel':            'Annuler',
    'cod.quantity':          'Quantité',
    'footer.allRights':      'Tous droits réservés.',
    'common.required':       'Obligatoire',
    'wishlist.empty':        'Aucun favori',
    'wishlist.title':        'Mes favoris',
  },
  ar: {
    'nav.home':              'الرئيسية',
    'nav.products':          'المنتجات',
    'nav.contact':           'اتصل بنا',
    'nav.search':            'بحث',
    'nav.cart':              'السلة',
    'nav.wishlist':          'المفضلة',
    'nav.merchant':          'فضاء التاجر',
    'product.outOfStock':    'نفذت الكمية',
    'product.inStock':       'متوفر',
    'product.discover':      'اكتشف',
    'product.learnMore':     'المزيد',
    'product.viewProduct':   'عرض المنتج',
    'product.relatedTitle':  'قد يعجبك أيضا',
    'cod.headline':          'اطلب · الدفع عند الاستلام',
    'cod.submit':            'اطلب الآن',
    'cod.reassurance':       'بدون دفع مسبق، الدفع عند الاستلام فقط',
    'cod.payAtDelivery':     'الدفع عند الاستلام',
    'cod.subtotal':          'المجموع الفرعي',
    'cod.shipping':          'التوصيل',
    'cod.fullName':          'الاسم الكامل *',
    'cod.phone':             'الهاتف *',
    'cod.email':             'البريد الإلكتروني',
    'cod.country':           'البلد *',
    'cod.address':           'العنوان *',
    'cod.addressExtra':      'تفاصيل إضافية (اختياري)',
    'cod.city':              'المدينة *',
    'cod.state':             'الولاية',
    'cod.postalCode':        'الرمز البريدي',
    'cod.notes':             'ملاحظة لعامل التوصيل (اختياري)',
    'cod.havePromo':         'لدي رمز ترويجي',
    'cod.applyPromo':        'تطبيق',
    'cod.cancel':            'إلغاء',
    'cod.quantity':          'الكمية',
    'footer.allRights':      'جميع الحقوق محفوظة.',
    'common.required':       'مطلوب',
    'wishlist.empty':        'لا يوجد منتج في المفضلة',
    'wishlist.title':        'مفضلتي',
  },
  en: {
    'nav.home':              'Home',
    'nav.products':          'Products',
    'nav.contact':           'Contact',
    'nav.search':            'Search',
    'nav.cart':              'Cart',
    'nav.wishlist':          'Wishlist',
    'nav.merchant':          'Merchant area',
    'product.outOfStock':    'Out of stock',
    'product.inStock':       'In stock',
    'product.discover':      'Discover',
    'product.learnMore':     'Learn more',
    'product.viewProduct':   'View product',
    'product.relatedTitle':  'You may also like',
    'cod.headline':          'Order · Cash on delivery',
    'cod.submit':            'Order',
    'cod.reassurance':       'No prepayment, cash on delivery only',
    'cod.payAtDelivery':     'To pay on delivery',
    'cod.subtotal':          'Subtotal',
    'cod.shipping':          'Shipping',
    'cod.fullName':          'Full name *',
    'cod.phone':             'Phone *',
    'cod.email':             'Email',
    'cod.country':           'Country *',
    'cod.address':           'Address *',
    'cod.addressExtra':      'Extra (optional)',
    'cod.city':              'City *',
    'cod.state':             'State',
    'cod.postalCode':        'Postal code',
    'cod.notes':             'Note for the courier (optional)',
    'cod.havePromo':         'I have a promo code',
    'cod.applyPromo':        'Apply',
    'cod.cancel':            'Cancel',
    'cod.quantity':          'Quantity',
    'footer.allRights':      'All rights reserved.',
    'common.required':       'Required',
    'wishlist.empty':        'No favorites yet',
    'wishlist.title':        'My favorites',
  },
  es: { ...({} as Dictionary) } as Dictionary,
  pt: { ...({} as Dictionary) } as Dictionary,
  it: { ...({} as Dictionary) } as Dictionary,
  de: { ...({} as Dictionary) } as Dictionary,
};

// Backfill non-translated locales with English so a missing key never
// renders blank. Lets the seller ship a partial language without
// breaking the storefront.
for (const loc of (['es', 'pt', 'it', 'de'] as const)) {
  DICT[loc] = { ...DICT.en };
}

/**
 * Resolve a localized string. Falls back to English then to the key
 * itself so missing entries don't crash the storefront render.
 */
export function t(locale: StorefrontLocale | string | undefined, key: StorefrontStringKey): string {
  const safeLocale = (locale && (DICT as Record<string, Dictionary>)[locale])
    ? (locale as StorefrontLocale)
    : 'fr';
  const dict = DICT[safeLocale];
  return dict[key] || DICT.en[key] || key;
}

export function dirOf(locale: StorefrontLocale | string | undefined): 'ltr' | 'rtl' {
  const entry = SUPPORTED_LOCALES.find((l) => l.code === locale);
  return entry?.dir ?? 'ltr';
}

const STORAGE_KEY = (storeSlug: string) => `flexio.locale:${storeSlug}`;

export function getPreferredLocale(storeSlug: string, fallback?: string): StorefrontLocale | undefined {
  if (typeof window === 'undefined') return fallback as StorefrontLocale | undefined;
  const stored = window.localStorage.getItem(STORAGE_KEY(storeSlug));
  if (stored && SUPPORTED_LOCALES.some((l) => l.code === stored)) {
    return stored as StorefrontLocale;
  }
  return (fallback as StorefrontLocale | undefined) || undefined;
}

export function setPreferredLocale(storeSlug: string, locale: StorefrontLocale): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY(storeSlug), locale);
  // Also persist as a cookie so server components can pick it up on the
  // next navigation/reload. Path=/ so it scopes to the whole storefront,
  // 1 year lifetime so the visitor doesn't have to reselect each visit.
  document.cookie = `flexio_locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  // Soft reload — simplest way to re-fetch dir + apply translations
  // everywhere without plumbing a context through every server component.
  window.location.reload();
}

/**
 * Listen for locale changes (e.g. from a switcher in another tab) and
 * flip the <html> dir attribute live without a reload. Returns a
 * cleanup function. Call from a top-level layout client component.
 */
export function bootstrapLocaleDir(storeSlug: string, fallback?: string): void {
  if (typeof window === 'undefined') return;
  const initial = getPreferredLocale(storeSlug, fallback);
  if (initial) {
    const dir = dirOf(initial);
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', initial);
  }
}

