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
  'header.dashboard': { fr: 'Tableau de bord', en: 'Dashboard', ar: 'لوحة التحكم' },
  'header.overview': { fr: "Vue d'ensemble", en: 'Overview', ar: 'نظرة عامة' },
  'header.searchPlaceholder': {
    fr: 'Rechercher produits, commandes, clients…',
    en: 'Search products, orders, customers…',
    ar: 'ابحث عن منتجات، طلبات، عملاء…',
  },
  'header.chooseStore': { fr: 'Choisir une boutique', en: 'Choose a store', ar: 'اختر متجرًا' },
  'header.switchStore': { fr: 'Changer de boutique', en: 'Switch store', ar: 'تغيير المتجر' },
  'header.viewSite': { fr: 'Voir le site', en: 'View site', ar: 'عرض الموقع' },
  'header.profile': { fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' },
  'header.settings': { fr: 'Paramètres', en: 'Settings', ar: 'الإعدادات' },
  'header.logout': { fr: 'Se déconnecter', en: 'Log out', ar: 'تسجيل الخروج' },
  'header.language': { fr: 'Langue', en: 'Language', ar: 'اللغة' },
  'header.openMenu': { fr: 'Ouvrir le menu', en: 'Open menu', ar: 'فتح القائمة' },
  'header.accountMenu': { fr: 'Menu du compte', en: 'Account menu', ar: 'قائمة الحساب' },

  // Sidebar — section titles
  'sidebar.workspace': { fr: 'Espace de travail', en: 'Workspace', ar: 'مساحة العمل' },
  'sidebar.sales': { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' },
  'sidebar.account': { fr: 'Compte', en: 'Account', ar: 'الحساب' },

  // Sidebar — workspace items
  'sidebar.overview': { fr: "Vue d'ensemble", en: 'Overview', ar: 'نظرة عامة' },
  'sidebar.myStores': { fr: 'Mes boutiques', en: 'My stores', ar: 'متاجري' },
  'sidebar.analytics': { fr: 'Analytics', en: 'Analytics', ar: 'التحليلات' },

  // Sidebar — sales items
  'sidebar.orders': { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' },
  'sidebar.products': { fr: 'Produits', en: 'Products', ar: 'المنتجات' },
  'sidebar.collections': { fr: 'Collections', en: 'Collections', ar: 'المجموعات' },
  'sidebar.suppliers': { fr: 'Fournisseurs', en: 'Suppliers', ar: 'الموردون' },
  'sidebar.offers': { fr: 'Offres', en: 'Offers', ar: 'العروض' },
  'sidebar.landingPages': { fr: 'Landing pages', en: 'Landing pages', ar: 'صفحات الهبوط' },
  // "AI Studio" is widely understood; "استوديو الذكاء الاصطناعي" is the full
  // formal form but too long for the sidebar — we keep the short bilingual
  // form so it doesn't wrap on smaller screens.
  'sidebar.aiStudio': { fr: 'Studio IA', en: 'AI Studio', ar: 'استوديو AI' },
  // Kept for backwards-compat with code that still reads these keys, both point
  // to the unified Studio IA page now.
  'sidebar.aiLanding': { fr: 'Studio IA', en: 'AI Studio', ar: 'استوديو AI' },
  'sidebar.aiPoster': { fr: 'Studio IA', en: 'AI Studio', ar: 'استوديو AI' },
  'sidebar.tracking': { fr: 'Suivi', en: 'Tracking', ar: 'التتبع' },
  'sidebar.customers': { fr: 'Clients', en: 'Customers', ar: 'العملاء' },
  'sidebar.profitCalculator': {
    fr: 'Calculatrice profit',
    en: 'Profit calculator',
    ar: 'حاسبة الأرباح',
  },
  'sidebar.marketplace': { fr: 'Marketplace', en: 'Marketplace', ar: 'السوق' },
  'sidebar.marketplaceAcquired': {
    fr: 'Produits acquis',
    en: 'Acquired products',
    ar: 'المنتجات المكتسبة',
  },

  // Sidebar — account items
  'sidebar.earnings': { fr: 'Revenus', en: 'Earnings', ar: 'الأرباح' },
  'sidebar.wallet': { fr: 'Solde', en: 'Wallet', ar: 'المحفظة' },
  'sidebar.team': { fr: 'Équipe', en: 'Team', ar: 'الفريق' },
  'sidebar.support': { fr: 'Support', en: 'Support', ar: 'الدعم' },
  'sidebar.integrations': { fr: 'Intégrations', en: 'Integrations', ar: 'التكاملات' },
  'sidebar.apps': { fr: 'Applications', en: 'Apps', ar: 'التطبيقات' },
  'sidebar.profile': { fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' },
  'sidebar.settings': { fr: 'Paramètres', en: 'Settings', ar: 'الإعدادات' },

  // Sidebar — chrome bits (logo aria, close button, admin shortcut)
  'sidebar.brandAria': {
    fr: 'FlexioPage — tableau de bord',
    en: 'FlexioPage — dashboard',
    ar: 'FlexioPage — لوحة التحكم',
  },
  'sidebar.closeMenu': { fr: 'Fermer le menu', en: 'Close menu', ar: 'إغلاق القائمة' },
  'sidebar.adminMode': {
    fr: 'Mode Admin Plateforme',
    en: 'Platform Admin Mode',
    ar: 'وضع إدارة المنصة',
  },

  // Cross-cutting fallbacks
  'common.user': { fr: 'Utilisateur', en: 'User', ar: 'المستخدم' },

  // ─── LANDING PAGE (/) ───────────────────────────────────────────────
  // Navbar
  'landing.nav.features': { fr: 'Fonctionnalités', en: 'Features', ar: 'المميزات' },
  'landing.nav.pricing': { fr: 'Tarifs', en: 'Pricing', ar: 'الأسعار' },
  'landing.nav.faq': { fr: 'FAQ', en: 'FAQ', ar: 'الأسئلة الشائعة' },
  'landing.nav.login': { fr: 'Se connecter', en: 'Log in', ar: 'تسجيل الدخول' },
  'landing.nav.createStore': { fr: 'Créer ma boutique', en: 'Create my store', ar: 'أنشئ متجري' },
  'landing.nav.openMenu': { fr: 'Ouvrir le menu', en: 'Open menu', ar: 'فتح القائمة' },
  'landing.nav.closeMenu': { fr: 'Fermer le menu', en: 'Close menu', ar: 'إغلاق القائمة' },
  'landing.nav.logoAria': { fr: 'FlexioPage — accueil', en: 'FlexioPage — home', ar: 'FlexioPage — الرئيسية' },
  'landing.nav.langLabel': { fr: 'Langue', en: 'Language', ar: 'اللغة' },
  'landing.nav.currentLang': {
    fr: 'Langue actuelle',
    en: 'Current language',
    ar: 'اللغة الحالية',
  },

  // Hero
  'landing.hero.badge': {
    fr: 'Sans abonnement · Tes 30 premières commandes sont gratuites',
    en: 'No subscription · Your first 30 orders are free',
    ar: 'بدون اشتراك · أول 30 طلبًا مجانية',
  },
  'landing.hero.title1': {
    fr: 'Crée ta boutique en ligne.',
    en: 'Create your online store.',
    ar: 'أنشئ متجرك الإلكتروني.',
  },
  'landing.hero.title2': {
    fr: 'Vends dès aujourd’hui.',
    en: 'Sell starting today.',
    ar: 'وابدأ البيع اليوم.',
  },
  'landing.hero.subtitle': {
    fr: "Ton premier client en 24h. Sans code, sans commission fixe, paiement à la livraison inclus — pour vendre partout en Afrique de l'Ouest et au Maghreb.",
    en: 'Your first customer within 24 h. No code, no fixed commission, cash on delivery included — sell everywhere in West Africa and the Maghreb.',
    ar: 'أول عميل خلال 24 ساعة. بدون برمجة، بدون عمولة ثابتة، الدفع عند الاستلام مُدمج — للبيع في كل أفريقيا الغربية والمغرب العربي.',
  },
  'landing.hero.ctaPrimary': {
    fr: 'Créer ma boutique gratuite',
    en: 'Create my free store',
    ar: 'أنشئ متجري مجانًا',
  },
  'landing.hero.ctaSecondary': {
    fr: 'Voir comment ça marche',
    en: 'See how it works',
    ar: 'شاهد كيف يعمل',
  },
  'landing.hero.stat1Label': { fr: 'vendeurs actifs', en: 'active sellers', ar: 'بائع نشط' },
  'landing.hero.stat2Label': { fr: 'pays couverts', en: 'countries covered', ar: 'دولة مغطاة' },
  'landing.hero.stat3Label': { fr: 'satisfaction', en: 'satisfaction', ar: 'رضا العملاء' },
  'landing.hero.reassure': {
    fr: 'Aucune carte bancaire pour commencer · Aucun engagement',
    en: 'No credit card to start · No commitment',
    ar: 'بدون بطاقة بنكية للبدء · بدون التزام',
  },

  // Hero mock (fake shop preview)
  'landing.heroMock.cash': { fr: 'Cash', en: 'Cash', ar: 'كاش' },
  'landing.heroMock.category': {
    fr: 'Caftan Marrakech',
    en: 'Marrakech Caftan',
    ar: 'قفطان مراكش',
  },
  'landing.heroMock.name': {
    fr: 'Soie brodée main',
    en: 'Hand-embroidered silk',
    ar: 'حرير مطرز يدويًا',
  },
  'landing.heroMock.desc': {
    fr: 'Coupe ample · livré sous 48h',
    en: 'Loose cut · delivered in 48 h',
    ar: 'قصّة فضفاضة · التوصيل خلال 48 ساعة',
  },
  'landing.heroMock.formTitle': {
    fr: 'Commande à la livraison',
    en: 'Cash on delivery',
    ar: 'الطلب مع الدفع عند الاستلام',
  },
  'landing.heroMock.cta': { fr: 'Commander', en: 'Order now', ar: 'اطلب الآن' },

  // Social proof strip
  'landing.stats.subscription': { fr: "d'abonnement", en: 'subscription', ar: 'اشتراك' },
  'landing.stats.openShop': {
    fr: 'pour ouvrir une boutique',
    en: 'to open a store',
    ar: 'لفتح متجر',
  },
  'landing.stats.countries': {
    fr: 'Afrique de l’Ouest + Maghreb',
    en: 'West Africa + Maghreb',
    ar: 'أفريقيا الغربية + المغرب العربي',
  },
  'landing.stats.support': { fr: 'support FR / AR', en: 'FR / AR support', ar: 'دعم فرنسي / عربي' },
  'landing.stats.countriesUnit': { fr: 'pays', en: 'countries', ar: 'دولة' },
  'landing.stats.marqueeAria': {
    fr: 'Pays couverts par FlexioPage',
    en: 'Countries covered by FlexioPage',
    ar: 'الدول التي يغطيها FlexioPage',
  },

  // Countries (marquee)
  'landing.countries.SN': { fr: 'Sénégal', en: 'Senegal', ar: 'السنغال' },
  'landing.countries.CI': { fr: 'Côte d’Ivoire', en: 'Ivory Coast', ar: 'ساحل العاج' },
  'landing.countries.ML': { fr: 'Mali', en: 'Mali', ar: 'مالي' },
  'landing.countries.BF': { fr: 'Burkina Faso', en: 'Burkina Faso', ar: 'بوركينا فاسو' },
  'landing.countries.BJ': { fr: 'Bénin', en: 'Benin', ar: 'بنين' },
  'landing.countries.TG': { fr: 'Togo', en: 'Togo', ar: 'توغو' },
  'landing.countries.GN': { fr: 'Guinée', en: 'Guinea', ar: 'غينيا' },
  'landing.countries.NE': { fr: 'Niger', en: 'Niger', ar: 'النيجر' },
  'landing.countries.GM': { fr: 'Gambie', en: 'Gambia', ar: 'غامبيا' },
  'landing.countries.GH': { fr: 'Ghana', en: 'Ghana', ar: 'غانا' },
  'landing.countries.NG': { fr: 'Nigeria', en: 'Nigeria', ar: 'نيجيريا' },
  'landing.countries.CM': { fr: 'Cameroun', en: 'Cameroon', ar: 'الكاميرون' },
  'landing.countries.MA': { fr: 'Maroc', en: 'Morocco', ar: 'المغرب' },
  'landing.countries.TN': { fr: 'Tunisie', en: 'Tunisia', ar: 'تونس' },
  'landing.countries.DZ': { fr: 'Algérie', en: 'Algeria', ar: 'الجزائر' },
  'landing.countries.LY': { fr: 'Libye', en: 'Libya', ar: 'ليبيا' },

  // Features
  'landing.features.badge': { fr: 'Une stack complète', en: 'A full stack', ar: 'حزمة متكاملة' },
  'landing.features.titleA': {
    fr: 'Tout ce qu’il faut pour vendre.',
    en: 'Everything you need to sell.',
    ar: 'كل ما تحتاجه للبيع.',
  },
  'landing.features.titleB': { fr: 'Rien de plus.', en: 'Nothing more.', ar: 'لا شيء آخر.' },
  'landing.features.subtitle': {
    fr: 'FlexioPage combine boutique, landing pages, formulaire COD et logistique en une seule app.',
    en: 'FlexioPage bundles store, landing pages, COD form and logistics into a single app.',
    ar: 'يجمع FlexioPage بين المتجر وصفحات الهبوط ونموذج الدفع عند الاستلام والخدمات اللوجستية في تطبيق واحد.',
  },
  'landing.features.item1Title': {
    fr: 'Landing pages générées par IA',
    en: 'AI-generated landing pages',
    ar: 'صفحات هبوط مُنشأة بالذكاء الاصطناعي',
  },
  'landing.features.item1Desc': {
    fr: 'Décris ton produit, l’IA écrit le copy + génère les photos cinématiques. Édition libre ensuite.',
    en: 'Describe your product — AI writes the copy and generates cinematic photos. Free editing afterwards.',
    ar: 'صِف منتجك، يكتب الذكاء الاصطناعي النصوص ويولّد صورًا سينمائية. تعديل حر بعد ذلك.',
  },
  'landing.features.item2Title': {
    fr: 'Paiement à la livraison',
    en: 'Cash on delivery',
    ar: 'الدفع عند الاستلام',
  },
  'landing.features.item2Desc': {
    fr: 'Aucune carte bancaire requise. Le client paie en espèces au livreur, tu reçois ton argent net.',
    en: 'No credit card required. Customer pays cash to the courier, you receive the net amount.',
    ar: 'لا حاجة لبطاقة بنكية. يدفع العميل نقدًا للموصّل، وتستلم مبلغك صافيًا.',
  },
  'landing.features.item3Title': {
    fr: 'Intègre ta société de livraison facilement',
    en: 'Plug in your delivery company easily',
    ar: 'اربط شركة التوصيل الخاصة بك بسهولة',
  },
  'landing.features.item3Desc': {
    fr: 'Connecte le coursier de ton choix : envoi des commandes, suivi des statuts et collecte du paiement gérés pour toi.',
    en: 'Connect the courier of your choice: order dispatch, status tracking and payment collection handled for you.',
    ar: 'اربط الموصّل الذي تختاره: إرسال الطلبات وتتبّع الحالات وتحصيل المدفوعات نديرها عنك.',
  },
  'landing.features.item4Title': {
    fr: '100% mobile-first',
    en: '100% mobile-first',
    ar: 'مصمم للهاتف بالكامل',
  },
  'landing.features.item4Desc': {
    fr: 'Tes clients commandent depuis WhatsApp, Instagram ou TikTok. Tout est optimisé mobile.',
    en: 'Your customers order from WhatsApp, Instagram or TikTok. Everything is mobile-optimized.',
    ar: 'يطلب عملاؤك من واتساب أو إنستغرام أو تيك توك. كل شيء محسّن للهاتف.',
  },
  'landing.features.item5Title': {
    fr: 'Arabe, Français, Darija',
    en: 'Arabic, French, Darija',
    ar: 'العربية والفرنسية والدارجة',
  },
  'landing.features.item5Desc': {
    fr: 'Interface bilingue, RTL natif, 16 pays préconfigurés (SN, MA, TN, DZ, CI, …).',
    en: 'Bilingual interface, native RTL, 16 pre-configured countries (SN, MA, TN, DZ, CI, …).',
    ar: 'واجهة ثنائية اللغة، دعم RTL أصلي، 16 دولة مُعدّة مسبقًا (السنغال، المغرب، تونس، الجزائر، ساحل العاج…).',
  },
  'landing.features.item6Title': {
    fr: 'Sécurité bancaire',
    en: 'Bank-grade security',
    ar: 'أمان بمستوى البنوك',
  },
  'landing.features.item6Desc': {
    fr: 'Webhook signés HMAC-SHA256, données chiffrées, conforme aux régulations locales.',
    en: 'HMAC-SHA256-signed webhooks, encrypted data, compliant with local regulations.',
    ar: 'خطافات ويب موقّعة HMAC-SHA256، بيانات مشفّرة، متوافقة مع اللوائح المحلية.',
  },

  // Flexio Pay
  'landing.pay.badge': { fr: 'Flexio Pay', en: 'Flexio Pay', ar: 'Flexio Pay' },
  'landing.pay.titleA': { fr: 'Encaisse en ligne.', en: 'Get paid online.', ar: 'اقبض عبر الإنترنت.' },
  'landing.pay.titleB': {
    fr: 'Partout en Afrique.',
    en: 'Everywhere in Africa.',
    ar: 'في كل أنحاء أفريقيا.',
  },
  'landing.pay.paragraph': {
    fr: 'Flexio Pay est la passerelle de paiement intégrée de FlexioPage : tes clients paient en mobile money ou par carte directement sur ta boutique et tes landing pages — sans compte marchand, sans intégration technique.',
    en: 'Flexio Pay is FlexioPage’s built-in payment gateway: your customers pay by mobile money or card directly on your store and landing pages — no merchant account, no technical integration.',
    ar: 'Flexio Pay هي بوابة الدفع المدمجة في FlexioPage: يدفع عملاؤك عبر المحفظة الإلكترونية أو البطاقة مباشرة من متجرك وصفحات الهبوط — بدون حساب تاجر، بدون تكامل تقني.',
  },
  'landing.pay.bullet1': {
    fr: 'Activation instantanée — aucun contrat bancaire, aucun code à écrire.',
    en: 'Instant activation — no bank contract, no code to write.',
    ar: 'تفعيل فوري — بدون عقد بنكي، بدون كتابة أي كود.',
  },
  'landing.pay.bullet2': {
    fr: 'Mobile money accepté dans 20+ pays africains (SN, CI, BJ, TG, CM, GH, NG…).',
    en: 'Mobile money accepted in 20+ African countries (SN, CI, BJ, TG, CM, GH, NG…).',
    ar: 'محافظ الهاتف مقبولة في أكثر من 20 دولة أفريقية (السنغال، ساحل العاج، بنين، توغو، الكاميرون، غانا، نيجيريا…).',
  },
  'landing.pay.bullet3': {
    fr: 'L’argent arrive sur ton solde vendeur — retrait vers ton mobile money.',
    en: 'Money lands on your seller balance — withdraw to your mobile money.',
    ar: 'تصل الأموال إلى رصيدك كبائع — يمكنك السحب إلى محفظة هاتفك.',
  },
  'landing.pay.bullet4': {
    fr: 'Paiements vérifiés côté serveur, webhooks signés — sécurité bancaire.',
    en: 'Server-verified payments, signed webhooks — bank-grade security.',
    ar: 'مدفوعات مُتحقّق منها على السيرفر، خطافات ويب موقّعة — أمان بمستوى البنوك.',
  },
  'landing.pay.cta': {
    fr: 'Commencer à encaisser',
    en: 'Start getting paid',
    ar: 'ابدأ بقبض المدفوعات',
  },
  'landing.pay.mockSubtitle': {
    fr: 'Paiement sécurisé',
    en: 'Secure payment',
    ar: 'دفع آمن',
  },
  'landing.pay.mockTotal': { fr: 'Total à payer', en: 'Amount to pay', ar: 'المبلغ الإجمالي' },
  'landing.pay.mockCta': { fr: 'Payer avec Wave', en: 'Pay with Wave', ar: 'ادفع عبر Wave' },
  'landing.pay.mockFooter': {
    fr: 'Transaction vérifiée par Flexio Pay',
    en: 'Transaction verified by Flexio Pay',
    ar: 'المعاملة مُتحقّق منها بواسطة Flexio Pay',
  },
  'landing.pay.methodCard': { fr: 'Carte bancaire', en: 'Bank card', ar: 'بطاقة بنكية' },

  // How it works
  'landing.how.badge': { fr: '3 étapes', en: '3 steps', ar: '3 خطوات' },
  'landing.how.title': {
    fr: 'De la création à la première vente.',
    en: 'From setup to your first sale.',
    ar: 'من إنشاء المتجر إلى أول عملية بيع.',
  },
  'landing.how.step1Title': {
    fr: 'Crée ta boutique en 5 minutes',
    en: 'Create your store in 5 minutes',
    ar: 'أنشئ متجرك في 5 دقائق',
  },
  'landing.how.step1Desc': {
    fr: 'Inscris-toi, choisis un thème, ajoute tes produits avec photos et SKU. Pas de configuration technique.',
    en: 'Sign up, pick a theme, add your products with photos and SKU. No technical setup.',
    ar: 'سجّل، اختر قالبًا، أضف منتجاتك مع الصور وأكواد SKU. لا يوجد أي إعداد تقني.',
  },
  'landing.how.step2Title': {
    fr: 'Génère une landing page avec l’IA',
    en: 'Generate a landing page with AI',
    ar: 'أنشئ صفحة هبوط بالذكاء الاصطناعي',
  },
  'landing.how.step2Desc': {
    fr: 'L’IA rédige le copywriting, génère les photos lifestyle et intègre le formulaire de commande.',
    en: 'AI writes the copy, generates lifestyle photos and embeds the order form.',
    ar: 'يكتب الذكاء الاصطناعي النصوص، ويولّد صور نمط الحياة، ويدمج نموذج الطلب.',
  },
  'landing.how.step3Title': {
    fr: 'Le client commande, tu encaisses',
    en: 'Customer orders, you get paid',
    ar: 'يطلب العميل، وأنت تستلم المال',
  },
  'landing.how.step3Desc': {
    fr: 'Commande à la livraison, MogaDelivery prend le relais, tu encaisses ton paiement. 30 premières livraisons gratuites, ensuite une petite commission seulement.',
    en: 'Cash on delivery, MogaDelivery takes over, you collect your payment. First 30 deliveries free, then only a small commission.',
    ar: 'الدفع عند الاستلام، تتولى MogaDelivery العملية، وتستلم أنت مبلغك. أول 30 عملية توصيل مجانية، ثم عمولة صغيرة فقط.',
  },

  // Commission panel
  'landing.commission.badge': {
    fr: 'Tarification équitable',
    en: 'Fair pricing',
    ar: 'تسعير عادل',
  },
  'landing.commission.titleA': { fr: 'Tes', en: 'Your', ar: 'أول' },
  'landing.commission.titleHighlight': {
    fr: '30 premières commandes',
    en: 'first 30 orders',
    ar: '30 طلبًا لك',
  },
  'landing.commission.titleB': {
    fr: 'sont gratuites.',
    en: 'are free.',
    ar: 'مجانية بالكامل.',
  },
  'landing.commission.paragraphStart': {
    fr: "Pas d'abonnement, pas de carte bancaire à la création, pas de frais cachés. Tu lances ta boutique et tu vends sans payer un centime — une petite commission ne s'applique qu'à partir de la",
    en: 'No subscription, no credit card to create your store, no hidden fees. You launch and sell without paying a cent — a small commission only applies starting from the',
    ar: 'بدون اشتراك، بدون بطاقة بنكية عند الإنشاء، بدون أي رسوم خفية. تُطلق متجرك وتبيع دون أن تدفع سنتًا واحدًا — تُطبَّق عمولة صغيرة فقط بدءًا من',
  },
  'landing.commission.paragraphStrong': {
    fr: '31e commande livrée',
    en: '31st delivered order',
    ar: 'الطلب رقم 31 المُسلَّم',
  },
  'landing.commission.badge30Main': {
    fr: 'premières commandes livrées',
    en: 'first delivered orders',
    ar: 'أول طلبات مُسلَّمة',
  },
  'landing.commission.badge30Sub': {
    fr: '100% gratuites · sans frais cachés',
    en: '100% free · no hidden fees',
    ar: 'مجانية 100% · بدون رسوم خفية',
  },
  'landing.commission.cta': {
    fr: 'Créer ma boutique',
    en: 'Create my store',
    ar: 'أنشئ متجري',
  },
  'landing.commission.includedTitle': {
    fr: 'Inclus pour 0 €',
    en: 'Included for €0',
    ar: 'مشمول بدون تكلفة',
  },
  'landing.commission.perk1': {
    fr: 'Boutique illimitée',
    en: 'Unlimited store',
    ar: 'متجر غير محدود',
  },
  'landing.commission.perk2': {
    fr: 'Landing pages illimitées',
    en: 'Unlimited landing pages',
    ar: 'صفحات هبوط غير محدودة',
  },
  'landing.commission.perk3': {
    fr: 'Génération IA des landings',
    en: 'AI landing generation',
    ar: 'توليد صفحات الهبوط بالذكاء الاصطناعي',
  },
  'landing.commission.perk4': {
    fr: 'Commandes illimitées',
    en: 'Unlimited orders',
    ar: 'طلبات غير محدودة',
  },
  'landing.commission.perk5': {
    fr: 'Dispatch MogaDelivery inclus',
    en: 'MogaDelivery dispatch included',
    ar: 'توزيع MogaDelivery مشمول',
  },
  'landing.commission.perk6': {
    fr: 'Support FR / AR',
    en: 'FR / AR support',
    ar: 'دعم فرنسي / عربي',
  },

  // FAQ
  'landing.faq.title': {
    fr: 'Les questions qu’on nous pose le plus.',
    en: 'The questions we get most often.',
    ar: 'أكثر الأسئلة التي تُطرح علينا.',
  },
  'landing.faq.q1': {
    fr: 'Comment fonctionne le solde ?',
    en: 'How does the balance work?',
    ar: 'كيف يعمل الرصيد؟',
  },
  'landing.faq.a1': {
    fr: 'Tes 30 premières commandes livrées sont 100% gratuites — aucun frais ne sort de ton solde. À partir de la 31e commande, une petite commission s’applique sur chaque livraison confirmée par le transporteur. Tu recharges ton solde via Wave, Orange Money, MTN MoMo ou virement quand tu veux.',
    en: 'Your first 30 delivered orders are 100% free — no fee is charged from your balance. Starting with the 31st order, a small commission applies to each delivery confirmed by the courier. You top up your balance via Wave, Orange Money, MTN MoMo or bank transfer whenever you want.',
    ar: 'أول 30 طلبًا مُسلَّمًا لك مجانية 100% — لا تُخصم أي رسوم من رصيدك. ابتداءً من الطلب 31، تُطبَّق عمولة صغيرة على كل عملية تسليم يؤكّدها الناقل. يمكنك شحن رصيدك عبر Wave أو Orange Money أو MTN MoMo أو التحويل البنكي متى شئت.',
  },
  'landing.faq.q2': {
    fr: 'Que se passe-t-il si une commande n’est pas livrée ?',
    en: 'What happens if an order is not delivered?',
    ar: 'ماذا يحدث إذا لم يتم تسليم الطلب؟',
  },
  'landing.faq.a2': {
    fr: 'Aucun frais. La commission ne s’applique qu’aux commandes livrées ET payées (transporteur confirme la collecte). Annulation, retour, refus → 0 frais. Les 30 premières livraisons restent gratuites de toute façon.',
    en: 'No fee. The commission only applies to orders that are delivered AND paid (the courier confirms collection). Cancellation, return, refusal → 0 fees. The first 30 deliveries stay free anyway.',
    ar: 'لا رسوم إطلاقًا. تُطبَّق العمولة فقط على الطلبات المُسلَّمة والمدفوعة (يؤكّد الناقل استلام المبلغ). الإلغاء والإرجاع والرفض ← 0 رسوم. أول 30 عملية تسليم مجانية في جميع الأحوال.',
  },
  'landing.faq.q3': {
    fr: 'Dans quels pays vous opérez ?',
    en: 'Which countries do you operate in?',
    ar: 'في أي دول تعملون؟',
  },
  'landing.faq.a3': {
    fr: '16 pays : Sénégal, Côte d’Ivoire, Mali, Burkina Faso, Bénin, Togo, Guinée, Niger, Gambie, Ghana, Nigeria, Cameroun, Maroc, Tunisie, Algérie, Libye.',
    en: '16 countries: Senegal, Ivory Coast, Mali, Burkina Faso, Benin, Togo, Guinea, Niger, Gambia, Ghana, Nigeria, Cameroon, Morocco, Tunisia, Algeria, Libya.',
    ar: '16 دولة: السنغال، ساحل العاج، مالي، بوركينا فاسو، بنين، توغو، غينيا، النيجر، غامبيا، غانا، نيجيريا، الكاميرون، المغرب، تونس، الجزائر، ليبيا.',
  },
  'landing.faq.q4': {
    fr: 'Puis-je vendre des produits digitaux ?',
    en: 'Can I sell digital products?',
    ar: 'هل يمكنني بيع منتجات رقمية؟',
  },
  'landing.faq.a4': {
    fr: 'Oui. Pour les produits digitaux le client paie en ligne (Wave, Orange Money, carte) et reçoit son fichier instantanément. Les 30 premières ventes sont gratuites comme pour les produits physiques.',
    en: 'Yes. For digital products the customer pays online (Wave, Orange Money, card) and receives the file instantly. The first 30 sales are free, just like for physical products.',
    ar: 'نعم. بالنسبة للمنتجات الرقمية، يدفع العميل عبر الإنترنت (Wave، Orange Money، بطاقة) ويستلم ملفه فوريًا. أول 30 عملية بيع مجانية كما هو الحال مع المنتجات المادية.',
  },

  // Final CTA
  'landing.finalCta.title': { fr: 'Prêt à vendre ?', en: 'Ready to sell?', ar: 'مستعد للبيع؟' },
  'landing.finalCta.subtitle': {
    fr: 'Crée ta boutique en moins de 5 minutes. Aucune carte bancaire, aucun engagement.',
    en: 'Create your store in under 5 minutes. No credit card, no commitment.',
    ar: 'أنشئ متجرك في أقل من 5 دقائق. بدون بطاقة بنكية، بدون التزام.',
  },
  'landing.finalCta.ctaPrimary': {
    fr: 'Démarrer gratuitement',
    en: 'Start for free',
    ar: 'ابدأ مجانًا',
  },
  'landing.finalCta.ctaSecondary': {
    fr: 'J’ai déjà un compte',
    en: 'I already have an account',
    ar: 'لديّ حساب بالفعل',
  },

  // Footer
  'landing.footer.tagline': {
    fr: 'La plateforme tout-en-un pour vendre, livrer et encaisser en Afrique.',
    en: 'The all-in-one platform to sell, deliver and get paid in Africa.',
    ar: 'المنصّة الشاملة للبيع والتوصيل واستلام المدفوعات في أفريقيا.',
  },
  'landing.footer.product': { fr: 'Produit', en: 'Product', ar: 'المنتج' },
  'landing.footer.support': { fr: 'Support', en: 'Support', ar: 'الدعم' },
  'landing.footer.legal': { fr: 'Légal', en: 'Legal', ar: 'قانوني' },
  'landing.footer.howLink': {
    fr: 'Comment ça marche',
    en: 'How it works',
    ar: 'كيف يعمل',
  },
  'landing.footer.pricingLink': { fr: 'Tarif', en: 'Pricing', ar: 'التسعير' },
  'landing.footer.contact': { fr: 'Nous contacter', en: 'Contact us', ar: 'اتصل بنا' },
  'landing.footer.terms': { fr: 'Conditions', en: 'Terms', ar: 'الشروط' },
  'landing.footer.privacy': { fr: 'Confidentialité', en: 'Privacy', ar: 'الخصوصية' },
  'landing.footer.dataDeletion': {
    fr: 'Suppression données',
    en: 'Data deletion',
    ar: 'حذف البيانات',
  },
  'landing.footer.rights': {
    fr: 'Tous droits réservés.',
    en: 'All rights reserved.',
    ar: 'جميع الحقوق محفوظة.',
  },
  'landing.footer.slogan': {
    fr: 'vendre · livrer · encaisser',
    en: 'sell · deliver · get paid',
    ar: 'بيع · توصيل · قبض',
  },
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
