'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Sparkles,
  Check,
  ChevronDown,
  Quote,
  Star,
  ShieldCheck,
  Truck,
  Clock,
  Heart,
  Zap,
  Gift,
  Leaf,
  Award,
  Crown,
  Lock,
  RefreshCw,
  Headphones,
  Instagram,
  Facebook,
  Youtube,
  PlayCircle,
  BadgeCheck,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { PageSection } from './SectionEditor';
import { CodOrderForm, type CodFormConfig } from '@/components/storefront/cod-order-form';
import { STORE_THEME_TEMPLATES } from '@/data/store-themes';
import { ChatBot } from '@/components/chatbot/ChatBot';
import { buildStoreScript } from '@/components/chatbot/scripts';

interface Props {
  sections: PageSection[];
  /** Optional product card list to render inside "products" sections. */
  products?: Array<{
    _id: string;
    name: string;
    price?: number;
    slug?: string;
    images?: string[];
    stock?: number;
    trackInventory?: boolean;
    allowBackorder?: boolean;
    sku?: string;
  }>;
  /** Banner shown at the top (e.g. "Preview — not published"). */
  banner?: React.ReactNode;
  className?: string;
  /** 'rtl' mirrors the page for Arabic / Hebrew / Persian / Urdu. */
  direction?: 'ltr' | 'rtl';
  /** Optional ISO code, used as the document `lang` attribute. */
  language?: string;
  /** Currency override (used when sections forget to set their own). */
  currency?: string;
  /** Store slug — required for the cod-form section to submit real orders. */
  storeSlug?: string;
  /** Default country for the cod-form. */
  country?: string;
  /** Theme template id (volt|atelier|bloom) for cod-form styling. */
  themeId?: string;
  /**
   * Optional store identity for the floating chatbot. When provided
   * (typically by the public store page), a scripted help bot appears
   * bottom-right with quick replies and WhatsApp/phone fallbacks.
   */
  storeChat?: {
    name: string;
    whatsapp?: string;
    phone?: string;
  };
}

export function LandingRenderer({
  sections,
  products = [],
  banner,
  className,
  direction = 'ltr',
  language,
  currency,
  storeSlug,
  country,
  themeId,
  storeChat,
}: Props) {
  const ordered = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Find a CTA candidate to power the sticky mobile bar
  const productSec = ordered.find((s) => s.type === 'product');
  const ctaSec = ordered.find((s) => s.type === 'cta');
  const stickyCta = stickyCtaConfig(productSec, ctaSec, currency);

  return (
    <div
      dir={direction}
      lang={language}
      className={cn(
        'relative min-h-screen bg-background text-foreground',
        // bottom padding so the sticky mobile CTA never overlaps the footer
        stickyCta && 'pb-24 sm:pb-0',
        className
      )}
    >
      {banner}
      {ordered.map((s) => (
        <SectionView
          key={s.id}
          section={s}
          products={products}
          currency={currency}
          direction={direction}
          storeSlug={storeSlug}
          country={country}
          themeId={themeId}
        />
      ))}
      {stickyCta && <StickyMobileCta {...stickyCta} />}
      {storeChat && (
        <ChatBot
          script={buildStoreScript(storeChat)}
          storageKey={`flexiopage-store-chat:${storeSlug ?? 'preview'}`}
          triggerLabel="Besoin d'aide ?"
        />
      )}
    </div>
  );
}

