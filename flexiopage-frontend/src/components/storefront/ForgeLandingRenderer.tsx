'use client';

import { forgeLandingTemplate } from '@/data/forge-landing-template';
import { ForgeHero } from './forge-sections/ForgeHero';
import { ForgeFeatures } from './forge-sections/ForgeFeatures';
import { ForgeProducts } from './forge-sections/ForgeProducts';
import { ForgeTestimonials } from './forge-sections/ForgeTestimonials';
import { ForgeNewsletter } from './forge-sections/ForgeNewsletter';
import { ForgeFAQ } from './forge-sections/ForgeFAQ';

interface ForgeLandingRendererProps {
  theme?: any;
  customSections?: any[];
}

export function ForgeLandingRenderer({
  theme = forgeLandingTemplate.theme,
  customSections,
}: ForgeLandingRendererProps) {
  const sections = customSections || forgeLandingTemplate.sections;

  return (
    <div className="w-full">
      {sections.map((section) => {
        switch (section.type) {
          case 'hero':
            return (
              <ForgeHero
                key={section.id}
                heading={section.config.heading}
                subheading={section.config.subheading}
                ctaText={section.config.ctaText}
                ctaUrl={section.config.ctaUrl}
                backgroundImage={section.config.backgroundImage}
                overlayGradient={section.config.overlayGradient}
                minHeight={section.config.minHeight}
                theme={theme}
              />
            );

          case 'features':
            return (
              <ForgeFeatures
                key={section.id}
                title={section.config.title}
                subtitle={section.config.subtitle}
                features={section.config.features}
                columns={section.config.columns || 3}
                theme={theme}
              />
            );

          case 'products':
            return (
              <ForgeProducts
                key={section.id}
                title={section.config.title}
                subtitle={section.config.subtitle}
                gridColumns={section.config.gridColumns || 4}
                theme={theme}
              />
            );

          case 'testimonials':
            return (
              <ForgeTestimonials
                key={section.id}
                title={section.config.title}
                subtitle={section.config.subtitle}
                testimonials={section.config.testimonials}
                theme={theme}
              />
            );

          case 'cta':
            return (
              <ForgeNewsletter
                key={section.id}
                title={section.config.title}
                description={section.config.description}
                ctaText={section.config.ctaText}
                badge={section.config.badge}
                theme={theme}
              />
            );

          case 'faq':
            return (
              <ForgeFAQ
                key={section.id}
                title={section.config.title}
                subtitle={section.config.subtitle}
                items={section.config.items}
                theme={theme}
              />
            );

          // Skip unsupported sections for now
          default:
            return null;
        }
      })}
    </div>
  );
}

// Export individual sections for flexibility
export * from './forge-sections/ForgeHero';
export * from './forge-sections/ForgeFeatures';
export * from './forge-sections/ForgeProducts';
export * from './forge-sections/ForgeTestimonials';
export * from './forge-sections/ForgeNewsletter';
export * from './forge-sections/ForgeFAQ';
