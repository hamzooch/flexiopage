/**
 * FORGE Theme — Complete landing page template
 * Gymshark-inspired athleisure/sportswear storefront
 *
 * Sections:
 * 1. Hero — fullbleed with video/image + CTA
 * 2. Features — brand values (3 columns)
 * 3. New Collection — featured products grid
 * 4. Why Choose Us — lifestyle imagery + benefits
 * 5. Best Sellers — carousel of top products
 * 6. Testimonials — customer carousel
 * 7. Newsletter CTA — conversion focused
 * 8. FAQ
 */

export const forgeLandingTemplate = {
  name: 'Forge Athleisure Pro',
  description: 'Complete storefront for modern sportswear & athleisure brands',
  sections: [
    // ═══════════════════════════════════════════════════════════════
    // 1. HERO — Fullbleed with gradient overlay
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'hero-forge',
      type: 'hero',
      layout: 'fullbleed',
      config: {
        heading: 'Built for Movement',
        subheading: 'Performance meets style. Engineered for athletes and everyday movers.',
        ctaText: 'Explore Collection',
        ctaUrl: '#products',
        backgroundImage: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200&q=80', // athlete in gym
        overlayGradient: 'from-black/60 via-black/40 to-transparent',
        textPosition: 'center',
        minHeight: '600px',
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // 2. BRAND VALUES — 3 column grid
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'values-forge',
      type: 'features',
      config: {
        title: 'Why Forge',
        subtitle: 'Three pillars of our mission',
        columns: 3,
        layout: 'minimal', // minimal text, icon-focused
        features: [
          {
            icon: '⚡',
            title: 'Performance',
            description: 'Engineered fabrics and cuts designed for peak athletic performance.',
          },
          {
            icon: '🎨',
            title: 'Design',
            description: 'Streetwear meets sport. Premium aesthetics in every stitch.',
          },
          {
            icon: '♻️',
            title: 'Sustainability',
            description: 'Eco-conscious materials and ethical manufacturing practices.',
          },
        ],
        background: 'surface',
        spacing: 'relaxed',
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // 3. NEW COLLECTION — Featured products
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'collection-forge',
      type: 'products',
      config: {
        title: 'New Arrivals',
        subtitle: 'This season\'s essentials',
        productIds: [], // Auto-populated by store's new products
        displayCount: 4,
        layout: 'overlay',           // Product cards with overlay text
        gridColumns: 4,
        showFilters: true,
        showSort: true,
        ctaText: 'View All',
        ctaUrl: '#shop',
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // 4. LIFESTYLE SECTION — Split image + benefits
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'lifestyle-forge',
      type: 'split',
      config: {
        layout: 'image-right', // image on right
        image: 'https://images.unsplash.com/photo-1520854221256-17451cc331d7?w=600&q=80', // model in athleisure
        title: 'From Studio to Street',
        description:
          'Our collection transcends the gym. Designed for the moments between—transitioning from workout to workday, streetwear to social.',
        highlights: [
          'Premium moisture-wicking fabrics',
          'Flattering, functional silhouettes',
          'Seamless transitions day-to-night',
          'Lab-tested durability',
        ],
        ctaText: 'Discover the Range',
        ctaUrl: '#shop',
        backgroundColor: 'surfaceMuted',
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // 5. BEST SELLERS — Carousel (auto-scroll)
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'bestsellers-forge',
      type: 'carousel',
      config: {
        title: 'Best Sellers',
        subtitle: 'Customer favorites',
        productIds: [], // Auto-populated by store's top sellers
        displayCount: 5,
        autoScroll: true,
        scrollInterval: 5000,
        showRating: true,
        showPrice: true,
        backgroundColor: 'background',
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // 6. TESTIMONIALS — Customer carousel
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'testimonials-forge',
      type: 'testimonials',
      config: {
        title: 'Loved by Athletes',
        subtitle: 'Join thousands who\'ve transformed their wardrobe',
        layout: 'carousel', // 1 featured + thumbnails below
        displayCount: 5,
        autoScroll: false,
        testimonials: [
          {
            quote: 'These are the only leggings I\'ll wear. The quality is unmatched.',
            author: 'Sarah M.',
            role: 'Fitness Coach',
            rating: 5,
            image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
          },
          {
            quote: 'Perfect for the gym and for coffee with friends. Versatile and comfy.',
            author: 'Marcus J.',
            role: 'CrossFit Athlete',
            rating: 5,
            image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus',
          },
          {
            quote: 'The attention to detail is incredible. Worth every penny.',
            author: 'Alex T.',
            role: 'Yoga Instructor',
            rating: 5,
            image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
          },
        ],
        backgroundColor: 'surface',
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // 7. NEWSLETTER CTA — High-conversion
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'newsletter-forge',
      type: 'cta',
      config: {
        layout: 'gradient-split', // gradient background, split content
        title: 'Get Exclusive Access',
        description: 'Subscribe for new drops, member-only sales, and fitness tips.',
        ctaText: 'Join the Forge',
        ctaPrimary: true,
        inputPlaceholder: 'Enter your email',
        backgroundColor: 'primary', // cyan neon background
        textColor: 'dark',
        badge: '10% OFF' + ' your first order',
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // 8. FAQ — Accordion
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'faq-forge',
      type: 'faq',
      config: {
        title: 'Frequently Asked',
        subtitle: 'Everything you need to know',
        items: [
          {
            question: 'What makes Forge different from other athleisure brands?',
            answer:
              'We combine cutting-edge performance fabrics with street-ready design. Every piece is lab-tested for durability and engineered for movement—whether you\'re at the gym or grabbing lunch.',
          },
          {
            question: 'Are your products true to size?',
            answer:
              'Yes, our sizing follows standard athletic wear. We recommend checking our detailed size guide for each category—fit is our priority. If something doesn\'t fit, we offer free exchanges.',
          },
          {
            question: 'How long do items typically ship?',
            answer: 'Orders ship within 1-2 business days. Standard shipping takes 5-7 days; express is 2-3 days. You\'ll receive tracking as soon as your order leaves our warehouse.',
          },
          {
            question: 'Do you use sustainable materials?',
            answer:
              'Yes. We use recycled polyester, organic cotton, and partner with facilities that meet rigorous environmental standards. Read our sustainability report for full details.',
          },
          {
            question: 'What\'s your returns policy?',
            answer: '30-day returns on unworn items with tags. We cover return shipping on defects. Try your order risk-free—quality is our guarantee.',
          },
        ],
        backgroundColor: 'surfaceMuted',
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // 9. FOOTER CTA — Sign up for SMS
    // ═══════════════════════════════════════════════════════════════
    {
      id: 'footer-social-forge',
      type: 'footer-cta',
      config: {
        title: 'Follow the Movement',
        description: 'Join our community for daily inspiration and exclusive updates.',
        socialLinks: [
          { platform: 'instagram', url: '#', label: 'Instagram' },
          { platform: 'tiktok', url: '#', label: 'TikTok' },
          { platform: 'youtube', url: '#', label: 'YouTube' },
          { platform: 'twitter', url: '#', label: 'Twitter' },
        ],
        backgroundColor: 'background',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════
  // Default Forge theme metadata
  // ═══════════════════════════════════════════════════════════════
  theme: {
    templateId: 'forge',
    primary: '#00d9ff',
    accent: '#00ff7f',
    background: '#0f0f0f',
    surface: '#1a1a1a',
    foreground: '#f0f0f0',
    dark: true,
  },

  // SEO & Meta
  meta: {
    title: 'Forge | Premium Athleisure & Sportswear',
    description: 'Performance meets style. Shop premium athletic wear engineered for movement.',
    keywords: ['athleisure', 'sportswear', 'fitness', 'athletic wear', 'gym clothes'],
  },
};

export default forgeLandingTemplate;
