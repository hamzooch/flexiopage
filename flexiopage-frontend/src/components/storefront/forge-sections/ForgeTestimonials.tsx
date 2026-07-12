'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  rating: number;
  image?: string;
}

interface ForgeTestimonialsProps {
  title: string;
  subtitle: string;
  testimonials: Testimonial[];
  theme?: any;
}

export function ForgeTestimonials({
  title,
  subtitle,
  testimonials = [],
  theme,
}: ForgeTestimonialsProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  const displayTestimonials = testimonials.length > 0 ? testimonials : [
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
  ];

  const current = displayTestimonials[activeIdx];

  return (
    <section
      className="py-20 px-4"
      style={{
        backgroundColor: theme?.surface || '#1a1a1a',
      }}
    >
      <div className="mx-auto max-w-4xl">
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

        {/* Featured Testimonial */}
        <div
          className="mb-12 rounded-sm border p-8 md:p-12"
          style={{
            backgroundColor: theme?.background || '#0f0f0f',
            borderColor: theme?.border || '#2a2a2a',
          }}
        >
          {/* Rating */}
          <div className="mb-4 flex gap-1">
            {[...Array(current.rating)].map((_, i) => (
              <span
                key={i}
                className="text-2xl"
                style={{ color: theme?.primary || '#00d9ff' }}
              >
                ★
              </span>
            ))}
          </div>

          {/* Quote */}
          <blockquote
            className="mb-8 text-2xl font-bold md:text-3xl"
            style={{
              fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
              color: theme?.foreground || '#f0f0f0',
            }}
          >
            "{current.quote}"
          </blockquote>

          {/* Author */}
          <div className="flex items-center gap-4">
            {current.image && (
              <img
                src={current.image}
                alt={current.author}
                className="h-12 w-12 rounded-full"
              />
            )}
            <div>
              <div
                className="font-bold"
                style={{
                  fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
                  color: theme?.foreground || '#f0f0f0',
                }}
              >
                {current.author}
              </div>
              <div
                className="text-sm"
                style={{
                  color: theme?.muted || '#8a8a8a',
                  fontFamily: theme?.fontBody || 'Inter, sans-serif',
                }}
              >
                {current.role}
              </div>
            </div>
          </div>
        </div>

        {/* Thumbnails */}
        {displayTestimonials.length > 1 && (
          <div className="flex items-center justify-center gap-2 overflow-x-auto pb-4">
            {displayTestimonials.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIdx(idx)}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  idx === activeIdx ? 'w-8' : 'w-2'
                )}
                style={{
                  backgroundColor:
                    idx === activeIdx
                      ? theme?.primary || '#00d9ff'
                      : theme?.border || '#2a2a2a',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
