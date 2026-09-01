'use client';

/**
 * Storefront product gallery.
 *
 * Mobile: full-width horizontally-scrollable strip with CSS scroll-snap +
 * dot indicators (native swipe, no gesture lib needed). Buyers on mobile
 * expect swipe — the old 4-col thumb grid was a conversion tax.
 *
 * Desktop: main image + clickable thumbnail column, plus a lightbox that
 * opens on click for a full-viewport zoomed view.
 *
 * All theme tokens are passed as plain data so this stays a thin client
 * island inside the otherwise server-rendered page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { mediaUrl, discountBadgeAnimClass, type DiscountBadgeAnimation } from '@/lib/utils';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';
import { lockBodyScroll } from '@/lib/scroll-lock';
import type { ThemeTokens } from '@/data/store-themes';
import { WishlistButton } from '@/components/storefront/wishlist-button';

interface Props {
  images: string[];
  productName: string;
  theme: ThemeTokens;
  radius: string;
  hasDiscount: boolean;
  discountPct: number;
  /** Motion class for the "-XX%" discount pill. Undefined → default pulse. */
  discountAnim?: DiscountBadgeAnimation;
  showGallery: boolean;
  isDigital: boolean;
  kindMeta: { icon: string; label: string } | null;
  storeSlug: string;
  wishlistItem: {
    id: string;
    slug: string;
    name: string;
    image?: string;
    price: number;
    currency: string;
  };
}