function SectionView({
  section,
  products,
  currency,
  direction,
  storeSlug,
  country,
  themeId,
}: {
  section: PageSection;
  products: Props['products'];
  currency?: string;
  direction: 'ltr' | 'rtl';
  storeSlug?: string;
  country?: string;
  themeId?: string;
}) {
  switch (section.type) {
    case 'hero':
      return <HeroSection p={section.props} />;
    case 'features':
      return <FeaturesSection p={section.props} />;
    case 'stats':
      return <StatsSection p={section.props} />;
    case 'gallery':
      return <GallerySection p={section.props} />;
    case 'product':
      return <ProductSection p={section.props} currency={currency} direction={direction} />;
    case 'products':
      return <ProductsSection p={section.props} products={products || []} currency={currency} />;
    case 'brands':
      return <BrandsSection p={section.props} />;
    case 'video':
      return <VideoSection p={section.props} />;
    case 'pricing':
      return <PricingSection p={section.props} currency={currency} />;
    case 'testimonials':
      return <TestimonialsSection p={section.props} />;
    case 'steps':
      return <StepsSection p={section.props} />;
    case 'cta':
      return <CtaSection p={section.props} />;
    case 'faq':
      return <FaqSection p={section.props} />;
    case 'footer':
      return <FooterSection p={section.props} />;
    case 'cod-form':
      return (
        <CodFormSection
          p={section.props}
          products={products || []}
          currency={currency}
          storeSlug={storeSlug}
          country={country}
          themeId={themeId}
        />
      );
    default:
      return null;
  }
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const ICONS: Record<string, LucideIcon> = {
  check: Check,
  shield: ShieldCheck,
  truck: Truck,
  clock: Clock,
  star: Star,
  heart: Heart,
  sparkles: Sparkles,
  zap: Zap,
  gift: Gift,
  leaf: Leaf,
  award: Award,
  crown: Crown,
  lock: Lock,
  refresh: RefreshCw,
  headphones: Headphones,
};

function getIcon(name?: string): LucideIcon {
  return (name && ICONS[name]) || Check;
}

function fmtPrice(n: number, currency?: string): string {
  const cur = currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');
function absUrl(u?: string): string {
  if (!u) return '';
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith('/')) return `${API_BASE}${u}`;
  return u;
}

// Reusable: subtle animated gradient mesh background.
function GradientMesh({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)} aria-hidden>
      <div className="absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-amber-400/30 blur-[120px]" />
      <div className="absolute top-20 right-1/4 h-[420px] w-[420px] rounded-full bg-orange-500/25 blur-[120px]" />
      <div className="absolute bottom-0 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-amber-300/20 blur-[120px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-transparent via-background/40 to-background" />
    </div>
  );
}

