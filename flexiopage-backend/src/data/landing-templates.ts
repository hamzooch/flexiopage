/**
 * Professional landing page templates for digital & physical products.
 * Each template has id, name, description, category, and predefined sections.
 *
 * Sections come pre-filled with example product images (Unsplash, free + stable
 * URLs) so the "Aperçu du thème" preview shows a complete-looking landing page
 * out of the box. The seller replaces these images with their own product
 * shots once they pick the template.
 */
export type TemplateSection = {
  id: string;
  type: string;
  order: number;
  props: Record<string, unknown>;
};

export interface LandingTemplate {
  id: string;
  name: string;
  description: string;
  category: 'digital' | 'physical' | 'mixed';
  thumbnail?: string;
  sections: TemplateSection[];
}

// ─────────────────────────────────────────────────────────────────────
// Example imagery — used as starter visuals in template sections so the
// preview never looks empty. All Unsplash, free for commercial use.
// ─────────────────────────────────────────────────────────────────────
const IMG = {
  // Generic ecommerce/lifestyle hero shots
  physicalHero: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1600&q=80',
  digitalHero: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=1600&q=80',
  mixedHero: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1600&q=80',
  // Gallery sets (4 each)
  galleryPhysical: [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&q=80',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&q=80',
    'https://images.unsplash.com/photo-1491637639811-60e2756cc1c7?w=1200&q=80',
    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=1200&q=80',
  ],
  galleryDigital: [
    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&q=80',
    'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=1200&q=80',
    'https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&q=80',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&q=80',
  ],
  // Testimonial avatars
  avatars: [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80',
  ],
  // Feature-card thumbnails
  featurePhysical: [
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80',
    'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=600&q=80',
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
  ],
  featureDigital: [
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80',
    'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&q=80',
    'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600&q=80',
  ],
};

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    id: 'digital-launch',
    name: 'Digital Product Launch',
    description: 'Hero + benefits + CTA for ebooks, courses, software.',
    category: 'digital',
    sections: [
      {
        id: 'hero-1',
        type: 'hero',
        order: 0,
        props: {
          title: 'Launch Your Digital Product',
          subtitle: 'Create, sell, and deliver instantly. Perfect for ebooks, courses, and downloads.',
          ctaText: 'Get Started',
          ctaSecondary: 'Learn more',
          layout: 'split',
          backgroundStyle: 'gradient',
          imageUrl: IMG.digitalHero,
        },
      },
      {
        id: 'features-1',
        type: 'features',
        order: 1,
        props: {
          title: 'Why Choose Us',
          subtitle: 'Everything you need to sell digital products online.',
          items: [
            { title: 'Instant Delivery', description: 'Automated delivery after purchase.', image: IMG.featureDigital[0] },
            { title: 'Secure Payments', description: 'Stripe & multiple payment options.', image: IMG.featureDigital[1] },
            { title: 'No Inventory', description: 'Sell without physical stock.', image: IMG.featureDigital[2] },
          ],
        },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        order: 2,
        props: {
          title: 'See it in action',
          subtitle: 'Screens that show what your customers will get.',
          images: IMG.galleryDigital,
        },
      },
      {
        id: 'testimonials-1',
        type: 'testimonials',
        order: 3,
        props: {
          title: 'Loved by creators',
          items: [
            { quote: 'Easiest launch I have ever done. Customers got the product in seconds.', author: 'Sarah K.', image: IMG.avatars[0] },
            { quote: 'Setup took 10 minutes and I made my first sale the same day.', author: 'Marc D.', image: IMG.avatars[1] },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        order: 4,
        props: {
          title: 'Ready to Start Selling?',
          subtitle: 'Join thousands of creators selling digital products.',
          buttonText: 'Create Your Store',
        },
      },
    ],
  },
  {
    id: 'physical-premium',
    name: 'Physical Product Premium',
    description: 'Elegant layout for high-end physical products.',
    category: 'physical',
    sections: [
      {
        id: 'hero-1',
        type: 'hero',
        order: 0,
        props: {
          title: 'Premium Quality, Delivered',
          subtitle: 'Discover our carefully crafted products. Free shipping on orders over $50.',
          ctaText: 'Shop Now',
          ctaSecondary: 'View collection',
          layout: 'split',
          backgroundStyle: 'image',
          imageUrl: IMG.physicalHero,
        },
      },
      {
        id: 'features-1',
        type: 'features',
        order: 1,
        props: {
          title: 'What Makes Us Different',
          subtitle: 'Quality and customer care at the heart of everything.',
          items: [
            { title: 'Free Shipping', description: 'On orders over $50.', image: IMG.featurePhysical[0] },
            { title: 'Easy Returns', description: '30-day hassle-free returns.', image: IMG.featurePhysical[1] },
            { title: 'Secure Packaging', description: 'We ship with care.', image: IMG.featurePhysical[2] },
          ],
        },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        order: 2,
        props: {
          title: 'Product Gallery',
          subtitle: 'Lifestyle shots from real customers.',
          images: IMG.galleryPhysical,
        },
      },
      {
        id: 'testimonials-1',
        type: 'testimonials',
        order: 3,
        props: {
          title: 'What Our Customers Say',
          items: [
            { quote: 'Fast delivery and great quality. The packaging was beautiful too.', author: 'Happy Customer', image: IMG.avatars[0] },
            { quote: 'Will definitely order again — exceeded my expectations!', author: 'Verified Buyer', image: IMG.avatars[2] },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        order: 4,
        props: {
          title: 'Ready to Order?',
          subtitle: 'Browse our collection and get yours today.',
          buttonText: 'Shop Now',
        },
      },
    ],
  },
  {
    id: 'mixed-store',
    name: 'Mixed Store (Digital + Physical)',
    description: 'Versatile template for stores selling both types.',
    category: 'mixed',
    sections: [
      {
        id: 'hero-1',
        type: 'hero',
        order: 0,
        props: {
          title: 'Your One-Stop Shop',
          subtitle: 'Digital downloads and physical products. Everything in one place.',
          ctaText: 'Explore',
          layout: 'split',
          backgroundStyle: 'gradient',
          imageUrl: IMG.mixedHero,
        },
      },
      {
        id: 'products-1',
        type: 'products',
        order: 1,
        props: {
          title: 'Featured Products',
          subtitle: 'Our most popular items.',
          layout: 'grid',
          columns: 3,
        },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        order: 2,
        props: {
          title: 'From the catalog',
          subtitle: 'A mix of digital and physical items.',
          images: [...IMG.galleryPhysical.slice(0, 2), ...IMG.galleryDigital.slice(0, 2)],
        },
      },
      {
        id: 'faq-1',
        type: 'faq',
        order: 3,
        props: {
          title: 'Frequently Asked Questions',
          items: [
            { question: 'How do I get my digital product?', answer: 'After payment you receive an instant download link by email.' },
            { question: 'What about shipping?', answer: 'Physical items ship within 2-3 business days.' },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        order: 4,
        props: {
          title: 'Questions? Contact Us',
          buttonText: 'Get in Touch',
        },
      },
    ],
  },
  {
    id: 'minimal-digital',
    name: 'Minimal Digital',
    description: 'Clean, minimal design for digital products.',
    category: 'digital',
    sections: [
      {
        id: 'hero-1',
        type: 'hero',
        order: 0,
        props: {
          title: 'Simple. Fast. Digital.',
          subtitle: 'Your product, one page, zero friction.',
          ctaText: 'Buy Now',
          layout: 'split',
          backgroundStyle: 'minimal',
          imageUrl: IMG.digitalHero,
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        order: 1,
        props: {
          title: 'Instant access after purchase.',
          buttonText: 'Get It Now',
        },
      },
    ],
  },
  {
    id: 'physical-classic',
    name: 'Classic Physical Store',
    description: 'Traditional storefront with hero, products, testimonials.',
    category: 'physical',
    sections: [
      {
        id: 'hero-1',
        type: 'hero',
        order: 0,
        props: {
          title: 'Welcome to Our Store',
          subtitle: 'Quality products for everyone.',
          ctaText: 'Shop All',
          layout: 'split',
          imageUrl: IMG.physicalHero,
        },
      },
      {
        id: 'products-1',
        type: 'products',
        order: 1,
        props: {
          title: 'Our Products',
          subtitle: 'Browse the collection.',
          layout: 'grid',
          columns: 3,
        },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        order: 2,
        props: {
          title: 'In the wild',
          images: IMG.galleryPhysical,
        },
      },
      {
        id: 'testimonials-1',
        type: 'testimonials',
        order: 3,
        props: {
          title: 'Customer Reviews',
          items: [
            { quote: 'Great product and service. Will recommend!', author: 'Aïcha', image: IMG.avatars[0] },
            { quote: 'Top quality and arrived earlier than expected.', author: 'Karim', image: IMG.avatars[1] },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        order: 4,
        props: {
          title: 'Thank you for shopping with us.',
          buttonText: 'Continue Shopping',
        },
      },
    ],
  },
];
