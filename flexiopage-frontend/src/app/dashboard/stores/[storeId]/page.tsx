'use client';

/**
 * Store edit page — split-view editor (refonte 2026-06-19).
 *
 * Layout :
 *   ┌──────────────┬──────────────────────┬─────────────────────┐
 *   │ Block list   │  Form du bloc actif  │  Preview iframe     │
 *   │ (LEFT)       │  (CENTER)            │  + page switcher    │
 *   │              │                      │  (RIGHT)            │
 *   └──────────────┴──────────────────────┴─────────────────────┘
 *
 * Les blocs SIMPLES (identité, bandeau, hero, WhatsApp, COD basique, etc.)
 * sont éditables inline dans le panneau central — modif locale + bouton
 * « Enregistrer » qui batche un PATCH /api/stores/:id.
 *
 * Les blocs LOURDS (sections complètes, marketing pixels, pages info,
 * collections, coupons, livraison) gardent leurs sous-pages dédiées : le
 * panneau central propose un raccourci « Ouvrir l'éditeur dédié → ». Ça
 * évite la duplication de 2000+ lignes d'éditeurs spécialisés.
 *
 * Le panneau preview affiche la storefront en iframe. Le dropdown « page »
 * permet au vendeur de basculer entre Accueil / Produit / Panier /
 * Checkout / Collection / Wishlist / Info sans quitter l'éditeur.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  ExternalLink,
  Eye,
  ImageIcon,
  Layers,
  Loader2,
  MessageCircle,
  Monitor,
  Package,
  Palette,
  RotateCw,
  ShoppingCart,
  Smartphone,
  Tablet,
  TrendingUp,
  Truck,
  Wallet,
  FileText,
  BadgePercent,
  Mail,
  Sparkles,
  Megaphone,
  PanelTop,
  PanelBottom,
  GalleryHorizontal,
  Settings as SettingsIcon,
  Quote,
  Tag,
  Save,
  GripVertical,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Zap,
  Power,
  ShieldAlert,
  Code2,
  Trash2,
  Search,
  Download,
  Plus,
  X,
  EyeOff,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, extractApiError } from '@/lib/api';
import { cn, publicStoreUrl } from '@/lib/utils';
import type {
  StoreType,
  StorefrontSettings,
  WhatsappSettings,
  CodFormSettings,
  AnnouncementBarSettings,
  SliderSettings,
  SlideItem,
  TestimonialsSettings,
  TestimonialItem,
  NavbarSettings,
  NavMenuLink,
  BrandDisplay,
  LogoSize,
  DeliveryIntegration,
  MarketingIntegration,
  VideoSettings,
  FAQSettings,
  FAQItemSettings,
  RichTextSettings,
} from '@/components/dashboard/store-editor';
import { FieldToggle, FooterEditor } from '@/components/dashboard/store-editor';
import { useConfirm, usePrompt } from '@/components/ui/confirm-dialog';
import { renderMarkdown } from '@/lib/markdown';
import type { NewsletterSettings, Subscriber, SubscriberCounts } from '@/types/newsletter';
import type { Coupon } from '@/types/coupon';
import {
  SETTINGS_COUNTRIES,
  SETTINGS_CURRENCIES,
  SETTINGS_LANGUAGES,
  directionOf,
} from '@/components/dashboard/store-editor';
import { ThemePaletteEditor } from '@/components/dashboard/theme-palette-editor';
import { ThemeFontEditor } from '@/components/dashboard/theme-font-editor';
import { ThemePreviewGrid } from '@/components/dashboard/theme-preview-card';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { imageSizes } from '@/lib/image-recommendations';
import {
  DEFAULT_SECTION_ORDER,
  resolveSectionOrder,
  type MovableSectionId,
} from '@/lib/section-order';
import {
  DEFAULT_PRODUCT_PAGE_ORDER,
  resolveProductPageOrder,
  type ProductPageSectionId,
  type ProductPageSettings,
} from '@/lib/product-page-order';
import {
  STORE_THEME_TEMPLATES,
  themesForStoreType,
  withLayoutFallback,
  type StoreThemeTemplate,
  type ThemeTokens,
} from '@/data/store-themes';

// ─────────────────────────────────────────────────────────────────────
// Block catalog — what shows up in the left panel
// ─────────────────────────────────────────────────────────────────────

/** Action possible dans le panneau central pour un bloc donné. */
type BlockMode = 'inline' | 'link';

interface BlockDef {
  id: string;
  label: string;
  icon: typeof SettingsIcon;
  group: 'identity' | 'header' | 'home' | 'conversion' | 'footer' | 'advanced';
  /** `inline` = formulaire dans le centre ; `link` = bouton ouvrant la sous-page. */
  mode: BlockMode;
  /** Pour `mode='link'` : segment relatif après /dashboard/stores/[storeId]/ */
  href?: string;
  /** Texte court affiché en sous-titre dans la liste. */
  hint: string;
  /** Caché sur les stores digital quand vrai. */
  physicalOnly?: boolean;
}

const BLOCKS: BlockDef[] = [
  // Identité
  { id: 'identity',  label: 'Identité',     icon: SettingsIcon, group: 'identity', mode: 'inline', hint: 'Nom, description, statut.' },
  { id: 'theme',     label: 'Thème',        icon: Palette,      group: 'identity', mode: 'inline', hint: 'Palette + structure visuelle.' },
  { id: 'branding',  label: 'Logo & favicon', icon: ImageIcon,  group: 'identity', mode: 'inline', hint: 'L\'image qui te représente.' },
  // Header
  { id: 'announce',  label: 'Bandeau annonce', icon: Megaphone, group: 'header', mode: 'inline', hint: 'Petits messages au-dessus du header.' },
  { id: 'navbar',    label: 'Navbar',       icon: PanelTop,     group: 'header', mode: 'inline', hint: 'Menu, logo, recherche.' },
  // Accueil
  { id: 'hero',      label: 'Hero',         icon: GalleryHorizontal, group: 'home', mode: 'inline', hint: 'Titre, sous-titre, image principale.' },
  { id: 'slider',    label: 'Slider',       icon: GalleryHorizontal, group: 'home', mode: 'inline', hint: 'Carousel auto-play avec images.' },
  { id: 'products',  label: 'Grille produits', icon: Package,   group: 'home', mode: 'inline', hint: 'Affichage de la grille sur l\'accueil.' },
  { id: 'testimonials', label: 'Témoignages', icon: Quote,      group: 'home', mode: 'inline', hint: 'Avis clients avec avatar et note.' },
  { id: 'video',     label: 'Vidéo',         icon: GalleryHorizontal, group: 'home', mode: 'inline', hint: 'YouTube, Vimeo ou mp4 avec paragraphe.' },
  { id: 'faq',       label: 'FAQ',           icon: MessageCircle, group: 'home', mode: 'inline', hint: 'Questions fréquentes en accordéon.' },
  { id: 'rich-text', label: 'Texte libre',   icon: FileText,      group: 'home', mode: 'inline', hint: 'Bloc markdown : histoire de marque, SEO.' },
  { id: 'section-order', label: 'Ordre des sections', icon: Layers, group: 'home', mode: 'inline', hint: 'Glisser hero/slider/produits/témoignages/vidéo/FAQ/texte.' },
  // Conversion
  { id: 'cod',       label: 'Formulaire COD', icon: Wallet,     group: 'conversion', mode: 'inline', hint: 'Champs du paiement à la livraison.', physicalOnly: true },
  { id: 'whatsapp',  label: 'Bouton WhatsApp', icon: MessageCircle, group: 'conversion', mode: 'inline', hint: 'Bulle flottante à droite.' },
  { id: 'product-page', label: 'Page produit', icon: Tag,       group: 'conversion', mode: 'inline', hint: 'Toggles + ordre des sections produit.' },
  // Footer
  { id: 'footer',    label: 'Footer',       icon: PanelBottom,  group: 'footer', mode: 'inline', hint: 'Contact, colonnes, signature.' },
  { id: 'info-pages', label: 'Pages d\'information', icon: FileText, group: 'footer', mode: 'inline', hint: 'CGV, FAQ, Contact, Confidentialité.' },
  // Avancé
  { id: 'collections', label: 'Collections', icon: Layers,      group: 'advanced', mode: 'inline', hint: 'Regroupements de produits.' },
  { id: 'coupons',   label: 'Codes promo',  icon: BadgePercent, group: 'advanced', mode: 'inline', hint: 'Réductions saisies au checkout.' },
  { id: 'marketing', label: 'Marketing & pixels', icon: TrendingUp, group: 'advanced', mode: 'inline', hint: 'Meta, TikTok, Snap, GA4.' },
  { id: 'newsletter', label: 'Newsletter & popup', icon: Mail,   group: 'advanced', mode: 'inline', hint: 'Popup welcome, liste emails.' },
  { id: 'delivery',  label: 'Livraison',     icon: Truck,        group: 'advanced', mode: 'inline', hint: 'MogaDelivery, adresse expéditeur.', physicalOnly: true },
  { id: 'abandoned', label: 'Paniers abandonnés', icon: ShoppingCart, group: 'advanced', mode: 'inline', hint: 'Relances WhatsApp.', physicalOnly: true },
  { id: 'apps',      label: 'Apps & intégrations', icon: Sparkles, group: 'advanced', mode: 'inline', hint: 'Vue d\'ensemble des modules.' },
];

const GROUP_LABELS: Record<BlockDef['group'], string> = {
  identity: 'Identité',
  header: 'Header',
  home: 'Page d\'accueil',
  conversion: 'Conversion',
  footer: 'Footer & pages',
  advanced: 'Avancé',
};

// ─────────────────────────────────────────────────────────────────────
// Preview page switcher
// ─────────────────────────────────────────────────────────────────────

/** Pages storefront affichables dans l'aperçu (clé interne + URL builder). */
interface PreviewPageDef {
  id: string;
  label: string;
  icon: typeof SettingsIcon;
  /** Construit l'URL relative à partir du store + des slugs sample. */
  buildPath: (ctx: { slug: string; productSlug?: string; collectionSlug?: string; infoSlug?: string; orderId?: string }) => string | null;
}

const PREVIEW_PAGES: PreviewPageDef[] = [
  { id: 'home',     label: 'Accueil',    icon: ImageIcon,   buildPath: ({ slug }) => `/${slug}` },
  { id: 'product',  label: 'Produit',    icon: Package,     buildPath: ({ slug, productSlug }) => productSlug ? `/${slug}/product/${productSlug}` : null },
  { id: 'cart',     label: 'Panier',     icon: ShoppingCart, buildPath: ({ slug }) => `/${slug}/cart` },
  { id: 'checkout', label: 'Checkout',   icon: Wallet,      buildPath: ({ slug }) => `/${slug}/cart/checkout` },
  { id: 'thanks',   label: 'Merci',      icon: CheckCircle2, buildPath: ({ orderId }) => orderId ? `/thanks/cod/${orderId}` : null },
  { id: 'collection', label: 'Collection', icon: Layers,    buildPath: ({ slug, collectionSlug }) => collectionSlug ? `/${slug}/c/${collectionSlug}` : null },
  { id: 'wishlist', label: 'Wishlist',   icon: Quote,       buildPath: ({ slug }) => `/${slug}/wishlist` },
  { id: 'info',     label: 'Page info',  icon: FileText,    buildPath: ({ slug, infoSlug }) => infoSlug ? `/${slug}/p/${infoSlug}` : null },
];

// ─────────────────────────────────────────────────────────────────────
// Local edit state — dirty tracker (jeu de clés top-level modifiées)
// ─────────────────────────────────────────────────────────────────────

/**
 * On track UNIQUEMENT quels champs top-level du Store ont été touchés.
 * Au save on relit la valeur courante depuis le snapshot local `store`,
 * qui contient déjà le merge complet (on évite le `$set: settings: {...}`
 * partiel qui écraserait les autres clés de settings côté backend).
 */
type DirtyKey = 'name' | 'description' | 'logo' | 'favicon' | 'isPublished' | 'theme' | 'settings' | 'customDomain' | 'integrations';

interface PatchState {
  /** Clés top-level dirty. */
  keys: Set<DirtyKey>;
  /** Sous-blocs précis touchés dans `settings`, juste pour le marqueur
   *  visuel à côté des blocs de la liste gauche. */
  settingsPaths: Set<string>;
}

const emptyPatch: PatchState = { keys: new Set(), settingsPaths: new Set() };

