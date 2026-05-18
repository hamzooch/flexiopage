/**
 * Wishlist persistence — strictly client-side, scoped per-store in
 * localStorage. No backend: a wishlist is throwaway personal context,
 * not data we need to sync across devices for an anonymous shopper.
 *
 * Storage shape:
 *   key   = `flexio.wishlist:<storeSlug>`
 *   value = JSON.stringify([{ id, slug, name, image, price, currency, addedAt }])
 */

export interface WishlistItem {
  id: string;
  slug: string;
  name: string;
  image?: string;
  price: number;
  currency: string;
  addedAt: number;
}

const KEY = (storeSlug: string) => `flexio.wishlist:${storeSlug}`;

function safeRead(storeSlug: string): WishlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY(storeSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WishlistItem[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(storeSlug: string, items: WishlistItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY(storeSlug), JSON.stringify(items));
    // Broadcast so multiple components on the page (heart icon + counter)
    // re-render simultaneously. Custom event name namespaced to avoid
    // clashing with anything else listening on 'storage'.
    window.dispatchEvent(new CustomEvent('flexio:wishlist', { detail: { storeSlug } }));
  } catch {
    // Quota or private mode — silently drop the update; the heart icon
    // will still flip back on next render because we re-read from storage.
  }
}

export function getWishlist(storeSlug: string): WishlistItem[] {
  return safeRead(storeSlug);
}

export function isInWishlist(storeSlug: string, productId: string): boolean {
  return safeRead(storeSlug).some((i) => i.id === productId);
}

export function toggleWishlist(storeSlug: string, item: Omit<WishlistItem, 'addedAt'>): boolean {
  const items = safeRead(storeSlug);
  const i = items.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    items.splice(i, 1);
    safeWrite(storeSlug, items);
    return false;
  }
  items.push({ ...item, addedAt: Date.now() });
  safeWrite(storeSlug, items);
  return true;
}

export function removeFromWishlist(storeSlug: string, productId: string): void {
  const next = safeRead(storeSlug).filter((i) => i.id !== productId);
  safeWrite(storeSlug, next);
}

export function clearWishlist(storeSlug: string): void {
  safeWrite(storeSlug, []);
}
