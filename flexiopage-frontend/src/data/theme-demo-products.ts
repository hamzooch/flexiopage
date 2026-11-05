/**
 * Produits demo de la vitrine vide. Les photos et les noms viennent de
 * `theme-example-products` : un thème digital n'affiche que des produits
 * digitaux, un thème physique que des produits physiques.
 */
import { examplesForTheme, type ThemeExample } from '@/data/theme-example-products';

export interface DemoProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  currency: string;
  image: string;
  images?: string[];
  category: string;
  inStock: boolean;
  rating: number;
  reviews: number;
  badge?: 'NEW' | 'BESTSELLER' | 'SALE' | 'LIMITED';
  digitalKind?: ThemeExample['digitalKind'];
}

function toDemo(themeId: string, example: ThemeExample, index: number): DemoProduct {
  return {
    id: `${themeId}-${index + 1}`,
    name: example.name,
    description: example.description,
    price: example.price,
    originalPrice: example.compareAtPrice,
    currency: 'USD',
    image: example.image,
    category: example.category,
    inStock: true,
    rating: example.badge === 'BESTSELLER' ? 4.8 : 4.6,
    reviews: 120 - index * 15,
    badge: example.badge,
    digitalKind: example.digitalKind,
  };
}

/** Produits d'exemple pour un thème, filtrés par le type de boutique. */
export function getDemoProductsByTheme(
  themeId: string,
  storeType: 'physical' | 'digital' = 'physical',
): DemoProduct[] {
  return examplesForTheme(themeId, storeType).map((example, index) => toDemo(themeId, example, index));
}

export function getFeaturedByTheme(
  themeId: string,
  count = 4,
  storeType: 'physical' | 'digital' = 'physical',
): DemoProduct[] {
  const products = getDemoProductsByTheme(themeId, storeType);
  return [...products]
    .sort((a, b) => {
      const aBest = a.badge === 'BESTSELLER' ? 1 : 0;
      const bBest = b.badge === 'BESTSELLER' ? 1 : 0;
      if (aBest !== bBest) return bBest - aBest;
      return b.reviews - a.reviews;
    })
    .slice(0, count);
}

export function getNewArrivalsByTheme(
  themeId: string,
  count = 4,
  storeType: 'physical' | 'digital' = 'physical',
): DemoProduct[] {
  const products = getDemoProductsByTheme(themeId, storeType);
  const news = products.filter((p) => p.badge === 'NEW');
  if (news.length >= count) return news.slice(0, count);
  const rest = products.filter((p) => p.badge !== 'NEW');
  return [...news, ...rest].slice(0, count);
}
