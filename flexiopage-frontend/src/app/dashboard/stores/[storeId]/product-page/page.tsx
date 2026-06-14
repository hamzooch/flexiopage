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
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import {
  type CodFormSettings,
  type StorefrontSettings,
  type StoreType,
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
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const newSettings = { ...(store.settings || {}), storefront, codForm };
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
      />
    </StoreSubPageShell>
  );
}
