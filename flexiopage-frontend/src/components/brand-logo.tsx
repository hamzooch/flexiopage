/**
 * FlexioPage brand mark. Renders the official logo from /public/brand/.
 *
 * Variants:
 *   - "color"   → horizontal wordmark, no tagline (default for navbars/headers)
 *   - "primary" → horizontal wordmark + "Crée ta boutique en un clic" tagline
 *                 (best for landing hero / login card where space allows)
 *   - "icon"    → square F. on solid orange (favicon, app icon, OG image)
 *
 * Implémentation : <img> natif plutôt que next/image. Le logo est un asset
 * statique, déjà petit (~10-30 Ko) et servi en PNG depuis /public/brand —
 * aucun bénéfice de l'optimization next/image, et son audit de ratio rentre
 * en conflit avec Tailwind preflight (`max-width: 100%; height: auto`) à
 * cause de l'arrondi int de la prop height. Bascule conscient sur <img>.
 */
import { cn } from '@/lib/utils';

type Variant = 'color' | 'primary' | 'icon';

interface Props {
  variant?: Variant;
  /** Pixel width; height auto-derives from the variant's aspect ratio. */
  width?: number;
  /** Optional height override (mostly for the square icon variant). */
  height?: number;
  className?: string;
  /** Préchargement above-the-fold (landing hero, login card). */
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/${cfg.file}`}
      alt="FlexioPage"
      width={w}
      height={h}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      style={{ width: w, maxWidth: '100%', height: 'auto' }}
      className={cn('select-none', className)}
    />
  );
}
