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

      {/* ─── SOCIAL PROOF BANNER ─── */}
      {content.socialProof && (
        <section style={{ padding: '0 56px 28px' }}>
          <div
            style={{
              padding: '18px 24px',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${t.accentSoft}, transparent)`,
              border: `1px solid ${t.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              flexDirection: isRtl ? 'row-reverse' : 'row',
            }}
          >
            <Sparkles size={20} color={t.accent} fill={t.accent} />
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: t.primaryText,
                letterSpacing: 0.2,
              }}
            >
              {content.socialProof}
            </div>
          </div>
        </section>
      )}

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
        {content.cta.hook && (
          <div
            style={{
              fontFamily: t.fontHeading,
              fontSize: 34,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -0.5,
              color: t.primaryText,
              marginBottom: 20,
            }}
          >
            {content.cta.hook}
          </div>
        )}
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
 * 1080 × 1080 — Facebook / Instagram feed post — HYBRID layout.
 *
 * The AI-generated hero scene fills the full canvas as the background; text
 * (badge, title, price, CTA) is overlaid on top via dark gradient bands that
 * keep everything legible regardless of the scene content.
 *
 * Stacked layers (bottom → top):
 *   1. Scene image (object-fit: cover)
 *   2. Top dark gradient — fades to transparent at ~35% (badge + title zone)
 *   3. Bottom dark gradient — fades to transparent at ~35% (price + CTA zone)
 *   4. Subtle vignette + accent glow
 *   5. Text content
 *
 * When no scene image is available we fall back to the solid theme background
 * with a placeholder block, so the layout still ships.
 */
function SquarePoster({ content, t, isRtl, exportRef }: CompactProps) {
  const hasScene = !!content.hero.productImageUrl;
  const accentRgb = hexToRgb(t.accent) || { r: 217, g: 181, b: 106 };
  return (
    <div
      ref={exportRef as React.Ref<HTMLDivElement>}
      dir={content.direction}
      lang={content.language}
      style={{
        width: 1080,
        height: 1080,
        background: t.background,
        color: '#ffffff',
        fontFamily: t.fontBody,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        textAlign: isRtl ? 'right' : 'left',
      }}
    >
      {/* Layer 1 — full-bleed hero scene */}
      {hasScene ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.hero.productImageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: t.surface,
            display: 'grid',
            placeItems: 'center',
            color: t.mutedText,
            fontSize: 18,
          }}
        >
          Photo produit
        </div>
      )}

      {/* Layer 2 — top dark gradient (badge + title legibility) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 20%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0) 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Layer 3 — bottom dark gradient (price + CTA legibility) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 18%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0) 48%)',
          pointerEvents: 'none',
        }}
      />

      {/* Layer 4 — accent corner glow (subtle brand color hint) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -220,
          [isRtl ? 'left' : 'right']: -220,
          width: 540,
          height: 540,
          borderRadius: 999,
          background: `radial-gradient(circle, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.35) 0%, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0) 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Layer 5 — TOP: badge + headline */}
      <div style={{ position: 'relative', padding: '64px 72px 0' }}>
        {content.hero.badge && (
          <div
            style={{
              display: 'inline-block',
              padding: '9px 20px',
              borderRadius: 999,
              background: `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.18)`,
              border: `1px solid rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.5)`,
              backdropFilter: 'blur(6px)',
              color: t.accent,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              marginBottom: 22,
              textShadow: '0 1px 2px rgba(0,0,0,0.35)',
            }}
          >
            {content.hero.badge}
          </div>
        )}
        <h1
          style={{
            fontFamily: t.fontHeading,
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: -2,
            margin: 0,
            color: '#ffffff',
            maxWidth: '85%',
            ...(isRtl ? { marginLeft: 'auto' } : {}),
            textShadow: '0 2px 12px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
          }}
        >
          {content.hero.title}
        </h1>
      </div>

      {/* Spacer pushing the price/CTA to the bottom */}
      <div style={{ flex: 1 }} />

      {/* Layer 5 — BOTTOM: urgency hook (optional) + price + CTA */}
      {content.cta.hook && (
        <div
          style={{
            position: 'relative',
            padding: '0 72px 18px',
            textAlign: isRtl ? 'right' : 'left',
          }}
        >
          <div
            style={{
              fontFamily: t.fontHeading,
              fontSize: 30,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -0.5,
              color: '#ffffff',
              textShadow: '0 2px 10px rgba(0,0,0,0.55)',
            }}
          >
            {content.cta.hook}
          </div>
        </div>
      )}
      <div
        style={{
          position: 'relative',
          padding: '0 72px 64px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 28,
          flexDirection: isRtl ? 'row-reverse' : 'row',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              color: t.accent,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 2,
              marginBottom: 6,
              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
            }}
          >
            {content.pricing.discountBadge || 'Prix promo'}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: t.fontHeading,
                fontSize: 68,
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1,
                textShadow: '0 2px 10px rgba(0,0,0,0.55)',
              }}
            >
              {fmtCurrency(content.pricing.priceAfter, content.pricing.currency)}
            </span>
            {content.pricing.priceBefore && content.pricing.priceBefore > content.pricing.priceAfter && (
              <span
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 24,
                  textDecoration: 'line-through',
                  textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }}
              >
                {fmtCurrency(content.pricing.priceBefore, content.pricing.currency)}
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            padding: '24px 40px',
            borderRadius: 999,
            background: t.ctaBg,
            color: t.ctaText,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
            whiteSpace: 'nowrap',
          }}
        >
          {content.cta.label}
        </div>
      </div>
    </div>
  );
}

/** Convert a `#rrggbb` hex string to {r,g,b}; returns null on parse failure. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
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
