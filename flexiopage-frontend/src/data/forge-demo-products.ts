/**
 * FORGE — exemples sportswear. Photos locales, pas de stock Unsplash
 * (certaines URLs étaient hors sujet : lunettes, sac, 404).
 */

export interface DemoProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  images?: string[];
  category: string;
  colors: string[];
  sizes: string[];
  inStock: boolean;
  rating: number;
  reviews: number;
  badge?: 'NEW' | 'BESTSELLER' | 'SALE' | 'LIMITED';
}

export const forgeDemodProducts: DemoProduct[] = [
  {
    id: 'forge-001',
    name: 'Legging performance',
    description: 'Legging taille haute, tissu respirant. Exemple à remplacer par ton produit.',
    price: 129,
    originalPrice: 149,
    image: '/demo-products/forge-1.jpg',
    category: 'Bas',
    colors: ['Noir'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
    rating: 4.8,
    reviews: 342,
    badge: 'BESTSELLER',
  },
  {
    id: 'forge-002',
    name: 'Short d’entraînement',
    description: 'Short léger pour l’entraînement. Exemple à remplacer par ton produit.',
    price: 69,
    image: '/demo-products/forge-2.jpg',
    category: 'Bas',
    colors: ['Noir'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
    rating: 4.6,
    reviews: 189,
  },
  {
    id: 'forge-003',
    name: 'Brassière athlete',
    description: 'Brassière de sport. Exemple à remplacer par ton produit.',
    price: 79,
    image: '/demo-products/forge-3.jpg',
    category: 'Hauts',
    colors: ['Noir'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
    rating: 4.7,
    reviews: 428,
    badge: 'NEW',
  },
  {
    id: 'forge-004',
    name: 'Hoodie training',
    description: 'Sweat à capuche. Exemple à remplacer par ton produit.',
    price: 99,
    image: '/demo-products/forge-4.jpg',
    category: 'Hauts',
    colors: ['Noir'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
    rating: 4.8,
    reviews: 521,
    badge: 'BESTSELLER',
  },
];

export function getFeaturedProducts(count: number = 4): DemoProduct[] {
  return forgeDemodProducts
    .filter((p) => p.badge === 'BESTSELLER' || p.rating >= 4.7)
    .slice(0, count);
}

export function getBestSellerProducts(count: number = 5): DemoProduct[] {
  return [...forgeDemodProducts].sort((a, b) => b.reviews - a.reviews).slice(0, count);
}

export function getNewArrivalProducts(count: number = 4): DemoProduct[] {
  return forgeDemodProducts.filter((p) => p.badge === 'NEW').slice(0, count);
}

export default forgeDemodProducts;
