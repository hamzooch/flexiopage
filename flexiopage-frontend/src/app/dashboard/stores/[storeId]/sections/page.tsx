'use client';

/**
 * Store sections editor — every block on the storefront is configurable
 * here. Left side: sticky vertical nav listing all sections (with on/off
 * status). Right side: scrolling cards.
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, extractApiError } from '@/lib/api';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import {
  AnnouncementBarEditor,
  FieldToggle,
  FooterEditor,
  NavbarEditor,
  SliderEditor,
  TestimonialsEditor,
  type CodFormSettings,
  type StorefrontSettings,
  type StoreType,
  type WhatsappSettings,
  type MovableSectionId,
  resolveSectionOrder,
} from '@/components/dashboard/store-editor';
import { ProductPageEditor } from '@/components/dashboard/product-page-editor';
import { StoreHomepageLivePreview } from '@/components/dashboard/store-homepage-live-preview';
import type { ProductPageSettings } from '@/lib/product-page-order';
import type { ThemeTokens } from '@/data/store-themes';
import { getRecommendedSectionsForTheme, type SectionId as ThemeSectionId } from '@/lib/theme-sections';
import {
  Megaphone,
  Navigation,
  Sparkles as SparklesIcon,
  GalleryHorizontal,
  LayoutGrid,
  MessageSquareQuote,
  PanelBottom,
  CheckCircle2,
  Circle,
  MessageCircle,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionDef {
  id: string;
  icon: typeof Megaphone;
  title: string;
  /** Whether the section is currently shown on the storefront. */
  isActive: (s: StorefrontSettings) => boolean;
  /** True when the seller has filled some content beyond defaults. */
  isCustomized: (s: StorefrontSettings) => boolean;
}

const SECTIONS: SectionDef[] = [
  {
    id: 'announcement',
    icon: Megaphone,
    title: 'Bandeau d\'annonce',
    isActive: (s) => !!s.announcementBar?.enabled,
    isCustomized: (s) => Array.isArray(s.announcementBar?.messages) && (s.announcementBar?.messages?.length || 0) > 0,
  },
  {
    id: 'navbar',
    icon: Navigation,
    title: 'Navbar',
    isActive: () => true,
    isCustomized: (s) => Array.isArray(s.navbar?.menuLinks) && (s.navbar?.menuLinks?.length || 0) > 0,
  },
  {
    id: 'hero',
    icon: SparklesIcon,
    title: 'Hero',
    isActive: (s) => s.showHero !== false,
    isCustomized: (s) => !!(s.heroTitle || s.heroSubtitle || s.heroImage),
  },
  {
    id: 'slider',
    icon: GalleryHorizontal,
    title: 'Slider',
    isActive: (s) => !!s.slider?.enabled,
    isCustomized: (s) => Array.isArray(s.slider?.slides) && (s.slider?.slides?.length || 0) > 0,
  },
  {
    id: 'products',
    icon: LayoutGrid,
    title: 'Grille produits',
    isActive: (s) => s.showProductsGrid !== false,
    isCustomized: (s) => !!s.productsGridTitle,
  },
  {
    id: 'testimonials',
    icon: MessageSquareQuote,
    title: 'Témoignages',
    isActive: (s) => Array.isArray(s.testimonials) && s.testimonials.length > 0,
    isCustomized: (s) => Array.isArray(s.testimonials) && s.testimonials.length > 0,
  },
  {
    id: 'footer',
    icon: PanelBottom,
    title: 'Pied de page',
    isActive: (s) => s.showFooter !== false,
    isCustomized: (s) => !!(s.footerNote || s.footer),
  },
];

// Whatsapp is configured here too but lives outside `storefront` settings,
// so it gets its own definition driven by the WhatsappSettings object.
interface WhatsappSectionDef {
  id: 'whatsapp';
  icon: typeof MessageCircle;
  title: string;
  isActive: (w: WhatsappSettings) => boolean;
  isCustomized: (w: WhatsappSettings) => boolean;
}
const WHATSAPP_SECTION: WhatsappSectionDef = {
  id: 'whatsapp',
  icon: MessageCircle,
  title: 'Bouton WhatsApp',
  isActive: (w) => !!w.enabled && !!w.phoneNumber?.trim(),
  isCustomized: (w) => !!w.phoneNumber?.trim(),
};

