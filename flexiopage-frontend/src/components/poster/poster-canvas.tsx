'use client';

/**
 * PosterCanvas — vertical ad-style poster (768 × ~2200), TryAd-inspired.
 *
 * Three theme variants:
 *   - gold-dark   : black + gold luxury (mini-cinema example)
 *   - cinema      : deep black with golden serif headlines
 *   - warm-tan    : warm beige/sand artisan editorial
 *
 * Sections (always in this order):
 *   1. Hero    : badge + title + product photo + price + trust badges + CTA
 *   2. Features: 3 icon-pills with copy
 *   3. Social  : 2 customer testimonials with generated avatars + 5-star
 *   4. Footer  : big CTA button + reassurance line
 *
 * The canvas is exported by html-to-image; everything is pure HTML/CSS so the
 * resulting PNG is identical to the on-screen preview.
 */

import {
  Check, Shield, Truck, Clock, Star, Sparkles, Zap, Gift, Crown, Lock, RefreshCw,
  Wallet, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import type { PosterContent, PosterFeature } from '@/lib/api';

const ICONS: Record<PosterFeature['icon'], LucideIcon> = {
  check: Check,
  shield: Shield,
  truck: Truck,
  clock: Clock,
  star: Star,
  sparkles: Sparkles,
  zap: Zap,
  gift: Gift,
  crown: Crown,
  lock: Lock,
  refresh: RefreshCw,
};

interface ThemeStyle {
  background: string;          // CSS background
  surface: string;             // card bg
  primaryText: string;
  mutedText: string;
  accent: string;              // headline + CTA color
  accentSoft: string;          // accent backgrounds
  border: string;
  ctaBg: string;               // CTA button background (gradient or color)
  ctaText: string;
  fontHeading: string;
  fontBody: string;
}

const THEMES: Record<PosterContent['theme'], ThemeStyle> = {
  'gold-dark': {
    background: 'linear-gradient(180deg, #1a1410 0%, #0d0a08 50%, #1a1410 100%)',
    surface: '#1f1812',
    primaryText: '#ffffff',
    mutedText: '#bfa685',
    accent: '#d9b56a',
    accentSoft: 'rgba(217, 181, 106, 0.12)',
    border: 'rgba(217, 181, 106, 0.25)',
    ctaBg: 'linear-gradient(180deg, #d9b56a 0%, #b08d3f 100%)',
    ctaText: '#1a1410',
    fontHeading: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    fontBody: '"Inter", system-ui, sans-serif',
  },
  cinema: {
    background: 'linear-gradient(180deg, #050505 0%, #0e0e10 100%)',
    surface: '#141416',
    primaryText: '#ffffff',
    mutedText: '#9ca3af',
    accent: '#f5d76e',
    accentSoft: 'rgba(245, 215, 110, 0.1)',
    border: 'rgba(245, 215, 110, 0.3)',
    ctaBg: 'linear-gradient(180deg, #f5d76e 0%, #c89d2c 100%)',
    ctaText: '#0c0a08',
    fontHeading: '"Inter", system-ui, sans-serif',
    fontBody: '"Inter", system-ui, sans-serif',
  },
  'warm-tan': {
    background: 'linear-gradient(180deg, #f5ebd9 0%, #e8d5b4 100%)',
    surface: '#ffffff',
    primaryText: '#3d2c1c',
    mutedText: '#7a6850',
    accent: '#a8743a',
    accentSoft: 'rgba(168, 116, 58, 0.1)',
    border: 'rgba(168, 116, 58, 0.25)',
    ctaBg: 'linear-gradient(180deg, #c9a674 0%, #a8743a 100%)',
    ctaText: '#ffffff',
    fontHeading: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    fontBody: '"Inter", system-ui, sans-serif',
  },
};

function fmtCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

interface Props {
  content: PosterContent;
  /** ref forwarded to the root element so parent can html-to-image it. */
  exportRef?: React.RefObject<HTMLDivElement | null>;
}

export function PosterCanvas({ content, exportRef }: Props) {
  const t = THEMES[content.theme];
  const isRtl = content.direction === 'rtl';
  const format = content.format || 'story';

  // Compact formats (square / landscape) get their own dedicated layouts.
  if (format === 'square') {
    return <SquarePoster content={content} t={t} isRtl={isRtl} exportRef={exportRef} />;
  }
  if (format === 'landscape') {
    return <LandscapePoster content={content} t={t} isRtl={isRtl} exportRef={exportRef} />;
  }

  // Default 'story' layout — full 768×~2200 vertical canvas
  return (
    <div
      ref={exportRef as React.Ref<HTMLDivElement>}
      dir={content.direction}
      lang={content.language}
      style={{
        width: 768,
        background: t.background,
        color: t.primaryText,
        fontFamily: t.fontBody,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative top glow */}
      <div
        style={{
          position: 'absolute',
          top: -100,
          [isRtl ? 'left' : 'right']: -100,
          width: 360,
          height: 360,
          borderRadius: 999,
          background: t.accent,
          opacity: 0.18,
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
        aria-hidden
      />

      {/* ─── HERO ─── */}
      <section style={{ padding: '60px 56px 40px', position: 'relative', textAlign: isRtl ? 'right' : 'left' }}>
        {content.hero.badge && (
          <div
            style={{
              display: 'inline-block',
              padding: '6px 14px',
              borderRadius: 999,
              background: t.accentSoft,
              border: `1px solid ${t.border}`,
              color: t.accent,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            {content.hero.badge}
          </div>
        )}
        {content.hero.eyebrow && (
          <div style={{ color: t.mutedText, fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
            {content.hero.eyebrow}
          </div>
        )}
        <h1
          style={{
            fontFamily: t.fontHeading,
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1,
            margin: 0,
            color: t.primaryText,
          }}
        >
          {content.hero.title}
        </h1>
        <p
          style={{
            color: t.mutedText,
            fontSize: 18,
            lineHeight: 1.5,
            marginTop: 16,
            maxWidth: 540,
            ...(isRtl ? { marginLeft: 'auto' } : {}),
          }}
        >
          {content.hero.subtitle}
        </p>

        {/* Product image + price card */}
        <div style={{ position: 'relative', marginTop: 32 }}>
          {content.hero.productImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={content.hero.productImageUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                objectFit: 'cover',
                borderRadius: 24,
                border: `1px solid ${t.border}`,
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                borderRadius: 24,
                background: t.surface,
                display: 'grid',
                placeItems: 'center',
                color: t.mutedText,
                fontSize: 14,
                border: `1px solid ${t.border}`,
              }}
            >
              Photo produit
            </div>
          )}
          {/* Discount badge floating */}
          {content.pricing.discountBadge && (
            <div
              style={{
                position: 'absolute',
                top: -16,
                [isRtl ? 'right' : 'left']: -16,
                background: t.ctaBg,
                color: t.ctaText,
                padding: '12px 16px',
                borderRadius: 999,
                fontWeight: 800,
                fontSize: 16,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              }}
            >
              {content.pricing.discountBadge}
            </div>
          )}
        </div>

        {/* Pricing block */}
        <div
          style={{
            marginTop: 24,
            padding: 20,
            borderRadius: 18,
            background: t.accentSoft,
            border: `1px solid ${t.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexDirection: isRtl ? 'row-reverse' : 'row',
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: t.mutedText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>
              Promotion limitée
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
              <span style={{ fontFamily: t.fontHeading, fontSize: 44, fontWeight: 800, color: t.accent }}>
                {fmtCurrency(content.pricing.priceAfter, content.pricing.currency)}
              </span>
              {content.pricing.priceBefore && content.pricing.priceBefore > content.pricing.priceAfter && (
                <span style={{ color: t.mutedText, fontSize: 18, textDecoration: 'line-through' }}>
                  {fmtCurrency(content.pricing.priceBefore, content.pricing.currency)}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {content.trustBadges.slice(0, 2).map((b, i) => (
              <div
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: t.mutedText,
                  fontWeight: 600,
                }}
              >
                {i === 0 ? <Truck size={14} /> : <Wallet size={14} />}
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section style={{ padding: '20px 56px 40px', textAlign: isRtl ? 'right' : 'left' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {content.features.map((f, i) => {
            const Icon = ICONS[f.icon] || Check;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  padding: 20,
                  borderRadius: 16,
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  flexDirection: isRtl ? 'row-reverse' : 'row',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: t.accentSoft,
                    color: t.accent,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: t.primaryText }}>{f.title}</div>
                  <div style={{ fontSize: 14, color: t.mutedText, marginTop: 4, lineHeight: 1.5 }}>{f.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section style={{ padding: '20px 56px 40px' }}>
        <div
          style={{
            padding: 24,
            borderRadius: 20,
            background: t.surface,
            border: `1px solid ${t.border}`,
          }}
        >
          {/* Stars */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 16 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} size={20} fill={t.accent} stroke={t.accent} />
            ))}
          </div>

          {content.testimonials.map((tt, i) => (
            <div
              key={i}
              style={{
                marginTop: i > 0 ? 24 : 0,
                paddingTop: i > 0 ? 24 : 0,
                borderTop: i > 0 ? `1px solid ${t.border}` : 'none',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                flexDirection: isRtl ? 'row-reverse' : 'row',
                textAlign: isRtl ? 'right' : 'left',
              }}
            >
              {tt.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tt.avatarUrl}
                  alt=""
                  crossOrigin="anonymous"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    objectFit: 'cover',
                    border: `2px solid ${t.accent}`,
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    background: t.accentSoft,
                    color: t.accent,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 20,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {tt.author?.[0] || '?'}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 16, color: t.primaryText, lineHeight: 1.5, fontStyle: 'italic', margin: 0 }}>
                  &ldquo;{tt.quote}&rdquo;
                </p>
                <div style={{ marginTop: 8, fontSize: 13, color: t.mutedText, fontWeight: 600 }}>
                  — {tt.author}{tt.role ? `, ${tt.role}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section style={{ padding: '20px 56px 60px', textAlign: 'center' }}>
        <div
          style={{
            padding: '24px 32px',
            borderRadius: 999,
            background: t.ctaBg,
            color: t.ctaText,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 1,
            textTransform: 'uppercase',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}
        >
          {content.cta.label}
        </div>
        {content.cta.reassurance && (
          <div
            style={{
              marginTop: 14,
              fontSize: 13,
              color: t.mutedText,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShieldCheck size={14} />
            {content.cta.reassurance}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Compact layouts ────────────────────────────────────────────────────
// Square (1080×1080) and landscape (1200×630) only render hero + price +
// CTA so the layout breathes at small canvas sizes. Features and
// testimonials are omitted on purpose — they're poster-only signals.

interface CompactProps {
  content: PosterContent;
  t: ThemeStyle;
  isRtl: boolean;
  exportRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * 1080 × 1080 — Facebook / Instagram feed post.
 * Layout: badge + title (top), product image (center, large), price + CTA (bottom).
 */
function SquarePoster({ content, t, isRtl, exportRef }: CompactProps) {
  return (
    <div
      ref={exportRef as React.Ref<HTMLDivElement>}
      dir={content.direction}
      lang={content.language}
      style={{
        width: 1080,
        height: 1080,
        background: t.background,
        color: t.primaryText,
        fontFamily: t.fontBody,
        position: 'relative',
        overflow: 'hidden',
        padding: 64,
        display: 'flex',
        flexDirection: 'column',
        textAlign: isRtl ? 'right' : 'left',
      }}
    >
      {/* Decorative glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -200,
          [isRtl ? 'left' : 'right']: -200,
          width: 600,
          height: 600,
          borderRadius: 999,
          background: t.accent,
          opacity: 0.15,
          filter: 'blur(140px)',
          pointerEvents: 'none',
        }}
      />

      {/* Top: badge + headline */}
      <div style={{ position: 'relative' }}>
        {content.hero.badge && (
          <div
            style={{
              display: 'inline-block',
              padding: '8px 18px',
              borderRadius: 999,
              background: t.accentSoft,
              border: `1px solid ${t.border}`,
              color: t.accent,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 20,
            }}
          >
            {content.hero.badge}
          </div>
        )}
        <h1
          style={{
            fontFamily: t.fontHeading,
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            margin: 0,
            color: t.primaryText,
          }}
        >
          {content.hero.title}
        </h1>
      </div>

      {/* Middle: product image */}
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '32px 0' }}>
        {content.hero.productImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={content.hero.productImageUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              maxWidth: '100%',
              maxHeight: 460,
              objectFit: 'contain',
              borderRadius: 24,
              filter: 'drop-shadow(0 24px 48px rgba(0,0,0,0.4))',
            }}
          />
        ) : (
          <div
            style={{
              width: 460,
              height: 460,
              borderRadius: 24,
              background: t.surface,
              display: 'grid',
              placeItems: 'center',
              color: t.mutedText,
              fontSize: 16,
              border: `1px solid ${t.border}`,
            }}
          >
            Photo produit
          </div>
        )}
      </div>

      {/* Bottom: price + CTA pill */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 24,
          flexDirection: isRtl ? 'row-reverse' : 'row',
          position: 'relative',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: t.mutedText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            {content.pricing.discountBadge || 'Prix promo'}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 6 }}>
            <span style={{ fontFamily: t.fontHeading, fontSize: 58, fontWeight: 800, color: t.accent, lineHeight: 1 }}>
              {fmtCurrency(content.pricing.priceAfter, content.pricing.currency)}
            </span>
            {content.pricing.priceBefore && content.pricing.priceBefore > content.pricing.priceAfter && (
              <span style={{ color: t.mutedText, fontSize: 22, textDecoration: 'line-through' }}>
                {fmtCurrency(content.pricing.priceBefore, content.pricing.currency)}
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            padding: '22px 36px',
            borderRadius: 999,
            background: t.ctaBg,
            color: t.ctaText,
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}
        >
          {content.cta.label}
        </div>
      </div>
    </div>
  );
}

/**
 * 1200 × 630 — Facebook link card, LinkedIn, Twitter card, OG image.
 * Layout: 2 columns — text + price + CTA on one side, product image on the other.
 */
function LandscapePoster({ content, t, isRtl, exportRef }: CompactProps) {
  return (
    <div
      ref={exportRef as React.Ref<HTMLDivElement>}
      dir={content.direction}
      lang={content.language}
      style={{
        width: 1200,
        height: 630,
        background: t.background,
        color: t.primaryText,
        fontFamily: t.fontBody,
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: isRtl ? '1fr 1.2fr' : '1.2fr 1fr',
      }}
    >
      {/* Decorative glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -150,
          [isRtl ? 'left' : 'right']: -150,
          width: 480,
          height: 480,
          borderRadius: 999,
          background: t.accent,
          opacity: 0.15,
          filter: 'blur(120px)',
          pointerEvents: 'none',
        }}
      />

      {/* Text side */}
      <div
        style={{
          padding: 56,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gridColumn: isRtl ? 2 : 1,
          textAlign: isRtl ? 'right' : 'left',
        }}
      >
        <div>
          {content.hero.badge && (
            <div
              style={{
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: 999,
                background: t.accentSoft,
                border: `1px solid ${t.border}`,
                color: t.accent,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {content.hero.badge}
            </div>
          )}
          <h1
            style={{
              fontFamily: t.fontHeading,
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              margin: 0,
              color: t.primaryText,
            }}
          >
            {content.hero.title}
          </h1>
          <p
            style={{
              color: t.mutedText,
              fontSize: 18,
              lineHeight: 1.45,
              marginTop: 14,
              ...(isRtl ? { marginLeft: 'auto' } : {}),
            }}
          >
            {content.hero.subtitle}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexDirection: isRtl ? 'row-reverse' : 'row',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: t.fontHeading, fontSize: 42, fontWeight: 800, color: t.accent, lineHeight: 1 }}>
                {fmtCurrency(content.pricing.priceAfter, content.pricing.currency)}
              </span>
              {content.pricing.priceBefore && content.pricing.priceBefore > content.pricing.priceAfter && (
                <span style={{ color: t.mutedText, fontSize: 18, textDecoration: 'line-through' }}>
                  {fmtCurrency(content.pricing.priceBefore, content.pricing.currency)}
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              padding: '16px 28px',
              borderRadius: 999,
              background: t.ctaBg,
              color: t.ctaText,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            {content.cta.label}
          </div>
        </div>
      </div>

      {/* Image side */}
      <div
        style={{
          position: 'relative',
          gridColumn: isRtl ? 1 : 2,
          overflow: 'hidden',
        }}
      >
        {content.hero.productImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={content.hero.productImageUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: t.surface,
              display: 'grid',
              placeItems: 'center',
              color: t.mutedText,
              fontSize: 16,
            }}
          >
            Photo produit
          </div>
        )}
      </div>
    </div>
  );
}
