'use client';

/**
 * Éditeur de la page produit publique — extrait de l'onglet « Page produit »
 * qui vivait dans /sections. Page dédiée pour rendre l'accès direct depuis
 * le hub boutique ("Modifier page produit") et clarifier que cette config
 * couvre TOUTE la fiche produit (sections, ordre, badges, timer, formulaire
 * COD inline, style visuel global) — distincte des sections de la home.
 *
 * Les réglages persistent sur `store.settings.storefront.productPage` et
 * `store.settings.codForm` (champs partagés avec /checkout, save batché).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { storesApi, extractApiError } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart } from 'lucide-react';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import {
  type CodFormSettings,
  type StorefrontSettings,
  type StoreType,
  type ThanksPageSettings,
} from '@/components/dashboard/store-editor';
import { ProductPageEditor } from '@/components/dashboard/product-page-editor';
import type { ProductPageSettings } from '@/lib/product-page-order';

export default function StoreProductPageSettings() {
  const params = useParams();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [storefront, setStorefront] = useState<StorefrontSettings>({});
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
  const [thanksPage, setThanksPage] = useState<ThanksPageSettings>({});

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as { store: StoreType }).store;
        setStore(s);
        if (s.settings?.storefront) setStorefront(s.settings.storefront);
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
        if (s.settings?.thanksPage) setThanksPage(s.settings.thanksPage);
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const newSettings = { ...(store.settings || {}), storefront, codForm, thanksPage };
      const res = await storesApi.update(storeId, { settings: newSettings });
      const updated = (res.data as { store: StoreType }).store;
      setStore(updated);
      if (updated.settings?.storefront) setStorefront(updated.settings.storefront);
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
      if (updated.settings?.thanksPage) setThanksPage(updated.settings.thanksPage);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[store/product-page] save failed', err);
      setErrorMessage(extractApiError(err, "L'enregistrement a échoué. Réessaie."));
      setStatus('error');
    }
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const productPage: ProductPageSettings = storefront.productPage || {};
  const setProductPage = (next: ProductPageSettings) =>
    setStorefront({ ...storefront, productPage: next });

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Modifier page produit"
      description="Sections, ordre, badges, timer, témoignages, style visuel + formulaire COD inline. Les réglages s'appliquent à toutes les fiches produit de la boutique."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <ProductPageEditor
        cfg={productPage}
        onChange={setProductPage}
        codForm={codForm}
        onCodFormChange={setCodForm}
        currency={store.settings?.currency || 'TND'}
        storeType={store.storeType}
        storeId={store._id}
      />

      {/* ── Page de remerciement ──────────────────────────────────────
          Customisable par le vendeur : titre, sous-titre, message,
          libellé du CTA. Le branding (logo, nom, favicon) vient
          automatiquement de la fiche store — pas besoin de l'éditer
          ici. Champs vides = on retombe sur les defaults FlexioPage. */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="h-4 w-4 text-primary" />
            Page de remerciement
          </CardTitle>
          <CardDescription className="text-xs">
            Affichée après la confirmation de commande COD. Le logo + nom de
            ta boutique apparaissent automatiquement à la place de FlexioPage —
            tu peux en plus personnaliser les textes ci-dessous.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="thx-title" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Titre principal
              </Label>
              <Input
                id="thx-title"
                value={thanksPage.title || ''}
                onChange={(e) => setThanksPage({ ...thanksPage, title: e.target.value || undefined })}
                placeholder="Commande confirmée 🎉"
                className="h-10 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="thx-cta" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Bouton retour boutique
              </Label>
              <Input
                id="thx-cta"
                value={thanksPage.ctaLabel || ''}
                onChange={(e) => setThanksPage({ ...thanksPage, ctaLabel: e.target.value || undefined })}
                placeholder={`Continuer sur ${store.name}`}
                className="h-10 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="thx-subtitle" className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Sous-titre
            </Label>
            <Input
              id="thx-subtitle"
              value={thanksPage.subtitle || ''}
              onChange={(e) => setThanksPage({ ...thanksPage, subtitle: e.target.value || undefined })}
              placeholder="Merci pour ta confiance ! Ta commande est en cours de traitement."
              className="h-10 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="thx-message" className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Mot du vendeur (optionnel)
            </Label>
            <textarea
              id="thx-message"
              value={thanksPage.message || ''}
              onChange={(e) => setThanksPage({ ...thanksPage, message: e.target.value || undefined })}
              placeholder="Tu seras contacté par notre livreur dans les 24h pour confirmer ta commande. Merci de faire confiance à notre boutique 💚"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              Affiché en gros sous le titre. Saute des lignes pour aérer.
            </p>
          </div>
        </CardContent>
      </Card>
    </StoreSubPageShell>
  );
}