// ────────────────────────────── HERO (modern, gradient-mesh, inline social proof)
function HeroSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title, 'Welcome');
  const subtitle = str(p.subtitle);
  const ctaText = str(p.ctaText, 'Shop now');
  const ctaSecondary = str(p.ctaSecondary);
  const badge = str(p.badge, 'New');
  const layout = str(p.layout, 'center');
  const imageUrl = absUrl(str(p.imageUrl));
  const rating = num(p.rating) ?? 4.9;
  const reviewCount = num(p.reviewCount) ?? 0;
  const showSocial = reviewCount > 0;

  if (layout === 'split' && imageUrl) {
    return (
      <section className="relative overflow-hidden">
        <GradientMesh />
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:gap-10 sm:px-6 sm:py-16 md:py-24 lg:grid-cols-[1.05fr_1fr]">
          <div className="space-y-5 sm:space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1 text-xs font-semibold backdrop-blur">
              <span className="relative grid h-1.5 w-1.5 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/60" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-orange-500" />
              </span>
              <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                {badge}
              </span>
            </div>
            <h1 className="text-balance text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
              {title}
            </h1>
            {subtitle && (
              <p className="max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
                {subtitle}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#cta"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full gradient-brand px-6 text-sm font-semibold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.02] hover:shadow-2xl"
              >
                {ctaText}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
              </a>
              {ctaSecondary && (
                <a href="#features" className="inline-flex h-12 items-center justify-center rounded-full border border-border/70 bg-card/80 px-6 text-sm font-medium backdrop-blur transition-colors hover:bg-muted/40">
                  {ctaSecondary}
                </a>
              )}
            </div>
            {showSocial && (
              <div className="flex flex-wrap items-center gap-3 pt-4 text-sm">
                <div className="flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={cn('h-4 w-4', i < Math.round(rating) ? 'fill-amber-500' : 'opacity-30')} strokeWidth={1.5} />
                  ))}
                </div>
                <span className="font-semibold tracking-tight">{rating.toFixed(1)}</span>
                <span className="text-muted-foreground">· {reviewCount.toLocaleString()} avis vérifiés</span>
              </div>
            )}
          </div>
          <div className="relative">
            <div className="absolute -inset-3 sm:-inset-4 -z-10 rounded-[28px] sm:rounded-[36px] bg-gradient-to-br from-amber-400/25 via-orange-500/20 to-orange-700/10 blur-2xl" />
            <div className="relative aspect-[4/5] sm:aspect-[5/6] overflow-hidden rounded-2xl sm:rounded-3xl border border-white/40 bg-muted shadow-2xl ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden">
      <GradientMesh />
      <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24 md:py-32">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs font-semibold backdrop-blur">
          <Sparkles className="h-3 w-3 text-orange-500" />
          <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">{badge}</span>
        </div>
        <h1 className="text-balance text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            {subtitle}
          </p>
        )}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#cta"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full gradient-brand px-6 text-sm font-semibold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.02] hover:shadow-2xl"
          >
            {ctaText}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
          </a>
          {ctaSecondary && (
            <a href="#features" className="inline-flex h-12 items-center justify-center rounded-full border border-border/70 bg-card/80 px-6 text-sm font-medium backdrop-blur transition-colors hover:bg-muted/40">
              {ctaSecondary}
            </a>
          )}
        </div>
        {showSocial && (
          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-sm backdrop-blur">
            <div className="flex items-center gap-0.5 text-amber-500">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn('h-4 w-4', i < Math.round(rating) ? 'fill-amber-500' : 'opacity-30')} strokeWidth={1.5} />
              ))}
            </div>
            <span className="font-semibold tracking-tight">{rating.toFixed(1)}</span>
            <span className="text-muted-foreground">· {reviewCount.toLocaleString()}+</span>
          </div>
        )}
      </div>
      {imageUrl && (
        <div className="mx-auto -mt-8 max-w-5xl px-6 pb-16">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-muted shadow-2xl ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={title} className="aspect-[16/9] w-full object-cover" />
          </div>
        </div>
      )}
    </section>
  );
}

