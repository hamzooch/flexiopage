/**
 * FlexioPage brand mark. Renders the official logo from /public/brand/.
 *
 * Variants:
 *   - "color"   → horizontal wordmark, no tagline (default for navbars/headers)
 *   - "primary" → horizontal wordmark + "Crée ta boutique en un clic" tagline
 *                 (best for landing hero / login card where space allows)
 *   - "icon"    → square F. on solid orange (favicon, app icon, OG image)
 *
 * Width is required; height auto-derives to keep aspect ratio per variant.
 */
import Image from 'next/image';
import { cn } from '@/lib/utils';

type Variant = 'color' | 'primary' | 'icon';

interface Props {
  variant?: Variant;
  /** Pixel width; height auto-derives from the variant's aspect ratio. */
  width?: number;
  /** Optional height override (mostly for the square icon variant). */
  height?: number;
  className?: string;
  /** Use `priority` on above-the-fold logos (landing hero, login card). */
  priority?: boolean;
}

/** width/height ratios measured on the source PNGs in /public/brand. */
const FILE_BY_VARIANT: Record<Variant, { file: string; ratio: number }> = {
  color:   { file: 'logo-color.png',   ratio: 932 / 269 },  // ~3.46:1, no tagline
  primary: { file: 'logo-primary.png', ratio: 1330 / 420 }, // ~3.16:1, with tagline
  icon:    { file: 'icon.png',         ratio: 1 },
};

const DEFAULT_WIDTH: Record<Variant, number> = {
  color:   160,
  primary: 280,
  icon:    40,
};

export function BrandLogo({
  variant = 'color',
  width,
  height,
  className,
  priority = false,
}: Props) {
  const cfg = FILE_BY_VARIANT[variant];
  const w = width ?? DEFAULT_WIDTH[variant];
  const h = height ?? Math.round(w / cfg.ratio);

  return (
    <Image
      src={`/brand/${cfg.file}`}
      alt="FlexioPage"
      width={w}
      height={h}
      priority={priority}
      className={cn('select-none', className)}
    />
  );
}
