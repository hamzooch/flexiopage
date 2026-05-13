import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import {
  STORE_THEME_TEMPLATES,
  RADIUS_PX,
  tokensToCssVars,
  googleFontsHref,
  type ThemeTokens,
} from '@/data/store-themes';
import { MarketingPixels, type MarketingConfig } from '@/components/storefront/MarketingPixels';
import { StorefrontSlider, type SliderConfig } from '@/components/storefront/Slider';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import { StoreFooter, type FooterConfig } from '@/components/storefront/StoreFooter';
import { StorefrontTestimonials, type TestimonialsConfig } from '@/components/storefront/Testimonials';

interface Props {
  params: Promise<{ storeSlug: string }>;
}

interface StorefrontConfig {
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

function resolveTheme(store: StoreDoc): ThemeTokens {
  const id = store.theme?.templateId;
  const found = STORE_THEME_TEMPLATES.find((t) => t.id === id);
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
          href={`/store/${store.slug}`}
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
// HERO
// ─────────────────────────────────────────────────────────────────────
function Hero({ store, theme, isDigital = false }: { store: StoreDoc; theme: ThemeTokens; isDigital?: boolean }) {
  const isEditorial = theme.style === 'editorial';
  const isTech = theme.style === 'tech';
  const isSoft = theme.style === 'soft';

  const titleSize =
    theme.fontDisplaySize === 'xlarge' ? 'text-3xl sm:text-5xl lg:text-7xl' :
    theme.fontDisplaySize === 'large'  ? 'text-3xl sm:text-4xl lg:text-6xl' : 'text-2xl sm:text-3xl lg:text-5xl';

  return (
    <section className="relative overflow-hidden">
      {/* Pattern bg */}
      {theme.pattern === 'grid' && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          }}
          aria-hidden
        />
      )}
      {theme.pattern === 'mesh' && (
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
      )}

      <div className={`relative mx-auto max-w-6xl px-4 sm:px-6 ${isEditorial ? 'py-14 sm:py-24 lg:py-32' : 'py-12 sm:py-20 lg:py-28'}`}>
        <div className={`${isEditorial ? 'max-w-3xl' : 'mx-auto max-w-3xl text-center'}`}>
          {!isEditorial && (
            <div
              className="mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur"
              style={{
                borderColor: theme.border,
                color: isTech ? theme.primary : theme.foreground,
                backgroundColor: hexA(theme.surface, 0.6),
                borderRadius: theme.borderRadius === 'none' ? '999px' : '999px',
              }}
            >
              <span className="relative grid h-1.5 w-1.5 place-items-center">
                <span
                  className="absolute inset-0 animate-ping rounded-full opacity-60"
                  style={{ backgroundColor: theme.primary }}
                />
                <span className="relative h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.primary }} />
              </span>
              {isDigital ? 'Téléchargement instantané' : 'Nouvelle collection'}
            </div>
          )}
          <h1
            className={`${titleSize} ${isEditorial ? 'leading-[0.95]' : 'leading-[1.05]'} font-bold tracking-tight`}
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {store.settings?.storefront?.heroTitle || store.name}
          </h1>
          {(store.settings?.storefront?.heroSubtitle || store.description) && (
            <p
              className={`mt-6 ${isEditorial ? 'max-w-xl text-lg' : 'mx-auto max-w-2xl'} leading-relaxed`}
              style={{ color: theme.muted, fontFamily: theme.fontBody }}
            >
              {store.settings?.storefront?.heroSubtitle || store.description}
            </p>
          )}
          <div className={`mt-9 flex flex-wrap items-center gap-3 ${isEditorial ? '' : 'justify-center'}`}>
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
              Découvrir nos produits
              <span aria-hidden>→</span>
            </a>
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
  const isEditorial = theme.style === 'editorial';
  const radius = RADIUS_PX[theme.borderRadius];

  return (
    <section
      id="products"
      className="border-t"
      style={{ borderColor: theme.border, backgroundColor: theme.background }}
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <div className={`mb-7 sm:mb-10 ${isEditorial ? '' : 'text-center'}`}>
          {isEditorial && (
            <div
              className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] sm:text-xs"
              style={{ color: theme.accent }}
            >
              — Sélection
            </div>
          )}
          <h2
            className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl"
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {title || 'Nos produits'}
          </h2>
          {!isEditorial && (
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
          <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {products.map((p) => {
              const hasDiscount = p.compareAtPrice && p.compareAtPrice > p.price;
              const discountPct = hasDiscount
                ? Math.round(((p.compareAtPrice! - p.price) / p.compareAtPrice!) * 100)
                : 0;
              return (
                <Link
                  key={p._id}
                  href={`/store/${storeSlug}/product/${p.slug}`}
                  className="group block overflow-hidden border transition-all hover:-translate-y-1"
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderRadius: radius,
                    boxShadow:
                      theme.shadow === 'glow'
                        ? `0 0 0 0 transparent`
                        : theme.shadow === 'soft'
                          ? '0 4px 12px rgba(0,0,0,0.04)'
                          : '0 1px 0 rgba(0,0,0,0.04)',
                  }}
                >
                  <div
                    className="relative aspect-square overflow-hidden"
                    style={{ backgroundColor: theme.surfaceMuted }}
                  >
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
                    {hasDiscount && (
                      <span
                        className="absolute left-3 top-3 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          backgroundColor: theme.primary,
                          color: theme.primaryFg,
                          borderRadius: theme.borderRadius === 'none' ? '0' : '999px',
                        }}
                      >
                        −{discountPct}%
                      </span>
                    )}
                    {isDigital && p.digitalKind && (
                      <span
                        className="absolute right-3 top-3 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur"
                        style={{
                          backgroundColor: hexA(theme.surface, 0.85),
                          color: theme.foreground,
                          border: `1px solid ${theme.border}`,
                          borderRadius: theme.borderRadius === 'none' ? '0' : '999px',
                        }}
                      >
                        {KIND_LABEL[p.digitalKind] || 'Digital'}
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    <h3
                      className="font-semibold tracking-tight"
                      style={{
                        fontFamily: isEditorial ? theme.fontHeading : theme.fontBody,
                        color: theme.foreground,
                      }}
                    >
                      {p.name}
                    </h3>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>
                        {formatCurrency(p.price, currency)}
                      </span>
                      {hasDiscount && (
                        <span className="text-xs line-through" style={{ color: theme.muted }}>
                          {formatCurrency(p.compareAtPrice!, currency)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
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
