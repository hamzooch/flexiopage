'use client';

/**
 * Compact, faithful mock of the public storefront homepage. Used as a
 * sticky right-side panel in the store edit sub-pages (/sections home
 * scope, /appearance, /info) so the seller sees every change in real
 * time without saving.
 *
 * Pure presentational component — no API calls, no router. Takes the
 * in-memory edit state (name, logo, theme, storefront sections,
 * whatsapp) and renders a scaled-down browser frame with a viewport
 * switcher (mobile / desktop) at the top.
 */

import { useEffect, useState } from 'react';
import {
  Eye,
  Smartphone,
  Monitor,
  Search,
  MessageCircle,
  Star,
  ShoppingBag,
  Heart,
  Instagram,
  Facebook,
  Youtube,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveSectionOrder } from '@/lib/section-order';
import type { StorefrontSettings, WhatsappSettings } from '@/components/dashboard/store-editor';
import type { ThemeTokens } from '@/data/store-themes';

export interface StoreHomepageLivePreviewProps {
  storeName: string;
  logo?: string;
  favicon?: string;
  theme?: Partial<ThemeTokens>;
  storefront: StorefrontSettings;
  whatsapp?: WhatsappSettings;
  /** Currency code shown on mock product prices (defaults to TND). */
  currency?: string;
  /** Sets the document direction of the inner mock — 'rtl' for Arabic. */
  direction?: 'ltr' | 'rtl';
  /** Pinned title overriding the auto-derived "Aperçu temps réel" caption. */
  title?: string;
}

/**
 * Tiny helper that turns a hex color into an `rgba(r, g, b, alpha)` string
 * so we can derive translucent surfaces from the theme primary without
 * needing a full color library.
 */
