import type { Metadata } from 'next';
import Link from 'next/link';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import {
  STORE_THEME_TEMPLATES,
  RADIUS_PX,
  tokensToCssVars,
  googleFontsHref,
  withLayoutFallback,
  type ThemeTokens,
} from '@/data/store-themes';
import { MarketingPixels, type MarketingConfig } from '@/components/storefront/MarketingPixels';
import { StorefrontSlider, type SliderConfig } from '@/components/storefront/Slider';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import { StoreFooter, type FooterConfig } from '@/components/storefront/StoreFooter';
import { StorefrontTestimonials, type TestimonialsConfig } from '@/components/storefront/Testimonials';
import { AnnouncementBar, type AnnouncementBarConfig } from '@/components/storefront/AnnouncementBar';

interface Props {
  params: Promise<{ storeSlug: string }>;
}

interface StorefrontConfig {
  announcementBar?: AnnouncementBarConfig;
  navbar?: NavbarConfig;
  showHero?: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImage?: string;
  showProductsGrid?: boolean;
  productsGridTitle?: string;
  showFeatures?: boolean;
  testimonials?: TestimonialsConfig;
  showFooter?: boolean;
  footerNote?: string;
  footer?: FooterConfig;
  slider?: SliderConfig;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  storeType?: 'physical' | 'digital';
  logo?: string;
  favicon?: string;
  theme?: { templateId?: string } & Record<string, unknown>;
  settings?: {
    currency?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    storefront?: StorefrontConfig;
  };
  integrations?: {
    marketing?: MarketingConfig;
  };
}

interface ProductDoc {
  _id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  slug: string;
  images?: string[];
  description?: string;
  type?: 'physical' | 'digital';
  digitalKind?: 'download' | 'course' | 'license' | 'membership' | 'service';
  digitalAssets?: Array<{ id: string; name: string; kind: string; size?: number }>;
}

const FALLBACK_THEME = STORE_THEME_TEMPLATES[0].theme;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug } = await params;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  try {
    const res = await fetch(`${apiBase}/api/public/store-by-slug/${storeSlug}`, {
      cache: 'no-store',
    });
    if (!res.ok) return {};
    const { store } = (await res.json()) as { store?: StoreDoc };
    if (!store) return {};
    const icon = mediaUrl(store.favicon || store.logo);
    return {
      title: store.name,
      description: store.description,
      ...(icon ? { icons: { icon } } : {}),
    };
  } catch {
    return {};
  }
}

function resolveTheme(store: StoreDoc): ThemeTokens {
  const saved = store.theme as Partial<ThemeTokens> | undefined;
  // A fully-saved theme carries the customized palette — use it verbatim
  // (backfilling the structural `layout` block for stores saved before it
  // existed). Otherwise fall back to the named template.
  if (saved && saved.primary && saved.background && saved.foreground) {
    return withLayoutFallback(saved as ThemeTokens);
  }
  const found = STORE_THEME_TEMPLATES.find((t) => t.id === saved?.templateId);
  return found?.theme || FALLBACK_THEME;
}

