import type { Request } from 'express';
import type { IStore, IStoreMarket } from '../models/Store.model';
import type { IProduct, IProductPricing } from '../models/Product.model';

/** Cookie posé par le sélecteur pays côté storefront. */
export const MARKET_COUNTRY_COOKIE = 'fp_market_country';

export interface ResolvedMarket {
  country: string;
  currency: string;
  /** Le market trouvé dans store.markets, ou null si on est tombé en fallback legacy. */
  market: IStoreMarket | null;
  /** Vrai quand on a dû fabriquer un market synthétique depuis settings.country/currency. */
  fallbackUsed: boolean;
  /** D'où vient le pays choisi : utile pour debug et pour décider si on POSE le cookie. */
  source: 'cookie' | 'header' | 'default' | 'first-enabled' | 'legacy-settings';
}

type StoreLike = Pick<IStore, 'markets' | 'settings'>;

function normalize(code: string | undefined | null): string {
  return (code || '').trim().toUpperCase();
}

function enabledMarkets(store: StoreLike): IStoreMarket[] {
  return (store.markets || []).filter((m) => m && m.enabled !== false);
}

function findMarket(store: StoreLike, country: string): IStoreMarket | undefined {
  if (!country) return undefined;
  return enabledMarkets(store).find((m) => normalize(m.country) === country);
}

/**
 * Résout le market à appliquer pour cette requête buyer. Priorité :
 *   1. cookie `fp_market_country` (choix explicite via le sélecteur)
 *   2. header `CF-IPCountry` (géoloc Cloudflare)
 *   3. `markets[isDefault]`
 *   4. premier market activé
 *   5. fallback legacy `settings.country/currency` (boutiques pré-migration)
 *
 * Ne lève jamais — retombe toujours sur quelque chose de safe.
 */
export function resolveMarketForRequest(req: Request, store: StoreLike): ResolvedMarket {
  // 1. Cookie
  const cookieCountry = normalize(req.cookies?.[MARKET_COUNTRY_COOKIE]);
  if (cookieCountry) {
    const m = findMarket(store, cookieCountry);
    if (m) {
      return {
        country: normalize(m.country),
        currency: normalize(m.currency),
        market: m,
        fallbackUsed: false,
        source: 'cookie',
      };
    }
  }

  // 2. CF-IPCountry
  const headerCountry = normalize(
    (req.headers['cf-ipcountry'] as string | undefined) ||
      (req.headers['x-vercel-ip-country'] as string | undefined),
  );
  if (headerCountry && headerCountry !== 'XX' && headerCountry !== 'T1') {
    const m = findMarket(store, headerCountry);
    if (m) {
      return {
        country: normalize(m.country),
        currency: normalize(m.currency),
        market: m,
        fallbackUsed: false,
        source: 'header',
      };
    }
  }

  // 3. Default market
  const def = enabledMarkets(store).find((m) => m.isDefault);
  if (def) {
    return {
      country: normalize(def.country),
      currency: normalize(def.currency),
      market: def,
      fallbackUsed: false,
      source: 'default',
    };
  }

  // 4. Premier market activé
  const first = enabledMarkets(store)[0];
  if (first) {
    return {
      country: normalize(first.country),
      currency: normalize(first.currency),
      market: first,
      fallbackUsed: false,
      source: 'first-enabled',
    };
  }

  // 5. Fallback legacy
  return {
    country: normalize(store.settings?.country) || '',
    currency: normalize(store.settings?.currency) || 'USD',
    market: null,
    fallbackUsed: true,
    source: 'legacy-settings',
  };
}

export interface ResolvedPricing {
  price: number;
  compareAtPrice?: number;
  currency: string;
  stock: number;
  available: boolean;
  /** Vrai quand on a dû retomber sur price/stock racine (pricing[country] absent). */
  fallbackUsed: boolean;
}

type ProductLike = Pick<
  IProduct,
  'pricing' | 'price' | 'compareAtPrice' | 'stock' | 'trackInventory' | 'allowBackorder'
>;

/**
 * Sélectionne le pricing à appliquer pour un produit dans un market. Si
 * `product.pricing[country]` existe et que `available` n'est pas explicitement
 * faux → on l'utilise. Sinon on retombe sur les champs racine (compat
 * boutiques mono-pays).
 *
 * Le `defaultCurrency` vient du market résolu — il sert quand on retombe sur
 * le prix racine, qui n'a pas de devise propre (la devise vient du store).
 */
export function resolveProductPricing(
  product: ProductLike,
  country: string,
  defaultCurrency: string,
): ResolvedPricing {
  const normalized = normalize(country);
  const entry: IProductPricing | undefined = (product.pricing || []).find(
    (p) => normalize(p.country) === normalized,
  );

  if (entry) {
    return {
      price: entry.price,
      compareAtPrice: entry.compareAtPrice,
      currency: normalize(entry.currency) || normalize(defaultCurrency),
      stock: entry.stock ?? 0,
      available: entry.available !== false,
      fallbackUsed: false,
    };
  }

  return {
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    currency: normalize(defaultCurrency),
    stock: product.stock ?? 0,
    available: true,
    fallbackUsed: true,
  };
}