function withAlpha(hex: string | undefined, alpha: number): string {
  if (!hex) return `rgba(124, 58, 237, ${alpha})`;
  const v = hex.replace('#', '');
  const n =
    v.length === 3
      ? v.split('').map((c) => c + c).join('')
      : v.padEnd(6, '0').slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function StoreHomepageLivePreview({
  storeName,
  logo,
  favicon,
  theme,
  storefront,
  whatsapp,
  currency = 'TND',
  direction = 'ltr',
  title,
}: StoreHomepageLivePreviewProps) {
  // ── Resolved theme colors (with sensible defaults) ────────────────
  const primary = theme?.primary || '#7c3aed';
  const primaryFg = theme?.primaryFg || '#ffffff';
  const accent = theme?.accent || primary;
  const background = theme?.background || '#ffffff';
  const surface = theme?.surface || background;
  const foreground = theme?.foreground || (theme?.dark ? '#f1f5f9' : '#0f172a');
  const muted = theme?.muted || '#64748b';
  const border = theme?.border || '#e2e8f0';

  const brandDisplay = storefront.navbar?.brandDisplay || 'logo+name';
  const menuLinks = storefront.navbar?.menuLinks?.slice(0, 4) ?? [];
  const showSearch = !!storefront.navbar?.showSearch;
  // Logo size in the navbar mock — scaled down because the mock itself is
  // already scaled. Mapping kept aligned with StoreNavbar.LOGO_SIZE_PX.
  const navbarLogoSize = storefront.navbar?.logoSize || 'md';
  const navbarLogoPx =
    navbarLogoSize === 'sm' ? 14
    : navbarLogoSize === 'md' ? 18
    : navbarLogoSize === 'lg' ? 24
    : 32;
  // Footer brand options — read here so the mocked footer mirrors the real one.
  const footerBrandDisplay = storefront.footer?.brandDisplay || 'name';
  const footerLogoSize = storefront.footer?.logoSize || 'md';
  const footerLogoPx =
    footerLogoSize === 'sm' ? 18
    : footerLogoSize === 'md' ? 22
    : footerLogoSize === 'lg' ? 28
    : 36;

  const announcement = storefront.announcementBar;
  const announcementMessages = (announcement?.messages || []).filter(Boolean);

  const sliderEnabled = !!storefront.slider?.enabled;
  const slides = (storefront.slider?.slides || []).filter((s) => s && (s.image || s.title));
  const heroEnabled = storefront.showHero !== false;
  const productsEnabled = storefront.showProductsGrid !== false;
  const productsTitle = storefront.productsGridTitle || 'Nos produits';
  const testimonials = storefront.testimonials?.items || [];
  const testimonialsEnabled = testimonials.length > 0;
  const footerEnabled = storefront.showFooter !== false;
  const featuresEnabled = storefront.showFeatures !== false;

  const wa = whatsapp;
  const waActive = !!wa?.enabled && !!wa?.phoneNumber?.trim();
  const waPos = wa?.position || 'bottom-right';
  const waColor = wa?.accentColor || '#25D366';

  const [device, setDevice] = useState<'mobile' | 'desktop'>('desktop');
  const isMobile = device === 'mobile';

  // ── Slider auto-rotate state — same cadence as the storefront ─────
  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => {
    if (!sliderEnabled || slides.length <= 1) return;
    const ms = Math.max(2000, storefront.slider?.autoplayMs ?? 5000);
    const id = window.setInterval(
      () => setSlideIdx((i) => (i + 1) % slides.length),
      ms
    );
    return () => window.clearInterval(id);
  }, [sliderEnabled, slides.length, storefront.slider?.autoplayMs]);
  useEffect(() => {
    if (slideIdx >= slides.length) setSlideIdx(0);
  }, [slideIdx, slides.length]);

  // ── Announcement bar message rotation ─────────────────────────────
  const [annIdx, setAnnIdx] = useState(0);
  useEffect(() => {
    if (!announcement?.enabled || announcementMessages.length <= 1) return;
    const id = window.setInterval(
      () => setAnnIdx((i) => (i + 1) % announcementMessages.length),
      3000
    );
    return () => window.clearInterval(id);
  }, [announcement?.enabled, announcementMessages.length]);

  const sectionOrder = resolveSectionOrder(storefront.sectionOrder);

  // Mock products — enough to fill the grid, color-tinted from theme.
  const mockProducts = [
    { name: 'Produit phare',  price: '49.90' },
    { name: 'Best seller',    price: '29.00' },
    { name: 'Nouveauté',      price: '79.50' },
    { name: 'Promo du jour',  price: '19.99' },
  ];

  const wrapperBg = background;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      {/* ── HEADER BAR ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Eye className="h-3 w-3" />
          {title || 'Aperçu temps réel'}
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {([
            { id: 'mobile',  icon: Smartphone, label: 'Mobile' },
            { id: 'desktop', icon: Monitor,    label: 'Desktop' },
          ] as const).map((d) => {
            const Icon = d.icon;
            const active = device === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDevice(d.id)}
                title={d.label}
                aria-label={d.label}
                aria-pressed={active}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded transition-all',
                  active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MOCK BODY ─────────────────────────────────────────────── */}
      <div className="max-h-[78vh] overflow-y-auto bg-muted/20 p-3">
        <div
          dir={direction}
          className="mx-auto overflow-hidden rounded-xl shadow-sm transition-all"
          style={{
            maxWidth: isMobile ? 280 : 9999,
            backgroundColor: wrapperBg,
            color: foreground,
          }}
        >
          {/* Fake browser chrome with favicon and URL */}
          <div className="flex items-center gap-1 border-b border-border/40 bg-muted/40 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
            <span className="ml-1 inline-flex items-center gap-1 truncate text-[9px] text-muted-foreground">
              {favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={favicon} alt="" className="h-2.5 w-2.5 rounded-[2px] object-cover" />
              ) : (
                <span
                  className="grid h-2.5 w-2.5 place-items-center rounded-[2px] text-[7px] font-bold text-white"
                  style={{ backgroundColor: primary }}
                >
                  {storeName.slice(0, 1).toUpperCase() || 'S'}
                </span>
              )}
              <span className="truncate">{(storeName || 'boutique').toLowerCase().replace(/\s+/g, '')}.flexiopage.com</span>
            </span>
          </div>

          {/* ── Announcement bar ─────────────────────────────────── */}
          {announcement?.enabled && announcementMessages.length > 0 && (
            <div
              className="overflow-hidden px-2 py-1 text-center text-[9px] font-semibold tracking-wide"
              style={{ backgroundColor: primary, color: primaryFg }}
            >
              {announcement.mode === 'animated' ? (
                <span className="inline-block whitespace-nowrap">
                  {announcementMessages.join('   ·   ')}
                </span>
              ) : (
                <span>{announcementMessages[annIdx] || announcementMessages[0]}</span>
              )}
            </div>
          )}

          {/* ── Navbar ───────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between gap-2 border-b px-2"
            style={{ borderColor: border, backgroundColor: surface, paddingTop: 6, paddingBottom: 6 }}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              {(brandDisplay === 'logo+name' || brandDisplay === 'logo') && (
                logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt=""
                    className="shrink-0 rounded-md object-contain"
                    style={{ width: navbarLogoPx, height: navbarLogoPx }}
                  />
                ) : (
                  <span
                    className="grid shrink-0 place-items-center rounded-md font-extrabold"
                    style={{
                      backgroundColor: primary,
                      color: primaryFg,
                      width: navbarLogoPx,
                      height: navbarLogoPx,
                      fontSize: Math.max(7, Math.round(navbarLogoPx * 0.45)),
                    }}
                  >
                    {storeName.slice(0, 1).toUpperCase() || 'S'}
                  </span>
                )
              )}
              {(brandDisplay === 'logo+name' || brandDisplay === 'name') && (
                <span
                  className="truncate font-extrabold"
                  style={{
                    color: foreground,
                    fontFamily: theme?.fontHeading,
                    fontSize: navbarLogoSize === 'xl' ? 13 : navbarLogoSize === 'lg' ? 11 : 10,
                  }}
                >
                  {storeName || 'Ma boutique'}
                </span>
              )}
            </div>
            {!isMobile && menuLinks.length > 0 && (
              <nav className="flex items-center gap-2">
                {menuLinks.map((l, i) => (
                  <span key={i} className="text-[9px] font-medium" style={{ color: muted }}>
                    {l.label || 'Lien'}
                  </span>
                ))}
              </nav>
            )}
            <div className="flex items-center gap-1.5">
              {showSearch && (
                <span
                  className="grid h-5 w-5 place-items-center rounded-md"
                  style={{ backgroundColor: withAlpha(primary, 0.1), color: primary }}
                >
                  <Search className="h-2.5 w-2.5" />
                </span>
              )}
              <span
                className="grid h-5 w-5 place-items-center rounded-md"
                style={{ backgroundColor: withAlpha(primary, 0.1), color: primary }}
              >
                <ShoppingBag className="h-2.5 w-2.5" />
              </span>
              {isMobile && (
                <span className="flex flex-col items-center gap-[2px]">
                  <span className="h-[1.5px] w-3 rounded" style={{ backgroundColor: foreground }} />
                  <span className="h-[1.5px] w-3 rounded" style={{ backgroundColor: foreground }} />
                  <span className="h-[1.5px] w-3 rounded" style={{ backgroundColor: foreground }} />
                </span>
              )}
            </div>
          </div>

          {/* ── Reorderable body sections ────────────────────────── */}
          {sectionOrder.map((id) => {
            if (id === 'hero' && heroEnabled) {
              return (
                <HeroBlock
                  key="hero"
                  title={storefront.heroTitle || storeName || 'Ma boutique'}
                  subtitle={storefront.heroSubtitle || 'Découvre notre sélection livrée chez toi.'}
                  image={storefront.heroImage}
                  primary={primary}
                  primaryFg={primaryFg}
                  accent={accent}
                  surface={surface}
                  foreground={foreground}
                  muted={muted}
                />
              );
            }
            if (id === 'slider' && sliderEnabled && slides.length > 0) {
              return (
                <SliderBlock
                  key="slider"
                  slide={slides[Math.min(slideIdx, slides.length - 1)]}
                  current={slideIdx}
                  total={slides.length}
                  primary={primary}
                  primaryFg={primaryFg}
                />
              );
            }
            if (id === 'products' && productsEnabled) {
              return (
                <ProductsBlock
                  key="products"
                  title={productsTitle}
                  products={mockProducts.slice(0, isMobile ? 2 : 4)}
                  currency={currency}
                  isMobile={isMobile}
                  primary={primary}
                  primaryFg={primaryFg}
                  accent={accent}
                  surface={surface}
                  foreground={foreground}
                  muted={muted}
                  border={border}
                />
              );
            }
            if (id === 'testimonials' && testimonialsEnabled) {
              return (
                <TestimonialsBlock
                  key="testimonials"
                  title={storefront.testimonials?.title || 'Avis clients'}
                  items={testimonials.slice(0, isMobile ? 1 : 2)}
                  accent={accent}
                  surface={surface}
                  foreground={foreground}
                  muted={muted}
                  border={border}
                />
              );
            }
            return null;
          })}

          {/* ── Reassurance strip ─────────────────────────────────── */}
          {featuresEnabled && (
            <div
              className="grid grid-cols-3 gap-1 border-t px-2 py-1.5"
              style={{ borderColor: border, backgroundColor: surface }}
            >
              {['Livraison rapide', 'Paiement sécurisé', 'Support 7/7'].map((t) => (
                <div key={t} className="text-center text-[7px] font-medium" style={{ color: muted }}>
                  ✓ {t}
                </div>
              ))}
            </div>
          )}

          {/* ── Footer ────────────────────────────────────────────── */}
          {footerEnabled && (
            <FooterBlock
              storeName={storeName}
              logo={logo}
              brandDisplay={footerBrandDisplay}
              logoPx={footerLogoPx}
              note={storefront.footerNote}
              footer={storefront.footer}
              primary={primary}
              primaryFg={primaryFg}
              foreground={foreground}
              muted={muted}
              border={border}
              surface={surface}
            />
          )}

          {/* ── Floating WhatsApp button overlay ─────────────────── */}
          {waActive && (
            <div className="relative">
              <span
                className={cn(
                  'pointer-events-none absolute z-10 grid h-7 w-7 place-items-center rounded-full text-white shadow-md',
                  waPos === 'bottom-right' && '-top-9 right-2',
                  waPos === 'bottom-left'  && '-top-9 left-2',
                  waPos === 'top-right'    && '-bottom-2 right-2',
                  waPos === 'top-left'     && '-bottom-2 left-2'
                )}
                style={{ backgroundColor: waColor }}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {wa?.pulse !== false && (
                  <span
                    aria-hidden
                    className="store-prev-wa-pulse pointer-events-none absolute inset-0 rounded-full"
                    style={{ border: `2px solid ${waColor}` }}
                  />
                )}
              </span>
            </div>
          )}
        </div>

        <p className="mt-2 text-center text-[9px] text-muted-foreground">
          Reflète ce que verront tes clients sur la vitrine
        </p>
      </div>

      <style>{`
        @keyframes storePrevWaPulse {
          0%   { transform: scale(1);    opacity: 0.55; }
          70%  { transform: scale(1.85); opacity: 0;    }
          100% { transform: scale(1.85); opacity: 0;    }
        }
        .store-prev-wa-pulse { animation: storePrevWaPulse 2.2s ease-out infinite; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-blocks — kept inline (and unexported) because they're tightly
// coupled to the parent's theme variables.
// ─────────────────────────────────────────────────────────────────────

function HeroBlock({
  title, subtitle, image, primary, primaryFg, accent, surface, foreground, muted,
}: {
  title: string; subtitle: string; image?: string;
  primary: string; primaryFg: string; accent: string;
  surface: string; foreground: string; muted: string;
}) {
  return (
    <div
      className="relative overflow-hidden px-3 py-4"
      style={{
        background: image
          ? `linear-gradient(135deg, ${withAlpha(primary, 0.55)}, ${withAlpha(accent, 0.35)}), url(${image}) center/cover`
          : `linear-gradient(135deg, ${withAlpha(primary, 0.12)}, ${withAlpha(accent, 0.06)}, ${surface})`,
      }}
    >
      <div className="space-y-1.5">
        <h2
          className="text-[13px] font-extrabold leading-tight"
          style={{ color: image ? '#fff' : foreground }}
        >
          {title}
        </h2>
        <p
          className="text-[10px] leading-snug"
          style={{ color: image ? 'rgba(255,255,255,0.92)' : muted }}
        >
          {subtitle}
        </p>
        <div className="flex items-center gap-1.5 pt-1">
          <button
            type="button"
            className="inline-flex h-6 items-center justify-center rounded-md px-2.5 text-[9px] font-bold"
            style={{ backgroundColor: primary, color: primaryFg }}
          >
            Découvrir
          </button>
          <button
            type="button"
            className="inline-flex h-6 items-center justify-center rounded-md border px-2.5 text-[9px] font-semibold"
            style={{ borderColor: image ? 'rgba(255,255,255,0.6)' : primary, color: image ? '#fff' : primary }}
          >
            En savoir +
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderBlock({
  slide, current, total, primary, primaryFg,
}: {
  slide: { image?: string; title?: string; subtitle?: string; ctaLabel?: string; overlay?: 'none' | 'light' | 'dark'; textAlign?: 'left' | 'center' | 'right' };
  current: number; total: number;
  primary: string; primaryFg: string;
}) {
  const overlay = slide.overlay || 'dark';
  const overlayLayer =
    overlay === 'dark'  ? 'linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.55))'
    : overlay === 'light' ? 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.55))'
    : 'none';
  const textColor = overlay === 'light' ? '#0f172a' : '#ffffff';
  const align = slide.textAlign || 'center';

  return (
    <div className="relative">
      <div
        className="relative h-24 w-full overflow-hidden"
        style={{
          background: slide.image
            ? `${overlayLayer}, url(${slide.image}) center/cover`
            : `linear-gradient(135deg, ${withAlpha(primary, 0.55)}, ${withAlpha(primary, 0.25)})`,
        }}
      >
        <div
          className={cn(
            'absolute inset-0 flex flex-col justify-end gap-1 p-2',
            align === 'left' && 'items-start text-left',
            align === 'center' && 'items-center text-center',
            align === 'right' && 'items-end text-right'
          )}
        >
          {slide.title && (
            <span className="text-[11px] font-extrabold leading-tight" style={{ color: textColor }}>
              {slide.title}
            </span>
          )}
          {slide.subtitle && (
            <span className="text-[8px] leading-snug" style={{ color: textColor, opacity: 0.9 }}>
              {slide.subtitle}
            </span>
          )}
          {slide.ctaLabel && (
            <span
              className="inline-flex h-5 items-center rounded px-2 text-[8px] font-bold"
              style={{ backgroundColor: primary, color: primaryFg }}
            >
              {slide.ctaLabel}
            </span>
          )}
        </div>
        {/* Slide indicators */}
        {total > 1 && (
          <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 w-1 rounded-full',
                  i === current ? 'bg-white' : 'bg-white/40'
                )}
              />
            ))}
          </div>
        )}
        {total > 1 && (
          <>
            <span className="absolute left-1 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white">
              <ChevronLeft className="h-2.5 w-2.5" />
            </span>
            <span className="absolute right-1 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white">
              <ChevronRight className="h-2.5 w-2.5" />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ProductsBlock({
  title, products, currency, isMobile,
  primary, primaryFg, accent, surface, foreground, muted, border,
}: {
  title: string;
  products: Array<{ name: string; price: string }>;
  currency: string;
  isMobile: boolean;
  primary: string; primaryFg: string; accent: string;
  surface: string; foreground: string; muted: string; border: string;
}) {
  return (
    <div className="space-y-2 px-3 py-3" style={{ backgroundColor: surface }}>
      <h3 className="text-[11px] font-bold" style={{ color: foreground }}>
        {title}
      </h3>
      <div className={cn('grid gap-1.5', isMobile ? 'grid-cols-2' : 'grid-cols-4')}>
        {products.map((p, i) => (
          <div
            key={i}
            className="overflow-hidden rounded border"
            style={{ borderColor: border, backgroundColor: surface }}
          >
            <div
              className="aspect-square"
              style={{
                background: `linear-gradient(135deg, ${withAlpha(primary, 0.22)}, ${withAlpha(accent, 0.1)})`,
              }}
            />
            <div className="space-y-0.5 p-1.5">
              <div className="truncate text-[8px] font-semibold" style={{ color: foreground }}>
                {p.name}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[8px] font-extrabold" style={{ color: primary }}>
                  {p.price} {currency}
                </span>
                <span
                  className="grid h-4 w-4 place-items-center rounded"
                  style={{ backgroundColor: withAlpha(primary, 0.12), color: primary }}
                >
                  <Heart className="h-2 w-2" />
                </span>
              </div>
              <button
                type="button"
                className="mt-0.5 inline-flex h-4 w-full items-center justify-center rounded text-[7px] font-bold"
                style={{ backgroundColor: primary, color: primaryFg }}
              >
                Commander
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestimonialsBlock({
  title, items, accent, surface, foreground, muted, border,
}: {
  title: string;
  items: Array<{ author: string; content: string; rating?: number }>;
  accent: string; surface: string; foreground: string; muted: string; border: string;
}) {
  return (
    <div className="space-y-1.5 px-3 py-3" style={{ backgroundColor: surface }}>
      <h3 className="text-[11px] font-bold" style={{ color: foreground }}>
        {title}
      </h3>
      <div className={cn('grid gap-1.5', items.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {items.map((t, i) => (
          <div
            key={i}
            className="rounded border p-1.5"
            style={{ borderColor: border, backgroundColor: surface }}
          >
            <div className="flex items-center gap-0.5">
              {[0, 1, 2, 3, 4].map((s) => (
                <Star
                  key={s}
                  className="h-2 w-2"
                  style={{
                    color: accent,
                    fill: s < (t.rating ?? 5) ? accent : 'transparent',
                  }}
                />
              ))}
            </div>
            <p className="mt-1 line-clamp-2 text-[8px] leading-snug" style={{ color: foreground }}>
              « {t.content || 'Super produit et livraison rapide.'} »
            </p>
            <div className="mt-1 text-[8px] font-semibold" style={{ color: muted }}>
              — {t.author || 'Client'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FooterBlock({
  storeName, logo, brandDisplay, logoPx, note, footer,
  primary, primaryFg, foreground, muted, border, surface,
}: {
  storeName: string;
  logo?: string;
  brandDisplay: 'logo+name' | 'logo' | 'name';
  logoPx: number;
  note?: string;
  footer?: import('@/components/dashboard/store-editor').FooterSettings;
  primary: string; primaryFg: string; foreground: string; muted: string; border: string; surface: string;
}) {
  const columns = footer?.columns || [];
  const social = footer?.social || {};
  const contact = footer?.contact || {};
  const hasSocial = !!(social.instagram || social.facebook || social.youtube || social.tiktok || social.x || social.whatsapp);
  const hasContact = !!(contact.email || contact.phone || contact.address);
  const wantLogo = brandDisplay !== 'name' && !!logo;
  const wantName = brandDisplay === 'name' || brandDisplay === 'logo+name' || !logo;

  // Brand block — logo, name, or both. Defaults to a tinted square placeholder
  // when "logo" is picked but no logo uploaded yet.
  const brandNode = (
    <div className="flex items-center gap-1.5">
      {wantLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo!} alt="" className="shrink-0 rounded object-contain" style={{ width: logoPx, height: logoPx }} />
      ) : brandDisplay !== 'name' ? (
        <span
          className="grid shrink-0 place-items-center rounded font-extrabold"
          style={{
            backgroundColor: primary,
            color: primaryFg,
            width: logoPx,
            height: logoPx,
            fontSize: Math.max(8, Math.round(logoPx * 0.45)),
          }}
        >
          {storeName.slice(0, 1).toUpperCase() || 'S'}
        </span>
      ) : null}
      {wantName && (
        <span className="text-[8px] font-extrabold uppercase tracking-wide" style={{ color: foreground }}>
          {storeName || 'Boutique'}
        </span>
      )}
    </div>
  );

  return (
    <div
      className="space-y-2 border-t px-3 py-3"
      style={{ borderColor: border, backgroundColor: withAlpha(primary, 0.04) }}
    >
      {(columns.length > 0 || hasContact) && (
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-0.5">
            {brandNode}
            <div className="pt-0.5 text-[7px]" style={{ color: muted }}>
              {note || `© 2026 ${storeName || 'Ma boutique'}`}
            </div>
          </div>
          {columns.slice(0, 2).map((col, i) => (
            <div key={i} className="space-y-0.5">
              <div className="text-[8px] font-bold" style={{ color: foreground }}>
                {col.title}
              </div>
              {col.links.slice(0, 3).map((l, j) => (
                <div key={j} className="truncate text-[7px]" style={{ color: muted }}>
                  {l.label}
                </div>
              ))}
            </div>
          ))}
          {columns.length === 0 && hasContact && (
            <div className="col-span-2 space-y-0.5">
              <div className="text-[8px] font-bold" style={{ color: foreground }}>Contact</div>
              {contact.email && <div className="truncate text-[7px]" style={{ color: muted }}>{contact.email}</div>}
              {contact.phone && <div className="truncate text-[7px]" style={{ color: muted }}>{contact.phone}</div>}
            </div>
          )}
        </div>
      )}

      {hasSocial && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {social.instagram && (
            <span className="grid h-4 w-4 place-items-center rounded" style={{ backgroundColor: surface, color: primary }}>
              <Instagram className="h-2.5 w-2.5" />
            </span>
          )}
          {social.facebook && (
            <span className="grid h-4 w-4 place-items-center rounded" style={{ backgroundColor: surface, color: primary }}>
              <Facebook className="h-2.5 w-2.5" />
            </span>
          )}
          {social.youtube && (
            <span className="grid h-4 w-4 place-items-center rounded" style={{ backgroundColor: surface, color: primary }}>
              <Youtube className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      )}

      {note && columns.length === 0 && !hasContact && (
        <div className="pt-1 text-center text-[7px]" style={{ color: muted }}>
          {note}
        </div>
      )}
    </div>
  );
}
