'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ForgeNewsletterProps {
  title: string;
  description: string;
  ctaText: string;
  badge?: string;
  onSubmit?: (email: string) => void;
  theme?: any;
}

export function ForgeNewsletter({
  title,
  description,
  ctaText,
  badge = '10% OFF your first order',
  onSubmit,
  theme,
}: ForgeNewsletterProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      onSubmit?.(email);
      setSubmitted(true);
      setEmail('');
      setTimeout(() => setSubmitted(false), 3000);
    }
  };

  return (
    <section
      className="relative overflow-hidden py-20 px-4"
      style={{
        background: `linear-gradient(135deg, ${theme?.primary || '#00d9ff'} 0%, ${theme?.accent || '#00ff7f'} 100%)`,
      }}
    >
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, 0.1) 25%, rgba(255, 255, 255, 0.1) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, 0.1) 75%, rgba(255, 255, 255, 0.1) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, 0.1) 25%, rgba(255, 255, 255, 0.1) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, 0.1) 75%, rgba(255, 255, 255, 0.1) 76%, transparent 77%, transparent)',
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        {/* Badge */}
        {badge && (
          <div
            className="mb-4 inline-block rounded-full px-4 py-2 text-sm font-bold"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: theme?.primaryFg || '#0a0a0a',
              fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
            }}
          >
            {badge}
          </div>
        )}

        {/* Title */}
        <h2
          className="mb-4 text-4xl font-bold md:text-5xl"
          style={{
            fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
            color: theme?.primaryFg || '#0a0a0a',
          }}
        >
          {title}
        </h2>

        {/* Description */}
        <p
          className="mb-8 text-lg"
          style={{
            color: theme?.primaryFg || '#0a0a0a',
            fontFamily: theme?.fontBody || 'Inter, sans-serif',
            opacity: 0.95,
          }}
        >
          {description}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              color: '#0a0a0a',
              borderColor: 'rgba(255, 255, 255, 0.3)',
            }}
          />
          <Button
            type="submit"
            className="px-8 py-3 text-lg font-bold"
            style={{
              backgroundColor: theme?.primaryFg || '#0a0a0a',
              color: theme?.primary || '#00d9ff',
            }}
          >
            {submitted ? '✓ Subscribed!' : ctaText}
          </Button>
        </form>

        {/* Message */}
        {submitted && (
          <p
            className="mt-4 text-sm"
            style={{
              color: theme?.primaryFg || '#0a0a0a',
              fontFamily: theme?.fontBody || 'Inter, sans-serif',
            }}
          >
            Check your email for your discount code!
          </p>
        )}
      </div>
    </section>
  );
}
