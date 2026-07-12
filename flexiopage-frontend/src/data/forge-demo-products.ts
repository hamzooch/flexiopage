/**
 * FORGE Theme — Demo Products for Storefront Preview
 * Realistic athleisure/sportswear mock data
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
  // ═════════════════════════════════════════════════════════════════
  // LEGGINGS & BOTTOMS
  // ═════════════════════════════════════════════════════════════════
  {
    id: 'forge-001',
    name: 'Flex Performance Leggings',
    description: 'High-waisted leggings with moisture-wicking fabric and phone pockets. Perfect for gym to street.',
    price: 129,
    originalPrice: 149,
    image: 'https://images.unsplash.com/photo-1506629082632-ee94b2e2d5ca?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1506629082632-ee94b2e2d5ca?w=600&q=80',
      'https://images.unsplash.com/photo-1506629082632-ee94b2e2d5ca?w=600&q=80&crop=entropy&cs=tinysrgb&fit=max',
    ],
    category: 'Bottoms',
    colors: ['Black', 'Charcoal', 'Navy', 'Olive'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    inStock: true,
    rating: 4.8,
    reviews: 342,
    badge: 'BESTSELLER',
  },

  {
    id: 'forge-002',
    name: 'Urban Training Shorts',
    description: 'Lightweight shorts with integrated compression liner. 5-inch inseam. Perfect for every workout.',
    price: 69,
    image: 'https://images.unsplash.com/photo-1511491437671-cf52139fc359?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1511491437671-cf52139fc359?w=600&q=80',
    ],
    category: 'Bottoms',
    colors: ['Black', 'White', 'Grey'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
    rating: 4.6,
    reviews: 189,
  },

  {
    id: 'forge-003',
    name: 'Prisma High-Rise Bike Shorts',
    description: 'Sleek bike shorts with reflective details. 8-inch inseam. Engineered for all-day comfort.',
    price: 85,
    originalPrice: 95,
    image: 'https://images.unsplash.com/photo-1506629082632-ee94b2e2d5ca?w=600&q=80',
    category: 'Bottoms',
    colors: ['Black', 'Charcoal', 'Navy'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
    rating: 4.9,
    reviews: 256,
    badge: 'NEW',
  },

  // ═════════════════════════════════════════════════════════════════
  // TOPS & SHIRTS
  // ═════════════════════════════════════════════════════════════════
  {
    id: 'forge-004',
    name: 'Athlete Sports Bra Pro',
    description: 'High-impact sports bra with adjustable straps and encapsulation support.',
    price: 79,
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80',
    category: 'Tops',
    colors: ['Black', 'Charcoal', 'Navy', 'Cyber Blue'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    inStock: true,
    rating: 4.7,
    reviews: 428,
    badge: 'BESTSELLER',
  },

  {
    id: 'forge-005',
    name: 'Core Tank Top',
    description: 'Breathable tank with racerback design. Flattering fit, maximum mobility.',
    price: 49,
    image: 'https://images.unsplash.com/photo-1503341990671-8235dd286509?w=600&q=80',
    category: 'Tops',
    colors: ['Black', 'White', 'Grey', 'Navy'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
    rating: 4.5,
    reviews: 312,
  },

  {
    id: 'forge-006',
    name: 'Oversized Athletic T-Shirt',
    description: 'Relaxed fit tee with premium cotton blend. Perfect layering piece.',
    price: 59,
    image: 'https://images.unsplash.com/photo-1482886687594-2f8b0fbb0bac?w=600&q=80',
    category: 'Tops',
    colors: ['Black', 'White', 'Charcoal', 'Sage'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    inStock: true,
    rating: 4.4,
    reviews: 267,
  },

  // ═════════════════════════════════════════════════════════════════
  // OUTERWEAR
  // ═════════════════════════════════════════════════════════════════
  {
    id: 'forge-007',
    name: 'Premium Zip Hoodie',
    description: 'Heavyweight hoodie with kangaroo pockets. Moisture-wicking and temperature-regulating.',
    price: 99,
    originalPrice: 119,
    image: 'https://images.unsplash.com/photo-1556821552-8c40c1b24895?w=600&q=80',
    category: 'Outerwear',
    colors: ['Black', 'Charcoal', 'Navy', 'Sage'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    inStock: true,
    rating: 4.8,
    reviews: 521,
    badge: 'BESTSELLER',
  },

  {
    id: 'forge-008',
    name: 'Lightweight Training Jacket',
    description: 'Windproof, water-resistant jacket. Perfect for outdoor training.',
    price: 139,
    image: 'https://images.unsplash.com/photo-1551028719-00167b16ebc5?w=600&q=80',
    category: 'Outerwear',
    colors: ['Black', 'Navy', 'Charcoal'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
    rating: 4.6,
    reviews: 183,
  },

  {
    id: 'forge-009',
    name: 'Crew Neck Sweatshirt',
    description: 'Classic crewneck with premium fabric. Timeless streetwear essential.',
    price: 79,
    image: 'https://images.unsplash.com/photo-1556821552-8c40c1b24895?w=600&q=80',
    category: 'Outerwear',
    colors: ['Black', 'Charcoal', 'Navy', 'Cream'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    inStock: true,
    rating: 4.5,
    reviews: 294,
  },

  // ═════════════════════════════════════════════════════════════════
  // ACCESSORIES
  // ═════════════════════════════════════════════════════════════════
  {
    id: 'forge-010',
    name: 'Performance Compression Socks',
    description: 'Graduated compression socks for recovery. Reduces fatigue and swelling.',
    price: 29,
    image: 'https://images.unsplash.com/photo-1461231590384-85297f91f3a4?w=600&q=80',
    category: 'Accessories',
    colors: ['Black', 'Grey', 'Navy'],
    sizes: ['ONE SIZE'],
    inStock: true,
    rating: 4.7,
    reviews: 156,
  },

  {
    id: 'forge-011',
    name: 'Mesh Gym Bag',
    description: 'Ventilated mesh gym bag. Water bottle pocket and internal compartments.',
    price: 49,
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80',
    category: 'Accessories',
    colors: ['Black', 'Charcoal'],
    sizes: ['ONE SIZE'],
    inStock: true,
    rating: 4.4,
    reviews: 98,
  },

  {
    id: 'forge-012',
    name: 'Wireless Workout Earbuds',
    description: 'True wireless earbuds with secure ear hooks. 12-hour battery life.',
    price: 89,
    image: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=600&q=80',
    category: 'Accessories',
    colors: ['Black', 'White'],
    sizes: ['ONE SIZE'],
    inStock: true,
    rating: 4.6,
    reviews: 234,
    badge: 'NEW',
  },
];

/**
 * Get featured products for homepage
 */
export function getFeaturedProducts(count: number = 4): DemoProduct[] {
  return forgeDemodProducts
    .filter((p) => p.badge === 'BESTSELLER' || p.rating >= 4.7)
    .slice(0, count);
}

/**
 * Get best sellers
 */
export function getBestSellerProducts(count: number = 5): DemoProduct[] {
  return forgeDemodProducts
    .sort((a, b) => b.reviews - a.reviews)
    .slice(0, count);
}

/**
 * Get new arrivals
 */
export function getNewArrivalProducts(count: number = 4): DemoProduct[] {
  return forgeDemodProducts
    .filter((p) => p.badge === 'NEW')
    .slice(0, count);
}

export default forgeDemodProducts;
