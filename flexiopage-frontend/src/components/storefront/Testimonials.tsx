/**
 * Testimonials/reviews section managed by the seller.
 *
 * Le rendu varie selon `theme.layout.testimonials` :
 *   - grid       (défaut) — grille 3 colonnes de cartes, neutre
 *   - editorial  — 1 grand quote par ligne, sérif géant magazine
 *   - carousel   — 1 témoignage mis en avant + petits avatars cliquables en bas
 *   - wall       — mur de mini-citations 1-2 lignes (masonry-like)
 *
 * Chaque thème fixe la sienne dans store-themes.ts pour différencier les
 * boutiques visuellement même quand le seller utilise la même config.
 */
'use client';
import { useState } from 'react';
import type { ThemeTokens } from '@/data/store-themes';
import { RADIUS_PX } from '@/data/store-themes';
import { mediaUrl } from '@/lib/utils';

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

function Stars({ value = 5, color, mutedColor, size = 14 }: { value?: number; color: string; mutedColor: string; size?: number }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex items-center gap-0.5" aria-label={`Note ${value} sur 5`}>
      {stars.map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
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

function hexA(hex: string | undefined | null, a: number): string {
  if (!hex || typeof hex !== 'string') return 'transparent';
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function Avatar({ t, theme, size = 44 }: { t: TestimonialItem; theme: ThemeTokens; size?: number }) {
  if (t.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mediaUrl(t.avatar) || t.avatar}
        alt={t.author}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, border: `2px solid ${theme.border}` }}
      />
    );
  }
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.32),
        background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        color: theme.primaryFg,
      }}
      aria-hidden
    >
      {initials(t.author)}
    </div>
  );
}

