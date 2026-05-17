/**
 * Testimonials/reviews section managed by the seller.
 *
 * The seller adds entries from the dashboard (name, optional photo, rating
 * 1-5, content). Rendered as a responsive card grid that adapts to the
 * active theme (colors, radius, fonts).
 */
import type { ThemeTokens } from '@/data/store-themes';
import { RADIUS_PX } from '@/data/store-themes';

export interface TestimonialItem {
  author: string;
  role?: string;
  rating?: number;
  content: string;
  avatar?: string;
  productName?: string;
  verified?: boolean;
}

export interface TestimonialsConfig {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  items?: TestimonialItem[];
}

interface Props {
  config?: TestimonialsConfig;
  theme: ThemeTokens;
  /** Override the default heading. */
  defaultTitle?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Stars({ value = 5, color, mutedColor }: { value?: number; color: string; mutedColor: string }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex items-center gap-0.5" aria-label={`Note ${value} sur 5`}>
      {stars.map((i) => (
        <svg
          key={i}
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill={i <= value ? color : mutedColor}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.78 4.8 17.5l.99-5.78-4.21-4.1 5.82-.85L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

export function StorefrontTestimonials({ config, theme, defaultTitle = 'Ils nous font confiance' }: Props) {
  if (!config?.enabled) return null;
  const items = (config.items || []).filter((t) => t?.author?.trim() && t?.content?.trim());
  if (items.length === 0) return null;

  const radius = RADIUS_PX[theme.borderRadius];
  const isEditorial = theme.style === 'editorial';

  return (
    <section
      className="border-t"
      style={{ borderColor: theme.border, backgroundColor: theme.surfaceMuted }}
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <div className={`mb-7 sm:mb-10 ${isEditorial ? '' : 'text-center'}`}>
          {isEditorial && (
            <div
              className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] sm:text-xs"
              style={{ color: theme.accent }}
            >
              — Témoignages
            </div>
          )}
          <h2
            className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl"
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {config.title || defaultTitle}
          </h2>
          {config.subtitle && (
            <p
              className={`mt-3 text-xs leading-relaxed sm:text-sm ${isEditorial ? 'max-w-xl' : 'mx-auto max-w-2xl'}`}
              style={{ color: theme.muted }}
            >
              {config.subtitle}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {items.map((t, i) => (
            <article
              key={i}
              className="flex flex-col border p-4 transition-transform hover:-translate-y-0.5 sm:p-6"
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderRadius: radius,
                color: theme.foreground,
                boxShadow:
                  theme.shadow === 'glow'
                    ? `0 0 24px ${hexA(theme.primary, 0.06)}`
                    : theme.shadow === 'soft'
                      ? '0 6px 18px rgba(0,0,0,0.05)'
                      : '0 1px 0 rgba(0,0,0,0.04)',
              }}
            >
              {/* Rating + verified badge */}
              <div className="mb-4 flex items-center justify-between">
                <Stars value={t.rating || 5} color={theme.primary} mutedColor={theme.border} />
                {t.verified && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: hexA(theme.primary, 0.1),
                      color: theme.primary,
                    }}
                  >
                    ✓ Vérifié
                  </span>
                )}
              </div>

              {/* Quote */}
              <p
                className="flex-1 text-base leading-relaxed"
                style={{ color: theme.foreground, fontFamily: theme.fontBody }}
              >
                « {t.content} »
              </p>

              {/* Author */}
              <div
                className="mt-5 flex items-center gap-3 border-t pt-4"
                style={{ borderColor: theme.border }}
              >
                {t.avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={t.avatar}
                    alt={t.author}
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                    style={{ border: `2px solid ${theme.border}` }}
                  />
                ) : (
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold"
                    style={{
                      background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
                      color: theme.primaryFg,
                    }}
                    aria-hidden
                  >
                    {initials(t.author)}
                  </div>
                )}
                <div className="min-w-0">
                  <div
                    className="truncate text-sm font-semibold"
                    style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
                  >
                    {t.author}
                  </div>
                  {(t.role || t.productName) && (
                    <div className="truncate text-xs" style={{ color: theme.muted }}>
                      {t.role}
                      {t.role && t.productName ? ' · ' : ''}
                      {t.productName ? `Acheté: ${t.productName}` : ''}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function hexA(hex: string | undefined | null, a: number): string {
  if (!hex || typeof hex !== 'string') return 'transparent';
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
