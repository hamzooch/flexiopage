'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ForgeFAQProps {
  title: string;
  subtitle: string;
  items: FAQItem[];
  theme?: any;
}

export function ForgeFAQ({
  title,
  subtitle,
  items = [],
  theme,
}: ForgeFAQProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const displayItems = items.length > 0 ? items : [
    {
      question: 'What makes Forge different?',
      answer:
        'We combine cutting-edge performance fabrics with street-ready design. Every piece is lab-tested for durability.',
    },
    {
      question: 'How long does shipping take?',
      answer: 'Standard shipping: 5-7 days. Express: 2-3 days. All orders ship within 1-2 business days.',
    },
    {
      question: 'What\'s your returns policy?',
      answer: '30-day returns on unworn items with tags. Free returns on defects. We cover return shipping.',
    },
  ];

  return (
    <section
      className="py-20 px-4"
      style={{
        backgroundColor: theme?.surfaceMuted || '#131313',
      }}
    >
      <div className="mx-auto max-w-3xl">
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

        {/* FAQ Items */}
        <div className="space-y-3">
          {displayItems.map((item, idx) => (
            <div
              key={idx}
              className="rounded-sm border overflow-hidden"
              style={{
                borderColor: theme?.border || '#2a2a2a',
                backgroundColor: theme?.surface || '#1a1a1a',
              }}
            >
              {/* Question */}
              <button
                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: theme?.surface || '#1a1a1a',
                }}
              >
                <h3
                  className="font-bold text-lg"
                  style={{
                    fontFamily: theme?.fontHeading || 'Space Grotesk, sans-serif',
                    color: theme?.foreground || '#f0f0f0',
                  }}
                >
                  {item.question}
                </h3>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 transition-transform duration-300',
                    openIdx === idx ? 'rotate-180' : ''
                  )}
                  style={{
                    color: theme?.primary || '#00d9ff',
                  }}
                />
              </button>

              {/* Answer */}
              {openIdx === idx && (
                <div
                  className="border-t px-6 py-4"
                  style={{
                    borderColor: theme?.border || '#2a2a2a',
                    backgroundColor: theme?.background || '#0f0f0f',
                  }}
                >
                  <p
                    className="text-base leading-relaxed"
                    style={{
                      color: theme?.muted || '#8a8a8a',
                      fontFamily: theme?.fontBody || 'Inter, sans-serif',
                    }}
                  >
                    {item.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
