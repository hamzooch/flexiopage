'use client';

/**
 * Storefront product gallery — interactive main image + clickable thumbnails.
 *
 * Extracted from the (server-rendered) product page so the thumbnails can
 * actually swap the main image client-side. Previously the main image was
 * hardcoded to images[0] and the thumbnails had no onClick, so tapping them
 * did nothing.
 *
 * All theme tokens are passed in as plain data so this stays a thin client
 * island inside the otherwise server-rendered page.
 */

import { useState } from 'react';
import Image from 'next/image';
import { mediaUrl } from '@/lib/utils';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';
import type { ThemeTokens } from '@/data/store-themes';
import { WishlistButton } from '@/components/storefront/wishlist-button';

interface Props {
  images: string[];
  productName: string;
  theme: ThemeTokens;
  /** Pre-computed CSS radius (RADIUS_PX[theme.borderRadius]). */
  radius: string;
  hasDiscount: boolean;
  discountPct: number;
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
  showGallery,
  isDigital,
  kindMeta,
  storeSlug,
  wishlistItem,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Guard against an out-of-range index if the images array ever shrinks.
  const safeIndex = activeIndex < images.length ? activeIndex : 0;
  const activeImage = images[safeIndex];
  const pillRadius = theme.borderRadius === 'none' ? '0' : '999px';

  // Thumbnails make sense only when there's more than one image. We now show
  // ALL images (including the first) so the active one can be re-selected and
  // every angle is reachable — capped so the strip never gets unwieldy.
  const thumbnails = images.slice(0, 8);

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-square overflow-hidden border"
        style={{ backgroundColor: theme.surfaceMuted, borderColor: theme.border, borderRadius: radius }}
      >
        {activeImage ? (
          <Image
            src={mediaUrl(activeImage) || activeImage}
            alt={productName}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            placeholder="blur"
            blurDataURL={IMAGE_BLUR_DATA_URL}
            className="object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center" style={{ color: theme.muted }}>
            Pas d&apos;image
          </div>
        )}
        {hasDiscount && (
          <span
            className="absolute left-4 top-4 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: '#10b981', color: '#fff', borderRadius: pillRadius }}
          >
            −{discountPct}%
          </span>
        )}
        {/* Heart toggle — saves to localStorage, accessible from /wishlist */}
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
      </div>

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
                  sizes="(max-width: 768px) 25vw, 120px"
                  placeholder="blur"
                  blurDataURL={IMAGE_BLUR_DATA_URL}
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
