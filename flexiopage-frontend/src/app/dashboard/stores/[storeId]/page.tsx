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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
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
} from '@/components/dashboard/store-editor';
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
  { id: 'section-order', label: 'Ordre des sections', icon: Layers, group: 'home', mode: 'inline', hint: 'Glisser hero/slider/produits/témoignages.' },
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
  buildPath: (ctx: { slug: string; productSlug?: string; collectionSlug?: string; infoSlug?: string }) => string | null;
}

const PREVIEW_PAGES: PreviewPageDef[] = [
  { id: 'home',     label: 'Accueil',    icon: ImageIcon,   buildPath: ({ slug }) => `/${slug}` },
  { id: 'product',  label: 'Produit',    icon: Package,     buildPath: ({ slug, productSlug }) => productSlug ? `/${slug}/product/${productSlug}` : null },
  { id: 'cart',     label: 'Panier',     icon: ShoppingCart, buildPath: ({ slug }) => `/${slug}/cart` },
  { id: 'checkout', label: 'Checkout',   icon: Wallet,      buildPath: ({ slug }) => `/${slug}/cart/checkout` },
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
type DirtyKey = 'name' | 'description' | 'logo' | 'favicon' | 'isPublished' | 'theme' | 'settings';

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
  const storeId = params.storeId as string;

  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [activeBlock, setActiveBlock] = useState<string | null>('hero');
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
    ]).then(([sRes, pRes, cRes, iRes]) => {
      if (cancelled) return;
      const s = (sRes?.data as { store?: StoreType } | undefined)?.store || null;
      setStore(s);
      const products = (pRes?.data as { products?: Array<{ slug?: string }> } | undefined)?.products || [];
      setFirstProductSlug(products[0]?.slug || null);
      const collections = (cRes?.data as { collections?: Array<{ slug?: string }> } | undefined)?.collections || [];
      setFirstCollectionSlug(collections[0]?.slug || null);
      const pages = (iRes?.data as { pages?: Array<{ slug?: string }> } | undefined)?.pages || [];
      setFirstInfoSlug(pages[0]?.slug || null);
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
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Tu veux régler langue, devise, pays, domaine personnalisé ?
          {' '}
          <Link href={`/dashboard/stores/${store._id}/info`} className="font-semibold text-primary hover:underline">
            Ouvrir les infos détaillées →
          </Link>
        </div>
      </div>
    </div>
  );
}

function ThemeEditor({ block, store, openThemePicker, currentThemeName }: EditorCtx) {
  const theme = (store.theme as Partial<ThemeTokens> | undefined) || {};
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
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Pour ajuster les couleurs précisément (palette personnalisée) :
          {' '}
          <Link href={`/dashboard/stores/${store._id}/appearance`} className="font-semibold text-primary hover:underline">
            Ouvrir l&apos;éditeur d&apos;apparence →
          </Link>
        </div>
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
  hero:         'Hero',
  slider:       'Slider',
  products:     'Grille produits',
  testimonials: 'Témoignages',
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

function FooterInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Footer</div>
            <p className="text-xs text-muted-foreground">
              Personnalise les colonnes, liens, logo et contenu du footer de ta boutique.
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/sections`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Ouvrir l'éditeur complet du footer
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoPagesInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Pages d'information</div>
            <p className="text-xs text-muted-foreground">
              Crée et gère les pages CGV, FAQ, Politique de confidentialité, Contact, etc.
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/info-pages`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Gérer les pages
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function CollectionsInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Collections</div>
            <p className="text-xs text-muted-foreground">
              Crée des regroupements de produits (ex: Nouveautés, Soldes, Best-sellers).
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/collections`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Gérer les collections
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function CouponsInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Codes promo</div>
            <p className="text-xs text-muted-foreground">
              Crée des codes de réduction avec pourcentage, montant fixe ou livraison gratuite.
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/coupons`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Gérer les codes promo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function MarketingInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Marketing & pixels</div>
            <p className="text-xs text-muted-foreground">
              Intègre Meta Pixel, TikTok, Snapchat, Google Analytics, Mixpanel pour tracker les conversions.
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/marketing`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Configurer le marketing
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function NewsletterInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Newsletter & popup</div>
            <p className="text-xs text-muted-foreground">
              Configure la popup de bienvenue et gère la liste d'emails des abonnés.
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/newsletter`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Configurer la newsletter
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function DeliveryInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Livraison</div>
            <p className="text-xs text-muted-foreground">
              Intègre MogaDelivery, configure l'adresse d'expédition et les zones de livraison.
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/delivery`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Configurer la livraison
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function AbandonedCartsInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Paniers abandonnés</div>
            <p className="text-xs text-muted-foreground">
              Envoie des relances WhatsApp automatiques aux clients avec panier non finalisé.
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/abandoned-carts`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Configurer les relances
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function AppsInlineEditor({ block, store, setStore, markDirty, storeId }: EditorCtx & { storeId?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <EditorHeader title={block.label} hint={block.hint} />
      <div className="space-y-5 p-5 overflow-auto max-h-[calc(100vh-300px)]">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Apps & intégrations</div>
            <p className="text-xs text-muted-foreground">
              Gère toutes tes apps connectées (Telegram, WhatsApp, paiements, etc.).
            </p>
          </div>
          <Link href={`/dashboard/stores/${storeId}/apps`}>
            <Button className="w-full gap-1.5 gradient-brand text-white">
              Gérer les apps
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
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
