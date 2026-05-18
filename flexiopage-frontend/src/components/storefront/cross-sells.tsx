/**
 * "Tu aimeras aussi" — server-rendered grid of related products shown
 * under the product detail page. Reads the resolved cross-sell list
 * (already fetched server-side by the page) and renders small cards.
 *
 * Theme-aware: uses the same surface/foreground/primary tokens as the
 * rest of the storefront so it adopts the seller's palette without an
 * extra config knob.
 */
import Link from 'next/link';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import type { ThemeTokens } from '@/data/store-themes';

export interface CrossSellItem {
  _id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  image?: string;
  /** Optional override label rendered as a pill on the card. */
  label?: string;
  /** Optional discount % applied at checkout when the buyer takes this item. */
  discountPct?: number;
}

interface Props {
  items: CrossSellItem[];
  storeSlug: string;
  currency: string;
  theme: ThemeTokens;
}

export function CrossSells({ items, storeSlug, currency, theme }: Props) {
  if (!items || items.length === 0) return null;

  const radius = theme.borderRadius === 'none' ? 0 : 12;
  const pillRadius = theme.borderRadius === 'none' ? 0 : 999;

  return (
    <section className="mt-8 sm:mt-12">
      <div className="mb-5 flex items-center gap-3">
        <span className="inline-block h-px flex-1" style={{ backgroundColor: theme.border }} aria-hidden />
        <h2
          className="text-xl font-bold tracking-tight sm:text-2xl"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          Tu aimeras aussi
        </h2>
        <span className="inline-block h-px flex-1" style={{ backgroundColor: theme.border }} aria-hidden />
      </div>

      <ul
        className="grid gap-3 sm:gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
      >
        {items.map((p) => {
          const hasCompare = !!p.compareAtPrice && p.compareAtPrice > p.price;
          return (
            <li key={p._id}>
              <Link
                href={`/${storeSlug}/product/${p.slug}`}
                className="group block overflow-hidden border transition-transform hover:-translate-y-0.5"
                style={{
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  borderRadius: radius,
                }}
              >
                <div
                  className="relative aspect-square overflow-hidden"
                  style={{ backgroundColor: theme.surfaceMuted }}
                >
                  {p.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={mediaUrl(p.image) || p.image}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="grid h-full place-items-center text-xs"
                      style={{ color: theme.muted }}
                    >
                      Pas d&apos;image
                    </div>
                  )}
                  {p.discountPct && p.discountPct > 0 && (
                    <span
                      className="absolute left-2 top-2 px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{
                        backgroundColor: theme.primary,
                        color: theme.primaryFg,
                        borderRadius: pillRadius,
                      }}
                    >
                      −{p.discountPct}%
                    </span>
                  )}
                  {p.label && (
                    <span
                      className="absolute right-2 top-2 max-w-[60%] truncate px-2 py-0.5 text-[10px] font-semibold backdrop-blur"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.85)',
                        color: theme.foreground,
                        borderRadius: pillRadius,
                      }}
                    >
                      {p.label}
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-2.5">
                  <h3
                    className="line-clamp-2 text-xs font-semibold leading-snug"
                    style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
                  >
                    {p.name}
                  </h3>
                  <div className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
                    <span className="text-xs font-extrabold" style={{ color: theme.primary }}>
                      {formatCurrency(p.price, currency)}
                    </span>
                    {hasCompare && (
                      <span className="text-[10px] line-through" style={{ color: theme.muted }}>
                        {formatCurrency(p.compareAtPrice!, currency)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
