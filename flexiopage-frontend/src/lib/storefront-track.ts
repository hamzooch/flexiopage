/**
 * Anonymous storefront funnel tracking — feeds the seller's "Suivi" dashboard.
 *
 * One anonymous session id per visitor (localStorage), sent with every event
 * so the backend can correlate add_to_cart -> purchase and surface abandoned
 * carts. No PII. Events are fire-and-forget via sendBeacon (survives page
 * navigation) with a keepalive fetch fallback.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const SID_KEY = 'flexio_sid';

/** Stable anonymous visitor id, created on first use. */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid =
        (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return '';
  }
}

export type StoreEventType = 'product_view' | 'add_to_cart';

/** Fire-and-forget — never throws, never blocks the storefront. */
export function trackStoreEvent(input: {
  storeId?: string;
  productId?: string;
  type: StoreEventType;
}): void {
  if (typeof window === 'undefined' || !input.storeId) return;
  const sessionId = getSessionId();
  if (!sessionId) return;
  const body = JSON.stringify({
    storeId: input.storeId,
    productId: input.productId,
    type: input.type,
    sessionId,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_BASE}/api/public/track`, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(`${API_BASE}/api/public/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // tracking must never break the page
  }
}
