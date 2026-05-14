import type { IProductBundle } from '../models/Product.model';

export interface BundlePricing {
  /** Effective per-unit price (tier total / quantity, or base price). */
  unitPrice: number;
  /** Total to charge for the whole quantity. */
  total: number;
  /** True when a quantity tier was matched and applied. */
  tierApplied: boolean;
}

/**
 * Resolve the price for a quantity-tier bundle.
 *
 * Logic — "buy more, save more":
 *   - Quantity 1 (or no bundle) → base price × quantity.
 *   - If the bundle is enabled AND a tier matches the exact quantity, the
 *     whole order costs `tier.totalPrice`; the effective unit price becomes
 *     `tier.totalPrice / quantity` so the Order line item stays consistent.
 *   - A quantity with no matching tier falls back to base price × quantity
 *     (the storefront only ever offers tier quantities, but the server must
 *     stay correct for any input — never trust the client).
 */
export function resolveBundlePricing(
  basePrice: number,
  bundle: IProductBundle | undefined | null,
  quantity: number,
): BundlePricing {
  const qty = Math.max(1, Math.floor(quantity || 1));
  if (bundle?.enabled && Array.isArray(bundle.tiers)) {
    const tier = bundle.tiers.find(
      (t) => t && t.quantity === qty && typeof t.totalPrice === 'number' && t.totalPrice > 0,
    );
    if (tier) {
      return { unitPrice: tier.totalPrice / qty, total: tier.totalPrice, tierApplied: true };
    }
  }
  return { unitPrice: basePrice, total: basePrice * qty, tierApplied: false };
}
