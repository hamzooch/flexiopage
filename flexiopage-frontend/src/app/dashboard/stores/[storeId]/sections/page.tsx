'use client';

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

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const newSettings = { ...(store.settings || {}), storefront };
      const res = await storesApi.update(storeId, { settings: newSettings });
      // Trust the server's view of the store, not what we sent — the backend
      // may normalize, unescape, or default fields. Re-syncing local state
      // (both the full store and the storefront form) guarantees the UI shows
      // what's actually persisted.
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
      <Card>
        <CardHeader>
          <CardTitle>Bandeau d&apos;annonce</CardTitle>
          <CardDescription>Bande fine au-dessus du menu — promos, livraison gratuite, remises. Texte fixe ou défilant.</CardDescription>
        </CardHeader>
        <CardContent>
          <AnnouncementBarEditor
            bar={storefront.announcementBar}
            onChange={(announcementBar) => setStorefront({ ...storefront, announcementBar })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navbar</CardTitle>
          <CardDescription>Menu de navigation affiché en haut de chaque page.</CardDescription>
        </CardHeader>
        <CardContent>
          <NavbarEditor
            navbar={storefront.navbar}
            onChange={(navbar) => setStorefront({ ...storefront, navbar })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hero</CardTitle>
          <CardDescription>Bandeau d&apos;accueil avec titre, sous-titre et image de fond.</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Slider</CardTitle>
          <CardDescription>Carrousel d&apos;images animé sous le hero.</CardDescription>
        </CardHeader>
        <CardContent>
          <SliderEditor
            storeId={storeId}
            slider={storefront.slider}
            onChange={(slider) => setStorefront({ ...storefront, slider })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grille des produits</CardTitle>
          <CardDescription>Liste des produits publiés, avec titre éditable.</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Témoignages clients</CardTitle>
          <CardDescription>Avis vérifiés affichés sous la grille des produits.</CardDescription>
        </CardHeader>
        <CardContent>
          <TestimonialsEditor
            storeId={storeId}
            testimonials={storefront.testimonials}
            onChange={(testimonials) => setStorefront({ ...storefront, testimonials })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pied de page</CardTitle>
          <CardDescription>Réseaux sociaux, coordonnées de contact et liens additionnels.</CardDescription>
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
    </StoreSubPageShell>
  );
}
