'use client';

/**
 * Client component that fires a marketing event (ViewContent, InitiateCheckout,
 * Purchase) once after hydration. Safe to render even if no pixel is configured
 * — it checks for window.fbq / window.gtag / window.ttq before calling.
 */
import { useEffect } from 'react';

type FbqEvent = 'ViewContent' | 'InitiateCheckout' | 'AddToCart' | 'Purchase';

declare global {
  interface Window {
    fbq?: (action: 'track', event: FbqEvent, data?: Record<string, unknown>) => void;
    gtag?: (cmd: 'event', name: string, params?: Record<string, unknown>) => void;
    ttq?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

export interface TrackPayload {
  event: FbqEvent;
  /** Item content ids for the FB pixel (productId or productSlug). */
  contentIds?: string[];
  /** Friendly name shown in event reports. */
  contentName?: string;
  /** 'product' | 'product_group' — defaults to 'product'. */
  contentType?: 'product' | 'product_group';
  value?: number;
  currency?: string;
  /** Per-event extras. For Purchase: orderNumber. */
  transactionId?: string;
  /** Line items, used for GA4 + TikTok. */
  items?: Array<{ id: string; name: string; quantity?: number; price?: number }>;
}

function gaEventName(event: FbqEvent): string {
  switch (event) {
    case 'ViewContent': return 'view_item';
    case 'InitiateCheckout': return 'begin_checkout';
    case 'AddToCart': return 'add_to_cart';
    case 'Purchase': return 'purchase';
  }
}

/** Imperative version of TrackEvent — call from event handlers (e.g. on COD
 * form first interaction). Safe to call before any pixel is loaded; each
 * branch checks for the global before firing. */
export function fireMarketingEvent(payload: TrackPayload): void {
  if (typeof window === 'undefined') return;
  const { event, contentIds, contentName, contentType, value, currency, transactionId, items } = payload;

  if (window.fbq) {
    const fbData: Record<string, unknown> = {};
    if (contentIds?.length) fbData.content_ids = contentIds;
    if (contentName) fbData.content_name = contentName;
    fbData.content_type = contentType || 'product';
    if (typeof value === 'number') fbData.value = value;
    if (currency) fbData.currency = currency;
    try { window.fbq('track', event, fbData); } catch { /* noop */ }
  }

  if (window.gtag) {
    const gaParams: Record<string, unknown> = {};
    if (typeof value === 'number') gaParams.value = value;
    if (currency) gaParams.currency = currency;
    if (transactionId) gaParams.transaction_id = transactionId;
    if (items?.length) {
      gaParams.items = items.map((it) => ({
        item_id: it.id,
        item_name: it.name,
        quantity: it.quantity || 1,
        price: it.price,
      }));
    }
    try { window.gtag('event', gaEventName(event), gaParams); } catch { /* noop */ }
  }

  if (window.ttq) {
    const ttData: Record<string, unknown> = {};
    if (typeof value === 'number') ttData.value = value;
    if (currency) ttData.currency = currency;
    if (contentIds?.length) ttData.content_id = contentIds[0];
    if (contentName) ttData.content_name = contentName;
    try { window.ttq.track(event, ttData); } catch { /* noop */ }
  }
}

export function TrackEvent({ payload }: { payload: TrackPayload }) {
  useEffect(() => {
    fireMarketingEvent(payload);
  }, [payload]);
  return null;
}
