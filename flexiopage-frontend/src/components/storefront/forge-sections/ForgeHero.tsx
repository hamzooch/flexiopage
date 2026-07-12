'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ForgeHeroProps {
  heading: string;
  subheading: string;
  ctaText: string;
  ctaUrl?: string;
  backgroundImage?: string;
  overlayGradient?: string;
  minHeight?: string;
  theme?: any;
}

export function ForgeHero({
  heading,
  subheading,
  ctaText,
  ctaUrl = '#',
  backgroundImage,
  overlayGradient = 'from-black/60 via-black/40 to-transparent',
  minHeight = '600px',
  theme,
}: ForgeHeroProps) {
  return (
    <section
      className="relative w-full overflow-hidden"
      style={{
        minHeight,
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Gradient Overlay */}
      <div className={cn('absolute inset-0 bg-gradient-to-b', overlayGradient)} />

      {/* Content */}
      <div className="relative z-10 flex h-full items-center justify-center px-4 py-20">
        <div className="text-center">
          <h1
            className="mb-4 text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl"
            style={{
              fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
              color: theme?.foreground || '#f0f0f0',
            }}
          >
            {heading}
          </h1>

          <p
            className="mx-auto mb-8 max-w-2xl text-lg md:text-xl"
            style={{
              color: theme?.muted || '#8a8a8a',
              fontFamily: theme?.fontBody || 'Inter, sans-serif',
            }}
          >
            {subheading}
          </p>

          <Button
            asChild
            className="px-8 py-3 text-lg font-semibold"
            style={{
              backgroundColor: theme?.primary || '#00d9ff',
              color: theme?.primaryFg || '#0a0a0a',
            }}
          >
            <a href={ctaUrl}>{ctaText}</a>
          </Button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2 animate-bounce">
        <div
          className="text-2xl"
          style={{ color: theme?.primary || '#00d9ff' }}
        >
          ↓
        </div>
      </div>
    </section>
  );
}