export default function StoreEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = params.storeId as string;

  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  // Le block actif peut être deep-linké via ?block=xxx (utilisé par les
  // redirects 301 des anciennes sous-pages et les CTAs externes). On lit
  // le param une seule fois à l'init pour ne pas re-forcer le block si le
  // vendeur clique ensuite un autre item dans le menu.
  const [activeBlock, setActiveBlock] = useState<string | null>(() => {
    const q = searchParams?.get('block');
    return q && q.trim() ? q : 'hero';
  });
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [visualEditMode, setVisualEditMode] = useState(true);

  // Dirty tracker — quels top-level keys ont changé localement.
  // On envoie au save la VALEUR COURANTE depuis `store` (déjà mergée).
  const [patch, setPatch] = useState<PatchState>(emptyPatch);
  const dirty = patch.keys.size > 0;

  // Sample slugs pour le page-switcher (chargés une fois)
  const [firstProductSlug, setFirstProductSlug] = useState<string | null>(null);
  const [firstCollectionSlug, setFirstCollectionSlug] = useState<string | null>(null);
  const [firstInfoSlug, setFirstInfoSlug] = useState<string | null>(null);
  const [firstOrderId, setFirstOrderId] = useState<string | null>(null);

  // Preview state
  const [previewPage, setPreviewPage] = useState<string>('home');
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [previewBust, setPreviewBust] = useState(0);

  // Fetch store + sample slugs
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    Promise.all([
      storesApi.get(storeId).catch(() => null),
      storesApi.listProducts(storeId, { published: 'true', limit: 1 }).catch(() => null),
      storesApi.listCollections?.(storeId).catch(() => null) ?? null,
      storesApi.listPages(storeId, { kind: 'info' }).catch(() => null),
      // On charge le dernier order pour permettre au preview « Merci » de
      // pointer sur un vrai orderId. Si aucun n'existe, l'entrée reste
      // disabled dans le switcher.
      storesApi.listOrders(storeId, { limit: 1 }).catch(() => null),
    ]).then(([sRes, pRes, cRes, iRes, oRes]) => {
      if (cancelled) return;
      const s = (sRes?.data as { store?: StoreType } | undefined)?.store || null;
      setStore(s);
      const products = (pRes?.data as { products?: Array<{ slug?: string }> } | undefined)?.products || [];
      setFirstProductSlug(products[0]?.slug || null);
      const collections = (cRes?.data as { collections?: Array<{ slug?: string }> } | undefined)?.collections || [];
      setFirstCollectionSlug(collections[0]?.slug || null);
      const pages = (iRes?.data as { pages?: Array<{ slug?: string }> } | undefined)?.pages || [];
      setFirstInfoSlug(pages[0]?.slug || null);
      const orders = (oRes?.data as { orders?: Array<{ _id?: string }> } | undefined)?.orders || [];
      setFirstOrderId(orders[0]?._id || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [storeId]);

  // Sans auto-save, le vendeur peut perdre ses modifs en fermant l'onglet
  // ou en cliquant un lien sans avoir cliqué Enregistrer. Le `beforeunload`
  // déclenche le pop-up natif du navigateur (« Quitter le site ? Vos
  // modifications ne seront peut-être pas enregistrées »).
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // La spec moderne ignore returnValue mais on le set pour les vieux
      // navigateurs qui en ont besoin pour déclencher le prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Manual save only
  async function handleSave() {
    if (!store || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    const payload: Record<string, unknown> = {};
    for (const k of Array.from(patch.keys)) {
      switch (k) {
        case 'name':        payload.name        = store.name; break;
        case 'description': payload.description = store.description; break;
        case 'logo':        payload.logo        = store.logo; break;
        case 'favicon':     payload.favicon     = store.favicon; break;
        case 'isPublished': payload.isPublished = !!store.isPublished; break;
        case 'theme':       payload.theme       = store.theme; break;
        case 'settings':    payload.settings    = store.settings; break;
        case 'customDomain': payload.customDomain = store.customDomain || undefined; break;
        case 'integrations': payload.integrations = store.integrations; break;
      }
    }
    try {
      await storesApi.update(storeId, payload);
      setPatch(emptyPatch);
      setPreviewBust((n) => n + 1);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setSaveError(e.response?.data?.error || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  /** Marque une clé top-level comme modifiée. Si la clé est `settings`,
   *  on accepte un sous-chemin (ex: 'whatsapp') pour le marqueur visuel
   *  à côté du bloc concerné dans la liste gauche. */
  function markDirty(key: DirtyKey, settingsSubPath?: string) {
    setPatch((prev) => {
      const keys = new Set(prev.keys);
      keys.add(key);
      const settingsPaths = new Set(prev.settingsPaths);
      if (key === 'settings' && settingsSubPath) settingsPaths.add(settingsSubPath);
      return { keys, settingsPaths };
    });
  }

  function selectTheme(tpl: StoreThemeTemplate) {
    setStore((s) => (s ? ({ ...s, theme: tpl.theme as unknown as Record<string, unknown> }) : s));
    markDirty('theme');
    setThemePickerOpen(false);
  }

  if (loading || !store) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isDigital = store.storeType === 'digital';
  const visibleBlocks = BLOCKS.filter((b) => !(b.physicalOnly && isDigital));
  const currentBlock = visibleBlocks.find((b) => b.id === activeBlock) || null;
  const savedTheme = store.theme as Partial<ThemeTokens> | undefined;
  const currentThemeId = savedTheme?.templateId;
  const currentThemeName = currentThemeId
    ? STORE_THEME_TEMPLATES.find((t) => t.id === currentThemeId)?.name
    : 'Personnalisé';

  const previewCtx = {
    slug: store.slug,
    productSlug: firstProductSlug || undefined,
    collectionSlug: firstCollectionSlug || undefined,
    infoSlug: firstInfoSlug || undefined,
    orderId: firstOrderId || undefined,
  };
  const previewDef = PREVIEW_PAGES.find((p) => p.id === previewPage) || PREVIEW_PAGES[0];
  const previewPath = previewDef.buildPath(previewCtx);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-64px)] flex-col bg-muted/30 sm:-mx-6 lg:-mx-8">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/stores')} className="-ml-2 shrink-0 gap-1.5 px-2 sm:px-3">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Boutiques</span>
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            {isDigital ? <Cloud className="h-4 w-4 shrink-0 text-fuchsia-500" /> : <Package className="h-4 w-4 shrink-0 text-indigo-500" />}
            <h1 className="truncate text-base font-semibold tracking-tight">{store.name}</h1>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                store.isPublished ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700',
              )}
            >
              {store.isPublished ? 'Publiée' : 'Brouillon'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Indicateur « modifications non enregistrées » — pulse ambre
              tant que le vendeur n'a pas cliqué sur « Enregistrer ». */}
          {dirty && !saving && (
            <span
              className="hidden items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 sm:inline-flex"
              title="Tu as des modifications non enregistrées."
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              Non enregistré
            </span>
          )}
          <Link href={publicStoreUrl(store)} target="_blank" rel="noopener">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg px-2 sm:px-3">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Voir la boutique</span>
            </Button>
          </Link>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              'h-9 gap-1.5 rounded-lg gradient-brand text-white shadow-md shadow-primary/25 hover:opacity-95',
              !dirty && 'opacity-60',
            )}
            title={dirty ? 'Clique pour enregistrer tes modifications.' : 'Aucune modification à enregistrer.'}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFlash ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              {saving ? 'Enregistrement…' : savedFlash ? 'Enregistré' : dirty ? `Enregistrer (${patch.keys.size})` : 'Enregistré'}
            </span>
            <span className="sm:hidden">
              {saving ? '…' : savedFlash ? 'OK' : dirty ? patch.keys.size : 'OK'}
            </span>
          </Button>
        </div>
      </header>

      {/* Save feedback banner */}
      {savedFlash && (
        <div className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700 flex items-center gap-2 sm:px-6">
          <Check className="h-3.5 w-3.5" />
          ✓ Modifications enregistrées
        </div>
      )}

      {/* Save error banner */}
      {saveError && (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive sm:px-6">
          {saveError}
        </div>
      )}

      {/* ── Body (WYSIWYG Visual Editor) ──────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT/CENTER — Visual block grid (all blocks as clickable cards) */}
        <div className="min-w-0 flex-1 flex-col overflow-y-auto border-r border-border/60 bg-muted/20 lg:flex">
          <div className="container max-w-5xl px-4 py-8 sm:px-6">
            <div className="space-y-6">
              {/* Section title */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Modifier votre boutique</h2>
                <p className="text-sm text-muted-foreground">Clique sur n'importe quel bloc pour le modifier. Les changements s'affichent en temps réel sur la droite.</p>
              </div>

              {/* Visual blocks grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleBlocks.map((block) => {
                  const isActive = activeBlock === block.id;
                  const isDirty = patch.keys.has('name') || patch.keys.has('description') ||
                                 (block.id === 'identity' && (patch.keys.has('name') || patch.keys.has('description'))) ||
                                 patch.settingsPaths.has(block.id);
                  const BlockIcon = block.icon;

                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() => setActiveBlock(block.id)}
                      className={cn(
                        'group relative flex flex-col gap-3 rounded-2xl border-2 p-4 text-left transition-all',
                        isActive
                          ? 'border-primary bg-primary/5 shadow-lg'
                          : 'border-border/60 bg-card hover:border-primary/50 hover:shadow-md',
                      )}
                    >
                      {/* Icon */}
                      <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
                      )}>
                        <BlockIcon className="h-5 w-5" />
                      </div>

                      {/* Label + hint */}
                      <div className="flex-1">
                        <div className="font-semibold leading-tight">{block.label}</div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{block.hint}</p>
                      </div>

                      {/* Dirty indicator */}
                      {isDirty && (
                        <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500" title="Modifié" />
                      )}

                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute inset-0 rounded-2xl ring-2 ring-primary pointer-events-none" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Editor panel (shows selected block options) */}
        <main
          className={cn(
            'w-96 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-card/40 lg:flex',
            'hidden lg:flex',
          )}
        >
          {currentBlock ? (
            <BlockEditor
              block={currentBlock}
              storeId={storeId}
              store={store}
              setStore={setStore}
              markDirty={markDirty}
              openThemePicker={() => setThemePickerOpen(true)}
              currentThemeName={currentThemeName || 'Par défaut'}
              setActiveBlock={setActiveBlock}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div className="max-w-sm space-y-2 text-muted-foreground">
                <Sparkles className="mx-auto h-8 w-8 opacity-40" />
                <p className="text-sm">Sélectionne un bloc pour commencer.</p>
              </div>
            </div>
          )}
        </main>

        {/* FAR RIGHT — live preview */}
        <PreviewPane
          previewPages={PREVIEW_PAGES}
          previewPage={previewPage}
          setPreviewPage={setPreviewPage}
          previewDevice={previewDevice}
          setPreviewDevice={setPreviewDevice}
          previewBust={previewBust}
          onReload={() => setPreviewBust((n) => n + 1)}
          mobileVisible={true}
          path={previewPath}
        />
      </div>

      {/* Theme picker modal */}
      {themePickerOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3 sm:p-6"
          onClick={() => setThemePickerOpen(false)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
              <div>
                <h2 className="text-base font-semibold">Choisir un thème</h2>
                <p className="text-xs text-muted-foreground">Le thème sélectionné est mis en attente — clique « Enregistrer » pour l&apos;appliquer.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setThemePickerOpen(false)}>
                Fermer
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <ThemePreviewGrid
                templates={themesForStoreType(isDigital ? 'digital' : 'physical')}
                selectedId={currentThemeId}
                onSelect={selectTheme}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LEFT — BlockList component
// ─────────────────────────────────────────────────────────────────────

function BlockList({
  blocks,
  activeId,
  onPick,
  dirtyTopKeys,
  dirtySettingsPaths,
  hiddenOnMobile,
}: {
  blocks: BlockDef[];
  activeId: string | null;
  onPick: (id: string) => void;
  dirtyTopKeys: Set<DirtyKey>;
  dirtySettingsPaths: Set<string>;
  /** Si vrai, masqué sur < lg (l'utilisateur a switché vers
   *  l'éditeur ou la preview via la barre d'onglets mobile). */
  hiddenOnMobile: boolean;
}) {
  // Mapping clé → bloc concerné pour le petit dot « modifié ».
  const dirtyBlocks = useMemo(() => {
    const set = new Set<string>();
    if (dirtyTopKeys.has('name') || dirtyTopKeys.has('description') || dirtyTopKeys.has('isPublished')) set.add('identity');
    if (dirtyTopKeys.has('theme')) set.add('theme');
    if (dirtyTopKeys.has('logo') || dirtyTopKeys.has('favicon')) set.add('branding');
    for (const p of Array.from(dirtySettingsPaths)) {
      if (p === 'announcementBar') set.add('announce');
      else if (p === 'navbar')       set.add('navbar');
      else if (p === 'hero')         set.add('hero');
      else if (p === 'slider')       set.add('slider');
      else if (p === 'products')     set.add('products');
      else if (p === 'testimonials') set.add('testimonials');
      else if (p === 'sectionOrder') set.add('section-order');
      else if (p === 'whatsapp')     set.add('whatsapp');
      else if (p === 'codForm')      set.add('cod');
      else if (p === 'productPage')  set.add('product-page');
    }
    return set;
  }, [dirtyTopKeys, dirtySettingsPaths]);

  const groups: Array<BlockDef['group']> = ['identity', 'header', 'home', 'conversion', 'footer', 'advanced'];

  return (
    <aside
      className={cn(
        // En desktop large : toujours visible à 288px (w-72).
        // En tablette/mobile : prend toute la largeur si actif via les
        // onglets, sinon masqué. La position est en flow normal — pas
        // d'overlay — pour rester lisible avec un long scroll.
        'shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-card/60 lg:flex lg:w-72',
        hiddenOnMobile ? 'hidden' : 'flex w-full',
      )}
    >
      <div className="flex-1 px-3 py-4">
        {groups.map((g) => {
          const items = blocks.filter((b) => b.group === g);
          if (items.length === 0) return null;
          return (
            <div key={g} className="mb-5 last:mb-0">
              <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {GROUP_LABELS[g]}
              </div>
              <div className="space-y-0.5">
                {items.map((b) => {
                  const Icon = b.icon;
                  const active = activeId === b.id;
                  const dirty = dirtyBlocks.has(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onPick(b.id)}
                      className={cn(
                        'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.label}</span>
                      {dirty && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Modifications non enregistrées" />
                      )}
                      {b.mode === 'link' ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CENTER — BlockEditor router
// ─────────────────────────────────────────────────────────────────────

interface EditorCtx {
  block: BlockDef;
  storeId: string;
  store: StoreType;
  setStore: React.Dispatch<React.SetStateAction<StoreType | null>>;
  markDirty: (key: DirtyKey, settingsSubPath?: string) => void;
  openThemePicker: () => void;
  currentThemeName: string;
  /** Permet à un éditeur (ex: Apps dashboard) de basculer l'utilisateur
   *  sur un autre block du hub sans passer par un lien externe. */
  setActiveBlock: (id: string) => void;
}

function BlockEditor(ctx: EditorCtx) {
  const { block } = ctx;

  // Editor inline — dispatch selon le bloc.
  switch (block.id) {
    case 'identity':  return <IdentityEditor {...ctx} />;
    case 'theme':     return <ThemeEditor {...ctx} />;
    case 'branding':  return <BrandingEditor {...ctx} />;
    case 'announce':  return <AnnounceEditor {...ctx} />;
    case 'hero':      return <HeroEditor {...ctx} />;
    case 'slider':    return <SliderEditor {...ctx} />;
    case 'products':  return <ProductsGridEditor {...ctx} />;
    case 'testimonials': return <TestimonialsEditor {...ctx} />;
    case 'video':     return <VideoInlineEditor {...ctx} />;
    case 'faq':       return <FAQInlineEditor {...ctx} />;
    case 'rich-text': return <RichTextInlineEditor {...ctx} />;
    case 'section-order': return <SectionOrderEditor {...ctx} />;
    case 'navbar':    return <NavbarEditor {...ctx} />;
    case 'footer':    return <FooterInlineEditor {...ctx} />;
    case 'info-pages': return <InfoPagesInlineEditor {...ctx} />;
    case 'collections': return <CollectionsInlineEditor {...ctx} />;
    case 'coupons': return <CouponsInlineEditor {...ctx} />;
    case 'marketing': return <MarketingInlineEditor {...ctx} />;
    case 'newsletter': return <NewsletterInlineEditor {...ctx} />;
    case 'delivery': return <DeliveryInlineEditor {...ctx} />;
    case 'abandoned': return <AbandonedCartsInlineEditor {...ctx} />;
    case 'apps': return <AppsInlineEditor {...ctx} />;
    case 'whatsapp':  return <WhatsappEditor {...ctx} />;
    case 'cod':       return <CodFormEditor {...ctx} />;
    case 'product-page': return <ProductPageEditor {...ctx} />;
    default:
      return (
        <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
          Éditeur inline à venir.
        </div>
      );
  }
}

function EditorHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="shrink-0 border-b border-border/60 px-5 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Inline editors — un par bloc simple
// ─────────────────────────────────────────────────────────────────────

function IdentityEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const country = store.settings?.country || '';
  const language = store.settings?.language || '';
  const currency = store.settings?.currency || 'USD';

  function patchSettings(patch: Record<string, unknown>) {
    const nextSettings = { ...(store.settings || {}), ...patch };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'identity');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Field
          label="Nom de la boutique"
          hint="Affiché en haut du storefront et dans les emails."
        >
          <Input
            value={store.name || ''}
            onChange={(e) => {
              setStore((s) => (s ? { ...s, name: e.target.value } : s));
              markDirty('name');
            }}
            placeholder="Ex: Atelier Macaftans"
          />
        </Field>
        <Field label="Description" hint="Une phrase courte (SEO + bannière SI activée).">
          <textarea
            value={store.description || ''}
            onChange={(e) => {
              setStore((s) => (s ? { ...s, description: e.target.value } : s));
              markDirty('description');
            }}
            placeholder="Ex: Vêtements traditionnels modernes, livraison 48h."
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Statut" hint="Une boutique en brouillon n'est pas accessible publiquement.">
          <label className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <input
              type="checkbox"
              checked={!!store.isPublished}
              onChange={(e) => {
                setStore((s) => (s ? { ...s, isPublished: e.target.checked } : s));
                markDirty('isPublished');
              }}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">
              {store.isPublished ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700"><Eye className="h-3.5 w-3.5" /> Boutique en ligne</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-700"><Eye className="h-3.5 w-3.5" /> Boutique en brouillon</span>
              )}
            </span>
          </label>
        </Field>

        <Field label="Pays cible" hint="Alimente la génération AI et pré-remplit devise/langue.">
          <select
            value={country}
            onChange={(e) => {
              const v = e.target.value;
              const match = SETTINGS_COUNTRIES.find((c) => c.code === v);
              // Cascade : sélectionner un pays auto-remplit devise, et bascule
              // en arabe si c'est un pays du monde arabe (préservé de /info).
              const patch: Record<string, unknown> = { country: v || undefined };
              if (match?.currency) patch.currency = match.currency;
              if (match?.arab && language !== 'ar') {
                patch.language = 'ar';
                patch.direction = 'rtl';
              }
              patchSettings(patch);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <optgroup label="Monde arabe">
              {SETTINGS_COUNTRIES.filter((c) => c.group === 'arab').map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </optgroup>
            <optgroup label="Afrique">
              {SETTINGS_COUNTRIES.filter((c) => c.group === 'africa').map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </optgroup>
            <optgroup label="Autre">
              {SETTINGS_COUNTRIES.filter((c) => c.group === 'other').map((c) => (
                <option key={c.code || 'none'} value={c.code}>{c.label}</option>
              ))}
            </optgroup>
          </select>
        </Field>

        <Field label="Langue" hint="Détermine le sens de lecture (LTR/RTL).">
          <select
            value={language}
            onChange={(e) => {
              const v = e.target.value;
              patchSettings({ language: v || undefined, direction: directionOf(v) });
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {SETTINGS_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          {language && directionOf(language) === 'rtl' && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-700">
              RTL · Droite → Gauche
            </p>
          )}
        </Field>

        <Field label="Devise" hint="Affichée sur les prix, cartes et checkout.">
          <select
            value={currency}
            onChange={(e) => patchSettings({ currency: e.target.value || 'USD' })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {SETTINGS_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="Domaine personnalisé" hint="Optionnel — branche ton propre nom de domaine.">
          <Input
            value={store.customDomain || ''}
            onChange={(e) => {
              const v = e.target.value;
              setStore((s) => (s ? { ...s, customDomain: v || undefined } : s));
              markDirty('customDomain');
            }}
            placeholder="Ex: www.maboutique.com"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Configure un CNAME chez ton registrar vers <code className="rounded bg-muted px-1 py-0.5 text-[11px]">cname.flexiopage.com</code>.
          </p>
        </Field>
      </div>
    </div>
  );
}

function ThemeEditor({ block, store, setStore, markDirty, openThemePicker, currentThemeName }: EditorCtx) {
  const theme = (store.theme as Partial<ThemeTokens> | undefined) || {};
  // Un thème sauvegardé peut être antérieur au bloc `layout` ou entièrement
  // personnalisé — on backfill les tokens structurels manquants pour éviter
  // que les éditeurs palette/fonts affichent des valeurs vides.
  const themeForEditors: ThemeTokens | null =
    theme.primary && theme.background ? withLayoutFallback(theme as ThemeTokens) : null;

  function patchTheme(next: ThemeTokens) {
    setStore((s) => (s ? { ...s, theme: next as unknown as Record<string, unknown> } : s));
    markDirty('theme');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-muted/30 to-card p-5">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              <span className="h-10 w-10 rounded-full border-2 border-card shadow-sm" style={{ backgroundColor: theme.primary || '#999' }} />
              <span className="h-10 w-10 rounded-full border-2 border-card shadow-sm" style={{ backgroundColor: theme.accent || '#666' }} />
              <span className="h-10 w-10 rounded-full border-2 border-card shadow-sm" style={{ backgroundColor: theme.background || '#fff' }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thème actif</div>
              <div className="truncate text-base font-bold">{currentThemeName}</div>
              <div className="text-xs text-muted-foreground">{theme.dark ? 'Mode sombre' : 'Mode clair'}</div>
            </div>
          </div>
          <Button onClick={openThemePicker} className="mt-4 w-full gap-1.5 gradient-brand text-white">
            <Palette className="h-4 w-4" /> Choisir un autre thème
          </Button>
        </div>

        {themeForEditors && (
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="mb-3">
              <div className="text-sm font-semibold">Palette de couleurs</div>
              <p className="text-[11px] text-muted-foreground">
                Personnalise chaque teinte du thème. Reviens à l&apos;original à tout moment.
              </p>
            </div>
            <ThemePaletteEditor theme={themeForEditors} onChange={patchTheme} />
          </div>
        )}

        {themeForEditors && (
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="mb-3">
              <div className="text-sm font-semibold">Typographie</div>
              <p className="text-[11px] text-muted-foreground">
                Choisis les polices des titres et du texte. Reviens à celles du thème quand tu veux.
              </p>
            </div>
            <ThemeFontEditor theme={themeForEditors} onChange={patchTheme} />
          </div>
        )}
      </div>
    </div>
  );
}

function BrandingEditor({ block, storeId, store, setStore, markDirty }: EditorCtx) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
          <div className="max-w-[260px]">
            <MediaPicker
              storeId={storeId}
              value={store.logo}
              onChange={(url) => {
                setStore((s) => (s ? { ...s, logo: url || '' } : s));
                markDirty('logo');
              }}
              label="Logo de la boutique"
              shape="square"
              helper="Apparaît dans la navbar du storefront."
              imageSizeRecommendation={imageSizes.logo}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
          <div className="max-w-[180px]">
            <MediaPicker
              storeId={storeId}
              value={store.favicon}
              onChange={(url) => {
                setStore((s) => (s ? { ...s, favicon: url || '' } : s));
                markDirty('favicon');
              }}
              label="Favicon (onglet du navigateur)"
              shape="square"
              helper=""
              imageSizeRecommendation={imageSizes.favicon}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Astuce : les images uploadées ici sont disponibles dans la bibliothèque média de la boutique
          et réutilisables pour le hero, le slider, etc.
        </p>
      </div>
    </div>
  );
}

function AnnounceEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const bar: AnnouncementBarSettings = storefront.announcementBar || {};

  function patchBar(next: AnnouncementBarSettings) {
    const nextStorefront: StorefrontSettings = { ...storefront, announcementBar: next };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'announcementBar');
  }

  const messages = bar.messages || [];

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Toggle
          label="Activer le bandeau d'annonce"
          checked={!!bar.enabled}
          onChange={(v) => patchBar({ ...bar, enabled: v })}
        />
        {bar.enabled && (
          <>
            <Field label="Mode" hint="Texte centré statique ou ticker animé.">
              <div className="inline-flex rounded-lg bg-muted/40 p-0.5">
                {(['fixed', 'animated'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => patchBar({ ...bar, mode: m })}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      (bar.mode || 'fixed') === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m === 'fixed' ? 'Statique' : 'Animé'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Messages" hint="Une ligne par message — affichés en rotation.">
              <div className="space-y-2">
                {messages.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={m}
                      onChange={(e) => {
                        const next = [...messages];
                        next[i] = e.target.value;
                        patchBar({ ...bar, messages: next });
                      }}
                      placeholder="Ex: Livraison gratuite dès 50 000 XOF"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patchBar({ ...bar, messages: messages.filter((_, j) => j !== i) })}
                      className="shrink-0"
                    >
                      Retirer
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => patchBar({ ...bar, messages: [...messages, ''] })}
                >
                  + Ajouter un message
                </Button>
              </div>
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

function HeroEditor({ block, storeId, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;

  function patchHero(next: Partial<StorefrontSettings>) {
    const nextStorefront: StorefrontSettings = { ...storefront, ...next };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'hero');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Toggle
          label="Afficher le hero"
          checked={storefront.showHero !== false}
          onChange={(v) => patchHero({ showHero: v })}
        />
        {storefront.showHero !== false && (
          <>
            <Field label="Titre" hint="Première ligne accrocheuse.">
              <Input
                value={storefront.heroTitle || ''}
                onChange={(e) => patchHero({ heroTitle: e.target.value })}
                placeholder="Ex: La mode qui te ressemble"
              />
            </Field>
            <Field label="Sous-titre" hint="Phrase d'appui.">
              <Input
                value={storefront.heroSubtitle || ''}
                onChange={(e) => patchHero({ heroSubtitle: e.target.value })}
                placeholder="Ex: Livraison 48h partout en Afrique de l'Ouest"
              />
            </Field>
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <MediaPicker
                storeId={storeId}
                value={storefront.heroImage}
                onChange={(url) => patchHero({ heroImage: url || '' })}
                label="Image hero (desktop)"
                shape="wide"
                helper="Téléverse depuis ton ordi ou pioche dans la médiathèque."
                imageSizeRecommendation={imageSizes.heroDesktop}
              />
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <MediaPicker
                storeId={storeId}
                value={storefront.heroImageMobile}
                onChange={(url) => patchHero({ heroImageMobile: url || '' })}
                label="Image hero (mobile, optionnel)"
                shape="square"
                helper="Si vide, on utilise l'image desktop."
                imageSizeRecommendation={imageSizes.heroMobile}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProductsGridEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;

  function patchGrid(next: Partial<StorefrontSettings>) {
    const nextStorefront: StorefrontSettings = { ...storefront, ...next };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'products');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Toggle
          label="Afficher la grille produits sur l'accueil"
          checked={storefront.showProductsGrid !== false}
          onChange={(v) => patchGrid({ showProductsGrid: v })}
        />
        {storefront.showProductsGrid !== false && (
          <>
            <Field label="Titre du bloc">
              <Input
                value={storefront.productsGridTitle || ''}
                onChange={(e) => patchGrid({ productsGridTitle: e.target.value })}
                placeholder="Ex: Nos meilleures ventes"
              />
            </Field>
            <Field label="Sous-titre du bloc">
              <Input
                value={storefront.productsGridSubtitle || ''}
                onChange={(e) => patchGrid({ productsGridSubtitle: e.target.value })}
                placeholder="Ex: Les classiques préférés de nos clients"
              />
            </Field>
            <Field label="Nombre de colonnes">
              <div className="inline-flex rounded-lg bg-muted/40 p-0.5">
                {([2, 3, 4] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => patchGrid({ productsGridColumns: c })}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      (storefront.productsGridColumns || 3) === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {c} colonnes
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Tri par défaut">
              <select
                value={storefront.productsGridSort || 'recent'}
                onChange={(e) => patchGrid({ productsGridSort: e.target.value as StorefrontSettings['productsGridSort'] })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="recent">Plus récents</option>
                <option value="price-asc">Prix croissant</option>
                <option value="price-desc">Prix décroissant</option>
                <option value="name-asc">Nom A-Z</option>
              </select>
            </Field>
            <Toggle
              label="Masquer les produits en rupture"
              checked={!!storefront.productsGridHideOutOfStock}
              onChange={(v) => patchGrid({ productsGridHideOutOfStock: v })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function SliderEditor({ block, storeId, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const slider: SliderSettings = storefront.slider || {};
  const slides = slider.slides || [];

  function patchSlider(next: SliderSettings) {
    const nextStorefront: StorefrontSettings = { ...storefront, slider: next };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'slider');
  }
  function patchSlides(nextSlides: SlideItem[]) {
    patchSlider({ ...slider, slides: nextSlides });
  }
  function patchSlide(index: number, partial: Partial<SlideItem>) {
    const next = [...slides];
    next[index] = { ...next[index], ...partial };
    patchSlides(next);
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Toggle
          label="Activer le slider"
          checked={!!slider.enabled}
          onChange={(v) => patchSlider({ ...slider, enabled: v })}
        />
        {slider.enabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                compact
                label="Lecture automatique"
                checked={slider.autoplay !== false}
                onChange={(v) => patchSlider({ ...slider, autoplay: v })}
              />
              <Field label="Durée entre slides (ms)">
                <Input
                  type="number"
                  min={1500}
                  step={500}
                  value={slider.autoplayMs ?? 4500}
                  onChange={(e) => patchSlider({ ...slider, autoplayMs: Number(e.target.value) || 4500 })}
                />
              </Field>
            </div>
            <Field label="Hauteur">
              <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted/40 p-0.5">
                {(['sm', 'md', 'lg', 'xl'] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => patchSlider({ ...slider, height: h })}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      (slider.height || 'md') === h ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {h.toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>

            {/* Liste des slides */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Slides ({slides.length})
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => patchSlides([...slides, { image: '' }])}
                >
                  + Ajouter une slide
                </Button>
              </div>
              {slides.length === 0 && (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  Aucune slide. Clique « + Ajouter une slide » pour commencer.
                </p>
              )}
              {slides.map((sl, i) => (
                <div key={i} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Slide #{i + 1}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={i === 0}
                        onClick={() => {
                          const next = [...slides];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          patchSlides(next);
                        }}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={i === slides.length - 1}
                        onClick={() => {
                          const next = [...slides];
                          [next[i], next[i + 1]] = [next[i + 1], next[i]];
                          patchSlides(next);
                        }}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => patchSlides(slides.filter((_, j) => j !== i))}
                      >
                        Retirer
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MediaPicker
                      storeId={storeId}
                      value={sl.image}
                      onChange={(url) => patchSlide(i, { image: url || '' })}
                      label="Image desktop"
                      shape="wide"
                      helper=""
                      imageSizeRecommendation={imageSizes.heroDesktop}
                    />
                    <MediaPicker
                      storeId={storeId}
                      value={sl.imageMobile}
                      onChange={(url) => patchSlide(i, { imageMobile: url || '' })}
                      label="Image mobile (optionnel)"
                      shape="square"
                      helper="Vide = image desktop."
                      imageSizeRecommendation={imageSizes.heroMobile}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Titre"
                      value={sl.title || ''}
                      onChange={(e) => patchSlide(i, { title: e.target.value })}
                    />
                    <Input
                      placeholder="Sous-titre"
                      value={sl.subtitle || ''}
                      onChange={(e) => patchSlide(i, { subtitle: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Texte du bouton (ex: Voir l'offre)"
                      value={sl.ctaLabel || ''}
                      onChange={(e) => patchSlide(i, { ctaLabel: e.target.value })}
                    />
                    <Input
                      placeholder="URL du bouton (ex: /collection/promo)"
                      value={sl.ctaUrl || ''}
                      onChange={(e) => patchSlide(i, { ctaUrl: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TestimonialsEditor({ block, storeId, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const tt: TestimonialsSettings = storefront.testimonials || {};
  const items = tt.items || [];

  function patchTt(next: TestimonialsSettings) {
    const nextStorefront: StorefrontSettings = { ...storefront, testimonials: next };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'testimonials');
  }
  function patchItems(next: TestimonialItem[]) {
    patchTt({ ...tt, items: next });
  }
  function patchItem(i: number, partial: Partial<TestimonialItem>) {
    const next = [...items];
    next[i] = { ...next[i], ...partial };
    patchItems(next);
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Toggle
          label="Afficher la section témoignages"
          checked={!!tt.enabled}
          onChange={(v) => patchTt({ ...tt, enabled: v })}
        />
        {tt.enabled && (
          <>
            <Field label="Titre du bloc">
              <Input
                value={tt.title || ''}
                onChange={(e) => patchTt({ ...tt, title: e.target.value })}
                placeholder="Ex: Ce que disent nos clients"
              />
            </Field>
            <Field label="Sous-titre">
              <Input
                value={tt.subtitle || ''}
                onChange={(e) => patchTt({ ...tt, subtitle: e.target.value })}
                placeholder="Ex: +1200 avis 5 étoiles"
              />
            </Field>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Témoignages ({items.length})
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => patchItems([...items, { author: '', content: '' }])}
                >
                  + Ajouter
                </Button>
              </div>
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  Aucun témoignage. Ajoute le premier ci-dessus.
                </p>
              )}
              {items.map((it, i) => (
                <div key={i} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Témoignage #{i + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patchItems(items.filter((_, j) => j !== i))}
                    >
                      Retirer
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                    <MediaPicker
                      storeId={storeId}
                      value={it.avatar}
                      onChange={(url) => patchItem(i, { avatar: url || '' })}
                      label="Avatar"
                      shape="round"
                      helper=""
                      imageSizeRecommendation={imageSizes.profilePhoto}
                    />
                    <div className="space-y-2">
                      <Input
                        placeholder="Nom du client"
                        value={it.author || ''}
                        onChange={(e) => patchItem(i, { author: e.target.value })}
                      />
                      <Input
                        placeholder="Rôle / ville (optionnel)"
                        value={it.role || ''}
                        onChange={(e) => patchItem(i, { role: e.target.value })}
                      />
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Note</Label>
                        <select
                          value={it.rating ?? 5}
                          onChange={(e) => patchItem(i, { rating: Number(e.target.value) })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>{n} ★</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <textarea
                    value={it.content || ''}
                    onChange={(e) => patchItem(i, { content: e.target.value })}
                    placeholder="Texte du témoignage…"
                    className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DraggableOrderList — réutilisable pour réordonner par drag-and-drop
// ─────────────────────────────────────────────────────────────────────
//
// API native HTML5 drag-and-drop : pas de dépendance externe, ça marche
// out-of-the-box au clavier sur les navigateurs modernes. Sur tactile
// le drag natif est limité — l'utilisateur peut toujours réorganiser
// via les listes plus haut dans la page (toggles, etc.) ou via la sous-
// page /sections qui a un éditeur plus riche.

function DraggableOrderList<T>({
  items,
  getKey,
  renderLabel,
  onReorder,
}: {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderLabel: (item: T, index: number) => React.ReactNode;
  onReorder: (next: T[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDragStart(e: React.DragEvent<HTMLLIElement>, i: number) {
    setDragIndex(i);
    // Effet visuel du curseur + payload neutre (Firefox refuse dragStart
    // sans setData). On utilise pas la valeur — l'état React suffit.
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* old browsers */ }
  }

  function handleDragOver(e: React.DragEvent<HTMLLIElement>, i: number) {
    // preventDefault est OBLIGATOIRE pour autoriser le drop sur cette zone.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (i !== overIndex) setOverIndex(i);
  }

  function handleDrop(e: React.DragEvent<HTMLLIElement>, target: number) {
    e.preventDefault();
    setOverIndex(null);
    const src = dragIndex;
    setDragIndex(null);
    if (src === null || src === target) return;
    const next = [...items];
    const [moved] = next.splice(src, 1);
    next.splice(target, 0, moved);
    onReorder(next);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <ul className="space-y-2">
      {items.map((item, i) => {
        const isDragging = dragIndex === i;
        const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
        return (
          <li
            key={getKey(item, i)}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={cn(
              'flex cursor-grab items-center gap-3 rounded-xl border bg-card p-3 transition-all active:cursor-grabbing',
              isDragging ? 'border-primary/50 opacity-40' : 'border-border/60',
              isOver && 'border-primary bg-primary/5 ring-2 ring-primary/20',
            )}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {i + 1}
            </span>
            <span className="flex-1 text-sm font-medium">{renderLabel(item, i)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section order — réordonne hero/slider/products/testimonials sur l'accueil
// ─────────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<MovableSectionId, string> = {
  hero:            'Hero',
  slider:          'Slider',
  products:        'Grille produits',
  testimonials:    'Témoignages',
  video:           'Vidéo',
  faq:             'FAQ',
  richText:        'Texte libre',
  featuredProduct: 'Produit vedette',
};

function SectionOrderEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const order = resolveSectionOrder(storefront.sectionOrder);

  function setOrder(next: MovableSectionId[]) {
    const nextStorefront: StorefrontSettings = { ...storefront, sectionOrder: next };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'sectionOrder');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <p className="text-xs text-muted-foreground">
          Glisse-déposez les sections pour changer leur ordre sur la page d&apos;accueil.
          Le bandeau, la navbar et le footer restent fixes.
        </p>
        <DraggableOrderList
          items={order}
          getKey={(id) => id}
          renderLabel={(id) => SECTION_LABELS[id]}
          onReorder={setOrder}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => setOrder([...DEFAULT_SECTION_ORDER])}>
          Réinitialiser à l&apos;ordre par défaut
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Vidéo — YouTube/Vimeo/mp4 + paragraphe côté droit sur l'accueil
// ─────────────────────────────────────────────────────────────────────

function VideoInlineEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const video: VideoSettings = storefront.video || {};

  function patch(next: Partial<VideoSettings>) {
    const nextVideo = { ...video, ...next };
    const nextStorefront = { ...storefront, video: nextVideo };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'video');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <FieldToggle
          label="Afficher la vidéo"
          sublabel="Section visible sur la page d'accueil (position réordonnable)."
          checked={!!video.enabled}
          onChange={(v) => patch({ enabled: v })}
        />
        <Field label="Lien vidéo" hint="YouTube, Vimeo, ou fichier .mp4/.webm/.ogg.">
          <Input
            value={video.url || ''}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </Field>
        <Field label="Titre" hint="Affiché à côté de la vidéo.">
          <Input
            value={video.title || ''}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Notre histoire"
          />
        </Field>
        <Field label="Paragraphe" hint="Contexte, promesse de marque ou descriptif court.">
          <textarea
            value={video.text || ''}
            onChange={(e) => patch({ text: e.target.value })}
            rows={5}
            placeholder="Depuis 2020, on sélectionne les meilleurs artisans du Sénégal…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FAQ — accordéon de questions / réponses réordonnable
// ─────────────────────────────────────────────────────────────────────

function FAQInlineEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const faq: FAQSettings = storefront.faq || {};
  const items: FAQItemSettings[] = faq.items || [];

  function patch(next: Partial<FAQSettings>) {
    const nextFaq = { ...faq, ...next };
    const nextStorefront = { ...storefront, faq: nextFaq };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'faq');
  }

  function setItems(next: FAQItemSettings[]) {
    patch({ items: next });
  }

  function addItem() {
    setItems([...items, { question: '', answer: '' }]);
  }

  function updateItem(i: number, key: keyof FAQItemSettings, value: string) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  function moveItem(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <FieldToggle
          label="Afficher la FAQ"
          sublabel="Section visible sur la page d'accueil (position réordonnable)."
          checked={!!faq.enabled}
          onChange={(v) => patch({ enabled: v })}
        />
        <Field label="Titre">
          <Input
            value={faq.title || ''}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Questions fréquentes"
          />
        </Field>
        <Field label="Sous-titre (optionnel)">
          <Input
            value={faq.subtitle || ''}
            onChange={(e) => patch({ subtitle: e.target.value })}
            placeholder="Tout ce que tu voulais savoir avant de commander."
          />
        </Field>

        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Questions ({items.length})
            </div>
            <Button size="sm" variant="outline" onClick={addItem} className="h-7 gap-1 text-[11px]">
              <Plus className="h-3 w-3" />
              Ajouter
            </Button>
          </div>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-card p-4 text-center text-[11px] text-muted-foreground">
              Aucune question — clique « Ajouter » pour commencer.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={i} className="rounded-lg border border-border/60 bg-card p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">Q{i + 1}</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveItem(i, -1)}
                        disabled={i === 0}
                        className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                        aria-label="Monter"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(i, 1)}
                        disabled={i === items.length - 1}
                        className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                        aria-label="Descendre"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="grid h-6 w-6 place-items-center rounded text-destructive hover:bg-destructive/10"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <Input
                    value={it.question}
                    onChange={(e) => updateItem(i, 'question', e.target.value)}
                    placeholder="Ex: Quels sont les délais de livraison ?"
                    className="mb-1.5 text-xs"
                  />
                  <textarea
                    value={it.answer}
                    onChange={(e) => updateItem(i, 'answer', e.target.value)}
                    rows={3}
                    placeholder="Réponse claire et rassurante — 2 phrases max."
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-[11px]"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rich Text — bloc markdown libre pour histoire de marque / SEO
// ─────────────────────────────────────────────────────────────────────

function RichTextInlineEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const rt: RichTextSettings = storefront.richText || {};

  function patch(next: Partial<RichTextSettings>) {
    const nextRt = { ...rt, ...next };
    const nextStorefront = { ...storefront, richText: nextRt };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'richText');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <FieldToggle
          label="Afficher le bloc"
          sublabel="Section visible sur la page d'accueil (position réordonnable)."
          checked={!!rt.enabled}
          onChange={(v) => patch({ enabled: v })}
        />
        <Field label="Titre (optionnel)">
          <Input
            value={rt.title || ''}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="À propos de la marque"
          />
        </Field>
        <Field label="Alignement">
          <div className="inline-flex rounded-lg bg-muted/40 p-0.5">
            {(['left', 'center'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => patch({ align: a })}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  (rt.align || 'left') === a ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {a === 'left' ? 'Gauche' : 'Centre'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Contenu (markdown)" hint="# titre · **gras** · *italique* · - listes · [lien](url)">
          <textarea
            value={rt.content || ''}
            onChange={(e) => patch({ content: e.target.value })}
            rows={10}
            placeholder={'## Notre mission\n\nDepuis 2020, nous ...\n\n- Point 1\n- Point 2'}
            className="w-full rounded-lg border border-input bg-background p-2.5 font-mono text-[11px] leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
        </Field>
        {rt.content?.trim() && (
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Aperçu
            </div>
            <div
              className={cn('prose-storefront text-xs leading-relaxed', (rt.align || 'left') === 'center' && 'text-center')}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(rt.content) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Page produit — toggles principaux + ordre des sections produit
// ─────────────────────────────────────────────────────────────────────

const PP_SECTION_LABELS: Record<ProductPageSectionId, string> = {
  badges:       'Badges de confiance',
  timer:        'Compte à rebours',
  description:  'Description longue',
  testimonials: 'Témoignages clients',
};

function ProductPageEditor({ block, storeId, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const pp: ProductPageSettings = storefront.productPage || {};
  const order = resolveProductPageOrder(pp.sectionOrder);

  function patchPp(next: ProductPageSettings) {
    const nextStorefront: StorefrontSettings = { ...storefront, productPage: next };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'productPage');
  }
  function setOrder(next: ProductPageSectionId[]) {
    patchPp({ ...pp, sectionOrder: next });
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sections affichées
          </div>
          <Toggle
            compact
            label="Badges de confiance"
            checked={pp.showBadges !== false}
            onChange={(v) => patchPp({ ...pp, showBadges: v })}
          />
          <Toggle
            compact
            label="Compte à rebours (urgence)"
            checked={!!pp.showTimer}
            onChange={(v) => patchPp({ ...pp, showTimer: v })}
          />
          <Toggle
            compact
            label="Description longue"
            checked={pp.showDescription !== false}
            onChange={(v) => patchPp({ ...pp, showDescription: v })}
          />
          <Toggle
            compact
            label="Témoignages clients"
            checked={!!pp.showTestimonials}
            onChange={(v) => patchPp({ ...pp, showTestimonials: v })}
          />
          <Toggle
            compact
            label='Bouton "Ajouter au panier"'
            checked={pp.showAddToCart !== false}
            onChange={(v) => patchPp({ ...pp, showAddToCart: v })}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ordre des sections — glisse pour réorganiser
          </div>
          <DraggableOrderList
            items={order}
            getKey={(id) => id}
            renderLabel={(id) => PP_SECTION_LABELS[id]}
            onReorder={setOrder}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOrder([...DEFAULT_PRODUCT_PAGE_ORDER])}
          >
            Réinitialiser
          </Button>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Pour personnaliser les badges, paramétrer le timer, ou choisir la palette de couleurs de la page produit :
          {' '}
          <Link href={`/dashboard/stores/${storeId}/product-page`} className="font-semibold text-primary hover:underline">
            Ouvrir l&apos;éditeur avancé →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Navbar — affichage marque, taille du logo, liens du menu, options
// ─────────────────────────────────────────────────────────────────────

const BRAND_DISPLAY_OPTIONS: { value: BrandDisplay; label: string; hint: string }[] = [
  { value: 'logo+name', label: 'Logo + nom', hint: 'Les deux côte à côte' },
  { value: 'logo',      label: 'Logo seul',  hint: 'Pas de texte (logo doit être assez lisible)' },
  { value: 'name',      label: 'Nom seul',   hint: 'Pas de logo, juste la marque écrite' },
];

const LOGO_SIZE_OPTIONS: { value: LogoSize; label: string }[] = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
];

function NavbarEditor({ block, storeId, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;
  const nav: NavbarSettings = storefront.navbar || {};
  const links = nav.menuLinks || [];

  function patchNav(next: NavbarSettings) {
    const nextStorefront: StorefrontSettings = { ...storefront, navbar: next };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'navbar');
  }
  function patchLinks(next: NavMenuLink[]) {
    patchNav({ ...nav, menuLinks: next });
  }
  function patchLink(i: number, partial: Partial<NavMenuLink>) {
    const next = [...links];
    next[i] = { ...next[i], ...partial };
    patchLinks(next);
  }
  function moveLink(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j], next[i]];
    patchLinks(next);
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        {/* Affichage de la marque */}
        <Field label="Affichage de la marque" hint="Comment ton identité apparaît à gauche de la navbar.">
          <div className="grid gap-2 sm:grid-cols-3">
            {BRAND_DISPLAY_OPTIONS.map((opt) => {
              const active = (nav.brandDisplay || 'logo+name') === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => patchNav({ ...nav, brandDisplay: opt.value })}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border/60 hover:border-primary/30 hover:bg-muted/30',
                  )}
                >
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{opt.hint}</div>
                </button>
              );
            })}
          </div>
          {!store.logo && (nav.brandDisplay === 'logo' || nav.brandDisplay === 'logo+name') && (
            <p className="text-[11px] text-amber-700">
              Aucun logo téléversé — la marque s&apos;affiche en texte tant qu&apos;un logo n&apos;est pas ajouté
              {' '}
              <Link href={`/dashboard/stores/${storeId}`} className="font-semibold underline">
                dans le bloc « Logo &amp; favicon »
              </Link>.
            </p>
          )}
        </Field>

        {/* Taille du logo */}
        <Field label="Taille du logo" hint="La navbar s'agrandit en conséquence — ton logo ne se fait jamais rogner.">
          <div className="inline-flex rounded-lg bg-muted/40 p-0.5">
            {LOGO_SIZE_OPTIONS.map((opt) => {
              const active = (nav.logoSize || 'md') === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => patchNav({ ...nav, logoSize: opt.value })}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Options de la navbar */}
        <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Options
          </div>
          <Toggle
            compact
            label="Afficher la barre de recherche"
            checked={!!nav.showSearch}
            onChange={(v) => patchNav({ ...nav, showSearch: v })}
          />
          <Toggle
            compact
            label="Afficher le sélecteur de langue"
            checked={!!nav.showLanguageSwitcher}
            onChange={(v) => patchNav({ ...nav, showLanguageSwitcher: v })}
          />
        </div>

        {/* Liens du menu */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Liens du menu ({links.length})
              </div>
              <div className="text-[11px] text-muted-foreground">
                Si vide, un menu par défaut s&apos;affiche (Accueil, Boutique).
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patchLinks([...links, { label: '', url: '' }])}
            >
              + Ajouter
            </Button>
          </div>
          {links.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
              Aucun lien — clique « + Ajouter » pour personnaliser le menu.
            </p>
          )}
          {links.map((l, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-border/60 bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">Lien #{i + 1}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => moveLink(i, -1)} aria-label="Monter">↑</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={i === links.length - 1} onClick={() => moveLink(i, 1)} aria-label="Descendre">↓</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchLinks(links.filter((_, j) => j !== i))}>Retirer</Button>
                </div>
              </div>
              <Input
                placeholder="Libellé (ex: Nouveautés)"
                value={l.label || ''}
                onChange={(e) => patchLink(i, { label: e.target.value })}
              />
              <Input
                placeholder="URL (/c/nouveautes, /p/contact, https://…)"
                value={l.url || ''}
                onChange={(e) => patchLink(i, { url: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">
                Les chemins commençant par <code>/</code> sont préfixés automatiquement par le slug
                de ta boutique (ex: <code>/c/promo</code> → <code>/{store.slug}/c/promo</code>).
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Le <strong>style</strong> visuel de la navbar (standard, centered, bold, glass, editorial) est
          fixé par le thème actif — change-le depuis le bloc « Thème » à gauche.
        </div>
      </div>
    </div>
  );
}

function WhatsappEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const ws: WhatsappSettings = store.settings?.whatsapp || {};

  function patchWs(next: WhatsappSettings) {
    const nextSettings = { ...(store.settings || {}), whatsapp: next };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'whatsapp');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Toggle
          label="Afficher le bouton WhatsApp flottant"
          checked={!!ws.enabled}
          onChange={(v) => patchWs({ ...ws, enabled: v })}
        />
        {ws.enabled && (
          <>
            <Field label="Numéro de téléphone" hint="Format international, ex: +221 77 123 45 67.">
              <Input
                value={ws.phoneNumber || ''}
                onChange={(e) => patchWs({ ...ws, phoneNumber: e.target.value })}
                placeholder="+221771234567"
              />
            </Field>
            <Field label="Position">
              <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted/40 p-0.5">
                {(['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => patchWs({ ...ws, position: p })}
                    className={cn(
                      'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                      (ws.position || 'bottom-right') === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p === 'bottom-right' ? '↘' : p === 'bottom-left' ? '↙' : p === 'top-right' ? '↗' : '↖'}
                    {' '}{p.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Couleur d'accent" hint="Code hex (ex: #25D366).">
              <Input
                value={ws.accentColor || ''}
                onChange={(e) => patchWs({ ...ws, accentColor: e.target.value })}
                placeholder="#25D366"
              />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

function CodFormEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const cf: CodFormSettings = store.settings?.codForm || {};

  function patchCf(next: CodFormSettings) {
    const nextSettings = { ...(store.settings || {}), codForm: next };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'codForm');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Field label="En-tête du formulaire">
          <Input
            value={cf.headline || ''}
            onChange={(e) => patchCf({ ...cf, headline: e.target.value })}
            placeholder="Ex: Commander en 30 secondes"
          />
        </Field>
        <Field label="Libellé du bouton">
          <Input
            value={cf.submitLabel || ''}
            onChange={(e) => patchCf({ ...cf, submitLabel: e.target.value })}
            placeholder="Ex: Commander maintenant"
          />
        </Field>
        <Field label="Phrase de réassurance">
          <Input
            value={cf.reassurance || ''}
            onChange={(e) => patchCf({ ...cf, reassurance: e.target.value })}
            placeholder="Ex: Sans carte. Livraison 24-72h."
          />
        </Field>
        <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Champs visibles</div>
          <Toggle compact label="Email" checked={cf.showEmail !== false} onChange={(v) => patchCf({ ...cf, showEmail: v })} />
          <Toggle compact label="Email obligatoire" checked={!!cf.requireEmail} onChange={(v) => patchCf({ ...cf, requireEmail: v })} />
          <Toggle compact label="Code postal" checked={!!cf.showPostalCode} onChange={(v) => patchCf({ ...cf, showPostalCode: v })} />
          <Toggle compact label="État/région" checked={!!cf.showState} onChange={(v) => patchCf({ ...cf, showState: v })} />
          <Toggle compact label="Notes" checked={cf.showNotes !== false} onChange={(v) => patchCf({ ...cf, showNotes: v })} />
          <Toggle compact label="Quantité" checked={cf.showQuantity !== false} onChange={(v) => patchCf({ ...cf, showQuantity: v })} />
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Couleurs, forme du bouton, animation, frais de livraison ?
          {' '}
          <Link href={`/dashboard/stores/${store._id}/checkout`} className="font-semibold text-primary hover:underline">
            Ouvrir le réglage complet du formulaire →
          </Link>
        </div>
      </div>
    </div>
  );
}

function FooterInlineEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const storefront = (store.settings?.storefront || {}) as StorefrontSettings;

  function patchStorefront(patch: Partial<StorefrontSettings>) {
    const nextStorefront: StorefrontSettings = { ...storefront, ...patch };
    const nextSettings = { ...(store.settings || {}), storefront: nextStorefront };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'footer');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-4 p-5">
        <FieldToggle
          label="Bandeau de réassurance"
          sublabel="Livraison rapide · Paiement sécurisé · Support"
          checked={storefront.showFeatures !== false}
          onChange={(v) => patchStorefront({ showFeatures: v })}
        />
        <FieldToggle
          label="Afficher le pied de page"
          sublabel="Mentions et liens vers les pages d'info."
          checked={storefront.showFooter !== false}
          onChange={(v) => patchStorefront({ showFooter: v })}
        />
        {storefront.showFooter !== false && (
          <div className="space-y-3">
            <Field label="Note légale (optionnel)" hint="Affichée en tout bas du footer.">
              <Input
                value={storefront.footerNote || ''}
                onChange={(e) => patchStorefront({ footerNote: e.target.value })}
                placeholder="Ex: © 2026 Ma Boutique · Tous droits réservés"
              />
            </Field>
            <FooterEditor
              footer={storefront.footer}
              onChange={(footer) => patchStorefront({ footer })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface InfoPageDoc {
  _id: string;
  name: string;
  slug: string;
  kind?: 'landing' | 'info';
  body?: string;
  isPublished?: boolean;
  updatedAt?: string;
}

function InfoPagesInlineEditor({ block, storeId, store }: EditorCtx) {
  const prompt = usePrompt();
  const confirm = useConfirm();
  const [pages, setPages] = useState<InfoPageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storesApi.listPages(storeId, { kind: 'info' });
      const list = (res.data as { pages?: InfoPageDoc[] }).pages || [];
      setPages(list.filter((p) => p.kind === 'info' || !p.kind));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  async function createInfoPage() {
    const name = await prompt({
      title: 'Nouvelle page',
      description: "Donne-lui un titre clair — c'est ce que tes clients verront dans le menu et le footer.",
      placeholder: 'Ex: Mentions légales, CGV, À propos…',
      confirmLabel: 'Créer',
      minLength: 2,
    });
    if (!name?.trim()) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await storesApi.createPage(storeId, {
      name: name.trim(),
      slug,
      kind: 'info',
      body: `# ${name.trim()}\n\nDécris ici le contenu de ta page.`,
      isPublished: true,
    });
    await load();
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-4 p-5">
        <Button onClick={createInfoPage} className="w-full gap-1.5 gradient-brand text-white">
          <Plus className="h-3.5 w-3.5" />
          Nouvelle page
        </Button>
        {loading ? (
          <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : pages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card p-6 text-center">
            <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Aucune page</p>
            <p className="text-[11px] text-muted-foreground">Clique sur « Nouvelle page ».</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {pages.map((p) => (
              <InfoPageRow
                key={p._id}
                page={p}
                storeId={storeId}
                storeSlug={store.slug || ''}
                expanded={expandedId === p._id}
                onToggle={() => setExpandedId((id) => (id === p._id ? null : p._id))}
                onSaved={(u) => setPages((arr) => arr.map((r) => (r._id === u._id ? u : r)))}
                onDeleted={async () => {
                  const ok = await confirm({
                    title: `Supprimer « ${p.name} » ?`,
                    description: 'La page ne sera plus accessible sur ta vitrine. Action irréversible.',
                    confirmLabel: 'Supprimer',
                    tone: 'destructive',
                  });
                  if (!ok) return;
                  await storesApi.deletePage(storeId, p._id);
                  setPages((arr) => arr.filter((r) => r._id !== p._id));
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InfoPageRow({
  page,
  storeId,
  storeSlug,
  expanded,
  onToggle,
  onSaved,
  onDeleted,
}: {
  page: InfoPageDoc;
  storeId: string;
  storeSlug: string;
  expanded: boolean;
  onToggle: () => void;
  onSaved: (p: InfoPageDoc) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(page.name);
  const [body, setBody] = useState(page.body || '');
  const [isPublished, setIsPublished] = useState(!!page.isPublished);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = name !== page.name || body !== (page.body || '') || isPublished !== !!page.isPublished;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await storesApi.updatePage(storeId, page._id, { name: name.trim(), body, isPublished });
      const updated = (res.data as { page: InfoPageDoc }).page;
      onSaved(updated);
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2200);
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish() {
    const next = !isPublished;
    setIsPublished(next);
    setSaving(true);
    try {
      const res = await storesApi.updatePage(storeId, page._id, { isPublished: next });
      onSaved((res.data as { page: InfoPageDoc }).page);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-indigo-500/10 text-indigo-700">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold">{page.name}</span>
              {isPublished ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                  <Eye className="h-2.5 w-2.5" /> Publiée
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                  <EyeOff className="h-2.5 w-2.5" /> Brouillon
                </span>
              )}
            </div>
            <code className="text-[10px] text-muted-foreground">/p/{page.slug}</code>
          </div>
        </div>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 p-3">
          <div className="space-y-2">
            <Field label="Titre">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Contenu (markdown)" hint="# titre · **gras** · *italique* · [lien](url) · - listes">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-input bg-background p-2 font-mono text-[11px] leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
            </Field>
            {body.trim() && (
              <div className="rounded-lg border border-border/60 bg-card p-2 max-h-48 overflow-y-auto">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Aperçu</div>
                <div className="prose-storefront text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={handleSave} disabled={saving || !dirty} className="gap-1">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Enregistrer
              </Button>
              <Button size="sm" variant="outline" onClick={handleTogglePublish} disabled={saving} className="gap-1">
                {isPublished ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {isPublished ? 'Brouillon' : 'Publier'}
              </Button>
              {storeSlug && (
                <Link href={`/${storeSlug}/p/${page.slug}`} target="_blank" rel="noopener">
                  <Button size="sm" variant="outline" className="gap-1"><ExternalLink className="h-3 w-3" />Voir</Button>
                </Link>
              )}
              <Button size="sm" variant="ghost" onClick={onDeleted} className="gap-1 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3 w-3" />
                Suppr.
              </Button>
              {savedAt && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Enregistré
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Modal plein-écran qui embarque une sous-page CRUD via iframe.
 * On passe `?embed=1` pour que le layout dashboard masque la sidebar +
 * header — sinon le vendeur verrait le chrome deux fois.
 * ESC pour fermer, refresh pour reload la vue.
 */
function CrudModal({
  title,
  src,
  onClose,
}: {
  title: string;
  src: string;
  onClose: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const separator = src.includes('?') ? '&' : '?';
  const embedSrc = `${src}${separator}embed=1`;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="text-[10px] text-muted-foreground">ESC pour fermer</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setRefreshKey((n) => n + 1)} className="gap-1">
            <RotateCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} className="gap-1">
            <X className="h-3.5 w-3.5" />
            Fermer
          </Button>
        </div>
      </div>
      <iframe
        key={refreshKey}
        src={embedSrc}
        className="flex-1 w-full border-0"
        title={title}
      />
    </div>
  );
}

function CollectionsInlineEditor({ block, storeId }: EditorCtx) {
  const [collections, setCollections] = useState<Array<{ _id: string; name: string; slug?: string; productCount?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    (storesApi.listCollections?.(storeId) || Promise.resolve({ data: { collections: [] } }))
      .then((res) => {
        setCollections((res.data as { collections?: Array<{ _id: string; name: string; slug?: string; productCount?: number }> }).collections || []);
      })
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-4 p-5">
        <Button
          onClick={() => setModalOpen(true)}
          className="w-full gap-1.5 gradient-brand text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouvelle collection
        </Button>
        {loading ? (
          <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : collections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card p-5 text-center">
            <Layers className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Aucune collection</p>
            <p className="text-[11px] text-muted-foreground">Regroupe tes produits par thème.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {collections.map((c) => (
              <li key={c._id}>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-left transition-colors hover:border-primary/40"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sky-500/10 text-sky-700">
                    <Layers className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{c.name}</div>
                    {typeof c.productCount === 'number' && (
                      <div className="text-[10px] text-muted-foreground">{c.productCount} produit{c.productCount > 1 ? 's' : ''}</div>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {modalOpen && (
        <CrudModal
          title="Collections"
          src={`/dashboard/stores/${storeId}/collections`}
          onClose={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function CouponsInlineEditor({ block, storeId }: EditorCtx) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    storesApi.listCoupons(storeId)
      .then((res) => setCoupons((res.data as { coupons?: Coupon[] }).coupons || []))
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-4 p-5">
        <Button
          onClick={() => setModalOpen(true)}
          className="w-full gap-1.5 gradient-brand text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouveau code promo
        </Button>
        {loading ? (
          <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : coupons.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card p-5 text-center">
            <BadgePercent className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Aucun code promo</p>
            <p className="text-[11px] text-muted-foreground">Réduction saisie au COD.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {coupons.map((c) => (
              <li key={c._id}>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-left transition-colors hover:border-primary/40"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-500/10 text-amber-700">
                    <BadgePercent className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <code className="truncate text-xs font-bold">{c.code}</code>
                      {!c.isActive && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                          inactif
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.type === 'percent' ? `−${c.value}%` : c.type === 'fixed' ? `−${c.value}` : 'Livraison gratuite'}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {modalOpen && (
        <CrudModal
          title="Codes promo"
          src={`/dashboard/stores/${storeId}/coupons`}
          onClose={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

interface MarketingProviderDef {
  key: keyof MarketingIntegration;
  label: string;
  placeholder: string;
  hint: string;
  accent: string;
  looksValid?: (v: string) => boolean;
}

const MARKETING_PROVIDERS: MarketingProviderDef[] = [
  {
    key: 'facebookPixelId',
    label: 'Meta Pixel',
    placeholder: '1234567890123456',
    hint: 'Meta Business Suite → Gestionnaire d\'événements.',
    accent: 'from-blue-500 to-indigo-600',
    looksValid: (v) => /^\d{10,20}$/.test(v.trim()),
  },
  {
    key: 'tiktokPixelId',
    label: 'TikTok Pixel',
    placeholder: 'CXXXXXXXXXXXXXXX',
    hint: 'TikTok Ads Manager → Outils → Événements.',
    accent: 'from-rose-500 to-pink-600',
    looksValid: (v) => /^[A-Z0-9]{18,30}$/.test(v.trim()),
  },
  {
    key: 'snapchatPixelId',
    label: 'Snapchat Pixel',
    placeholder: '00000000-0000-0000-0000-000000000000',
    hint: 'Snap Ads Manager → Événements.',
    accent: 'from-amber-400 to-yellow-500',
    looksValid: (v) => /^[0-9a-f-]{30,40}$/i.test(v.trim()),
  },
  {
    key: 'googleAnalyticsId',
    label: 'Google Analytics 4',
    placeholder: 'G-XXXXXXXXXX',
    hint: 'GA4 → Administration → Flux de données.',
    accent: 'from-orange-500 to-red-500',
    looksValid: (v) => /^G-[A-Z0-9]{8,12}$/i.test(v.trim()),
  },
];

function MarketingInlineEditor({ block, store, setStore, markDirty }: EditorCtx) {
  const cfg: MarketingIntegration = store.integrations?.marketing || {};

  function updateCfg<K extends keyof MarketingIntegration>(key: K, value: MarketingIntegration[K]) {
    const nextCfg = { ...cfg, [key]: value };
    // On nettoie les strings vides pour ne pas polluer la DB avec des "".
    const cleaned: MarketingIntegration = Object.fromEntries(
      Object.entries(nextCfg).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() ? v : undefined) : v]),
    ) as MarketingIntegration;
    const nextIntegrations = { ...(store.integrations || {}), marketing: cleaned };
    setStore((s) => (s ? { ...s, integrations: nextIntegrations } : s));
    markDirty('integrations', 'marketing');
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground">
          Colle l&apos;ID brut de chaque plateforme — FlexioPage envoie <strong>PageView</strong>,
          {' '}<strong>ViewContent</strong>, <strong>AddToCart</strong>, <strong>InitiateCheckout</strong>,
          {' '}<strong>Purchase</strong> automatiquement.
        </div>

        {MARKETING_PROVIDERS.map((p) => {
          const value = (cfg[p.key] as string) || '';
          const filled = !!value.trim();
          const validFormat = filled && (p.looksValid?.(value) ?? true);
          return (
            <div key={p.key} className="rounded-xl border border-border/60 bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className={cn('grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br text-white shadow-sm', p.accent)}>
                  <TrendingUp className="h-3.5 w-3.5" />
                </span>
                <Label className="flex-1 text-sm font-semibold">{p.label}</Label>
                {filled && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                      validFormat ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', validFormat ? 'bg-emerald-500' : 'bg-amber-500')} />
                    {validFormat ? 'OK' : '?'}
                  </span>
                )}
              </div>
              <Input
                value={value}
                placeholder={p.placeholder}
                onChange={(e) => updateCfg(p.key, e.target.value as MarketingIntegration[typeof p.key])}
                className="h-9 font-mono text-xs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">{p.hint}</p>
            </div>
          );
        })}

        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-sm">
              <TrendingUp className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 text-sm font-semibold">Google Ads (conversion)</div>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-[10px]">ID de conversion</Label>
              <Input
                value={cfg.googleAdsConversionId || ''}
                onChange={(e) => updateCfg('googleAdsConversionId', e.target.value)}
                placeholder="AW-123456789"
                className="mt-0.5 h-9 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Label de l&apos;action</Label>
              <Input
                value={cfg.googleAdsConversionLabel || ''}
                onChange={(e) => updateCfg('googleAdsConversionLabel', e.target.value)}
                placeholder="xyzABCDEFghijklm"
                className="mt-0.5 h-9 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-fuchsia-600" />
            <div className="flex-1 text-sm font-semibold">Meta Conversions API</div>
            <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">
              Serveur
            </span>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Double les événements en server-side. Recommandé si tu dépenses &gt; 100€/mois sur Meta Ads.
          </p>
          <div className="space-y-2">
            <div>
              <Label className="text-[10px]">Access token</Label>
              <Input
                type="password"
                autoComplete="off"
                value={cfg.facebookConversionsApiToken || ''}
                onChange={(e) => updateCfg('facebookConversionsApiToken', e.target.value)}
                placeholder="EAA..."
                className="mt-0.5 h-9 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Code de test (optionnel)</Label>
              <Input
                value={cfg.facebookTestEventCode || ''}
                onChange={(e) => updateCfg('facebookTestEventCode', e.target.value)}
                placeholder="TEST12345"
                className="mt-0.5 h-9 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Code2 className="h-4 w-4 text-amber-600" />
            <div className="flex-1 text-sm font-semibold">Code personnalisé &lt;head&gt;</div>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Avancé
            </span>
          </div>
          <textarea
            value={cfg.customHeadCode || ''}
            onChange={(e) => updateCfg('customHeadCode', e.target.value)}
            rows={6}
            placeholder={'<!-- Hotjar -->\n<script>...</script>'}
            className="w-full rounded-lg border border-input bg-background p-2 font-mono text-[11px] leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Injecté sur toutes les pages publiques. Ne colle que du code de confiance.
          </p>
        </div>
      </div>
    </div>
  );
}

function NewsletterInlineEditor({ block, storeId, store, setStore, markDirty }: EditorCtx) {
  const confirm = useConfirm();
  const cfg: NewsletterSettings = {
    enabled: false,
    delaySeconds: 5,
    exitIntent: true,
    dismissalDays: 7,
    ...((store.settings as { newsletter?: NewsletterSettings } | undefined)?.newsletter || {}),
  };
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [counts, setCounts] = useState<SubscriberCounts>({ total: 0, thisMonth: 0 });
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [search, setSearch] = useState('');
  const [subsLoading, setSubsLoading] = useState(true);

  // Chargement initial : abonnés + coupons (pour le dropdown récompense).
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    Promise.all([
      storesApi.listSubscribers(storeId).catch(() => ({ data: { subscribers: [], counts: { total: 0, thisMonth: 0 } } })),
      storesApi.listCoupons(storeId).catch(() => ({ data: { coupons: [] } })),
    ]).then(([sRes, cRes]) => {
      if (cancelled) return;
      setSubscribers((sRes?.data as { subscribers?: Subscriber[] } | undefined)?.subscribers || []);
      setCounts((sRes?.data as { counts?: SubscriberCounts } | undefined)?.counts || { total: 0, thisMonth: 0 });
      setCoupons((cRes?.data as { coupons?: Coupon[] } | undefined)?.coupons || []);
      setSubsLoading(false);
    });
    return () => { cancelled = true; };
  }, [storeId]);

  // Debounce search vers l'API — 250ms pour ne pas pilonner le backend.
  useEffect(() => {
    if (!storeId || subsLoading) return;
    const t = window.setTimeout(() => {
      storesApi.listSubscribers(storeId, { search: search || undefined })
        .then((res) => setSubscribers((res.data as { subscribers?: Subscriber[] }).subscribers || []))
        .catch(() => {});
    }, 250);
    return () => window.clearTimeout(t);
  }, [search, storeId, subsLoading]);

  function updateCfg<K extends keyof NewsletterSettings>(key: K, value: NewsletterSettings[K]) {
    const nextNewsletter = { ...cfg, [key]: value };
    const nextSettings = { ...(store.settings || {}), newsletter: nextNewsletter };
    setStore((s) => (s ? { ...s, settings: nextSettings } : s));
    markDirty('settings', 'newsletter');
  }

  async function handleDeleteSubscriber(sub: Subscriber) {
    const ok = await confirm({
      title: `Supprimer ${sub.email} ?`,
      description: "L'abonné ne recevra plus tes campagnes. L'historique des envois est conservé.",
      confirmLabel: 'Supprimer',
      tone: 'destructive',
    });
    if (!ok) return;
    await storesApi.deleteSubscriber(storeId, sub._id);
    setSubscribers((arr) => arr.filter((x) => x._id !== sub._id));
    setCounts((c) => ({ ...c, total: Math.max(0, c.total - 1) }));
  }

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <FieldToggle
          label="Pop-up actif"
          sublabel="Décoche pour mettre en pause sans perdre la config."
          checked={!!cfg.enabled}
          onChange={(v) => updateCfg('enabled', v)}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field label="Délai (s)" hint="0 = immédiat. 3-7s = sweet spot.">
            <Input
              type="number"
              min={0}
              step={1}
              value={cfg.delaySeconds ?? 5}
              onChange={(e) => updateCfg('delaySeconds', Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </Field>
          <Field label="Re-affichage (jours)" hint="Après un refus visiteur.">
            <Input
              type="number"
              min={0}
              step={1}
              value={cfg.dismissalDays ?? 7}
              onChange={(e) => updateCfg('dismissalDays', Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </Field>
        </div>

        <FieldToggle
          label="Trigger exit-intent (desktop)"
          sublabel="Surface le pop-up si la souris quitte la fenêtre par le haut."
          checked={cfg.exitIntent !== false}
          onChange={(v) => updateCfg('exitIntent', v)}
        />

        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Contenu du pop-up
          </div>
          <div className="space-y-2">
            <Field label="Titre">
              <Input
                value={cfg.headline || ''}
                onChange={(e) => updateCfg('headline', e.target.value)}
                placeholder="Profite de 10% sur ta première commande"
              />
            </Field>
            <Field label="Sous-titre">
              <Input
                value={cfg.subheadline || ''}
                onChange={(e) => updateCfg('subheadline', e.target.value)}
                placeholder="Laisse ton email pour recevoir le code"
              />
            </Field>
            <Field label="Texte du bouton">
              <Input
                value={cfg.ctaLabel || ''}
                onChange={(e) => updateCfg('ctaLabel', e.target.value)}
                placeholder="Recevoir mon code"
              />
            </Field>
            <div className="max-w-[180px]">
              <MediaPicker
                storeId={storeId}
                value={cfg.image}
                onChange={(url) => updateCfg('image', url || '')}
                label="Image (optionnel)"
                shape="square"
                helper="Affichée à gauche sur desktop."
                imageSizeRecommendation={imageSizes.promoBannerSquare}
              />
            </div>
            <Field label="Message de succès" hint="Affiché après l'inscription.">
              <Input
                value={cfg.successMessage || ''}
                onChange={(e) => updateCfg('successMessage', e.target.value)}
                placeholder="Merci, voici ton code :"
              />
            </Field>
          </div>
        </div>

        <Field
          label="Récompense (code promo)"
          hint={coupons.length === 0
            ? "Crée d'abord un code depuis le block « Codes promo »."
            : "Le code est affiché à l'abonné dans l'écran de succès."}
        >
          <select
            value={cfg.rewardCouponCode || ''}
            onChange={(e) => updateCfg('rewardCouponCode', e.target.value || undefined)}
            disabled={coupons.length === 0}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Aucune récompense —</option>
            {coupons.map((c) => (
              <option key={c._id} value={c.code}>
                {c.code} ({c.type === 'percent' ? `−${c.value}%` : `−${c.value}`})
                {!c.isActive && ' · inactif'}
              </option>
            ))}
          </select>
        </Field>

        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Abonnés</div>
              <div className="text-[11px] text-muted-foreground">
                <strong>{counts.total}</strong> total · <strong>{counts.thisMonth}</strong> ce mois
              </div>
            </div>
            <a
              href={storesApi.subscribersCsvUrl(storeId)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 text-[11px] font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Download className="h-3 w-3" />
              CSV
            </a>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrer par email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
          {subsLoading ? (
            <div className="grid place-items-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : subscribers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-card p-4 text-center text-[11px] text-muted-foreground">
              {search ? `Aucun email ne contient « ${search} »` : 'Aucun abonné pour le moment.'}
            </div>
          ) : (
            <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60 bg-card">
              {subscribers.map((sub) => (
                <li key={sub._id} className="flex items-center gap-2 px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{sub.email}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(sub.createdAt).toLocaleDateString('fr-FR')}
                      {sub.rewardCouponCode && (
                        <span className="ml-1 inline-flex items-center gap-1 rounded bg-primary/10 px-1 text-[9px] text-primary">
                          <BadgePercent className="h-2 w-2" />
                          {sub.rewardCouponCode}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubscriber(sub)}
                    className="grid h-6 w-6 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx) {
  const delivery: DeliveryIntegration = store.integrations?.delivery || {
    provider: 'mogadelivery',
    enabled: false,
    autoDispatch: true,
  };

  // Onboarding auto MD — les actions connexion/rotation appellent des
  // endpoints dédiés qui écrivent directement en DB (pas via markDirty).
  // Après succès, on refetch le store pour resync l'état local.
  const [connecting, setConnecting] = useState(false);
  const [togglingConn, setTogglingConn] = useState(false);
  const [connectResult, setConnectResult] = useState<null | { kind: 'success' | 'manual' | 'error'; message: string }>(null);
  const [mdJwt, setMdJwt] = useState('');
  const [existingBoutiqueId, setExistingBoutiqueId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  function patchDelivery(patch: Partial<DeliveryIntegration>) {
    const nextDelivery = { ...delivery, ...patch };
    const nextIntegrations = { ...(store.integrations || {}), delivery: nextDelivery };
    setStore((s) => (s ? { ...s, integrations: nextIntegrations } : s));
    markDirty('integrations', 'delivery');
  }

  function patchPickup(patch: Record<string, string>) {
    patchDelivery({ pickupAddress: { ...(delivery.pickupAddress || {}), ...patch } });
  }

  async function refetchStore() {
    try {
      const fresh = await storesApi.get(storeId);
      const s = (fresh.data as { store: StoreType }).store;
      setStore(s);
    } catch { /* silent */ }
  }

  async function handleConnect() {
    setConnecting(true);
    setConnectResult(null);
    try {
      const res = await storesApi.connectMogaDelivery(storeId, {
        sellerToken: mdJwt.trim() || undefined,
        existingBoutiqueId: existingBoutiqueId.trim() || undefined,
      });
      if (res.data.mode === 'auto') {
        setConnectResult({
          kind: 'success',
          message: `Boutique enregistrée chez MogaDelivery (store_id ${res.data.storeIdMD ?? storeId}). L'authentification utilise le secret plateforme — tu peux dispatcher.`,
        });
        await refetchStore();
      } else {
        setConnectResult({
          kind: 'manual',
          message: res.data.message || "Mode manuel : demande à MogaDelivery d'enregistrer ce store_id.",
        });
      }
    } catch (err) {
      setConnectResult({ kind: 'error', message: extractApiError(err, 'Onboarding échoué.') });
    } finally {
      setConnecting(false);
    }
  }

  async function handleToggleConnection(connect: boolean) {
    setTogglingConn(true);
    setConnectResult(null);
    try {
      await storesApi.setDeliveryConnection(storeId, connect);
      // Refresh depuis DB pour resync — enabled + secret sont écrits par l'API.
      await refetchStore();
      setConnectResult({
        kind: 'success',
        message: connect
          ? 'Intégration reconnectée — les dispatchs reprennent. Secret inchangé, aucun risque de 401.'
          : 'Intégration déconnectée — dispatchs suspendus. Ton secret et ta Boutique MogaDelivery sont conservés ; reconnecte quand tu veux.',
      });
    } catch (err) {
      setConnectResult({ kind: 'error', message: extractApiError(err, 'Action impossible.') });
    } finally {
      setTogglingConn(false);
    }
  }

  // Livraison est physical-only — le block est déjà filtré dans BLOCKS,
  // mais garde-fou visuel si un digital arrive ici via ?block=delivery.
  if (store.storeType === 'digital') {
    return (
      <div className="flex flex-1 flex-col">
        <EditorHeader title={block.label} hint={block.hint} />
        <div className="p-5">
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
            La livraison n&apos;est pas disponible pour les boutiques digitales.
          </div>
        </div>
      </div>
    );
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/webhooks/mogadelivery`;

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5">
        <Toggle
          label={delivery.provider === 'bestdelivery' ? 'Activer Best Delivery' : 'Activer MogaDelivery'}
          checked={!!delivery.enabled}
          onChange={(v) => patchDelivery({ enabled: v })}
        />

        <Field label="Transporteur" hint="MogaDelivery = Afrique de l'Ouest, Best Delivery = Tunisie.">
          <select
            value={delivery.provider || 'mogadelivery'}
            onChange={(e) => patchDelivery({ provider: e.target.value as DeliveryIntegration['provider'] })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="mogadelivery">MogaDelivery — Afrique de l&apos;Ouest</option>
            <option value="bestdelivery">Best Delivery — Tunisie (SOAP)</option>
          </select>
        </Field>

        {delivery.provider === 'bestdelivery' && (
          <>
            <div className="flex items-start gap-2 rounded-md bg-sky-500/10 px-3 py-2 text-[11px] text-sky-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Best Delivery couvre la Tunisie. Renseigne les identifiants de ton compte expéditeur.</span>
            </div>
            <Field label="Login" hint="Login du compte expéditeur Best Delivery.">
              <Input
                autoComplete="off"
                value={delivery.login || ''}
                onChange={(e) => patchDelivery({ login: e.target.value })}
                className={delivery.enabled && !delivery.login?.trim() ? 'border-rose-500/60' : ''}
              />
            </Field>
            <Field label="Mot de passe" hint="Stocké chiffré côté serveur.">
              <Input
                type="password"
                autoComplete="off"
                value={delivery.pwd || ''}
                onChange={(e) => patchDelivery({ pwd: e.target.value })}
                className={delivery.enabled && !delivery.pwd?.trim() ? 'border-rose-500/60' : ''}
                placeholder="••••••••"
              />
            </Field>
            <Field label="WSDL (avancé)" hint="Laisse vide pour l'endpoint prod par défaut.">
              <Input
                value={delivery.baseUrl || ''}
                onChange={(e) => patchDelivery({ baseUrl: e.target.value })}
                placeholder="https://api.best-delivery.net/serviceShipments.php?wsdl"
              />
            </Field>
          </>
        )}

        {delivery.provider !== 'bestdelivery' && (
          <>
            {delivery.enabled && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Connecté — dispatchs auto actifs
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleConnection(false)}
                  disabled={togglingConn}
                  className="gap-1.5"
                >
                  {togglingConn ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                  Déconnecter
                </Button>
              </div>
            )}

            <div className="rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 to-rose-500/5 p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-fuchsia-700" />
                <div className="text-sm font-semibold">Connexion automatique MogaDelivery</div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Crée la Boutique côté MogaDelivery (ou resync le secret) et pose un HMAC en un clic. Auth via le secret plateforme.
              </p>
              <Button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="mt-2 w-full gap-2"
              >
                {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                {delivery.enabled ? 'Resynchroniser' : 'Connecter'}
              </Button>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="mt-2 text-[11px] font-medium text-fuchsia-700 hover:underline"
              >
                {showAdvanced ? 'Masquer' : 'Afficher'} les options avancées
              </button>
              {showAdvanced && (
                <div className="mt-2 space-y-2">
                  <div>
                    <Label className="text-[10px]">JWT seller MogaDelivery (optionnel)</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={mdJwt}
                      onChange={(e) => setMdJwt(e.target.value)}
                      placeholder="eyJhbGciOi..."
                      className="mt-0.5 font-mono text-xs"
                    />
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Colle ton token depuis DevTools de admin-mogadelivery.com. Utilisé uniquement pour cet appel.
                    </p>
                  </div>
                  <div>
                    <Label className="text-[10px]">boutiqueId existant (resync)</Label>
                    <Input
                      value={existingBoutiqueId}
                      onChange={(e) => setExistingBoutiqueId(e.target.value)}
                      placeholder="Laisse vide pour créer une nouvelle Boutique"
                      className="mt-0.5 text-xs"
                    />
                  </div>
                </div>
              )}
              {connectResult && (
                <div
                  className={cn(
                    'mt-2 rounded-md px-3 py-2 text-[11px]',
                    connectResult.kind === 'success' && 'bg-emerald-500/10 text-emerald-800',
                    connectResult.kind === 'manual' && 'bg-amber-500/10 text-amber-800',
                    connectResult.kind === 'error' && 'bg-rose-500/10 text-rose-800',
                  )}
                >
                  {connectResult.message}
                </div>
              )}
            </div>

            <Field label="Base URL (avancé)" hint="Laisse vide pour l'endpoint MogaDelivery par défaut.">
              <Input
                value={delivery.baseUrl || ''}
                onChange={(e) => patchDelivery({ baseUrl: e.target.value })}
                placeholder="https://api.admin-mogadelivery.com/api/webhooks/flexiopage"
              />
            </Field>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Webhook entrant</div>
              <code className="mt-1 block truncate rounded-md bg-background px-2 py-1.5 font-mono text-[10px]">
                {webhookUrl}
              </code>
              <p className="mt-1 text-[10px] text-muted-foreground">
                MogaDelivery pousse les changements de statut (assigné, en transit, livré, retourné) signés avec le secret plateforme.
              </p>
            </div>
          </>
        )}

        <div>
          <Toggle
            label="Dispatch automatique"
            checked={delivery.autoDispatch !== false}
            onChange={(v) => patchDelivery({ autoDispatch: v })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dès qu&apos;une commande COD est payée, envoi auto au coursier. Décoche pour dispatcher manuellement.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Adresse d&apos;expédition
          </div>
          <div className="space-y-3">
            <Field label="Nom du contact">
              <Input
                value={delivery.pickupAddress?.contactName || ''}
                onChange={(e) => patchPickup({ contactName: e.target.value })}
                placeholder="Ex: Aïssatou Diallo"
              />
            </Field>
            <Field label="Téléphone du contact" hint="Format international avec indicatif pays.">
              <Input
                type="tel"
                value={delivery.pickupAddress?.contactPhone || ''}
                onChange={(e) => patchPickup({ contactPhone: e.target.value })}
                placeholder="Ex: +221 70 000 00 00"
              />
            </Field>
            <Field label="Adresse complète" hint="N°, rue, quartier — comme sur Google Maps.">
              <Input
                value={delivery.pickupAddress?.line1 || ''}
                onChange={(e) => patchPickup({ line1: e.target.value })}
                placeholder="Ex: 12 Rue Félix Faure, Plateau"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ville">
                <Input
                  value={delivery.pickupAddress?.city || ''}
                  onChange={(e) => patchPickup({ city: e.target.value })}
                  placeholder="Dakar"
                />
              </Field>
              <Field label="Pays" hint="Code ISO 2 lettres.">
                <Input
                  value={delivery.pickupAddress?.country || ''}
                  onChange={(e) => patchPickup({ country: e.target.value })}
                  placeholder="SN"
                />
              </Field>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AbandonedCartsInlineEditor({ block, storeId }: EditorCtx) {
  const [carts, setCarts] = useState<Array<{ _id: string; phone?: string; customerName?: string; total?: number; createdAt?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    storesApi.listAbandonedCarts(storeId)
      .then((res) => setCarts((res.data as { carts?: Array<{ _id: string; phone?: string; customerName?: string; total?: number; createdAt?: string }> }).carts || []))
      .catch(() => setCarts([]))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-4 p-5">
        <Button
          onClick={() => setModalOpen(true)}
          className="w-full gap-1.5 gradient-brand text-white"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Ouvrir la liste des paniers
        </Button>
        {loading ? (
          <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : carts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card p-5 text-center">
            <ShoppingCart className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Aucun panier abandonné</p>
            <p className="text-[11px] text-muted-foreground">Les paniers non finalisés apparaîtront ici.</p>
          </div>
        ) : (
          <>
            <div className="text-[11px] text-muted-foreground">
              <strong>{carts.length}</strong> panier{carts.length > 1 ? 's' : ''} à relancer
            </div>
            <ul className="space-y-1.5">
              {carts.slice(0, 8).map((c) => (
                <li key={c._id}>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-left transition-colors hover:border-primary/40"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-rose-500/10 text-rose-700">
                      <ShoppingCart className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">
                        {c.customerName || c.phone || 'Anonyme'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {typeof c.total === 'number' && <>{c.total.toFixed(2)} · </>}
                        {c.createdAt && new Date(c.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {carts.length > 8 && (
                <li className="text-center text-[10px] text-muted-foreground">
                  + {carts.length - 8} autres — clique « Ouvrir la liste »
                </li>
              )}
            </ul>
          </>
        )}
      </div>
      {modalOpen && (
        <CrudModal
          title="Paniers abandonnés"
          src={`/dashboard/stores/${storeId}/abandoned-carts`}
          onClose={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

/** Chaque tuile pointe vers un block ID du hub — pas d'URL, on switch localement. */
interface AppTile {
  blockId: string;
  icon: typeof SettingsIcon;
  title: string;
  description: string;
  connected: boolean;
  metric?: string;
  tone: 'fuchsia' | 'rose' | 'emerald' | 'amber' | 'sky' | 'violet';
}

const APPS_TONE: Record<AppTile['tone'], { iconBg: string; chipBg: string; chipFg: string }> = {
  fuchsia: { iconBg: 'from-fuchsia-500 to-pink-600',   chipBg: 'bg-fuchsia-500/10', chipFg: 'text-fuchsia-700' },
  rose:    { iconBg: 'from-rose-500 to-pink-600',      chipBg: 'bg-rose-500/10',    chipFg: 'text-rose-700' },
  emerald: { iconBg: 'from-emerald-500 to-teal-600',   chipBg: 'bg-emerald-500/10', chipFg: 'text-emerald-700' },
  amber:   { iconBg: 'from-amber-500 to-orange-600',   chipBg: 'bg-amber-500/10',   chipFg: 'text-amber-700' },
  sky:     { iconBg: 'from-sky-500 to-blue-600',       chipBg: 'bg-sky-500/10',     chipFg: 'text-sky-700' },
  violet:  { iconBg: 'from-violet-500 to-fuchsia-600', chipBg: 'bg-violet-500/10',  chipFg: 'text-violet-700' },
};

function AppsInlineEditor({ block, store, storeId, setActiveBlock }: EditorCtx) {
  // Compteurs live pour badges "3 actifs" — on tolère un échec silencieux
  // (l'API peut ne pas être dispo si le store est en création).
  const [couponCount, setCouponCount] = useState<number>(0);
  const [collectionCount, setCollectionCount] = useState<number>(0);
  const [subscriberCount, setSubscriberCount] = useState<number>(0);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    Promise.all([
      storesApi.listCoupons(storeId).catch(() => ({ data: { coupons: [] } })),
      storesApi.listCollections?.(storeId).catch(() => ({ data: { collections: [] } })) ?? Promise.resolve({ data: { collections: [] } }),
      storesApi.listSubscribers?.(storeId).catch(() => ({ data: { counts: { total: 0 } } })) ?? Promise.resolve({ data: { counts: { total: 0 } } }),
    ]).then(([cRes, colRes, subRes]) => {
      if (cancelled) return;
      const coupons = (cRes?.data as { coupons?: Array<{ isActive?: boolean }> } | undefined)?.coupons || [];
      setCouponCount(coupons.filter((c) => c.isActive).length);
      const collections = (colRes?.data as { collections?: unknown[] } | undefined)?.collections || [];
      setCollectionCount(collections.length);
      const counts = (subRes?.data as { counts?: { total?: number } } | undefined)?.counts;
      setSubscriberCount(counts?.total || 0);
    });
    return () => { cancelled = true; };
  }, [storeId]);

  const delivery = store.integrations?.delivery;
  const marketing = store.integrations?.marketing;
  const newsletter = (store.settings as { newsletter?: { enabled?: boolean } } | undefined)?.newsletter;
  const whatsapp = store.settings?.whatsapp;

  const tiles: AppTile[] = [
    {
      blockId: 'delivery',
      icon: Truck,
      title: 'Livraison',
      description: 'Dispatch auto des commandes COD vers le coursier.',
      connected: !!(delivery?.enabled && delivery.apiKey && delivery.pickupAddress?.city),
      metric: delivery?.autoDispatch !== false ? 'Auto-dispatch' : 'Manuel',
      tone: 'rose',
    },
    {
      blockId: 'marketing',
      icon: TrendingUp,
      title: 'Pixels marketing',
      description: 'Meta, TikTok, Snap, GA4 — événements auto.',
      connected: !!(marketing?.facebookPixelId || marketing?.tiktokPixelId || marketing?.snapchatPixelId || marketing?.googleAnalyticsId),
      metric: (() => {
        const n = [marketing?.facebookPixelId, marketing?.tiktokPixelId, marketing?.snapchatPixelId, marketing?.googleAnalyticsId].filter(Boolean).length;
        return n > 0 ? `${n} pixel${n > 1 ? 's' : ''}` : undefined;
      })(),
      tone: 'fuchsia',
    },
    {
      blockId: 'whatsapp',
      icon: MessageCircle,
      title: 'WhatsApp flottant',
      description: 'Bouton chat sur toutes les pages.',
      connected: !!(whatsapp?.enabled && whatsapp?.phoneNumber?.trim()),
      tone: 'emerald',
    },
    {
      blockId: 'newsletter',
      icon: Mail,
      title: 'Newsletter & pop-up',
      description: 'Capture d\'emails avec code promo.',
      connected: !!newsletter?.enabled,
      metric: subscriberCount > 0 ? `${subscriberCount} abonné${subscriberCount > 1 ? 's' : ''}` : undefined,
      tone: 'emerald',
    },
    {
      blockId: 'coupons',
      icon: BadgePercent,
      title: 'Codes promo',
      description: 'Codes % ou fixes saisis au COD.',
      connected: couponCount > 0,
      metric: couponCount > 0 ? `${couponCount} actif${couponCount > 1 ? 's' : ''}` : undefined,
      tone: 'amber',
    },
    {
      blockId: 'collections',
      icon: Layers,
      title: 'Collections',
      description: 'Regroupe tes produits par thème.',
      connected: collectionCount > 0,
      metric: collectionCount > 0 ? `${collectionCount} collection${collectionCount > 1 ? 's' : ''}` : undefined,
      tone: 'sky',
    },
  ];

  const connectedCount = tiles.filter((t) => t.connected).length;

  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-4 p-5">
        <div
          className={cn(
            'inline-flex rounded-full px-3 py-1.5 text-xs font-bold',
            connectedCount === tiles.length
              ? 'bg-emerald-500/10 text-emerald-700'
              : 'bg-primary/10 text-primary',
          )}
        >
          {connectedCount} / {tiles.length} connectées
        </div>
        <div className="space-y-2">
          {tiles.map((t) => {
            const tone = APPS_TONE[t.tone];
            const Icon = t.icon;
            return (
              <button
                key={t.blockId}
                type="button"
                onClick={() => setActiveBlock(t.blockId)}
                className={cn(
                  'group relative flex w-full items-start gap-3 overflow-hidden rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
                  t.connected
                    ? 'border-emerald-500/30 hover:border-emerald-500/60'
                    : 'border-border/60 hover:border-primary/40',
                )}
              >
                <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', tone.iconBg)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold tracking-tight">{t.title}</h3>
                    {t.connected ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{t.description}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        t.connected ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700',
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', t.connected ? 'bg-emerald-500' : 'bg-amber-500')} />
                      {t.connected ? 'Connectée' : 'À configurer'}
                    </span>
                    {t.metric && (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tone.chipBg, tone.chipFg)}>
                        {t.metric}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-3 text-center text-[11px] text-muted-foreground">
          <Sparkles className="mx-auto mb-1 h-3.5 w-3.5 text-primary" />
          Plus d&apos;intégrations à venir — chatbots, email transactionnel, Google Sheets…
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Common form primitives
// ─────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange, compact }: { label: string; checked: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3', compact ? 'py-1.5' : 'py-2.5')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input"
      />
      <span className={cn('text-sm', compact && 'text-xs')}>{label}</span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────
// RIGHT — PreviewPane (page switcher + device switcher + iframe)
// ─────────────────────────────────────────────────────────────────────

function PreviewPane({
  previewPages,
  previewPage,
  setPreviewPage,
  previewDevice,
  setPreviewDevice,
  previewBust,
  onReload,
  path,
  mobileVisible,
}: {
  previewPages: PreviewPageDef[];
  previewPage: string;
  setPreviewPage: (id: string) => void;
  previewDevice: 'mobile' | 'tablet' | 'desktop';
  setPreviewDevice: (d: 'mobile' | 'tablet' | 'desktop') => void;
  previewBust: number;
  onReload: () => void;
  path: string | null;
  /** Sur < lg, ne s'affiche que si l'onglet « Aperçu » est actif. */
  mobileVisible: boolean;
}) {
  return (
    <section
      className={cn(
        'min-w-0 flex-1 flex-col bg-muted/40 lg:flex',
        mobileVisible ? 'flex' : 'hidden',
      )}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/80 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1">
          {previewPages.map((p) => {
            const Icon = p.icon;
            const active = previewPage === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreviewPage(p.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3" />
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {([
            { id: 'mobile', icon: Smartphone, label: 'Mobile', width: 375 },
            { id: 'tablet', icon: Tablet, label: 'Tablette', width: 768 },
            { id: 'desktop', icon: Monitor, label: 'Desktop', width: 1280 },
          ] as const).map((d) => {
            const Icon = d.icon;
            const active = previewDevice === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setPreviewDevice(d.id)}
                title={`${d.label} · ${d.width}px`}
                aria-pressed={active}
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-md transition-all',
                  active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          <button
            type="button"
            onClick={onReload}
            title="Recharger"
            className="ml-0.5 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Iframe area — block layout (pas flex) : un flex child a un
          min-width: auto par défaut, et l'iframe interne de 768px (tablet)
          pousse alors le wrap au-delà de son max-width visuel. Le bloc
          plain respecte max-width strictement et mx-auto centre. */}
      <div className="flex-1 overflow-auto p-4">
        {path ? (
          <ViewportPreview
            device={previewDevice}
            src={`${path}${path.includes('?') ? '&' : '?'}preview=1`}
            previewBust={previewBust}
          />
        ) : (
          <div className="mx-auto grid w-full max-w-sm place-items-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun {previewPage === 'product' ? 'produit' : previewPage === 'collection' ? 'collection' : 'page'} à afficher pour cet aperçu.
              {' '}Crée-en un puis recharge.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ViewportPreview — true-device-width iframe + transform: scale()
// ─────────────────────────────────────────────────────────────────────
//
// Rendre l'iframe à sa vraie largeur (375/768/1280) et scaler via CSS
// pour rester dans la colonne disponible. Sans ça, l'iframe forcée
// à 375px ne déclenche pas les media queries mobiles du storefront.
function ViewportPreview({
  device,
  src,
  previewBust,
}: {
  device: 'mobile' | 'tablet' | 'desktop';
  src: string;
  previewBust: number;
}) {
  const dims = {
    mobile:  { width: 375,  height: 720 },
    tablet:  { width: 768,  height: 1024 },
    desktop: { width: 1280, height: 800 },
  }[device];

  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Démarre à 0 → tant que useLayoutEffect n'a pas mesuré la largeur
  // disponible, le wrap a height = 0 donc l'iframe est invisible : pas
  // de flash à scale=1 (= 1024px de haut pour le tablet). Dès le 1er
  // layoutEffect on a la vraie valeur AVANT le 1er paint.
  const [scale, setScale] = useState(0);

  // useLayoutEffect (pas useEffect) : s'exécute après le commit DOM mais
  // AVANT le paint. Sans ça, sur switch mobile→tablet, l'iframe rendait
  // d'abord à l'ancienne scale (tablet width 768 à scale=0.95 = oversize
  // qui débordait) puis se corrigeait après paint → flicker.
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    let raf = 0;
    const compute = () => {
      const available = el.clientWidth;
      if (available <= 0) return;
      const s = Math.min(1, available / dims.width);
      setScale(s);
    };
    compute();
    // requestAnimationFrame autour de l'observer : sans ça, sur certains
    // navigateurs la rafale de redimensionnement déclenche un setState
    // par frame qui se chevauche avec le suivant → instabilité visuelle.
    const obs = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    });
    obs.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [dims.width]);

  const maxFrameWidth =
    device === 'mobile' ? 360
    : device === 'tablet' ? 640
    : 9999;

  return (
    <div
      ref={wrapRef}
      className="mx-auto overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl"
      style={{
        maxWidth: maxFrameWidth,
        width: '100%',
        height: dims.height * scale,
        transition: 'height 0.2s ease, max-width 0.2s ease',
      }}
    >
      <iframe
        // Le `device` n'est PLUS dans la key : changer de device modifie
        // juste width/height/transform de l'iframe (CSS), pas son `src`.
        // Avant, chaque switch mobile↔tablet↔desktop unmount + remount
        // l'iframe → rechargement complet de la storefront, jank visible.
        key={`${src}-${previewBust}`}
        src={src}
        title="Aperçu de la boutique"
        className="origin-top-left border-0 bg-background"
        style={{
          width: dims.width,
          height: dims.height,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}