// ────────────────────────────── FEATURES (cards with hover lift)
function FeaturesSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title, 'Features');
  const subtitle = str(p.subtitle);
  const items = arr<{ title?: string; description?: string; icon?: string }>(p.items);
  return (
    <section id="features" className="relative border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">{title}</h2>
          {subtitle && <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base md:text-lg">{subtitle}</p>}
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => {
            const Icon = getIcon(it.icon);
            return (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-7 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
              >
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative grid h-12 w-12 place-items-center rounded-xl gradient-brand text-white shadow-md shadow-primary/25 transition-transform group-hover:scale-110">
                  <Icon className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <h3 className="relative mt-5 text-lg font-semibold tracking-tight">{str(it.title)}</h3>
                {it.description && <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{str(it.description)}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── STATS
function StatsSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title);
  const items = arr<{ value?: string | number; label?: string }>(p.items);
  return (
    <section className="relative border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        {title && <h2 className="mb-10 text-center text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>}
        <div className={cn('grid gap-6', items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4')}>
          {items.map((it, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card p-7 text-center transition-transform hover:-translate-y-0.5">
              <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700 bg-clip-text text-4xl font-extrabold leading-none tracking-tight text-transparent sm:text-5xl">
                {String(it.value ?? '')}
              </div>
              <div className="mt-2 text-sm font-medium text-muted-foreground">{str(it.label)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── GALLERY (bento layout)
function GallerySection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title);
  const subtitle = str(p.subtitle);
  const images = arr<string>(p.images).filter((u) => typeof u === 'string' && u);
  if (images.length === 0) return null;

  // Bento layout for 4+ images: first big, others smaller
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24">
        {(title || subtitle) && (
          <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
            {title && <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{title}</h2>}
            {subtitle && <p className="mt-3 text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
          </div>
        )}
        {images.length >= 4 ? (
          // Mobile: 2-col uniform grid (no bento — too cramped). Desktop: bento.
          <div className="grid auto-rows-[140px] grid-cols-2 gap-2.5 sm:auto-rows-[180px] sm:grid-cols-4 sm:gap-4">
            {images.slice(0, 6).map((src, i) => (
              <div
                key={i}
                className={cn(
                  'group relative overflow-hidden rounded-xl border border-border/60 bg-muted shadow-sm transition-all hover:shadow-xl sm:rounded-2xl',
                  // Bento only kicks in at sm+
                  i === 0 && 'sm:col-span-2 sm:row-span-2'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={absUrl(src)}
                  alt={`Gallery ${i + 1}`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4">
            {images.map((src, i) => (
              <div key={i} className="aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted sm:rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={absUrl(src)} alt={`Gallery ${i + 1}`} className="h-full w-full object-cover transition-transform hover:scale-105" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ────────────────────────────── PRODUCT (single deep card)
function ProductSection({
  p,
  currency,
  direction,
}: {
  p: Record<string, unknown>;
  currency?: string;
  direction: 'ltr' | 'rtl';
}) {
  const name = str(p.name, 'Product');
  const tagline = str(p.tagline);
  const priceBefore = num(p.priceBefore);
  const priceAfter = num(p.priceAfter);
  const cur = str(p.currency, currency || 'USD');
  const discountPct = num(p.discountPct) ?? (priceBefore && priceAfter && priceBefore > priceAfter
    ? Math.round(((priceBefore - priceAfter) / priceBefore) * 100)
    : undefined);
  const imageUrl = str(p.imageUrl);
  const gallery = arr<string>(p.gallery).filter((u) => u);
  const highlights = arr<string>(p.highlights).filter((u) => u);
  const ctaText = str(p.ctaText, 'Add to cart');
  const trustBadges = arr<string>(p.trustBadges).filter((u) => u);
  const rating = num(p.rating);
  const reviewCount = num(p.reviewCount);
  const [active, setActive] = useState(0);
  const images = imageUrl ? [imageUrl, ...gallery.filter((g) => g !== imageUrl)] : gallery;

  return (
    <section className="border-t border-border/60">
      <div className="mx-auto grid max-w-6xl items-start gap-8 px-4 py-14 sm:gap-10 sm:px-6 sm:py-20 md:py-24 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="relative">
            {discountPct && discountPct > 0 && (
              <span className="absolute left-4 top-4 z-10 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/30">
                -{discountPct}%
              </span>
            )}
            <div className="aspect-square overflow-hidden rounded-3xl border border-border/60 bg-muted shadow-xl ring-1 ring-black/5">
              {images[active] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={absUrl(images[active])} alt={name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-muted-foreground">No image</div>
              )}
            </div>
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {images.slice(0, 5).map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    'aspect-square overflow-hidden rounded-xl border bg-muted transition-all',
                    i === active ? 'border-primary ring-2 ring-primary/30' : 'border-border/60 hover:border-primary/40'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={absUrl(src)} alt={`${name} ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5 sm:space-y-6">
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl md:text-4xl">{name}</h2>
            {tagline && <p className="mt-3 text-base text-muted-foreground sm:text-lg">{tagline}</p>}
          </div>

          {(rating || reviewCount) && (
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-0.5 text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn('h-4 w-4', rating && i < Math.round(rating) ? 'fill-amber-500' : 'opacity-30')}
                    strokeWidth={1.5}
                  />
                ))}
              </div>
              {rating && <span className="font-semibold">{rating.toFixed(1)}</span>}
              {reviewCount && <span className="text-muted-foreground">({reviewCount.toLocaleString()})</span>}
            </div>
          )}

          {(priceBefore || priceAfter) && (
            <div className={cn('flex flex-wrap items-baseline gap-3', direction === 'rtl' && 'flex-row-reverse')}>
              {priceAfter !== undefined && (
                <span className="text-4xl font-extrabold tracking-tight text-primary">{fmtPrice(priceAfter, cur)}</span>
              )}
              {priceBefore !== undefined && priceBefore !== priceAfter && (
                <span className="text-xl text-muted-foreground line-through">{fmtPrice(priceBefore, cur)}</span>
              )}
              {discountPct && discountPct > 0 && (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  Économise {discountPct}%
                </span>
              )}
            </div>
          )}

          {highlights.length > 0 && (
            <ul className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-5">
              {highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-700">
                    <Check className="h-3 w-3" strokeWidth={3.5} />
                  </span>
                  <span className="font-medium">{h}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href="#cta"
              className="group inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-full gradient-brand px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.02]"
            >
              <ShoppingBag className="h-4 w-4" />
              {ctaText}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
            </a>
          </div>

          {trustBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {trustBadges.map((b, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── PRODUCTS GRID
function ProductsSection({
  p,
  products,
  currency,
}: {
  p: Record<string, unknown>;
  products: NonNullable<Props['products']>;
  currency?: string;
}) {
  const title = str(p.title, 'Products');
  const subtitle = str(p.subtitle);
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{title}</h2>
          {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
        </div>
        {products.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-border/70 bg-card p-12 text-center text-sm text-muted-foreground">
            Products from your store will appear here.
          </div>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.slice(0, 6).map((product) => (
              <div
                key={product._id}
                className="group overflow-hidden rounded-2xl border border-border/60 bg-card transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
              >
                <div className="aspect-square bg-muted">
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={absUrl(product.images[0])} alt={product.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">No image</div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-medium tracking-tight">{product.name}</h3>
                  {typeof product.price === 'number' && (
                    <p className="mt-1.5 text-base font-semibold text-primary">
                      {fmtPrice(product.price, currency)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ────────────────────────────── BRANDS / press
function BrandsSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title, 'As featured in');
  const items = arr<{ name?: string }>(p.items);
  if (items.length === 0) return null;
  return (
    <section className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-14">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {items.map((it, i) => (
            <span key={i} className="bg-gradient-to-br from-foreground/70 to-foreground/40 bg-clip-text text-base font-bold tracking-tight text-transparent">
              {str(it.name)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── VIDEO
function VideoSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title);
  const subtitle = str(p.subtitle);
  const videoUrl = str(p.videoUrl);
  const posterUrl = str(p.posterUrl);
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        {title && (
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
            {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-muted shadow-2xl ring-1 ring-black/5">
          {videoUrl ? (
            <video src={absUrl(videoUrl)} poster={absUrl(posterUrl) || undefined} controls className="aspect-video w-full bg-black" />
          ) : posterUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={absUrl(posterUrl)} alt="Video poster" className="aspect-video w-full object-cover" />
              <div className="absolute inset-0 grid place-items-center bg-black/30">
                <PlayCircle className="h-16 w-16 text-white drop-shadow-2xl" />
              </div>
            </div>
          ) : (
            <div className="grid aspect-video w-full place-items-center bg-gradient-to-br from-amber-400/25 to-orange-500/25">
              <PlayCircle className="h-14 w-14 text-foreground/70" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── PRICING
function PricingSection({ p, currency }: { p: Record<string, unknown>; currency?: string }) {
  const title = str(p.title, 'Pricing');
  const subtitle = str(p.subtitle);
  const cur = str(p.currency, currency || 'USD');
  const plans = arr<{
    name?: string;
    price?: string | number;
    period?: string;
    features?: string[];
    ctaText?: string;
    highlight?: boolean;
  }>(p.plans);
  if (plans.length === 0) return null;
  return (
    <section className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{title}</h2>
          {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
        </div>
        <div
          className={cn(
            'mt-14 grid gap-6',
            plans.length === 1 && 'mx-auto max-w-sm',
            plans.length === 2 && 'sm:grid-cols-2',
            plans.length >= 3 && 'sm:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {plans.map((plan, i) => {
            const priceLabel = typeof plan.price === 'number' ? fmtPrice(plan.price, cur) : str(plan.price);
            return (
              <div
                key={i}
                className={cn(
                  'relative flex flex-col rounded-3xl border bg-card p-7 transition-all hover:shadow-xl',
                  plan.highlight ? 'border-primary shadow-xl shadow-primary/15 ring-2 ring-primary/20' : 'border-border/60'
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-brand px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white shadow-lg">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold tracking-tight">{str(plan.name)}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight">{priceLabel}</span>
                  {plan.period && <span className="text-sm text-muted-foreground">/ {plan.period}</span>}
                </div>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {arr<string>(plan.features).map((f, j) => (
                    <li key={j} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#cta"
                  className={cn(
                    'mt-7 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition-all',
                    plan.highlight
                      ? 'gradient-brand text-white shadow-md shadow-primary/30 hover:scale-[1.02]'
                      : 'border border-border/70 bg-background hover:bg-muted/40'
                  )}
                >
                  {str(plan.ctaText, 'Choose')}
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── TESTIMONIALS (modern, verified badge, large avatar)
function TestimonialsSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title, 'What our customers say');
  const items = arr<{ quote?: string; author?: string; role?: string; rating?: number; avatarUrl?: string }>(p.items);
  return (
    <section className="border-t border-border/60 bg-gradient-to-b from-card/40 via-background to-background">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{title}</h2>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => {
            const rating = num(it.rating) ?? 5;
            const avatar = absUrl(str(it.avatarUrl));
            return (
              <figure
                key={i}
                className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                <Quote className="h-6 w-6 text-orange-500/40" />
                <div className="mt-3 flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className={cn('h-4 w-4', j < Math.round(rating) ? 'fill-amber-500' : 'opacity-30')}
                      strokeWidth={1.5}
                    />
                  ))}
                </div>
                <blockquote className="mt-4 text-base leading-relaxed">{str(it.quote)}</blockquote>
                {it.author && (
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-border/40 pt-5">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar}
                        alt={str(it.author)}
                        className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-orange-500/30"
                      />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-base font-semibold text-white">
                        {str(it.author).charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-sm font-semibold tracking-tight">{str(it.author)}</span>
                        <BadgeCheck className="h-4 w-4 text-blue-500" strokeWidth={2.5} />
                      </span>
                      {it.role && <span className="block truncate text-xs font-normal text-muted-foreground">{str(it.role)}</span>}
                    </span>
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── STEPS (How it works)
function StepsSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title, 'How it works');
  const subtitle = str(p.subtitle);
  const items = arr<{ title?: string; description?: string; icon?: string }>(p.items);
  if (items.length === 0) return null;
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{title}</h2>
          {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="relative mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* dotted connector line on lg+ */}
          <div className="pointer-events-none absolute left-0 right-0 top-12 hidden h-px bg-[linear-gradient(to_right,transparent,theme(colors.border)_50%,transparent)] lg:block" aria-hidden />
          {items.map((it, i) => {
            const Icon = getIcon(it.icon);
            return (
              <div key={i} className="relative rounded-2xl border border-border/60 bg-card p-7">
                <div className="mb-4 flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-xl gradient-brand text-white shadow-md shadow-primary/25">
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <span className="bg-gradient-to-br from-amber-500 to-orange-600 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent opacity-30">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight">{str(it.title)}</h3>
                {it.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{str(it.description)}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── CTA (with optional urgency)
function CtaSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title, 'Ready to get started?');
  const subtitle = str(p.subtitle);
  const buttonText = str(p.buttonText, 'Get started');
  const secondaryText = str(p.secondaryText);
  const urgency = str(p.urgency);
  return (
    <section id="cta" className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 md:py-24">
        <div className="relative overflow-hidden rounded-[28px] sm:rounded-[36px] gradient-brand p-7 text-center text-white shadow-2xl shadow-primary/30 sm:p-10 md:p-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden />
          {urgency && (
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.2em] backdrop-blur">
              <Clock className="h-3.5 w-3.5" />
              {urgency}
            </span>
          )}
          <h2 className="relative mt-4 text-balance text-2xl font-bold leading-tight tracking-tight sm:mt-5 sm:text-4xl md:text-5xl">{title}</h2>
          {subtitle && <p className="relative mx-auto mt-3 max-w-2xl text-sm text-white/90 sm:mt-4 sm:text-base md:text-lg">{subtitle}</p>}
          <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-primary shadow-lg transition-transform hover:scale-[1.02]"
            >
              {buttonText}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
            </button>
            {secondaryText && <span className="text-xs text-white/80">{secondaryText}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────── FAQ (smooth accordion)
function FaqSection({ p }: { p: Record<string, unknown> }) {
  const title = str(p.title, 'Frequently asked questions');
  const items = arr<{ question?: string; answer?: string }>(p.items);
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20 md:py-24">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{title}</h2>
        <div className="mt-12 space-y-3">
          {items.map((it, i) => (
            <FaqItem key={i} question={str(it.question)} answer={str(it.answer)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-card transition-colors', open ? 'border-primary/30' : 'border-border/60')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-6 py-5 text-start font-medium transition-colors hover:bg-muted/30"
      >
        <span>{question}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300', open && 'rotate-180 text-primary')}
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{answer}</p>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────── FOOTER
const SOCIAL_ICON: Record<string, LucideIcon> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: PlayCircle,
  x: PlayCircle,
  whatsapp: PlayCircle,
};

function FooterSection({ p }: { p: Record<string, unknown> }) {
  const brandName = str(p.brandName);
  const tagline = str(p.tagline);
  const links = arr<{ label?: string; href?: string }>(p.links);
  const socials = arr<{ name?: string; href?: string }>(p.socials);
  const paymentMethods = arr<string>(p.paymentMethods).filter((s) => s);
  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-center">
          <div>
            <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
              {brandName}
            </div>
            {tagline && <p className="mt-2 max-w-md text-sm text-muted-foreground">{tagline}</p>}
          </div>
          {links.length > 0 && (
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={str(l.href, '#')}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {str(l.label)}
                </a>
              ))}
            </nav>
          )}
          {socials.length > 0 && (
            <div className="flex items-center gap-3">
              {socials.map((s, i) => {
                const Icon = SOCIAL_ICON[(s.name || '').toLowerCase()] || PlayCircle;
                return (
                  <a
                    key={i}
                    href={str(s.href, '#')}
                    aria-label={str(s.name)}
                    className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-background text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground hover:shadow-md"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
        {paymentMethods.length > 0 && (
          <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-border/60 pt-7">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Paiement
            </span>
            {paymentMethods.map((pm, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-md border border-border/60 bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {pm}
              </span>
            ))}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-muted-foreground sm:text-start">
          © {new Date().getFullYear()} {brandName}. Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}

// ────────────────────────────── STICKY MOBILE CTA BAR
function stickyCtaConfig(
  productSec: PageSection | undefined,
  ctaSec: PageSection | undefined,
  currency?: string
): { label: string; price?: string; href: string } | null {
  if (productSec) {
    const p = productSec.props;
    const after = num(p.priceAfter);
    const cur = str(p.currency, currency || '');
    return {
      label: str(p.ctaText, 'Acheter maintenant'),
      price: typeof after === 'number' ? fmtPrice(after, cur || 'USD') : undefined,
      href: '#cta',
    };
  }
  if (ctaSec) {
    return { label: str(ctaSec.props.buttonText, 'Get started'), href: '#cta' };
  }
  return null;
}

function StickyMobileCta({ label, price, href }: { label: string; price?: string; href: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:hidden">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border/60 bg-card/95 p-2 shadow-2xl backdrop-blur-xl">
        {price && (
          <div className="flex flex-col px-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prix</span>
            <span className="text-base font-bold tracking-tight text-primary">{price}</span>
          </div>
        )}
        <a
          href={href}
          className="ml-auto inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl gradient-brand px-5 text-sm font-semibold text-white shadow-md shadow-primary/30"
        >
          <ShoppingBag className="h-4 w-4" />
          {label}
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COD FORM — embed the cash-on-delivery order form inside a landing page.
// Used on physical-product landings so the buyer can order directly without
// jumping to /store/<slug>/product/<slug>.
//
// Props (set by the AI generator or the seller in the editor):
//   - title, subtitle              copy above the form
//   - productSlug                  which product the form orders. If absent
//                                  we fall back to the first item in `products`.
//   - showEmail / requireEmail / showPostalCode / showState /
//     showNotes / showQuantity     field-visibility toggles (same as
//                                  store.settings.codForm)
//   - submitLabel                  custom button label
//   - reassurance                  small reassurance line under the button
// ─────────────────────────────────────────────────────────────────────
function CodFormSection({
  p,
  products,
  currency,
  storeSlug,
  country,
  themeId,
}: {
  p: PageSection['props'];
  products: NonNullable<Props['products']>;
  currency?: string;
  storeSlug?: string;
  country?: string;
  themeId?: string;
}) {
  const title = str(p.title, 'Commander · Paiement à la livraison');
  const subtitle = str(p.subtitle);
  const productSlug = str(p.productSlug) || products[0]?.slug || '';
  const product = products.find((pr) => pr.slug === productSlug) || products[0];

  const config: CodFormConfig = {
    headline: str(p.headline) || undefined,
    submitLabel: str(p.submitLabel) || undefined,
    reassurance: str(p.reassurance) || undefined,
    showEmail: p.showEmail !== false,
    requireEmail: p.requireEmail === true,
    showPostalCode: p.showPostalCode === true,
    showState: p.showState === true,
    showNotes: p.showNotes !== false,
    showQuantity: p.showQuantity !== false,
  };

  // Resolve theme tokens for the form (same look as the standalone product page).
  const theme =
    STORE_THEME_TEMPLATES.find((t) => t.id === themeId)?.theme ||
    STORE_THEME_TEMPLATES[0].theme;
  const radius =
    theme.borderRadius === 'none' ? '0px' :
    theme.borderRadius === 'small' ? '6px' :
    theme.borderRadius === 'xl' ? '20px' : '12px';

  if (!product || !storeSlug) {
    // Editor / preview mode — show a non-interactive placeholder so the
    // landing renders cleanly without trying to submit a real order.
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center">
          <ShoppingBag className="mx-auto h-7 w-7 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {storeSlug
              ? 'Aucun produit publié. Le formulaire sera actif dès que tu auras un produit physique.'
              : 'Formulaire de commande en mode aperçu — il sera actif sur la version publiée.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="cod-order-form-section"
      className="mx-auto max-w-2xl scroll-mt-24 px-4 py-14 sm:px-6 sm:py-20"
    >
      {(title || subtitle) && (
        <div className="mb-8 text-center">
          {title && (
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{title}</h2>
          )}
          {subtitle && (
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">{subtitle}</p>
          )}
        </div>
      )}
      <CodOrderForm
        storeSlug={storeSlug}
        productSlug={product.slug || ''}
        productName={product.name}
        productPrice={product.price || 0}
        productStock={product.stock ?? 999}
        trackInventory={!!product.trackInventory}
        allowBackorder={!!product.allowBackorder}
        currency={currency || 'XOF'}
        defaultCountry={country}
        config={config}
        theme={theme}
        radius={radius}
      />
    </section>
  );
}
