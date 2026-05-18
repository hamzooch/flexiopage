'use client';

/**
 * Store sections editor — every block on the storefront is configurable
 * here. Left side: sticky vertical nav listing all sections (with on/off
 * status). Right side: scrolling cards.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
  type StorefrontSettings,
  type StoreType,
} from '@/components/dashboard/store-editor';
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
    isCustomized: (s) => !!(s.announcementBar?.message),
  },
  {
    id: 'navbar',
    icon: Navigation,
    title: 'Navbar',
    isActive: () => true,
    isCustomized: (s) => Array.isArray(s.navbar?.links) && (s.navbar?.links?.length || 0) > 0,
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
  // Tracks which section card is currently in the user's viewport so the
  // sticky left nav can highlight the matching nav item.
  const [activeSection, setActiveSection] = useState<string>('announcement');

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
      const newSettings = { ...(store.settings || {}), storefront };
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

  const activeCount = SECTIONS.filter((s) => s.isActive(storefront)).length;

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Sections de la vitrine"
      description="Active, désactive et personnalise chaque bloc affiché sur la page d'accueil de ta boutique."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* ── STICKY LEFT NAV — quick-jump to any section ────────── */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 px-1.5 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Sections
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {activeCount}/{SECTIONS.length} actives
              </span>
            </div>
            <nav className="space-y-0.5">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const isActive = s.isActive(storefront);
                const isCustom = s.isCustomized(storefront);
                const isCurrent = activeSection === s.id;
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
            </nav>
            <div className="mt-2 rounded-lg bg-muted/40 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground">
              <strong className="text-foreground">Astuce :</strong> clique sur une section pour
              y aller. Le point vert indique qu&apos;elle est active et configurée.
            </div>
          </div>
        </aside>

        {/* ── RIGHT — scrollable section cards ──────────────────── */}
        <div className="space-y-5">
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

          <Card id="hero" className="scroll-mt-6">
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
                  <div className="sm:col-span-2">
                    <MediaPicker
                      storeId={storeId}
                      value={storefront.heroImage}
                      onChange={(url) => setStorefront({ ...storefront, heroImage: url || '' })}
                      label="Image de fond du hero (optionnel)"
                      shape="wide"
                      helper="Téléverse une image ou choisis-la dans ta galerie (1920×1080 recommandé)."
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="slider" className="scroll-mt-6">
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
          </Card>

          <Card id="products" className="scroll-mt-6">
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
                <div className="space-y-1.5">
                  <Label htmlFor="grid-title">Titre de la section produits</Label>
                  <Input
                    id="grid-title"
                    placeholder="Ex: Nos produits · Le catalogue · Découvrir"
                    value={storefront.productsGridTitle || ''}
                    onChange={(e) => setStorefront({ ...storefront, productsGridTitle: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">Vide = « Nos produits » par défaut.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="testimonials" className="scroll-mt-6">
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
          </Card>

          <Card id="footer" className="scroll-mt-6">
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
          </Card>
        </div>
      </div>
    </StoreSubPageShell>
  );
}