export default async function PublicStorePage({ params }: Props) {
  const { storeSlug } = await params;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  let store: StoreDoc | null = null;
  let products: ProductDoc[] = [];

  try {
    const [storeRes, productsRes] = await Promise.all([
      fetch(`${apiBase}/api/public/store-by-slug/${storeSlug}`, { cache: 'no-store' }),
      fetch(`${apiBase}/api/public/stores/${storeSlug}/products`, { cache: 'no-store' }),
    ]);
    if (storeRes.ok) {
      const d = await storeRes.json();
      store = d.store;
    }
    if (productsRes.ok && store) {
      const d = await productsRes.json();
      products = d.products || [];
    }
  } catch {
    // fallback
  }

  if (!store) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Store not found</h1>
          <Link href="/" className="mt-4 inline-block text-primary hover:underline">
            Back to FlexioPage
          </Link>
        </div>
      </div>
    );
  }

  const theme = resolveTheme(store);
  const direction = store.settings?.direction || 'ltr';
  const language = store.settings?.language;
  const currency = store.settings?.currency || 'USD';
  const fontsUrl = googleFontsHref(theme);
  const radius = RADIUS_PX[theme.borderRadius];

  const isDigital = store.storeType === 'digital';
  const sf = store.settings?.storefront || {};
  const showHero = sf.showHero !== false;
  const showGrid = sf.showProductsGrid !== false;
  const showFeatures = sf.showFeatures !== false;
  const showFooter = sf.showFooter !== false;

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <MarketingPixels config={store.integrations?.marketing} />
      <div
        dir={direction}
        lang={language}
        className="min-h-screen"
        style={tokensToCssVars(theme)}
      >
        <AnnouncementBar config={sf.announcementBar} theme={theme} />
        <StoreNavbar
          storeName={store.name}
          storeSlug={store.slug}
          storeLogo={store.logo}
          theme={theme}
          config={sf.navbar}
        />
        <StorefrontSlider
          config={sf.slider}
          primary={theme.primary}
          primaryFg={theme.primaryFg}
          borderRadius={theme.borderRadius === 'none' ? 0 : 9999}
        />
        {showHero && <Hero store={store} theme={theme} isDigital={isDigital} />}
        {isDigital && showFeatures && <DigitalTrustStrip theme={theme} />}
        {showGrid && (
          <ProductsGrid
            theme={theme}
            products={products}
            storeSlug={store.slug}
            currency={currency}
            isDigital={isDigital}
            title={sf.productsGridTitle}
          />
        )}
        <StorefrontTestimonials config={sf.testimonials} theme={theme} />
        {isDigital && showFeatures && <DigitalGuarantee theme={theme} />}
        {showFooter && (
          <StoreFooter
            storeName={store.name}
            storeSlug={store.slug}
            footerNote={sf.footerNote}
            config={sf.footer}
            theme={theme}
          />
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────
function Header({ store, theme }: { store: StoreDoc; theme: ThemeTokens }) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-xl"
      style={{
        borderColor: theme.border,
        backgroundColor: hexA(theme.background, 0.85),
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-3 sm:h-16 sm:px-6">
        <Link
          href={`/${store.slug}`}
          className="truncate text-base font-bold tracking-tight sm:text-xl"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          {store.name}
        </Link>
        <Link
          href="/login"
          className="shrink-0 text-xs transition-colors sm:text-sm"
          style={{ color: theme.muted }}
        >
          <span className="hidden sm:inline">Espace marchand</span>
          <span className="sm:hidden">Marchand</span>
        </Link>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO — five structurally distinct layouts driven by theme.layout.hero
// ─────────────────────────────────────────────────────────────────────
function HeroPattern({ theme }: { theme: ThemeTokens }) {
  if (theme.pattern === 'grid') {
    return (
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
        }}
        aria-hidden
      />
    );
  }
  if (theme.pattern === 'mesh') {
    return (
      <>
        <div
          className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full blur-3xl opacity-50"
          style={{ backgroundColor: theme.gradientFrom }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 top-20 h-[360px] w-[360px] rounded-full blur-3xl opacity-40"
          style={{ backgroundColor: theme.gradientTo }}
          aria-hidden
        />
      </>
    );
  }
  return null;
}

function HeroCta({ theme, label }: { theme: ThemeTokens; label: string }) {
  const isTech = theme.style === 'tech';
  return (
    <a
      href="#products"
      className="inline-flex h-12 items-center gap-2 px-7 text-sm font-semibold transition-all hover:scale-[1.02]"
      style={{
        background: isTech
          ? `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`
          : theme.primary,
        color: theme.primaryFg,
        borderRadius: theme.borderRadius === 'none' ? '0' : '999px',
        boxShadow:
          theme.shadow === 'glow'
            ? `0 8px 32px ${hexA(theme.primary, 0.45)}`
            : theme.shadow === 'soft'
              ? `0 12px 28px ${hexA(theme.primary, 0.25)}`
              : `0 2px 0 ${theme.primary}`,
      }}
    >
      {label}
      <span aria-hidden>→</span>
    </a>
  );
}

function Hero({ store, theme, isDigital = false }: { store: StoreDoc; theme: ThemeTokens; isDigital?: boolean }) {
  const layout = theme.layout?.hero || 'centered';
  const title = store.settings?.storefront?.heroTitle || store.name;
  const subtitle = store.settings?.storefront?.heroSubtitle || store.description;
  const heroImage = store.settings?.storefront?.heroImage;
  const eyebrow = isDigital ? 'Téléchargement instantané' : 'Nouvelle collection';
  const radius = RADIUS_PX[theme.borderRadius];

  const titleSize =
    theme.fontDisplaySize === 'xlarge' ? 'text-4xl sm:text-6xl lg:text-7xl' :
    theme.fontDisplaySize === 'large'  ? 'text-3xl sm:text-5xl lg:text-6xl' : 'text-3xl sm:text-4xl lg:text-5xl';

  // When the seller uploads a hero background image we render a dedicated
  // image-cover layout (image + dark scrim + white text) instead of one of
  // the 5 layout variants — the picked image is a strong creative choice
  // that should drive the hero, not compete with a placeholder visual.
  if (heroImage) {
    return (
      <section className="relative overflow-hidden" style={{ backgroundColor: theme.surfaceMuted }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.65) 100%)' }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <div
              className="mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur"
              style={{ borderColor: 'rgba(255,255,255,0.35)', color: '#fff', backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <span className="relative grid h-1.5 w-1.5 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ backgroundColor: theme.primary }} />
                <span className="relative h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.primary }} />
              </span>
              {eyebrow}
            </div>
            <h1
              className={`${titleSize} font-bold leading-[1.05] tracking-tight text-white`}
              style={{ fontFamily: theme.fontHeading, textShadow: '0 2px 16px rgba(0,0,0,0.35)' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg"
                style={{ fontFamily: theme.fontBody, textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}
              >
                {subtitle}
              </p>
            )}
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <HeroCta theme={theme} label="Découvrir nos produits" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── FULLBLEED — edge-to-edge color block, oversized uppercase type ──
  if (layout === 'fullbleed') {
    return (
      <section className="relative overflow-hidden" style={{ backgroundColor: theme.surfaceMuted }}>
        <HeroPattern theme={theme} />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
          <div
            className="mb-6 inline-flex items-center gap-2 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ backgroundColor: theme.primary, color: theme.primaryFg }}
          >
            {eyebrow}
          </div>
          <h1
            className={`${titleSize} max-w-4xl font-black uppercase leading-[0.92] tracking-tight`}
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="mt-6 max-w-xl text-base leading-relaxed sm:text-lg"
              style={{ color: theme.muted, fontFamily: theme.fontBody }}
            >
              {subtitle}
            </p>
          )}
          <div className="mt-9">
            <HeroCta theme={theme} label="Voir les produits" />
          </div>
        </div>
      </section>
    );
  }

  // ── EDITORIAL — asymmetric, left-aligned, big serif, accent rule ──
  if (layout === 'editorial') {
    return (
      <section className="relative overflow-hidden" style={{ backgroundColor: theme.background }}>
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <div
                className="mb-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.3em]"
                style={{ color: theme.accent }}
              >
                <span className="h-px w-10" style={{ backgroundColor: theme.accent }} />
                {isDigital ? 'Sélection digitale' : 'Maison & collection'}
              </div>
              <h1
                className={`${titleSize} font-bold leading-[0.95] tracking-tight`}
                style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
              >
                {title}
              </h1>
            </div>
            {subtitle && (
              <p
                className="max-w-sm border-l pl-5 text-base leading-relaxed"
                style={{ color: theme.muted, fontFamily: theme.fontBody, borderColor: theme.border }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <HeroCta theme={theme} label="Découvrir" />
            <a href="#products" className="text-sm font-medium underline underline-offset-4" style={{ color: theme.foreground }}>
              Voir tout le catalogue
            </a>
          </div>
        </div>
      </section>
    );
  }

  // ── SPLIT — copy left, decorative visual panel right ──
  if (layout === 'split') {
    return (
      <section className="relative overflow-hidden" style={{ backgroundColor: theme.background }}>
        <HeroPattern theme={theme} />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div>
            <div
              className="mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur"
              style={{ borderColor: theme.border, color: theme.primary, backgroundColor: hexA(theme.surface, 0.6) }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.primary }} />
              {eyebrow}
            </div>
            <h1
              className={`${titleSize} font-bold leading-[1.05] tracking-tight`}
              style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-6 max-w-lg text-base leading-relaxed" style={{ color: theme.muted, fontFamily: theme.fontBody }}>
                {subtitle}
              </p>
            )}
            <div className="mt-8">
              <HeroCta theme={theme} label="Découvrir nos produits" />
            </div>
          </div>
          {/* Visual panel */}
          <div
            className="relative aspect-[4/3] overflow-hidden lg:aspect-square"
            style={{
              borderRadius: radius,
              background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
            }}
          >
            <div
              className="absolute left-6 top-6 h-24 w-24 rounded-2xl opacity-90 blur-[1px]"
              style={{ backgroundColor: hexA(theme.surface, 0.55) }}
              aria-hidden
            />
            <div
              className="absolute bottom-8 right-8 h-32 w-32 rounded-full"
              style={{ backgroundColor: hexA(theme.background, 0.35) }}
              aria-hidden
            />
            <div
              className="absolute inset-x-6 bottom-6 rounded-xl p-4 backdrop-blur"
              style={{ backgroundColor: hexA(theme.surface, 0.85), borderRadius: radius }}
            >
              <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: theme.foreground, opacity: 0.7 }} />
              <div className="mt-2 h-2 w-1/3 rounded-full" style={{ backgroundColor: theme.primary }} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── MINIMAL — stark, type-only, generous whitespace ──
  if (layout === 'minimal') {
    return (
      <section className="relative" style={{ backgroundColor: theme.background }}>
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
          <div
            className="mb-6 text-[11px] font-bold uppercase tracking-[0.35em]"
            style={{ color: theme.muted }}
          >
            {eyebrow}
          </div>
          <h1
            className={`${titleSize} max-w-3xl font-extrabold leading-[1] tracking-tight`}
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-6 max-w-lg text-base leading-relaxed" style={{ color: theme.muted, fontFamily: theme.fontBody }}>
              {subtitle}
            </p>
          )}
          <div className="mt-9 flex items-center gap-5">
            <HeroCta theme={theme} label="Parcourir" />
          </div>
          <div className="mt-14 h-px w-full" style={{ backgroundColor: theme.border }} />
        </div>
      </section>
    );
  }

  // ── CENTERED — default: badge + centered stack ──
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: theme.background }}>
      <HeroPattern theme={theme} />
      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div
            className="mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur"
            style={{ borderColor: theme.border, color: theme.foreground, backgroundColor: hexA(theme.surface, 0.6) }}
          >
            <span className="relative grid h-1.5 w-1.5 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ backgroundColor: theme.primary }} />
              <span className="relative h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.primary }} />
            </span>
            {eyebrow}
          </div>
          <h1
            className={`${titleSize} font-bold leading-[1.05] tracking-tight`}
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mx-auto mt-6 max-w-2xl leading-relaxed" style={{ color: theme.muted, fontFamily: theme.fontBody }}>
              {subtitle}
            </p>
          )}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <HeroCta theme={theme} label="Découvrir nos produits" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PRODUCTS GRID
