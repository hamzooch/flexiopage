'use client';

/**
 * Storefront slider/carousel — rendered right under the navbar.
 *
 * Reads slides from store.settings.storefront.slider.slides. Each slide has
 * an image (required), optional title/subtitle/CTA, alignment, and overlay
 * intensity. The seller can add as many slides as needed from the dashboard
 * "Storefront" tab.
 *
 * Features:
 *   - autoplay (configurable interval), paused while the user hovers
 *   - keyboard navigation (← / →)
 *   - swipe on mobile
 *   - dots + prev/next arrows
 *   - respects prefers-reduced-motion
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, mediaUrl } from '@/lib/utils';

export interface SliderSlide {
  image: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  textAlign?: 'left' | 'center' | 'right';
  overlay?: 'none' | 'light' | 'dark';
}

export interface SliderConfig {
  enabled?: boolean;
  autoplay?: boolean;
  autoplayMs?: number;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  slides?: SliderSlide[];
}

const HEIGHT_CLASSES: Record<NonNullable<SliderConfig['height']>, string> = {
  sm: 'h-[260px] sm:h-[320px]',
  md: 'h-[340px] sm:h-[420px]',
  lg: 'h-[420px] sm:h-[520px]',
  xl: 'h-[520px] sm:h-[640px]',
};

const OVERLAY_CLASSES: Record<NonNullable<SliderSlide['overlay']>, string> = {
  none: '',
  light: 'bg-white/30',
  dark: 'bg-black/40',
};

const ALIGN_CLASSES: Record<NonNullable<SliderSlide['textAlign']>, string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
};

interface Props {
  config?: SliderConfig;
  /** Primary brand color from the theme — used for the CTA button. */
  primary?: string;
  primaryFg?: string;
  borderRadius?: number | string;
}

export function StorefrontSlider({ config, primary = '#0ea5e9', primaryFg = '#fff', borderRadius = 9999 }: Props) {
  const slides = (config?.slides || []).filter((s) => s.image?.trim());
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const total = slides.length;

  const go = useCallback((next: number) => {
    if (total === 0) return;
    setIndex(((next % total) + total) % total);
  }, [total]);

  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Autoplay — paused on hover or when there's only one slide.
  useEffect(() => {
    if (!config?.autoplay || total < 2 || paused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const interval = Math.max(2000, config.autoplayMs || 5000);
    const id = window.setInterval(() => setIndex((i) => (i + 1) % total), interval);
    return () => window.clearInterval(id);
  }, [config?.autoplay, config?.autoplayMs, total, paused]);

  // Keyboard navigation
  useEffect(() => {
    if (total < 2) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, total]);

  if (!config?.enabled || total === 0) return null;

  const heightClass = HEIGHT_CLASSES[config.height || 'lg'];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Carrousel de la boutique"
      className={cn('relative w-full overflow-hidden', heightClass)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
        touchStartX.current = null;
      }}
    >
      {/* Slides */}
      {slides.map((s, i) => {
        const isActive = i === index;
        const align = ALIGN_CLASSES[s.textAlign || 'center'];
        const overlay = OVERLAY_CLASSES[s.overlay ?? 'dark'];
        return (
          <div
            key={i}
            aria-hidden={!isActive}
            aria-roledescription="slide"
            aria-label={`${i + 1} sur ${total}`}
            className={cn(
              'absolute inset-0 transition-opacity duration-700 ease-out',
              isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(s.image)}
              alt={s.title || ''}
              className="absolute inset-0 h-full w-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
            />
            <div className={cn('absolute inset-0', overlay)} />
            <div className={cn('relative z-10 mx-auto flex h-full max-w-5xl flex-col justify-center px-6 sm:px-10', align)}>
              {s.title && (
                <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-white drop-shadow sm:text-5xl">
                  {s.title}
                </h2>
              )}
              {s.subtitle && (
                <p className="mt-3 max-w-xl text-base text-white/90 drop-shadow sm:text-lg">
                  {s.subtitle}
                </p>
              )}
              {s.ctaLabel && s.ctaUrl && (
                <a
                  href={s.ctaUrl}
                  className="mt-6 inline-flex h-12 items-center gap-2 px-7 text-sm font-semibold transition-transform hover:scale-[1.02]"
                  style={{
                    background: primary,
                    color: primaryFg,
                    borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                  }}
                >
                  {s.ctaLabel}
                  <span aria-hidden>→</span>
                </a>
              )}
            </div>
          </div>
        );
      })}

      {/* Arrows */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Précédent"
            className="absolute left-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50 sm:left-5 sm:h-12 sm:w-12"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Suivant"
            className="absolute right-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50 sm:right-5 sm:h-12 sm:w-12"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Dots */}
          <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-1.5 sm:bottom-6">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Aller au slide ${i + 1}`}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-8 bg-white' : 'w-3 bg-white/50 hover:bg-white/75'
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
