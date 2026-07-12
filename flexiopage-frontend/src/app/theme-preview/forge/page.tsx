'use client';

import { ForgeLandingRenderer } from '@/components/storefront/ForgeLandingRenderer';
import { ForgeHero } from '@/components/storefront/forge-sections/ForgeHero';
import { ForgeFeatures } from '@/components/storefront/forge-sections/ForgeFeatures';
import { ForgeProducts } from '@/components/storefront/forge-sections/ForgeProducts';
import { ForgeTestimonials } from '@/components/storefront/forge-sections/ForgeTestimonials';
import { ForgeNewsletter } from '@/components/storefront/forge-sections/ForgeNewsletter';
import { ForgeFAQ } from '@/components/storefront/forge-sections/ForgeFAQ';
import { forgeDemodProducts, getNewArrivalProducts, getBestSellerProducts } from '@/data/forge-demo-products';
import { getThemeById } from '@/data/store-themes';

export default function ForgeThemePreviewPage() {
  const forgeTheme = getThemeById('forge');

  const theme = forgeTheme?.theme || {
    primary: '#00d9ff',
    accent: '#00ff7f',
    background: '#0f0f0f',
    surface: '#1a1a1a',
    surfaceMuted: '#131313',
    foreground: '#f0f0f0',
    muted: '#8a8a8a',
    border: '#2a2a2a',
    fontHeading: '"Space Grotesk", "Inter", sans-serif',
    fontBody: '"Inter", system-ui, sans-serif',
    borderRadius: 'small',
  };

  const newArrivals = getNewArrivalProducts(4);
  const bestSellers = getBestSellerProducts(5);

  const testimonials = [
    {
      quote: 'These are the only leggings I\'ll wear. The quality is unmatched and the fit is perfect.',
      author: 'Sarah M.',
      role: 'Fitness Coach',
      rating: 5,
      image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    },
    {
      quote: 'Perfect for the gym and for coffee with friends. Versatile, comfy, and looks amazing.',
      author: 'Marcus J.',
      role: 'CrossFit Athlete',
      rating: 5,
      image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus',
    },
    {
      quote: 'The attention to detail is incredible. Worth every penny. Already ordered 3 items.',
      author: 'Alex T.',
      role: 'Yoga Instructor',
      rating: 5,
      image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    },
    {
      quote: 'Game changer. The materials feel premium and the durability is insane.',
      author: 'Jordan L.',
      role: 'Personal Trainer',
      rating: 5,
      image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan',
    },
    {
      quote: 'Finally found athletic wear that matches my lifestyle. Obsessed!',
      author: 'Emma K.',
      role: 'Wellness Blogger',
      rating: 5,
      image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma',
    },
  ];

  const faqItems = [
    {
      question: 'What makes Forge different from other athleisure brands?',
      answer:
        'We combine cutting-edge performance fabrics with street-ready design. Every piece is lab-tested for durability and engineered for movement—whether you\'re at the gym or grabbing lunch. Our attention to detail sets us apart.',
    },
    {
      question: 'Are your products true to size?',
      answer:
        'Yes, our sizing follows standard athletic wear. We recommend checking our detailed size guide for each category—fit is our priority. If something doesn\'t fit perfectly, we offer free exchanges within 30 days.',
    },
    {
      question: 'How long do items typically ship?',
      answer:
        'Orders ship within 1-2 business days. Standard shipping takes 5-7 days; express is 2-3 days. You\'ll receive tracking as soon as your order leaves our warehouse.',
    },
    {
      question: 'Do you use sustainable materials?',
      answer:
        'Yes. We use recycled polyester, organic cotton, and partner with facilities that meet rigorous environmental standards. Read our sustainability report for full details on our practices.',
    },
    {
      question: 'What\'s your returns policy?',
      answer:
        '30-day returns on unworn items with tags. We cover return shipping on defects. Try your order risk-free—quality is our guarantee.',
    },
  ];

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: theme.background,
      }}
    >
      {/* 1. HERO */}
      <ForgeHero
        heading="Built for Movement"
        subheading="Performance meets style. Engineered for athletes and everyday movers. From the gym to the streets, Forge has you covered."
        ctaText="Explore Collection"
        ctaUrl="#new-collection"
        backgroundImage="https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200&q=80"
        overlayGradient="from-black/60 via-black/40 to-transparent"
        minHeight="600px"
        theme={theme}
      />

      {/* 2. BRAND VALUES */}
      <ForgeFeatures
        title="Why Forge"
        subtitle="Three pillars of our mission"
        features={[
          {
            icon: '⚡',
            title: 'Performance',
            description: 'Engineered fabrics and cuts designed for peak athletic performance and everyday comfort.',
          },
          {
            icon: '🎨',
            title: 'Design',
            description: 'Streetwear meets sport. Premium aesthetics in every stitch and seam.',
          },
          {
            icon: '♻️',
            title: 'Sustainability',
            description: 'Eco-conscious materials and ethical manufacturing practices.',
          },
        ]}
        columns={3}
        theme={theme}
      />

      {/* 3. NEW COLLECTION */}
      <section
        className="py-4"
        style={{
          backgroundColor: theme.background,
        }}
      >
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <h2
              className="mb-3 text-4xl font-bold md:text-5xl"
              style={{
                fontFamily: theme.fontHeading,
                color: theme.foreground,
              }}
            >
              New Arrivals
            </h2>
            <p
              className="text-lg"
              style={{
                color: theme.muted,
                fontFamily: theme.fontBody,
              }}
            >
              This season's essentials
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {newArrivals.map((product) => (
              <div
                key={product.id}
                className="group relative overflow-hidden rounded-sm cursor-pointer hover:opacity-90 transition-opacity"
                style={{
                  backgroundColor: theme.surface,
                }}
              >
                <div className="relative h-64 overflow-hidden md:h-72">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {product.badge && (
                    <div
                      className="absolute top-4 right-4 px-3 py-1 rounded text-xs font-bold"
                      style={{
                        backgroundColor: theme.primary,
                        color: theme.background,
                      }}
                    >
                      {product.badge}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 transition-all duration-300 group-hover:bg-black/40 flex items-center justify-center">
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-all px-6 py-2 font-bold text-sm"
                      style={{
                        backgroundColor: theme.primary,
                        color: theme.background,
                      }}
                    >
                      Quick View
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <h3
                    className="mb-1 font-bold text-sm"
                    style={{
                      fontFamily: theme.fontHeading,
                      color: theme.foreground,
                    }}
                  >
                    {product.name}
                  </h3>
                  <p
                    className="text-xs mb-3"
                    style={{
                      color: theme.muted,
                      fontFamily: theme.fontBody,
                    }}
                  >
                    {product.colors.slice(0, 3).join(', ')}
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <span
                        className="font-bold text-lg"
                        style={{
                          color: theme.primary,
                        }}
                      >
                        ${product.price}
                      </span>
                      {product.originalPrice && (
                        <span
                          className="ml-2 text-xs line-through"
                          style={{
                            color: theme.muted,
                          }}
                        >
                          ${product.originalPrice}
                        </span>
                      )}
                    </div>
                    <span
                      className="text-xs"
                      style={{
                        color: theme.primary,
                      }}
                    >
                      ★ {product.rating}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. TESTIMONIALS */}
      <ForgeTestimonials
        title="Loved by Athletes"
        subtitle="Join thousands who've transformed their wardrobe"
        testimonials={testimonials}
        theme={theme}
      />

      {/* 5. NEWSLETTER CTA */}
      <ForgeNewsletter
        title="Get Exclusive Access"
        description="Subscribe for new drops, member-only sales, and fitness tips."
        ctaText="Join the Forge"
        badge="10% OFF your first order"
        theme={theme}
      />

      {/* 6. FAQ */}
      <ForgeFAQ
        title="Frequently Asked"
        subtitle="Everything you need to know"
        items={faqItems}
        theme={theme}
      />

      {/* 7. FOOTER NOTICE */}
      <section
        className="py-16 px-4 text-center border-t"
        style={{
          backgroundColor: theme.background,
          borderColor: theme.border,
        }}
      >
        <div className="mx-auto max-w-4xl">
          <h3
            className="mb-4 text-2xl font-bold"
            style={{
              fontFamily: theme.fontHeading,
              color: theme.foreground,
            }}
          >
            This is a Preview
          </h3>
          <p
            className="mb-6"
            style={{
              color: theme.muted,
              fontFamily: theme.fontBody,
            }}
          >
            You're viewing the FORGE theme with demo products. Create your store to start selling with this theme!
          </p>
          <button
            className="px-8 py-3 font-bold text-lg rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: theme.primary,
              color: theme.background,
            }}
          >
            Create Store with Forge
          </button>
        </div>
      </section>
    </div>
  );
}