// ─────────────────────────────────────────────────────────────────────
const KIND_LABEL: Record<string, string> = {
  download: 'Téléchargement',
  course: 'Cours',
  license: 'Licence',
  membership: 'Accès membre',
  service: 'Prestation',
};

const GRID_COLS_CLASS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

function ProductCard({
  product: p,
  theme,
  storeSlug,
  currency,
  isDigital,
}: {
  product: ProductDoc;
  theme: ThemeTokens;
  storeSlug: string;
  currency: string;
  isDigital: boolean;
}) {
  const cardStyle = theme.layout?.productCard || 'classic';
  const radius = RADIUS_PX[theme.borderRadius];
  const hasDiscount = p.compareAtPrice && p.compareAtPrice > p.price;
  const discountPct = hasDiscount
    ? Math.round(((p.compareAtPrice! - p.price) / p.compareAtPrice!) * 100)
    : 0;
  const href = `/${storeSlug}/product/${p.slug}`;
  const pillRadius = theme.borderRadius === 'none' ? '0' : '999px';

  const image = (
    <>
      {p.images?.[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.images[0]}
          alt={p.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="grid h-full place-items-center text-xs" style={{ color: theme.muted }}>
          No image
        </div>
      )}
    </>
  );

  const discountBadge = hasDiscount && (
    <span
      className="absolute left-3 top-3 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: theme.primary, color: theme.primaryFg, borderRadius: pillRadius }}
    >
      −{discountPct}%
    </span>
  );
  const kindBadge = isDigital && p.digitalKind && (
    <span
      className="absolute right-3 top-3 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur"
      style={{
        backgroundColor: hexA(theme.surface, 0.85),
        color: theme.foreground,
        border: `1px solid ${theme.border}`,
        borderRadius: pillRadius,
      }}
    >
      {KIND_LABEL[p.digitalKind] || 'Digital'}
    </span>
  );
  // Wrap allows the compare price to drop to a 2nd line on very narrow
  // mobile cards instead of overflowing; whitespace-nowrap keeps each
  // formatted amount atomic so "45 000 XOF" never splits mid-number.
  const priceRow = (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
      <span
        className="whitespace-nowrap text-sm font-bold sm:text-base"
        style={{ color: theme.primary }}
      >
        {formatCurrency(p.price, currency)}
      </span>
      {hasDiscount && (
        <span
          className="whitespace-nowrap text-xs font-medium line-through opacity-80 sm:text-[13px]"
          style={{ color: theme.muted }}
        >
          {formatCurrency(p.compareAtPrice!, currency)}
        </span>
      )}
    </div>
  );

  // ── OVERLAY — text on top of the image with a dark scrim ──
  if (cardStyle === 'overlay') {
    return (
      <Link
        key={p._id}
        href={href}
        className="group relative block aspect-[4/5] overflow-hidden"
        style={{ borderRadius: radius, backgroundColor: theme.surfaceMuted }}
      >
        {image}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 8%, rgba(0,0,0,0) 55%)' }} aria-hidden />
        {discountBadge}
        {kindBadge}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="text-sm font-bold uppercase tracking-tight text-white sm:text-base" style={{ fontFamily: theme.fontHeading }}>
            {p.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
            <span
              className="whitespace-nowrap text-sm font-bold sm:text-base"
              style={{ color: theme.primary }}
            >
              {formatCurrency(p.price, currency)}
            </span>
            {hasDiscount && (
              <span className="whitespace-nowrap text-xs font-medium text-white/70 line-through sm:text-[13px]">
                {formatCurrency(p.compareAtPrice!, currency)}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // ── EDITORIAL — borderless, flat image, serif name below ──
  if (cardStyle === 'editorial') {
    return (
      <Link key={p._id} href={href} className="group block">
        <div className="relative aspect-[3/4] overflow-hidden" style={{ backgroundColor: theme.surfaceMuted }}>
          {image}
          {discountBadge}
          {kindBadge}
        </div>
        <div className="pt-3">
          <h3 className="text-base font-medium leading-snug" style={{ fontFamily: theme.fontHeading, color: theme.foreground }}>
            {p.name}
          </h3>
          <div className="mt-1">{priceRow}</div>
        </div>
      </Link>
    );
  }

  // ── MINIMAL — tight, thin hairline, text hugs the image ──
  if (cardStyle === 'minimal') {
    return (
      <Link
        key={p._id}
        href={href}
        className="group block overflow-hidden transition-colors"
        style={{ borderRadius: radius, border: `1px solid ${theme.border}`, backgroundColor: theme.surface }}
      >
        <div className="relative aspect-square overflow-hidden" style={{ backgroundColor: theme.surfaceMuted }}>
          {image}
          {discountBadge}
          {kindBadge}
        </div>
        <div className="px-3 py-2.5">
          <h3 className="truncate text-sm font-semibold tracking-tight" style={{ color: theme.foreground }}>
            {p.name}
          </h3>
          <div className="mt-1">{priceRow}</div>
        </div>
      </Link>
    );
  }

  // ── CLASSIC — default: bordered card, image then padded text block ──
  return (
    <Link
      key={p._id}
      href={href}
      className="group block overflow-hidden border transition-all hover:-translate-y-1"
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderRadius: radius,
        boxShadow:
          theme.shadow === 'glow'
            ? `0 4px 20px ${hexA(theme.primary, 0.12)}`
            : theme.shadow === 'soft'
              ? '0 4px 12px rgba(0,0,0,0.05)'
              : '0 1px 0 rgba(0,0,0,0.04)',
      }}
    >
      <div className="relative aspect-square overflow-hidden" style={{ backgroundColor: theme.surfaceMuted }}>
        {image}
        {discountBadge}
        {kindBadge}
      </div>
      <div className="p-3 sm:p-5">
        <h3
          className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight sm:text-base"
          style={{ fontFamily: theme.fontBody, color: theme.foreground }}
        >
          {p.name}
        </h3>
        <div className="mt-1.5 sm:mt-2">{priceRow}</div>
      </div>
    </Link>
  );
}

function ProductsGrid({
  theme,
  products,
  storeSlug,
  currency,
  isDigital = false,
  title,
}: {
  theme: ThemeTokens;
  products: ProductDoc[];
  storeSlug: string;
  currency: string;
  isDigital?: boolean;
  title?: string;
}) {
  const radius = RADIUS_PX[theme.borderRadius];
  // "Bold" nav themes (Volt, Studio) also use loud uppercase section heads.
  const uppercase = theme.layout?.nav === 'bold';
  // Editorial / left-aligned section heads vs centered ones.
  const leftAlign = theme.layout?.hero === 'editorial' || theme.layout?.hero === 'minimal';
  const cols = theme.layout?.gridColumns || 3;
  const gridClass = GRID_COLS_CLASS[cols] || GRID_COLS_CLASS[3];

  return (
    <section
      id="products"
      className="border-t"
      style={{ borderColor: theme.border, backgroundColor: theme.background }}
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <div className={`mb-7 sm:mb-10 ${leftAlign ? '' : 'text-center'}`}>
          {leftAlign && (
            <div
              className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] sm:text-xs"
              style={{ color: theme.accent }}
            >
              — Sélection
            </div>
          )}
          <h2
            className={`text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl ${uppercase ? 'uppercase' : ''}`}
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {title || 'Nos produits'}
          </h2>
          {!leftAlign && (
            <p className="mt-2 text-xs sm:text-sm" style={{ color: theme.muted }}>
              Tous nos produits, choisis avec soin.
            </p>
          )}
        </div>

        {products.length === 0 ? (
          <div
            className="grid place-items-center border border-dashed p-10 text-sm sm:p-16"
            style={{
              borderColor: theme.border,
              color: theme.muted,
              backgroundColor: theme.surfaceMuted,
              borderRadius: radius,
            }}
          >
            Aucun produit pour l&apos;instant.
          </div>
        ) : (
          <div className={`grid gap-3 sm:gap-6 ${gridClass}`}>
            {products.map((p) => (
              <ProductCard
                key={p._id}
                product={p}
                theme={theme}
                storeSlug={storeSlug}
                currency={currency}
                isDigital={isDigital}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────────────
function Footer({ store, theme }: { store: StoreDoc; theme: ThemeTokens }) {
  return (
    <footer
      className="border-t"
      style={{
        borderColor: theme.border,
        backgroundColor: theme.surfaceMuted,
        color: theme.muted,
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 text-center text-sm sm:px-6 sm:py-10">
        <span
          className="font-bold tracking-tight"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          {store.name}
        </span>
        <p className="mt-2 text-[11px] sm:text-xs">
          © {new Date().getFullYear()} {store.name}. Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}

// hex (#rrggbb) → rgba helper for tinted backgrounds and shadows
function hexA(hex: string, a: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ─────────────────────────────────────────────────────────────────────
// DIGITAL — trust strip & guarantee (chariow-style)
// ─────────────────────────────────────────────────────────────────────
function DigitalTrustStrip({ theme }: { theme: ThemeTokens }) {
  const items: { icon: string; label: string }[] = [
    { icon: '⚡', label: 'Téléchargement instantané' },
    { icon: '🔒', label: 'Paiement 100% sécurisé' },
    { icon: '♾️', label: 'Accès à vie' },
    { icon: '✅', label: 'Garantie 14 jours' },
  ];
  return (
    <section
      className="border-y"
      style={{ borderColor: theme.border, backgroundColor: theme.surfaceMuted }}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 py-5 text-xs sm:gap-6 sm:px-6 sm:py-7 sm:text-sm lg:grid-cols-4">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 sm:gap-3" style={{ color: theme.muted }}>
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm sm:h-9 sm:w-9 sm:text-base"
              style={{ backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}
            >
              {it.icon}
            </span>
            <span className="min-w-0 font-medium leading-tight" style={{ color: theme.foreground }}>
              {it.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DigitalGuarantee({ theme }: { theme: ThemeTokens }) {
  return (
    <section
      className="border-t"
      style={{ borderColor: theme.border, backgroundColor: theme.background }}
    >
      <div className="mx-auto max-w-3xl px-4 py-10 text-center sm:px-6 sm:py-16">
        <div
          className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl text-2xl"
          style={{
            background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
            color: theme.primaryFg,
          }}
        >
          ✓
        </div>
        <h2
          className="text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          Satisfait ou remboursé sous 14 jours
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed" style={{ color: theme.muted }}>
          Tu reçois ton accès immédiatement par email après l&apos;achat.
          Si tu n&apos;es pas satisfait dans les 14 jours, on te rembourse — sans question, sans formulaire compliqué.
        </p>
      </div>
    </section>
  );
}
