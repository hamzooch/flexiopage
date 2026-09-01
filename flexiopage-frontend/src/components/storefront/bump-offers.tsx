'use client';

/**
 * Bump offers rendered inline in the COD form, above the submit button.
 *
 * Reads the enriched upsells returned by /public/stores/:s/products/:p and
 * shows a card-like checkbox row per offer. Buyer ticks → offer is added to
 * the order at the seller-configured discount. Increases AOV without a
 * second decision (proven "order bump" pattern).
 */

import Image from 'next/image';
import { Check } from 'lucide-react';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';
import type { ThemeTokens } from '@/data/store-themes';

export interface BumpOffer {
  _id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  image?: string;
  label?: string;
  discountPct?: number;
}

interface Props {
  offers: BumpOffer[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  currency: string;
  theme: ThemeTokens;
  radius: string;
}

export function BumpOffers({ offers, selectedIds, onToggle, currency, theme, radius }: Props) {
  if (!offers || offers.length === 0) return null;

  return (
    <div className="border-t pt-4" style={{ borderColor: theme.border }}>
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: '#f59e0b18', color: '#b45309' }}
        >
          Offre unique
        </span>
        <span className="text-sm font-bold" style={{ color: theme.foreground }}>
          Ajoute à ta commande
        </span>
      </div>

      <div className="space-y-2">
        {offers.map((o) => {
          const selected = selectedIds.includes(o._id);
          const hasDiscount = !!o.compareAtPrice && o.compareAtPrice > o.price;
          return (
            <button
              key={o._id}
              type="button"
              onClick={() => onToggle(o._id)}
              aria-pressed={selected}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors"
              style={{
                border: `${selected ? 2 : 1}px dashed ${selected ? theme.primary : theme.border}`,
                backgroundColor: selected ? theme.surfaceMuted : theme.background,
                borderRadius: radius,
              }}
            >
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded"
                style={{
                  border: `1.5px solid ${selected ? theme.primary : theme.border}`,
                  backgroundColor: selected ? theme.primary : 'transparent',
                }}
                aria-hidden
              >
                {selected && <Check className="h-3.5 w-3.5" style={{ color: theme.primaryFg }} strokeWidth={3} />}
              </span>

              {o.image && (
                <div
                  className="relative h-12 w-12 shrink-0 overflow-hidden"
                  style={{ borderRadius: radius, backgroundColor: theme.surfaceMuted }}
                >
                  <Image
                    src={mediaUrl(o.image) || o.image}
                    alt=""
                    fill
                    sizes="48px"
                    placeholder="blur"
                    blurDataURL={IMAGE_BLUR_DATA_URL}
                    className="object-cover"
                    unoptimized={mediaUrl(o.image)?.includes('cloudinary') ?? false}
                  />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold leading-snug" style={{ color: theme.foreground }}>
                    {o.label || `Oui, j'ajoute ${o.name}`}
                  </span>
                  {o.discountPct && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: '#10b98118', color: '#047857' }}
                    >
                      −{o.discountPct}%
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: theme.muted }}>
                  {o.label ? o.name : 'Ajouté à ta commande d\'un simple clic'}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-sm font-extrabold" style={{ color: theme.primary }}>
                  +{formatCurrency(o.price, currency)}
                </div>
                {hasDiscount && (
                  <div className="text-[10px] line-through" style={{ color: theme.muted }}>
                    {formatCurrency(o.compareAtPrice!, currency)}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
