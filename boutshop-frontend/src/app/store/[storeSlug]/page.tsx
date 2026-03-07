import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import {
  STORE_THEME_TEMPLATES,
  RADIUS_PX,
  tokensToCssVars,
  googleFontsHref,
  type ThemeTokens,
} from '@/data/store-themes';

interface Props {
  params: Promise<{ storeSlug: string }>;
}

interface StorefrontConfig {
  showHero?: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImage?: string;
  showProductsGrid?: boolean;
  productsGridTitle?: string;
  showFeatures?: boolean;
  showFooter?: boolean;
  footerNote?: string;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  storeType?: 'physical' | 'digital';
  theme?: { templateId?: string } & Record<string, unknown>;
  settings?: {
    currency?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    storefront?: StorefrontConfig;
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
            Back to BoutShop
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
      <div
        dir={direction}
        lang={language}
        className="min-h-screen"
        style={tokensToCssVars(theme)}
      >
        <Header store={store} theme={theme} />
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
        {isDigital && showFeatures && <DigitalGuarantee theme={theme} />}
        {showFooter && <Footer store={store} theme={theme} />}
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
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href={`/store/${store.slug}`}
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          {store.name}
        </Link>
        <Link
          href="/login"
          className="text-sm transition-colors"
          style={{ color: theme.muted }}
        >
          Espace marchand
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
    theme.fontDisplaySize === 'xlarge' ? 'text-5xl sm:text-7xl' :
    theme.fontDisplaySize === 'large'  ? 'text-4xl sm:text-6xl' : 'text-3xl sm:text-5xl';

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

      <div className={`relative mx-auto max-w-6xl px-6 ${isEditorial ? 'py-24 sm:py-32' : 'py-20 sm:py-28'}`}>
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
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className={`mb-10 ${isEditorial ? '' : 'text-center'}`}>
          {isEditorial && (
            <div
              className="mb-2 text-xs font-semibold uppercase tracking-[0.25em]"
              style={{ color: theme.accent }}
            >
              — Sélection
            </div>
          )}
          <h2
            className="text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {title || 'Nos produits'}
          </h2>
          {!isEditorial && (
            <p className="mt-2 text-sm" style={{ color: theme.muted }}>
              Tous nos produits, choisis avec soin.
            </p>
          )}
        </div>

        {products.length === 0 ? (
          <div
            className="grid place-items-center border border-dashed p-16 text-sm"
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
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
      <div className="mx-auto max-w-6xl px-6 py-10 text-center text-sm">
        <span
          className="font-bold tracking-tight"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          {store.name}
        </span>
        <p className="mt-2 text-xs">
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
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 py-7 text-sm sm:grid-cols-4 sm:gap-6">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3" style={{ color: theme.muted }}>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base"
              style={{ backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}
            >
              {it.icon}
            </span>
            <span className="font-medium leading-tight" style={{ color: theme.foreground }}>
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
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
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