function hexA(hex: string | undefined | null, a: number): string {
  if (!hex || typeof hex !== 'string') return 'transparent';
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function ProductGallery({
  images,
  productName,
  theme,
  radius,
  hasDiscount,
  discountPct,
  discountAnim,
  showGallery,
  isDigital,
  kindMeta,
  storeSlug,
  wishlistItem,
}: Props) {
  const badgeAnimClass = discountBadgeAnimClass(discountAnim);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const safeIndex = activeIndex < images.length ? activeIndex : 0;
  const activeImage = images[safeIndex];
  const pillRadius = theme.borderRadius === 'none' ? '0' : '999px';
  const thumbnails = images.slice(0, 8);
  const totalImages = images.length;

  // Mobile scroll-snap tracking — reflect the dot indicator to whichever
  // image is centered in the strip. IntersectionObserver keeps state in
  // sync with native swipe/scroll without polling.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const slides = Array.from(strip.querySelectorAll('[data-slide]')) as HTMLElement[];
    if (slides.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the largest intersection ratio > 0.5.
        let best: IntersectionObserverEntry | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (best && best.intersectionRatio >= 0.5) {
          const idx = Number((best.target as HTMLElement).dataset.slide);
          if (!Number.isNaN(idx)) setActiveIndex(idx);
        }
      },
      { root: strip, threshold: [0, 0.5, 1] }
    );
    slides.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [images]);

  const scrollToIndex = useCallback((idx: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    const slide = strip.querySelector(`[data-slide="${idx}"]`) as HTMLElement | null;
    if (slide) slide.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, []);

  // Keyboard nav in lightbox — arrows to move, escape to close.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowRight') setActiveIndex((i) => Math.min(i + 1, totalImages - 1));
      else if (e.key === 'ArrowLeft') setActiveIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll via le gestionnaire partagé (refcount + classe CSS).
    const releaseLock = lockBodyScroll();
    return () => {
      window.removeEventListener('keydown', onKey);
      releaseLock();
    };
  }, [lightboxOpen, totalImages]);

  return (
    <div className="space-y-3">
      {/* ── MOBILE: swipeable strip. Hidden on lg+. ─────────────────── */}
      <div className="lg:hidden">
        <div
          ref={stripRef}
          className="relative flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {(images.length > 0 ? images : [null]).map((img, i) => (
            <div
              key={i}
              data-slide={i}
              className="relative aspect-square w-full shrink-0 snap-start border"
              style={{
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.border,
                borderRadius: radius,
              }}
            >
              {img ? (
                <Image
                  src={mediaUrl(img) || img}
                  alt={productName}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  placeholder="blur"
                  blurDataURL={IMAGE_BLUR_DATA_URL}
                  className="object-cover"
                  unoptimized={mediaUrl(img)?.includes('cloudinary') ?? false}
                />
              ) : (
                <div className="grid h-full place-items-center" style={{ color: theme.muted }}>
                  Pas d&apos;image
                </div>
              )}
              {i === safeIndex && hasDiscount && (
                <span
                  className={`${badgeAnimClass} absolute left-3 top-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider`}
                  style={{ backgroundColor: '#10b981', color: '#fff', borderRadius: pillRadius }}
                >
                  −{discountPct}%
                </span>
              )}
              {i === safeIndex && isDigital && kindMeta && (
                <span
                  className="absolute right-3 top-3 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold backdrop-blur"
                  style={{
                    backgroundColor: hexA(theme.surface, 0.9),
                    color: theme.foreground,
                    border: `1px solid ${theme.border}`,
                    borderRadius: pillRadius,
                  }}
                >
                  <span>{kindMeta.icon}</span>
                  {kindMeta.label}
                </span>
              )}
              {i === safeIndex && (
                <div className="absolute bottom-3 right-3 z-10">
                  <WishlistButton storeSlug={storeSlug} size="md" item={wishlistItem} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Dot indicators — tap-to-scroll */}
        {totalImages > 1 && (
          <div className="mt-2 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Aller à l'image ${i + 1}`}
                aria-current={i === safeIndex}
                onClick={() => scrollToIndex(i)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === safeIndex ? 20 : 6,
                  backgroundColor: i === safeIndex ? theme.primary : theme.border,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── DESKTOP: main image + thumbnail grid. Hidden on <lg. ────── */}
      <div className="hidden lg:block space-y-3">
        <button
          type="button"
          onClick={() => activeImage && setLightboxOpen(true)}
          disabled={!activeImage}
          className="group relative block aspect-square w-full overflow-hidden border"
          style={{ backgroundColor: theme.surfaceMuted, borderColor: theme.border, borderRadius: radius }}
          aria-label="Zoomer l'image"
        >
          {activeImage ? (
            <Image
              src={mediaUrl(activeImage) || activeImage}
              alt={productName}
              fill
              priority
              sizes="50vw"
              placeholder="blur"
              blurDataURL={IMAGE_BLUR_DATA_URL}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              unoptimized={mediaUrl(activeImage)?.includes('cloudinary') ?? false}
            />
          ) : (
            <div className="grid h-full place-items-center" style={{ color: theme.muted }}>
              Pas d&apos;image
            </div>
          )}
          {hasDiscount && (
            <span
              className={`${badgeAnimClass} absolute left-4 top-4 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider`}
              style={{ backgroundColor: '#10b981', color: '#fff', borderRadius: pillRadius }}
            >
              −{discountPct}%
            </span>
          )}
          <div className="absolute bottom-4 right-4 z-10">
            <WishlistButton storeSlug={storeSlug} size="md" item={wishlistItem} />
          </div>
          {isDigital && kindMeta && (
            <span
              className="absolute right-4 top-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold backdrop-blur"
              style={{
                backgroundColor: hexA(theme.surface, 0.9),
                color: theme.foreground,
                border: `1px solid ${theme.border}`,
                borderRadius: pillRadius,
              }}
            >
              <span>{kindMeta.icon}</span>
              {kindMeta.label}
            </span>
          )}
          {activeImage && (
            <span
              className="pointer-events-none absolute bottom-4 left-4 rounded-full px-2.5 py-1 text-[10px] font-semibold opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
              style={{ backgroundColor: hexA(theme.surface, 0.85), color: theme.foreground }}
              aria-hidden
            >
              Cliquer pour zoomer
            </span>
          )}
        </button>

        {showGallery && thumbnails.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {thumbnails.map((img, i) => {
              const active = i === safeIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Voir l'image ${i + 1}`}
                  aria-pressed={active}
                  className="relative aspect-square overflow-hidden border transition-all"
                  style={{
                    borderColor: active ? theme.primary : theme.border,
                    borderWidth: active ? 2 : 1,
                    borderRadius: radius,
                    opacity: active ? 1 : 0.7,
                  }}
                >
                  <Image
                    src={mediaUrl(img) || img}
                    alt=""
                    fill
                    sizes="120px"
                    placeholder="blur"
                    blurDataURL={IMAGE_BLUR_DATA_URL}
                    className="object-cover"
                    unoptimized={mediaUrl(img)?.includes('cloudinary') ?? false}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── LIGHTBOX — full-viewport zoomed view, arrows to navigate. ── */}
      {lightboxOpen && activeImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vue agrandie du produit"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Fermer"
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {totalImages > 1 && safeIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => Math.max(i - 1, 0)); }}
              aria-label="Image précédente"
              className="absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {totalImages > 1 && safeIndex < totalImages - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => Math.min(i + 1, totalImages - 1)); }}
              aria-label="Image suivante"
              className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <div
            className="relative h-full max-h-[90vh] w-full max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={mediaUrl(activeImage) || activeImage}
              alt={productName}
              fill
              sizes="90vw"
              className="object-contain"
              priority
              unoptimized={mediaUrl(activeImage)?.includes('cloudinary') ?? false}
            />
          </div>

          {totalImages > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              {safeIndex + 1} / {totalImages}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