export function StorefrontTestimonials({ config, theme, defaultTitle = 'Ils nous font confiance' }: Props) {
  if (!config?.enabled) return null;
  const items = (config.items || []).filter((t) => t?.author?.trim() && t?.content?.trim());
  if (items.length === 0) return null;

  const variant = theme.layout?.testimonials || 'grid';

  return (
    <section
      className="border-t"
      style={{ borderColor: theme.border, backgroundColor: theme.surfaceMuted }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        {variant === 'editorial'   && <EditorialVariant items={items} theme={theme} config={config} defaultTitle={defaultTitle} />}
        {variant === 'carousel'    && <CarouselVariant items={items} theme={theme} config={config} defaultTitle={defaultTitle} />}
        {variant === 'wall'        && <WallVariant items={items} theme={theme} config={config} defaultTitle={defaultTitle} />}
        {(!variant || variant === 'grid') && <GridVariant items={items} theme={theme} config={config} defaultTitle={defaultTitle} />}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Header partagé (sauf editorial qui a son propre traitement)
// ────────────────────────────────────────────────────────────────────

function Heading({
  config,
  defaultTitle,
  theme,
  align = 'center',
}: {
  config: TestimonialsConfig;
  defaultTitle: string;
  theme: ThemeTokens;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`mb-8 sm:mb-12 ${align === 'left' ? '' : 'text-center'}`}>
      <h2
        className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl"
        style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
      >
        {config.title || defaultTitle}
      </h2>
      {config.subtitle && (
        <p
          className={`mt-3 text-sm leading-relaxed sm:text-base ${align === 'left' ? 'max-w-2xl' : 'mx-auto max-w-2xl'}`}
          style={{ color: theme.muted }}
        >
          {config.subtitle}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// 1. GRID — défaut, conversion-safe (3 colonnes de cartes)
// ────────────────────────────────────────────────────────────────────

interface VariantProps {
  items: TestimonialItem[];
  theme: ThemeTokens;
  config: TestimonialsConfig;
  defaultTitle: string;
}

function GridVariant({ items, theme, config, defaultTitle }: VariantProps) {
  const radius = RADIUS_PX[theme.borderRadius];
  return (
    <>
      <Heading config={config} defaultTitle={defaultTitle} theme={theme} />
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {items.map((t, i) => (
          <article
            key={i}
            className="flex flex-col border p-5 transition-transform hover:-translate-y-0.5 sm:p-6"
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
            <div className="mb-4 flex items-center justify-between">
              <Stars value={t.rating || 5} color={theme.primary} mutedColor={theme.border} />
              {t.verified && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: hexA(theme.primary, 0.1), color: theme.primary }}
                >
                  ✓ Vérifié
                </span>
              )}
            </div>
            <p className="flex-1 text-base leading-relaxed" style={{ color: theme.foreground, fontFamily: theme.fontBody }}>
              « {t.content} »
            </p>
            <div className="mt-5 flex items-center gap-3 border-t pt-4" style={{ borderColor: theme.border }}>
              <Avatar t={t} theme={theme} size={44} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold" style={{ color: theme.foreground, fontFamily: theme.fontHeading }}>
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
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// 2. EDITORIAL — 1 grand quote par ligne, sérif géant
// ────────────────────────────────────────────────────────────────────

function EditorialVariant({ items, theme, config, defaultTitle }: VariantProps) {
  return (
    <>
      <div className="mb-12 sm:mb-16">
        <div
          className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] sm:text-xs"
          style={{ color: theme.accent }}
        >
          — Témoignages
        </div>
        <h2
          className="text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          {config.title || defaultTitle}
        </h2>
        {config.subtitle && (
          <p
            className="mt-5 max-w-2xl text-sm leading-relaxed sm:text-base"
            style={{ color: theme.muted, fontFamily: theme.fontBody }}
          >
            {config.subtitle}
          </p>
        )}
      </div>

      <div className="space-y-12 sm:space-y-16">
        {items.slice(0, 5).map((t, i) => (
          <article
            key={i}
            className="grid gap-6 border-t pt-10 sm:grid-cols-[1fr_2fr] sm:gap-12 sm:pt-12"
            style={{ borderColor: theme.border }}
          >
            {/* Colonne gauche : auteur */}
            <div className="space-y-3">
              <Avatar t={t} theme={theme} size={56} />
              <div>
                <div className="text-base font-bold" style={{ color: theme.foreground, fontFamily: theme.fontHeading }}>
                  {t.author}
                </div>
                {(t.role || t.productName) && (
                  <div className="mt-0.5 text-xs" style={{ color: theme.muted }}>
                    {t.role}
                    {t.role && t.productName ? ' · ' : ''}
                    {t.productName ? `Acheté: ${t.productName}` : ''}
                  </div>
                )}
              </div>
              <Stars value={t.rating || 5} color={theme.primary} mutedColor={theme.border} size={16} />
            </div>
            {/* Colonne droite : citation géante */}
            <blockquote
              className="text-xl leading-relaxed sm:text-2xl lg:text-3xl"
              style={{
                color: theme.foreground,
                fontFamily: theme.fontHeading,
                fontStyle: 'italic',
              }}
            >
              <span style={{ color: theme.accent, fontSize: '2em', lineHeight: 0 }}>“</span>
              {t.content}
              <span style={{ color: theme.accent, fontSize: '2em', lineHeight: 0 }}>”</span>
            </blockquote>
          </article>
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// 3. CAROUSEL — 1 testimonial mis en avant + petits avatars sélecteurs
// ────────────────────────────────────────────────────────────────────

function CarouselVariant({ items, theme, config, defaultTitle }: VariantProps) {
  const [active, setActive] = useState(0);
  const radius = RADIUS_PX[theme.borderRadius];
  const safe = items[Math.min(active, items.length - 1)] || items[0];

  return (
    <>
      <Heading config={config} defaultTitle={defaultTitle} theme={theme} />

      {/* Carte centrale grande */}
      <article
        className="relative mx-auto max-w-3xl overflow-hidden p-8 sm:p-12"
        style={{
          backgroundColor: theme.surface,
          borderRadius: radius,
          border: `1px solid ${theme.border}`,
          boxShadow:
            theme.shadow === 'glow'
              ? `0 0 60px ${hexA(theme.primary, 0.12)}`
              : '0 20px 40px -20px rgba(0,0,0,0.15)',
        }}
      >
        {/* Soft gradient blob en arrière-plan */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl"
          style={{ background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})` }}
          aria-hidden
        />
        <div className="relative">
          {/* Énorme guillemet */}
          <div
            className="select-none text-7xl leading-none sm:text-8xl"
            style={{ color: hexA(theme.primary, 0.35), fontFamily: theme.fontHeading }}
            aria-hidden
          >
            “
          </div>
          <p
            className="-mt-6 text-lg leading-relaxed sm:text-2xl"
            style={{ color: theme.foreground, fontFamily: theme.fontBody }}
          >
            {safe.content}
          </p>
          <div className="mt-6 flex items-center gap-3 sm:mt-8">
            <Avatar t={safe} theme={theme} size={52} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-bold" style={{ color: theme.foreground, fontFamily: theme.fontHeading }}>
                  {safe.author}
                </span>
                {safe.verified && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                    style={{ backgroundColor: hexA(theme.primary, 0.15), color: theme.primary }}
                  >
                    ✓
                  </span>
                )}
              </div>
              {(safe.role || safe.productName) && (
                <div className="truncate text-xs" style={{ color: theme.muted }}>
                  {safe.role}
                  {safe.role && safe.productName ? ' · ' : ''}
                  {safe.productName ? `Acheté: ${safe.productName}` : ''}
                </div>
              )}
              <div className="mt-1">
                <Stars value={safe.rating || 5} color={theme.primary} mutedColor={theme.border} size={13} />
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* Avatars sélecteurs sous la carte */}
      {items.length > 1 && (
        <div className="mt-8 flex justify-center gap-3">
          {items.slice(0, 8).map((t, i) => {
            const isActive = i === active;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Voir le témoignage de ${t.author}`}
                aria-pressed={isActive}
                className="relative shrink-0 transition-transform"
                style={{
                  transform: isActive ? 'scale(1.15)' : 'scale(1)',
                }}
              >
                <div
                  style={{
                    boxShadow: isActive ? `0 0 0 3px ${theme.primary}` : 'none',
                    borderRadius: '9999px',
                    transition: 'box-shadow 0.2s',
                  }}
                >
                  <Avatar t={t} theme={theme} size={40} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// 4. WALL — mur de mini-citations courtes (masonry-like)
// ────────────────────────────────────────────────────────────────────

function WallVariant({ items, theme, config, defaultTitle }: VariantProps) {
  const radius = RADIUS_PX[theme.borderRadius];
  return (
    <>
      <Heading config={config} defaultTitle={defaultTitle} theme={theme} align="center" />
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 lg:gap-5">
        {items.map((t, i) => (
          <article
            key={i}
            className="mb-4 break-inside-avoid border p-4 sm:p-5 lg:mb-5"
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderRadius: radius,
              color: theme.foreground,
            }}
          >
            <Stars value={t.rating || 5} color={theme.primary} mutedColor={theme.border} size={12} />
            <p
              className="mt-3 text-sm leading-snug sm:text-base"
              style={{ color: theme.foreground, fontFamily: theme.fontBody }}
            >
              « {t.content} »
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Avatar t={t} theme={theme} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold" style={{ color: theme.foreground }}>
                  {t.author}
                </div>
                {t.role && (
                  <div className="truncate text-[10px]" style={{ color: theme.muted }}>
                    {t.role}
                  </div>
                )}
              </div>
              {t.verified && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                  style={{ backgroundColor: hexA(theme.primary, 0.12), color: theme.primary }}
                >
                  ✓
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