export default function StoreSectionsPage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [storefront, setStorefront] = useState<StorefrontSettings>({
    showHero: true,
    showProductsGrid: true,
    showFeatures: true,
    showFooter: true,
  });
  const [whatsapp, setWhatsapp] = useState<WhatsappSettings>({
    enabled: false,
    position: 'bottom-right',
    accentColor: '#25D366',
    pulse: true,
  });
  // COD form — shared with /checkout. Living here lets the seller manage
  // the entire product-page experience (sections + form) from one tab.
  const [codForm, setCodForm] = useState<CodFormSettings>({
    showEmail: false,
    requireEmail: false,
    showAddressLine2: false,
    showCity: false,
    showPostalCode: false,
    showState: false,
    showNotes: false,
    showQuantity: true,
  });
  // Tracks which section card is currently in the user's viewport so the
  // sticky left nav can highlight the matching nav item.
  const [activeSection, setActiveSection] = useState<string>('announcement');
  // Top-level scope: homepage sections vs product-page sections.
  // Seeded from ?scope=product so the per-product editor can deep-link
  // straight to the product-page tab + a named anchor (e.g. #product-page-style).
  const searchParams = useSearchParams();
  const initialScope = searchParams?.get('scope') === 'product' ? 'product' : 'home';
  const [scope, setScope] = useState<'home' | 'product'>(initialScope);
  // Quand `false`, l'éditeur ne montre que les sections recommandées par le
  // thème actif. Quand `true`, on affiche tout (utile pour réactiver une
  // section masquée par le thème mais que le vendeur veut quand même).
  const [showAllSections, setShowAllSections] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as { store: StoreType }).store;
        setStore(s);
        if (s.settings?.storefront) {
          setStorefront({
            showHero: true,
            showProductsGrid: true,
            showFeatures: true,
            showFooter: true,
            ...s.settings.storefront,
          });
        }
        if (s.settings?.whatsapp) {
          setWhatsapp({
            enabled: false,
            position: 'bottom-right',
            accentColor: '#25D366',
            pulse: true,
            ...s.settings.whatsapp,
          });
        }
        if (s.settings?.codForm) {
          setCodForm({
            showEmail: false,
            requireEmail: false,
            showAddressLine2: false,
            showCity: false,
            showPostalCode: false,
            showState: false,
            showNotes: false,
            showQuantity: true,
            ...s.settings.codForm,
          });
        }
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  // Highlight the section that's currently centered in the viewport.
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: 0 }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [loading]);

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const newSettings = { ...(store.settings || {}), storefront, whatsapp, codForm };
      const res = await storesApi.update(storeId, { settings: newSettings });
      const updated = (res.data as { store: StoreType }).store;
      setStore(updated);
      if (updated.settings?.storefront) {
        setStorefront({
          showHero: true,
          showProductsGrid: true,
          showFeatures: true,
          showFooter: true,
          ...updated.settings.storefront,
        });
      }
      if (updated.settings?.whatsapp) {
        setWhatsapp({
          enabled: false,
          position: 'bottom-right',
          accentColor: '#25D366',
          pulse: true,
          ...updated.settings.whatsapp,
        });
      }
      if (updated.settings?.codForm) {
        setCodForm({
          showEmail: false,
          requireEmail: false,
          showAddressLine2: false,
          showCity: false,
          showPostalCode: false,
          showState: false,
          showNotes: false,
          showQuantity: true,
          ...updated.settings.codForm,
        });
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[store/sections] save failed', err);
      setErrorMessage(extractApiError(err, "L'enregistrement a échoué. Réessaie."));
      setStatus('error');
    }
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  // Sync thème ↔ sections : filtrer les sections en fonction des
  // recommandations du thème actif. Le vendeur peut tout afficher via le
  // toggle pour réactiver une section masquée.
  const themeRec = getRecommendedSectionsForTheme(store.theme as Partial<ThemeTokens> | undefined);
  const visibleSections = showAllSections
    ? SECTIONS
    : SECTIONS.filter((s) => themeRec.recommended.has(s.id as ThemeSectionId));
  const visibleSectionIds = new Set(visibleSections.map((s) => s.id));
  const hiddenByThemeCount = SECTIONS.length - visibleSections.length;
  const isCardVisible = (id: string) => visibleSectionIds.has(id);

  const storefrontActiveCount = SECTIONS.filter((s) => s.isActive(storefront)).length;
  const totalSections = SECTIONS.length + 1; // + Whatsapp
  const activeCount = storefrontActiveCount + (WHATSAPP_SECTION.isActive(whatsapp) ? 1 : 0);

  // Helpers for the product-page sub-config — kept on storefront.productPage
  // so save batches both at once.
  const productPage: ProductPageSettings = storefront.productPage || {};
  const setProductPage = (next: ProductPageSettings) =>
    setStorefront({ ...storefront, productPage: next });

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Sections de la vitrine"
      description="Active, désactive et personnalise chaque bloc — page d'accueil ET page produit."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      {/* Scope switcher — pick which page's sections you're editing. */}
      <div className="mb-2 inline-flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-sm">
        {([
          { id: 'home',    label: "Page d'accueil",   help: 'Bandeau, hero, slider, produits, footer…' },
          { id: 'product', label: 'Page produit',     help: 'Badges, timer, témoignages, description…' },
        ] as const).map((opt) => {
          const active = scope === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScope(opt.id)}
              title={opt.help}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                active
                  ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-md'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {scope === 'product' ? (
        <ProductPageEditor
          cfg={productPage}
          onChange={setProductPage}
          codForm={codForm}
          onCodFormChange={setCodForm}
          currency={store.settings?.currency || 'TND'}
          storeType={store.storeType}
        />
      ) : (
      <div className="grid gap-4 md:gap-5 md:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_320px] lg:gap-6">
        {/* ── STICKY LEFT NAV — quick-jump to any section ──────────
            md+ : sticky pour rester accessible pendant qu'on scrolle les cards
            lg+ : 3 colonnes avec la preview à droite */}
        <aside className="md:sticky md:top-4 md:self-start lg:top-6">
          <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 px-1.5 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Sections
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {activeCount}/{totalSections} actives
              </span>
            </div>
            <nav className="space-y-0.5">
              {(() => {
                // Reorder the 4 movable sections (hero/slider/products/
                // testimonials) according to the seller's saved order; the
                // 3 fixed ones (announcement/navbar/footer) keep their
                // canonical position. Returns SECTIONS reshuffled.
                const movableIds = new Set<MovableSectionId>(['hero', 'slider', 'products', 'testimonials']);
                const order = resolveSectionOrder(storefront.sectionOrder);
                const byId = new Map(SECTIONS.map((s) => [s.id, s]));
                const ordered: typeof SECTIONS = [];
                for (const s of SECTIONS) {
                  if (movableIds.has(s.id as MovableSectionId)) break;
                  ordered.push(s);
                }
                for (const mid of order) {
                  const s = byId.get(mid);
                  if (s) ordered.push(s);
                }
                for (const s of SECTIONS) {
                  if (!movableIds.has(s.id as MovableSectionId) && !ordered.includes(s)) {
                    ordered.push(s);
                  }
                }
                // Filtre selon la recommandation du thème actif (sauf si
                // showAllSections est ON, auquel cas on garde tout).
                return ordered.filter((s) => visibleSectionIds.has(s.id));
              })().map((s, navIndex, navArr) => {
                const Icon = s.icon;
                const isActive = s.isActive(storefront);
                const isCustom = s.isCustomized(storefront);
                const isCurrent = activeSection === s.id;
                const isMovable = (['hero', 'slider', 'products', 'testimonials'] as const).includes(
                  s.id as MovableSectionId
                );
                const order = resolveSectionOrder(storefront.sectionOrder);
                const orderIdx = order.indexOf(s.id as MovableSectionId);
                const canMoveUp = isMovable && orderIdx > 0;
                const canMoveDown = isMovable && orderIdx >= 0 && orderIdx < order.length - 1;
                const move = (dir: -1 | 1) => {
                  const next = order.slice();
                  const swap = orderIdx + dir;
                  if (swap < 0 || swap >= next.length) return;
                  [next[orderIdx], next[swap]] = [next[swap], next[orderIdx]];
                  setStorefront({ ...storefront, sectionOrder: next });
                };
                void navIndex; void navArr;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => jumpTo(s.id)}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all',
                      isCurrent
                        ? 'bg-gradient-to-r from-primary/10 to-fuchsia-500/5 text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-md',
                        isActive
                          ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-sm'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-medium">{s.title}</span>
                    {/* Reorder arrows — only on movable sections. Click bubbles
                        up to the parent <button>, so we stopPropagation to keep
                        the jumpTo behavior intact. */}
                    {isMovable && (
                      <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                        <span
                          role="button"
                          tabIndex={canMoveUp ? 0 : -1}
                          aria-label="Monter"
                          onClick={(e) => { e.stopPropagation(); if (canMoveUp) move(-1); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && canMoveUp) { e.preventDefault(); move(-1); } }}
                          className={cn(
                            'grid h-5 w-5 place-items-center rounded transition-colors',
                            canMoveUp
                              ? 'cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground'
                              : 'cursor-not-allowed text-muted-foreground/30'
                          )}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </span>
                        <span
                          role="button"
                          tabIndex={canMoveDown ? 0 : -1}
                          aria-label="Descendre"
                          onClick={(e) => { e.stopPropagation(); if (canMoveDown) move(1); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && canMoveDown) { e.preventDefault(); move(1); } }}
                          className={cn(
                            'grid h-5 w-5 place-items-center rounded transition-colors',
                            canMoveDown
                              ? 'cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground'
                              : 'cursor-not-allowed text-muted-foreground/30'
                          )}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </span>
                      </span>
                    )}
                    {isActive ? (
                      <CheckCircle2
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          isCustom ? 'text-emerald-500' : 'text-emerald-400/50'
                        )}
                      />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    )}
                  </button>
                );
              })}
              {/* Whatsapp lives in settings.whatsapp, not storefront — same nav
                  shape so the seller sees it alongside the section toggles. */}
              {(() => {
                const Icon = WHATSAPP_SECTION.icon;
                const isActive = WHATSAPP_SECTION.isActive(whatsapp);
                const isCustom = WHATSAPP_SECTION.isCustomized(whatsapp);
                const isCurrent = activeSection === WHATSAPP_SECTION.id;
                return (
                  <button
                    key={WHATSAPP_SECTION.id}
                    type="button"
                    onClick={() => jumpTo(WHATSAPP_SECTION.id)}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all',
                      isCurrent
                        ? 'bg-gradient-to-r from-primary/10 to-fuchsia-500/5 text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-md',
                        isActive ? 'bg-emerald-500 text-white shadow-sm' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-medium">{WHATSAPP_SECTION.title}</span>
                    {isActive ? (
                      <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', isCustom ? 'text-emerald-500' : 'text-emerald-400/50')} />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    )}
                  </button>
                );
              })()}
            </nav>
            <div className="mt-2 rounded-lg bg-muted/40 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground">
              <strong className="text-foreground">Astuce :</strong> clique sur une section pour
              y aller. Le point vert indique qu&apos;elle est active et configurée.
            </div>
          </div>
        </aside>

        {/* ── RIGHT — scrollable section cards ──────────────────── */}
        <div className="space-y-5">
          {/* Bandeau info : explique quelles sections sont recommandées
              par le thème actif. Permet aussi de tout afficher si le
              vendeur veut réactiver une section masquée. */}
          {hiddenByThemeCount > 0 || !showAllSections ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-fuchsia-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-sm">
                  <Palette className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">
                    {hiddenByThemeCount > 0 && !showAllSections
                      ? `${hiddenByThemeCount} section${hiddenByThemeCount > 1 ? 's' : ''} masquée${hiddenByThemeCount > 1 ? 's' : ''} par le thème`
                      : 'Toutes les sections affichées'}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{themeRec.rationale}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllSections((v) => !v)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
              >
                {showAllSections ? <><EyeOff className="h-3 w-3" /> Replier sur le thème</> : <><Eye className="h-3 w-3" /> Afficher tout</>}
              </button>
            </div>
          ) : null}

          <Card id="announcement" className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="h-4 w-4 text-primary" />
                Bandeau d&apos;annonce
              </CardTitle>
              <CardDescription>
                Bande fine au-dessus du menu — promos, livraison gratuite, codes
                de remise. Texte fixe ou défilant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnnouncementBarEditor
                bar={storefront.announcementBar}
                onChange={(announcementBar) => setStorefront({ ...storefront, announcementBar })}
              />
            </CardContent>
          </Card>

          <Card id="navbar" className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Navigation className="h-4 w-4 text-primary" />
                Navbar
              </CardTitle>
              <CardDescription>
                Menu de navigation affiché en haut de chaque page. Tu peux ajouter
                des liens vers tes collections ou pages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NavbarEditor
                navbar={storefront.navbar}
                onChange={(navbar) => setStorefront({ ...storefront, navbar })}
              />
            </CardContent>
          </Card>

          {isCardVisible('hero') && <Card id="hero" className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SparklesIcon className="h-4 w-4 text-primary" />
                Hero
              </CardTitle>
              <CardDescription>
                Bandeau d&apos;accueil avec titre, sous-titre et image de fond.
                Premier contact visuel avec ton client.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldToggle
                label="Afficher le hero"
                sublabel="Grande zone en haut avec titre + sous-titre"
                checked={storefront.showHero !== false}
                onChange={(v) => setStorefront({ ...storefront, showHero: v })}
              />
              {storefront.showHero !== false && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="hero-title">Titre principal du hero</Label>
                    <Input
                      id="hero-title"
                      placeholder="Ex: Bijoux artisanaux du Sahel"
                      value={storefront.heroTitle || ''}
                      onChange={(e) => setStorefront({ ...storefront, heroTitle: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">Vide = nom de la boutique.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hero-subtitle">Sous-titre du hero</Label>
                    <Input
                      id="hero-subtitle"
                      placeholder="Ex: Pièces uniques fabriquées à la main, livrées en 48h"
                      value={storefront.heroSubtitle || ''}
                      onChange={(e) => setStorefront({ ...storefront, heroSubtitle: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">Vide = description de la boutique.</p>
                  </div>
                  {/* Image bureau (16:9 large) + image mobile (4:5 portrait) :
                      la vitrine swap automatiquement selon la taille d'écran.
                      Si seule la version bureau est fournie, on l'utilise sur
                      mobile aussi (rétro-compat). */}
                  <div className="space-y-1.5">
                    <MediaPicker
                      storeId={storeId}
                      value={storefront.heroImage}
                      onChange={(url) => setStorefront({ ...storefront, heroImage: url || '' })}
                      label="🖥️ Image de fond — bureau (optionnel)"
                      shape="wide"
                      helper="Format paysage 1920×1080 (16:9) recommandé."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <MediaPicker
                      storeId={storeId}
                      value={storefront.heroImageMobile}
                      onChange={(url) => setStorefront({ ...storefront, heroImageMobile: url || '' })}
                      label="📱 Image de fond — mobile (optionnel)"
                      shape="square"
                      helper="Format portrait 1080×1350 (4:5) ou carré recommandé. Vide = même image que bureau."
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="hero-video">🎬 Vidéo de fond — bureau (optionnel — gagne sur l&apos;image)</Label>
                    <Input
                      id="hero-video"
                      placeholder="Ex: https://youtu.be/abc123 · https://vimeo.com/123456 · /uploads/promo.mp4"
                      value={storefront.heroVideo || ''}
                      onChange={(e) => setStorefront({ ...storefront, heroVideo: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      YouTube, Vimeo, ou fichier <code className="rounded bg-muted px-1">.mp4</code>/<code className="rounded bg-muted px-1">.webm</code>.
                      Lecture autoplay muet en boucle.
                    </p>
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="hero-video-mobile">📱 Vidéo de fond — mobile (optionnel)</Label>
                    <Input
                      id="hero-video-mobile"
                      placeholder="Ex: /uploads/promo-vertical.mp4 (format portrait recommandé)"
                      value={storefront.heroVideoMobile || ''}
                      onChange={(e) => setStorefront({ ...storefront, heroVideoMobile: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Vide = même vidéo que bureau. Pour un rendu propre sur mobile, recadre en vertical (9:16) ou carré.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>}

          {isCardVisible('slider') && <Card id="slider" className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GalleryHorizontal className="h-4 w-4 text-primary" />
                Slider
              </CardTitle>
              <CardDescription>
                Carrousel d&apos;images animé sous le hero — idéal pour mettre en
                avant plusieurs offres ou collections.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SliderEditor
                storeId={storeId}
                slider={storefront.slider}
                onChange={(slider) => setStorefront({ ...storefront, slider })}
              />
            </CardContent>
          </Card>}

          {isCardVisible('products') && <Card id="products" className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutGrid className="h-4 w-4 text-primary" />
                Grille des produits
              </CardTitle>
              <CardDescription>
                Liste des produits publiés, avec titre éditable. Le cœur de ta
                vitrine.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldToggle
                label="Afficher la grille"
                sublabel="Liste des produits publiés sur la page d'accueil"
                checked={storefront.showProductsGrid !== false}
                onChange={(v) => setStorefront({ ...storefront, showProductsGrid: v })}
              />
              {storefront.showProductsGrid !== false && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="grid-title">Titre de la section</Label>
                      <Input
                        id="grid-title"
                        placeholder="Ex: Nos produits · Le catalogue · Découvrir"
                        value={storefront.productsGridTitle || ''}
                        onChange={(e) => setStorefront({ ...storefront, productsGridTitle: e.target.value })}
                      />
                      <p className="text-[11px] text-muted-foreground">Vide = « Nos produits ».</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="grid-subtitle">Sous-titre (optionnel)</Label>
                      <Input
                        id="grid-subtitle"
                        placeholder="Ex: Tous nos produits, choisis avec soin"
                        value={storefront.productsGridSubtitle || ''}
                        onChange={(e) => setStorefront({ ...storefront, productsGridSubtitle: e.target.value })}
                      />
                      <p className="text-[11px] text-muted-foreground">Vide = texte par défaut.</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="grid-max">Nombre maximum de produits</Label>
                      <Input
                        id="grid-max"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0 = tous"
                        value={storefront.productsGridMaxItems ?? ''}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setStorefront({
                            ...storefront,
                            productsGridMaxItems: Number.isFinite(n) && n > 0 ? n : undefined,
                          });
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">Vide ou 0 = tous les produits publiés.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="grid-cols">Colonnes par ligne</Label>
                      <select
                        id="grid-cols"
                        className="h-10 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                        value={storefront.productsGridColumns ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setStorefront({
                            ...storefront,
                            productsGridColumns: v === '' ? undefined : (parseInt(v, 10) as 2 | 3 | 4),
                          });
                        }}
                      >
                        <option value="">Auto (selon le thème)</option>
                        <option value="2">2 colonnes</option>
                        <option value="3">3 colonnes</option>
                        <option value="4">4 colonnes</option>
                      </select>
                      <p className="text-[11px] text-muted-foreground">Le mobile garde 2 colonnes max.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="grid-sort">Tri des produits</Label>
                      <select
                        id="grid-sort"
                        className="h-10 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                        value={storefront.productsGridSort ?? 'recent'}
                        onChange={(e) => {
                          const v = e.target.value as 'recent' | 'price-asc' | 'price-desc' | 'name-asc';
                          setStorefront({ ...storefront, productsGridSort: v });
                        }}
                      >
                        <option value="recent">Plus récents en premier</option>
                        <option value="price-asc">Prix croissant</option>
                        <option value="price-desc">Prix décroissant</option>
                        <option value="name-asc">Nom (A → Z)</option>
                      </select>
                    </div>
                  </div>

                  <FieldToggle
                    label="Masquer les produits en rupture de stock"
                    sublabel="Par défaut, ils sont affichés avec un badge 'Rupture'."
                    checked={!!storefront.productsGridHideOutOfStock}
                    onChange={(v) => setStorefront({ ...storefront, productsGridHideOutOfStock: v })}
                  />
                </div>
              )}
            </CardContent>
          </Card>}

          {isCardVisible('testimonials') && <Card id="testimonials" className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquareQuote className="h-4 w-4 text-primary" />
                Témoignages clients
              </CardTitle>
              <CardDescription>
                Avis vérifiés affichés sous la grille — gros levier de conversion.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TestimonialsEditor
                storeId={storeId}
                testimonials={storefront.testimonials}
                onChange={(testimonials) => setStorefront({ ...storefront, testimonials })}
              />
            </CardContent>
          </Card>}

          {isCardVisible('footer') && <Card id="footer" className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PanelBottom className="h-4 w-4 text-primary" />
                Pied de page
              </CardTitle>
              <CardDescription>
                Réassurance, réseaux sociaux, coordonnées et liens additionnels —
                ferme la confiance en bas de page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldToggle
                label="Bandeau de réassurance"
                sublabel="Livraison rapide · Paiement sécurisé · Support"
                checked={storefront.showFeatures !== false}
                onChange={(v) => setStorefront({ ...storefront, showFeatures: v })}
              />
              <FieldToggle
                label="Afficher le pied de page"
                sublabel="Mentions et liens vers les pages"
                checked={storefront.showFooter !== false}
                onChange={(v) => setStorefront({ ...storefront, showFooter: v })}
              />
              {storefront.showFooter !== false && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="footer-note">Note légale du pied de page (optionnel)</Label>
                    <Input
                      id="footer-note"
                      placeholder="Ex: © 2026 Ma Boutique · Tous droits réservés"
                      value={storefront.footerNote || ''}
                      onChange={(e) => setStorefront({ ...storefront, footerNote: e.target.value })}
                    />
                  </div>
                  <FooterEditor
                    footer={storefront.footer}
                    onChange={(footer) => setStorefront({ ...storefront, footer })}
                  />
                </div>
              )}
            </CardContent>
          </Card>}

          <Card id="whatsapp" className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                Bouton WhatsApp
              </CardTitle>
              <CardDescription>
                Un bouton flottant sur ta vitrine — le client te contacte
                directement sur WhatsApp en un clic.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WhatsappEditor cfg={whatsapp} onChange={setWhatsapp} />
            </CardContent>
          </Card>
        </div>

        {/* ── STICKY RIGHT — real-time mini-storefront mock ──────
            Masqué sous lg pour donner toute la place à l'édition sur
            tablette ; le vendeur peut prévisualiser via le bouton
            "Voir la boutique" du shell parent ou en ouvrant l'URL
            publique dans un autre onglet. */}
        <aside className="hidden lg:sticky lg:top-6 lg:self-start lg:block">
          <StoreHomepageLivePreview
            storeName={store.name}
            logo={store.logo}
            favicon={store.favicon}
            theme={store.theme as Partial<ThemeTokens> | undefined}
            storefront={storefront}
            whatsapp={whatsapp}
            currency={store.settings?.currency}
            direction={store.settings?.direction}
          />
        </aside>
      </div>
      )}
    </StoreSubPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// WhatsApp editor — toggle + phone + message + position + color + preview
// ─────────────────────────────────────────────────────────────────────

function WhatsappEditor({
  cfg,
  onChange,
}: {
  cfg: WhatsappSettings;
  onChange: (next: WhatsappSettings) => void;
}) {
  const positions: Array<{ v: NonNullable<WhatsappSettings['position']>; label: string; cls: string }> = [
    { v: 'top-left',     label: '↖ Haut gauche',  cls: 'top-1 left-1' },
    { v: 'top-right',    label: '↗ Haut droite',  cls: 'top-1 right-1' },
    { v: 'bottom-left',  label: '↙ Bas gauche',   cls: 'bottom-1 left-1' },
    { v: 'bottom-right', label: '↘ Bas droite',   cls: 'bottom-1 right-1' },
  ];
  const accent = cfg.accentColor || '#25D366';
  const active = !!cfg.enabled && !!cfg.phoneNumber?.trim();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
      {/* ── LEFT — form ────────────────────────────────────────── */}
      <div className="space-y-4">
        <FieldToggle
          label="Activer le bouton WhatsApp"
          sublabel="Affiché sur toutes les pages de la boutique"
          checked={!!cfg.enabled}
          onChange={(v) => onChange({ ...cfg, enabled: v })}
        />

        {cfg.enabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wa-phone">Numéro WhatsApp (avec indicatif)</Label>
                <Input
                  id="wa-phone"
                  placeholder="+216 55 000 000"
                  value={cfg.phoneNumber || ''}
                  onChange={(e) => onChange({ ...cfg, phoneNumber: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Format international. Les espaces / tirets sont supprimés automatiquement.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-color">Couleur du bouton</Label>
                <div className="flex h-10 items-center gap-2">
                  <input
                    id="wa-color"
                    type="color"
                    value={accent}
                    onChange={(e) => onChange({ ...cfg, accentColor: e.target.value })}
                    className="h-9 w-11 cursor-pointer rounded-md border border-border/60 bg-background p-0"
                  />
                  <Input
                    value={cfg.accentColor || ''}
                    onChange={(e) => onChange({ ...cfg, accentColor: e.target.value || undefined })}
                    placeholder="#25D366"
                    className="h-9 flex-1 font-mono text-xs"
                  />
                  {cfg.accentColor && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...cfg, accentColor: undefined })}
                      className="rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Effacer (vert WhatsApp par défaut)"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wa-msg">Message pré-rempli (optionnel)</Label>
              <Input
                id="wa-msg"
                placeholder="Bonjour, j'ai une question sur un produit…"
                value={cfg.message || ''}
                onChange={(e) => onChange({ ...cfg, message: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Pré-rempli dans WhatsApp à l&apos;ouverture. Vide = aucun message.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Position du bouton</Label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {positions.map((opt) => {
                  const isActive = (cfg.position || 'bottom-right') === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => onChange({ ...cfg, position: opt.v })}
                      className={cn(
                        'rounded-lg border px-2.5 py-2 text-xs font-medium transition-all',
                        isActive
                          ? 'border-emerald-500 bg-emerald-500/5 text-foreground shadow-sm'
                          : 'border-border/60 text-muted-foreground hover:border-emerald-500/40'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <FieldToggle
              label="Animation de pulsation"
              sublabel="Ondes vertes autour du bouton — attire l'œil"
              checked={cfg.pulse !== false}
              onChange={(v) => onChange({ ...cfg, pulse: v })}
            />
          </>
        )}
      </div>

      {/* ── RIGHT — live preview ───────────────────────────────── */}
      <aside className="space-y-2">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Aperçu position
        </Label>
        <div className="relative h-56 overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-card">
          {/* Fake browser chrome to convey "this is on the storefront" */}
          <div className="absolute inset-x-0 top-0 flex items-center gap-1 border-b border-border/40 bg-card/60 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
          </div>
          <div className="absolute inset-x-3 top-7 space-y-1">
            <div className="h-2 w-2/3 rounded bg-muted-foreground/15" />
            <div className="h-2 w-1/2 rounded bg-muted-foreground/15" />
            <div className="h-12 rounded bg-muted-foreground/10" />
            <div className="h-2 w-1/3 rounded bg-muted-foreground/15" />
          </div>

          {active && (
            <div
              className={cn(
                'absolute',
                positions.find((p) => p.v === (cfg.position || 'bottom-right'))?.cls
              )}
            >
              <span
                className="relative grid h-8 w-8 place-items-center rounded-full text-white shadow-md"
                style={{ backgroundColor: accent }}
              >
                <MessageCircle className="h-4 w-4" />
                {cfg.pulse !== false && (
                  <span
                    aria-hidden
                    className="wa-prev-pulse pointer-events-none absolute inset-0 rounded-full"
                    style={{ border: `2px solid ${accent}` }}
                  />
                )}
              </span>
            </div>
          )}
          {!active && (
            <div className="absolute inset-x-2 bottom-2 text-center text-[10px] text-muted-foreground">
              Active + numéro pour voir l&apos;aperçu
            </div>
          )}
          <style jsx>{`
            @keyframes waPrevPulse {
              0%   { transform: scale(1);    opacity: 0.55; }
              70%  { transform: scale(1.85); opacity: 0;    }
              100% { transform: scale(1.85); opacity: 0;    }
            }
            .wa-prev-pulse { animation: waPrevPulse 2.2s ease-out infinite; }
          `}</style>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Le bouton apparaît sur chaque page de la boutique (accueil, produit, info, checkout).
        </p>
      </aside>
    </div>
  );
}
