/**
 * Professional landing page templates for digital & physical products.
 * Each template has id, name, description, category, and predefined sections.
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
          layout: 'center',
          backgroundStyle: 'gradient',
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
            { title: 'Instant Delivery', description: 'Automated delivery after purchase.' },
            { title: 'Secure Payments', description: 'Stripe & multiple payment options.' },
            { title: 'No Inventory', description: 'Sell without physical stock.' },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        order: 2,
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
            { title: 'Free Shipping', description: 'On orders over $50.' },
            { title: 'Easy Returns', description: '30-day hassle-free returns.' },
            { title: 'Secure Packaging', description: 'We ship with care.' },
          ],
        },
      },
      {
        id: 'testimonials-1',
        type: 'testimonials',
        order: 2,
        props: {
          title: 'What Our Customers Say',
          items: [
            { quote: 'Fast delivery and great quality.', author: 'Happy Customer' },
            { quote: 'Will definitely order again!', author: 'Verified Buyer' },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        order: 3,
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
          layout: 'center',
          backgroundStyle: 'gradient',
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
        id: 'faq-1',
        type: 'faq',
        order: 2,
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
        order: 3,
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
          layout: 'center',
          backgroundStyle: 'minimal',
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
          layout: 'center',
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
        id: 'testimonials-1',
        type: 'testimonials',
        order: 2,
        props: {
          title: 'Customer Reviews',
          items: [
            { quote: 'Great product and service.', author: 'Customer' },
          ],
        },
      },
      {
        id: 'cta-1',
        type: 'cta',
        order: 3,
        props: {
          title: 'Thank you for shopping with us.',
          buttonText: 'Continue Shopping',
        },
      },
    ],
  },
];
