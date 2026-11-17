'use client';

/**
 * Fires a one-shot storefront funnel event after hydration. Drop it on a
 * server-rendered page (e.g. the product page) to record a `product_view`.
 */
import { useEffect } from 'react';
import { trackStoreEvent, type StoreEventType } from '@/lib/storefront-track';

export function StoreTracker({
  storeId,
  productId,
  variantId,
  type,
}: {
  storeId?: string;
  productId?: string;
  /** Variant A/B servi au visiteur, propagé à l'event de funnel. */
  variantId?: string;
  type: StoreEventType;
}) {
  useEffect(() => {
    trackStoreEvent({ storeId, productId, variantId, type });
    // Fire once per mount — product/store/variant ids are stable for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
