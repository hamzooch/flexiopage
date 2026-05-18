/**
 * Lightweight i18n for the dashboard chrome (header + sidebar + menus).
 *
 * Scope is intentionally narrow: only the strings that wrap the whole app
 * (navigation, top bar, account menu) are translated here. Page content stays
 * in French for now — adding a new language to this dict is trivial, but
 * translating every dashboard page is a separate, much bigger chantier.
 *
 * Persistence lives in a Zustand store (`useLangStore`) so the seller's
 * preference survives reloads and route changes.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Lang = 'fr' | 'en' | 'ar';

export const LANGUAGES: { code: Lang; label: string; flag: string; nativeName: string }[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷', nativeName: 'Français' },
  { code: 'en', label: 'English', flag: '🇬🇧', nativeName: 'English' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', nativeName: 'العربية' },
];

/** Right-to-left languages — drives the `dir` attribute on <html>. */
export function isRtl(lang: Lang): boolean {
  return lang === 'ar';
}

// ─────────────────────────────────────────────────────────────────────
// Dictionary
// ─────────────────────────────────────────────────────────────────────
// Keys are dot-grouped by surface. Add a new key here, then use it via
// `useT()`. When adding a new language, every key must be filled — TS
// enforces this through the Dict type below.

const DICTIONARY = {
  // Header / breadcrumbs
  'header.dashboard': { fr: 'Dashboard', en: 'Dashboard', ar: 'لوحة التحكم' },
  'header.overview': { fr: "Vue d'ensemble", en: 'Overview', ar: 'نظرة عامة' },
  'header.searchPlaceholder': {
    fr: 'Rechercher produits, commandes, clients…',
    en: 'Search products, orders, customers…',
    ar: 'بحث عن منتجات أو طلبات أو عملاء…',
  },
  'header.chooseStore': { fr: 'Choisir une boutique', en: 'Choose a store', ar: 'اختر متجرًا' },
  'header.switchStore': { fr: 'Changer de boutique', en: 'Switch store', ar: 'تغيير المتجر' },
  'header.viewSite': { fr: 'Voir le site', en: 'View site', ar: 'عرض الموقع' },
  'header.profile': { fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' },
  'header.settings': { fr: 'Paramètres', en: 'Settings', ar: 'الإعدادات' },
  'header.logout': { fr: 'Se déconnecter', en: 'Log out', ar: 'تسجيل الخروج' },
  'header.language': { fr: 'Langue', en: 'Language', ar: 'اللغة' },

  // Sidebar — section titles
  'sidebar.workspace': { fr: 'Espace de travail', en: 'Workspace', ar: 'مساحة العمل' },
  'sidebar.sales': { fr: 'Vente', en: 'Sales', ar: 'المبيعات' },
  'sidebar.account': { fr: 'Compte', en: 'Account', ar: 'الحساب' },

  // Sidebar — workspace items
  'sidebar.overview': { fr: "Vue d'ensemble", en: 'Overview', ar: 'نظرة عامة' },
  'sidebar.myStores': { fr: 'Mes boutiques', en: 'My stores', ar: 'متاجري' },
  'sidebar.analytics': { fr: 'Analytics', en: 'Analytics', ar: 'الإحصائيات' },

  // Sidebar — sales items
  'sidebar.orders': { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' },
  'sidebar.products': { fr: 'Produits', en: 'Products', ar: 'المنتجات' },
  'sidebar.offers': { fr: 'Offres', en: 'Offers', ar: 'العروض' },
  'sidebar.landingPages': { fr: 'Landing pages', en: 'Landing pages', ar: 'صفحات الهبوط' },
  'sidebar.aiStudio': { fr: 'Studio IA', en: 'AI Studio', ar: 'استوديو الذكاء الاصطناعي' },
  // Kept for backwards-compat with code that still reads these keys, both point
  // to the unified Studio IA page now.
  'sidebar.aiLanding': { fr: 'Studio IA', en: 'AI Studio', ar: 'استوديو الذكاء الاصطناعي' },
  'sidebar.aiPoster': { fr: 'Studio IA', en: 'AI Studio', ar: 'استوديو الذكاء الاصطناعي' },
  'sidebar.tracking': { fr: 'Suivi', en: 'Tracking', ar: 'التتبع' },
  'sidebar.customers': { fr: 'Clients', en: 'Customers', ar: 'العملاء' },
  'sidebar.profitCalculator': {
    fr: 'Calculatrice profit',
    en: 'Profit calculator',
    ar: 'حاسبة الأرباح',
  },

  // Sidebar — account items
  'sidebar.wallet': { fr: 'Solde', en: 'Wallet', ar: 'الرصيد' },
  'sidebar.team': { fr: 'Équipe', en: 'Team', ar: 'الفريق' },
  'sidebar.support': { fr: 'Support', en: 'Support', ar: 'الدعم' },
  'sidebar.integrations': { fr: 'Intégrations', en: 'Integrations', ar: 'التكاملات' },
  'sidebar.apps': { fr: 'Applications', en: 'Apps', ar: 'التطبيقات' },
  'sidebar.profile': { fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' },
  'sidebar.settings': { fr: 'Paramètres', en: 'Settings', ar: 'الإعدادات' },
} as const satisfies Record<string, Record<Lang, string>>;

export type TKey = keyof typeof DICTIONARY;

export function t(key: TKey, lang: Lang): string {
  return DICTIONARY[key]?.[lang] ?? DICTIONARY[key]?.fr ?? key;
}

// ─────────────────────────────────────────────────────────────────────
// Zustand store + hook
// ─────────────────────────────────────────────────────────────────────

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'fr',
      setLang: (lang) => set({ lang }),
    }),
    { name: 'flexiopage-lang' }
  )
);

/** React hook returning a `t(key)` function bound to the current language. */
export function useT(): { t: (key: TKey) => string; lang: Lang } {
  const lang = useLangStore((s) => s.lang);
  return { t: (key) => t(key, lang), lang };
}
