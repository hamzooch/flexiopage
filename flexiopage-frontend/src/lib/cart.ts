/**
 * Cart persistence — strictly client-side, scoped per-store in
 * localStorage. Same pattern as `lib/wishlist`: no backend, no auth,
 * the cart is a personal shopping list that lives in the browser until
 * the buyer submits it via the multi-item COD checkout.
 *
 * Storage shape:
 *   key   = `flexio.cart:<storeSlug>`
 *   value = JSON.stringify([{ id, slug, name, image, price, currency, variantName?, quantity, addedAt }])
 */

export interface CartItem {
  id: string;
  slug: string;
  name: string;
  image?: string;
  price: number;
  currency: string;
  /** Optional variant — pairs with the id when the same product has multiple variants. */
  variantName?: string;
  quantity: number;
  addedAt: number;
}

const KEY = (storeSlug: string) => `flexio.cart:${storeSlug}`;

function safeRead(storeSlug: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY(storeSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(storeSlug: string, items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY(storeSlug), JSON.stringify(items));
    // Broadcast so the navbar badge + cart page + any other listener
    // re-render on the same tab. Namespaced to avoid clashing.
    window.dispatchEvent(new CustomEvent('flexio:cart', { detail: { storeSlug } }));
  } catch {
    // Quota / private mode — silently drop, badge will re-read on next render.
  }
}

/** Unique key for an item — same product + same variant collapses to one row. */
function lineKey(productId: string, variantName?: string): string {
  return `${productId}::${variantName || ''}`;
}

export function getCart(storeSlug: string): CartItem[] {
  return safeRead(storeSlug);
}

export function getCartCount(storeSlug: string): number {
  return safeRead(storeSlug).reduce((sum, i) => sum + i.quantity, 0);
}

export function getCartSubtotal(storeSlug: string): number {
  return safeRead(storeSlug).reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/**
 * Add an item. If the same (product + variant) is already in the cart,
 * increment its quantity instead of duplicating the row.
 */
export function addToCart(
  storeSlug: string,
  item: Omit<CartItem, 'quantity' | 'addedAt'>,
  quantity = 1
): CartItem[] {
  const items = safeRead(storeSlug);
  const key = lineKey(item.id, item.variantName);
  const existing = items.find((i) => lineKey(i.id, i.variantName) === key);
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + quantity);
  } else {
    items.push({ ...item, quantity, addedAt: Date.now() });
  }
  safeWrite(storeSlug, items);
  return items;
}

export function updateCartQty(
  storeSlug: string,
  productId: string,
  variantName: string | undefined,
  quantity: number
): CartItem[] {
  const items = safeRead(storeSlug);
  const idx = items.findIndex((i) => lineKey(i.id, i.variantName) === lineKey(productId, variantName));
  if (idx >= 0) {
    if (quantity <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx].quantity = Math.min(99, quantity);
    }
    safeWrite(storeSlug, items);
  }
  return items;
}

export function removeFromCart(
  storeSlug: string,
  productId: string,
  variantName?: string
): CartItem[] {
  const next = safeRead(storeSlug).filter(
    (i) => lineKey(i.id, i.variantName) !== lineKey(productId, variantName)
  );
  safeWrite(storeSlug, next);
  return next;
}

export function clearCart(storeSlug: string): void {
  safeWrite(storeSlug, []);
}
