'use client';

/**
 * Variant picker with visual affordances.
 *
 * Replaces a text-only pill list. When a variant has a "Couleur" option that
 * maps to a known color (French/English name or hex), render a color dot;
 * otherwise render a labelled pill (fine for sizes, materials, capacities).
 *
 * Grouping: variants are grouped by their first differentiating option key
 * (e.g. "Couleur", "Taille"), so the buyer sees separate rows instead of one
 * long flat strip.
 */

import { cn, formatCurrency } from '@/lib/utils';
import type { ThemeTokens } from '@/data/store-themes';

export interface Variant {
  name: string;
  sku?: string;
  price?: number;
  stock?: number;
  options?: Record<string, string>;
}

interface Props {
  variants: Variant[];
  activeIdx: number;
  onSelect: (idx: number) => void;
  productPrice: number;
  currency: string;
  trackInventory: boolean;
  allowBackorder: boolean;
  theme: ThemeTokens;
  radius: string;
}

// Common color names in French + English → CSS color. Keeps the seller from
// having to type hex codes; falls back to the raw value if it looks like a
// hex color, otherwise falls back to `null` (renders a text pill instead of
// a dot).
const COLOR_NAMES: Record<string, string> = {
  // French
  noir: '#0a0a0a', blanc: '#ffffff', gris: '#9ca3af', rouge: '#dc2626',
  bleu: '#2563eb', vert: '#16a34a', jaune: '#eab308', orange: '#f97316',
  rose: '#ec4899', violet: '#a855f7', marron: '#78350f', beige: '#e7dcc5',
  ivoire: '#fffff0', kaki: '#6b7c3a', doré: '#d4af37', argenté: '#c0c0c0',
  turquoise: '#14b8a6', bordeaux: '#7a1230', crème: '#fbf7f0', bronze: '#cd7f32',
  // English
  black: '#0a0a0a', white: '#ffffff', gray: '#9ca3af', grey: '#9ca3af',
  red: '#dc2626', blue: '#2563eb', green: '#16a34a', yellow: '#eab308',
  pink: '#ec4899', purple: '#a855f7', brown: '#78350f', gold: '#d4af37',
  silver: '#c0c0c0', navy: '#0f2447', maroon: '#7a1230', ivory: '#fffff0',
  cream: '#fbf7f0', olive: '#6b7c3a',
};

function colorFor(value: string | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  // Try exact, then strip accents (Rouge → rouge, Doré → dore)
  if (COLOR_NAMES[raw]) return COLOR_NAMES[raw];
  const stripped = raw.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return COLOR_NAMES[stripped] || null;
}

const COLOR_KEYS = ['couleur', 'color', 'colour'];

/** Group variants by their first differentiating option key. Falls back to a
 * single 'Variante' group when variants have no options. */
function groupVariants(variants: Variant[]): Map<string, Array<{ v: Variant; idx: number }>> {
  const groups = new Map<string, Array<{ v: Variant; idx: number }>>();
  variants.forEach((v, idx) => {
    // Prefer the first option key; if none, all under "Variante".
    const key = v.options ? Object.keys(v.options)[0] : null;
    const groupKey = key || 'Variante';
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push({ v, idx });
  });
  return groups;
}

export function VariantSwatches({
  variants, activeIdx, onSelect, productPrice, currency,
  trackInventory, allowBackorder, theme, radius,
}: Props) {
  const groups = groupVariants(variants);
  const active = variants[Math.min(activeIdx, variants.length - 1)];

  return (
    <div className="space-y-3">
      {Array.from(groups.entries()).map(([groupKey, items]) => {
        const isColorGroup = COLOR_KEYS.includes(groupKey.toLowerCase());
        const activeValue = active?.options?.[groupKey] || active?.name;

        return (
          <div key={groupKey}>
            <div className="mb-1.5 flex items-baseline gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wider" style={{ color: theme.muted }}>
                {groupKey}
              </span>
              {activeValue && (
                <span className="font-medium" style={{ color: theme.foreground }}>
                  {activeValue}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {items.map(({ v, idx }) => {
                const isActive = idx === activeIdx;
                const outOfStock = (v.stock ?? 0) <= 0 && trackInventory && !allowBackorder;
                const value = v.options?.[groupKey] || v.name;
                const dot = isColorGroup ? colorFor(value) : null;

                if (dot) {
                  // Color dot swatch — circular, colored fill, ring on active
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => onSelect(idx)}
                      title={outOfStock ? `${value} — rupture` : value}
                      aria-label={value}
                      aria-pressed={isActive}
                      className={cn(
                        'relative h-9 w-9 rounded-full border-2 transition-all',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                      )}
                      style={{
                        backgroundColor: dot,
                        borderColor: isActive ? theme.primary : theme.border,
                        boxShadow: isActive ? `0 0 0 2px ${theme.background}, 0 0 0 4px ${theme.primary}` : undefined,
                      }}
                    >
                      {outOfStock && (
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{ background: `linear-gradient(135deg, transparent 45%, ${theme.muted} 45%, ${theme.muted} 55%, transparent 55%)` }}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                }

                // Text pill swatch — sizes, materials, capacities, anything non-color
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => onSelect(idx)}
                    className={cn(
                      'inline-flex min-w-[3rem] items-center justify-center gap-1.5 border px-3 py-2 text-xs font-semibold transition-all',
                      'disabled:cursor-not-allowed disabled:line-through disabled:opacity-50',
                    )}
                    style={{
                      borderColor: isActive ? theme.primary : theme.border,
                      backgroundColor: isActive ? theme.primary : 'transparent',
                      color: isActive ? theme.primaryFg : theme.foreground,
                      borderRadius: radius,
                      borderWidth: isActive ? 2 : 1,
                    }}
                    title={outOfStock ? `${value} — rupture` : value}
                  >
                    {value}
                    {typeof v.price === 'number' && v.price !== productPrice && (
                      <span className="opacity-70">· {formatCurrency(v.price, currency)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {active && (
        <p className="text-[11px]" style={{ color: (active.stock ?? 0) > 0 ? '#047857' : '#dc2626' }}>
          {(active.stock ?? 0) > 0 ? `✓ ${active.stock} en stock` : 'Rupture de stock'}
        </p>
      )}
    </div>
  );
}
