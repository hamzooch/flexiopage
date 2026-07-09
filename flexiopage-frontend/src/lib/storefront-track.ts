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

export type StoreEventType = 'page_view' | 'product_view' | 'add_to_cart';

const SOURCE_KEY = 'flexio_src';

/**
 * Source d'arrivée du visiteur. Priorité :
 *   1. utm_source de l'URL courante (pub Meta/TikTok/Google)
 *   2. valeur mémorisée à la 1ère visite (localStorage — évite d'écraser
 *      "facebook" par "direct" quand le visiteur navigue en interne)
 *   3. undefined → le backend retombera sur le Referer, puis 'direct'.
 */
function resolveSource(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const utm = new URLSearchParams(window.location.search).get('utm_source');
    if (utm) {
      localStorage.setItem(SOURCE_KEY, utm);
      return utm;
    }
    const stored = localStorage.getItem(SOURCE_KEY);
    return stored || undefined;
  } catch {
    return undefined;
  }
}

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
    source: resolveSource(),
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
