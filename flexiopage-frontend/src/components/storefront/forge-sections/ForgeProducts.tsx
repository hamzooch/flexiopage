'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ForgeProductsProps {
  title: string;
  subtitle: string;
  products?: Array<{
    id: string;
    name: string;
    image: string;
    price: number;
    currency?: string;
  }>;
  gridColumns?: 4 | 3 | 2;
  theme?: any;
}

export function ForgeProducts({
  title,
  subtitle,
  products = [],
  gridColumns = 4,
  theme,
}: ForgeProductsProps) {
  // Demo products if none provided
  const displayProducts = products.length > 0 ? products : [
    {
      id: '1',
      name: 'Performance Leggings',
      image: 'https://images.unsplash.com/photo-1506629082632-ee94b2e2d5ca?w=500&q=80',
      price: 129,
    },
    {
      id: '2',
      name: 'Athlete Sports Bra',
      image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=500&q=80',
      price: 79,
    },
    {
      id: '3',
      name: 'Premium Hoodie',
      image: 'https://images.unsplash.com/photo-1556821552-8c40c1b24895?w=500&q=80',
      price: 99,
    },
    {
      id: '4',
      name: 'Training Shorts',
      image: 'https://images.unsplash.com/photo-1511491437671-cf52139fc359?w=500&q=80',
      price: 69,
    },
  ];

  return (
    <section
      className="py-20 px-4"
      style={{
        backgroundColor: theme?.background || '#0f0f0f',
      }}
    >
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-16 text-center">
          <h2
            className="mb-3 text-4xl font-bold md:text-5xl"
            style={{
              fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
              color: theme?.foreground || '#f0f0f0',
            }}
          >
            {title}
          </h2>
          <p
            className="text-lg"
            style={{
              color: theme?.muted || '#8a8a8a',
              fontFamily: theme?.fontBody || 'Inter, sans-serif',
            }}
          >
            {subtitle}
          </p>
        </div>

        {/* Products Grid */}
        <div
          className={cn(
            'grid gap-6 md:gap-8',
            gridColumns === 4
              ? 'md:grid-cols-4'
              : gridColumns === 3
                ? 'md:grid-cols-3'
                : 'md:grid-cols-2'
          )}
        >
          {displayProducts.map((product) => (
            <div
              key={product.id}
              className="group relative overflow-hidden rounded-sm"
              style={{
                backgroundColor: theme?.surface || '#1a1a1a',
              }}
            >
              {/* Image */}
              <div className="relative h-64 overflow-hidden md:h-72">
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 transition-all duration-300 group-hover:bg-black/40" />
              </div>

              {/* Info */}
              <div
                className="p-4"
                style={{
                  backgroundColor: theme?.surface || '#1a1a1a',
                }}
              >
                <h3
                  className="mb-2 font-bold text-sm"
                  style={{
                    fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
                    color: theme?.foreground || '#f0f0f0',
                  }}
                >
                  {product.name}
                </h3>

                <div className="flex items-center justify-between">
                  <span
                    className="font-bold text-lg"
                    style={{
                      color: theme?.primary || '#00d9ff',
                    }}
                  >
                    ${product.price}
                  </span>

                  <Button
                    size="sm"
                    className="text-xs"
                    style={{
                      backgroundColor: theme?.primary || '#00d9ff',
                      color: theme?.primaryFg || '#0a0a0a',
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* View All CTA */}
        <div className="mt-12 text-center">
          <Button
            variant="outline"
            className="px-8 py-3 text-lg"
            style={{
              borderColor: theme?.primary || '#00d9ff',
              color: theme?.primary || '#00d9ff',
            }}
          >
            View All Products
          </Button>
        </div>
      </div>
    </section>
  );
}
