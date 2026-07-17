'use client';

/**
 * Section FAQ générique (accordion) disponible sur tous les thèmes.
 * Rendu uniquement si activée + au moins une question saisie.
 *
 * Alternative theme-agnostic à `forge-sections/ForgeFAQ` (verrouillé au
 * thème sombre Forge). Utilise les tokens standards de ThemeTokens comme
 * `Video.tsx` pour rester cohérent avec les autres sections.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThemeTokens } from '@/data/store-themes';
import { RADIUS_PX } from '@/data/store-themes';

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQConfig {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  items?: FAQItem[];
}

export function StorefrontFAQ({ config, theme }: { config?: FAQConfig; theme: ThemeTokens }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  if (!config?.enabled) return null;
  const items = (config.items || []).filter((i) => i.question?.trim());
  if (items.length === 0) return null;

  const radius = RADIUS_PX[theme.borderRadius] ?? '12px';
  const title = config.title?.trim() || 'Questions fréquentes';
  const subtitle = config.subtitle?.trim();

  return (
    <section
      className="border-t"
      style={{ borderColor: theme.border, backgroundColor: theme.surfaceMuted }}
    >
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center sm:mb-12">
          <h2
            className="text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="mt-2 text-sm sm:text-base"
              style={{ color: theme.muted, fontFamily: theme.fontBody }}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="space-y-2.5">
          {items.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="overflow-hidden border"
                style={{
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  borderRadius: radius,
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-opacity hover:opacity-90 sm:px-5 sm:py-4"
                  aria-expanded={isOpen}
                >
                  <h3
                    className="text-sm font-semibold sm:text-base"
                    style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
                  >
                    {item.question}
                  </h3>
                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 transition-transform duration-300', isOpen && 'rotate-180')}
                    style={{ color: theme.primary }}
                  />
                </button>
                {isOpen && (
                  <div
                    className="border-t px-4 py-3.5 sm:px-5 sm:py-4"
                    style={{ borderColor: theme.border, backgroundColor: theme.background }}
                  >
                    <p
                      className="whitespace-pre-line text-sm leading-relaxed sm:text-[15px]"
                      style={{ color: theme.muted, fontFamily: theme.fontBody }}
                    >
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
