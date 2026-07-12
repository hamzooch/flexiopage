'use client';

import { cn } from '@/lib/utils';

export interface Feature {
  icon: string;
  title: string;
  description: string;
}

export interface ForgeFeaturesProps {
  title: string;
  subtitle: string;
  features: Feature[];
  columns?: 3 | 4;
  theme?: any;
}

export function ForgeFeatures({
  title,
  subtitle,
  features,
  columns = 3,
  theme,
}: ForgeFeaturesProps) {
  return (
    <section
      className="py-20 px-4"
      style={{
        backgroundColor: theme?.surface || '#1a1a1a',
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

        {/* Features Grid */}
        <div
          className={cn(
            'grid gap-8 md:gap-12',
            columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'
          )}
        >
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="text-center"
              style={{
                padding: '2rem',
                borderRadius: theme?.borderRadius === 'small' ? '4px' : '8px',
                backgroundColor: theme?.surfaceMuted || '#131313',
              }}
            >
              {/* Icon */}
              <div className="mb-4 text-5xl">{feature.icon}</div>

              {/* Title */}
              <h3
                className="mb-2 text-xl font-bold"
                style={{
                  fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
                  color: theme?.foreground || '#f0f0f0',
                }}
              >
                {feature.title}
              </h3>

              {/* Description */}
              <p
                className="text-sm"
                style={{
                  color: theme?.muted || '#8a8a8a',
                  fontFamily: theme?.fontBody || 'Inter, sans-serif',
                }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
