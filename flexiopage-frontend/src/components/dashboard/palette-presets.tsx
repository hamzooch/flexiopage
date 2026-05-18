'use client';

/**
 * Product-page color palette picker. Each preset bundles the 5 colors
 * that drive the product page look (background, title, price, accent,
 * button bg, button text) so the seller can apply a coherent palette in
 * one click — instead of fiddling with 5 separate color inputs.
 *
 * The picker is shape-agnostic: the same component is used both in the
 * store-wide product-page editor and the per-product editor. Empty values
 * fall back to the active theme, so a half-applied palette still works.
 */

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProductPalette {
  titleColor?: string;
  priceColor?: string;
  accentColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  backgroundColor?: string;
}

interface PaletteDef extends ProductPalette {
  id: string;
  name: string;
  hint: string;
}

/**
 * Curated set of palettes. Each one is internally consistent (price /
 * accent / button share the same family, title sits on its own contrast
 * tier, button text always readable on its button bg).
 */
export const PRODUCT_PALETTES: PaletteDef[] = [
  {
    id: 'classique-noir',
    name: 'Classique noir',
    hint: 'Élégant, sobre, fond clair',
    titleColor: '#0a0a0a',
    priceColor: '#0a0a0a',
    accentColor: '#0a0a0a',
    buttonColor: '#0a0a0a',
    buttonTextColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
  {
    id: 'or-luxe',
    name: 'Or & ardoise',
    hint: 'Premium, mode, bijoux',
    titleColor: '#1b1410',
    priceColor: '#a98455',
    accentColor: '#a98455',
    buttonColor: '#1b1410',
    buttonTextColor: '#f7eed7',
    backgroundColor: '#fbf6ec',
  },
  {
    id: 'vibrant-rose',
    name: 'Rose vibrant',
    hint: 'Beauté, lifestyle féminin',
    titleColor: '#3a0f24',
    priceColor: '#db2777',
    accentColor: '#ec4899',
    buttonColor: '#db2777',
    buttonTextColor: '#ffffff',
    backgroundColor: '#fff1f5',
  },
  {
    id: 'tech-cyan',
    name: 'Tech cyan',
    hint: 'Gadgets, électronique, gaming',
    titleColor: '#0c1428',
    priceColor: '#0891b2',
    accentColor: '#06b6d4',
    buttonColor: '#0891b2',
    buttonTextColor: '#ffffff',
    backgroundColor: '#f0f9ff',
  },
  {
    id: 'urbain-violet',
    name: 'Urbain violet',
    hint: 'Streetwear, gen-Z, créatif',
    titleColor: '#1f0a32',
    priceColor: '#7c3aed',
    accentColor: '#a855f7',
    buttonColor: '#7c3aed',
    buttonTextColor: '#ffffff',
    backgroundColor: '#faf5ff',
  },
  {
    id: 'organique-vert',
    name: 'Organique vert',
    hint: 'Naturel, bio, food, bien-être',
    titleColor: '#0f2e1e',
    priceColor: '#15803d',
    accentColor: '#16a34a',
    buttonColor: '#15803d',
    buttonTextColor: '#ffffff',
    backgroundColor: '#f0fdf4',
  },
  {
    id: 'urgence-rouge',
    name: 'Urgence rouge',
    hint: 'Promo flash, soldes, dropshipping',
    titleColor: '#0a0a0a',
    priceColor: '#dc2626',
    accentColor: '#ef4444',
    buttonColor: '#dc2626',
    buttonTextColor: '#ffffff',
    backgroundColor: '#fef2f2',
  },
  {
    id: 'dark-mode',
    name: 'Mode sombre',
    hint: 'Premium tech, audio, mode dark',
    titleColor: '#f5f5f5',
    priceColor: '#a3e635',
    accentColor: '#a3e635',
    buttonColor: '#a3e635',
    buttonTextColor: '#0a0a0a',
    backgroundColor: '#0a0a0a',
  },
];

interface Props {
  value?: ProductPalette & { paletteId?: string };
  onApply: (next: ProductPalette & { paletteId: string }) => void;
}

export function PalettePresetPicker({ value, onApply }: Props) {
  // Highlight the active palette either by stored id OR by matching on
  // the full color set (so a legacy seller-tweaked config still lights up
  // the matching tile when colors happen to align).
  const activeId =
    value?.paletteId ||
    PRODUCT_PALETTES.find(
      (p) =>
        p.titleColor === value?.titleColor &&
        p.priceColor === value?.priceColor &&
        p.accentColor === value?.accentColor
    )?.id;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Palettes prêtes à l&apos;emploi
        </p>
        {activeId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-2.5 w-2.5" />
            Palette active
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {PRODUCT_PALETTES.map((p) => {
          const active = activeId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onApply({
                paletteId: p.id,
                titleColor: p.titleColor,
                priceColor: p.priceColor,
                accentColor: p.accentColor,
                buttonColor: p.buttonColor,
                buttonTextColor: p.buttonTextColor,
                backgroundColor: p.backgroundColor,
              })}
              className={cn(
                'group flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-all',
                active
                  ? 'border-primary ring-2 ring-primary/15'
                  : 'border-border/60 hover:border-primary/40'
              )}
              title={p.hint}
            >
              {/* Mini swatch preview — 4 stripes that visually summarize the palette */}
              <div
                className="relative h-12 w-full overflow-hidden rounded-lg border border-border/40"
                style={{ backgroundColor: p.backgroundColor || '#ffffff' }}
              >
                <div className="flex h-full">
                  <div className="flex-1" style={{ backgroundColor: p.backgroundColor || '#ffffff' }} />
                  <div className="flex-1" style={{ backgroundColor: p.titleColor || '#0a0a0a' }} />
                  <div className="flex-1" style={{ backgroundColor: p.accentColor || '#7c3aed' }} />
                  <div className="flex-1" style={{ backgroundColor: p.buttonColor || '#0a0a0a' }} />
                </div>
                {active && (
                  <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-primary shadow">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold leading-tight">{p.name}</div>
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                  {p.hint}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onApply({
          paletteId: '',
          titleColor: undefined,
          priceColor: undefined,
          accentColor: undefined,
          buttonColor: undefined,
          buttonTextColor: undefined,
          backgroundColor: undefined,
        })}
        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        Réinitialiser (utiliser les couleurs du thème)
      </button>
    </div>
  );
}
