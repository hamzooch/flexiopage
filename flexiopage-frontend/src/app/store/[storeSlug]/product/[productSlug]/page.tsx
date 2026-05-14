import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import type { ProductBundle } from '@/lib/api';
import {
  STORE_THEME_TEMPLATES,
  RADIUS_PX,
  tokensToCssVars,
  googleFontsHref,
  type ThemeTokens,
} from '@/data/store-themes';
import { CodOrderForm, type CodFormConfig } from '@/components/storefront/cod-order-form';
import { MarketingPixels, type MarketingConfig } from '@/components/storefront/MarketingPixels';
import { TrackEvent } from '@/components/storefront/TrackEvent';
import { StoreTracker } from '@/components/storefront/StoreTracker';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';

interface Props {
  params: Promise<{ storeSlug: string; productSlug: string }>;
}

interface DigitalAsset {
  id: string;
  name: string;
  url: string;
  kind: 'file' | 'video' | 'image' | 'audio' | 'link';
  mimeType?: string;
  size?: number;
}

interface ProductDoc {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  type: 'physical' | 'digital';
  images?: string[];
  stock?: number;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  digitalKind?: 'download' | 'course' | 'license' | 'membership' | 'service';
  digitalAssets?: DigitalAsset[];
  accessType?: 'lifetime' | 'limited';
  accessDays?: number;
  licenseKeyTemplate?: string;
  seoTitle?: string;
  seoDescription?: string;
  pageSettings?: {
    showGallery?: boolean;
    showDescription?: boolean;
    showTrustBadges?: boolean;
    codFormTitle?: string;
    reassuranceText?: string;
  };
  bundle?: ProductBundle;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  storeType?: 'physical' | 'digital';
  logo?: string;
  theme?: { templateId?: string };
  settings?: {
    currency?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    country?: string;
    codForm?: CodFormConfig;
    storefront?: { navbar?: NavbarConfig };
  };
  integrations?: { marketing?: MarketingConfig };
}

const FALLBACK_THEME = STORE_THEME_TEMPLATES[0].theme;
function resolveTheme(store: StoreDoc | null): ThemeTokens {
  if (!store) return FALLBACK_THEME;
  const id = store.theme?.templateId;
  return STORE_THEME_TEMPLATES.find((t) => t.id === id)?.theme || FALLBACK_THEME;
}

const KIND_META: Record<NonNullable<ProductDoc['digitalKind']>, { label: string; icon: string; what: string }> = {
  download:   { label: 'Téléchargement',  icon: '⬇️',  what: 'Tu reçois les fichiers immédiatement après l\'achat.' },
  course:     { label: 'Cours en ligne',  icon: '🎓',  what: 'Tu reçois un accès à toutes les vidéos et ressources du cours.' },
  license:    { label: 'Clé de licence',  icon: '🔑',  what: 'Tu reçois une clé de licence unique par email après l\'achat.' },
  membership: { label: 'Espace membre',   icon: '👥',  what: 'Tu accèdes à l\'espace membre dès la confirmation du paiement.' },
  service:    { label: 'Prestation',      icon: '🤝',  what: 'On te contacte par email dans les 24h pour planifier la prestation.' },
};

function bytesHuman(b?: number): string {
  if (!b || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function assetIcon(kind: DigitalAsset['kind']): string {
  switch (kind) {
    case 'video': return '🎬';
    case 'audio': return '🎧';
    case 'image': return '🖼️';
    case 'link':  return '🔗';
    default:      return '📄';
  }
}

export default async function PublicProductPage({ params }: Props) {
  const { storeSlug, productSlug } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  let product: ProductDoc | null = null;
  let store: StoreDoc | null = null;

  try {
    const [pRes, sRes] = await Promise.all([
      fetch(`${apiUrl}/api/public/stores/${storeSlug}/products/${productSlug}`, { cache: 'no-store' }),
      fetch(`${apiUrl}/api/public/store-by-slug/${storeSlug}`, { cache: 'no-store' }),
    ]);
    if (pRes.ok) product = (await pRes.json()).product;
    if (sRes.ok) store = (await sRes.json()).store;
  } catch {
    // fallback
  }

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Produit introuvable</h1>
          <Link href={`/${storeSlug}`} className="mt-4 inline-block text-primary hover:underline">
            Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  const theme = resolveTheme(store);
  const direction = store?.settings?.direction || 'ltr';
  const language = store?.settings?.language;
  const currency = store?.settings?.currency || 'USD';
  const fontsUrl = googleFontsHref(theme);
  const radius = RADIUS_PX[theme.borderRadius];

  const isDigital = product.type === 'digital';
  const hasDiscount = !!product.compareAtPrice && product.compareAtPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
    : 0;
  const kindMeta = product.digitalKind ? KIND_META[product.digitalKind] : null;
  const assets = (product.digitalAssets || []).filter((a) => a && a.name);

  // Per-product page customization — every toggle defaults to "shown".
  const ps = product.pageSettings || {};
  const showGallery = ps.showGallery !== false;
  const showDescription = ps.showDescription !== false;
  const showTrustBadges = ps.showTrustBadges !== false;
  // Per-product overrides merged over the store-level COD form config.
  const codConfig: CodFormConfig = {
    ...(store?.settings?.codForm || {}),
    ...(ps.codFormTitle ? { headline: ps.codFormTitle } : {}),
    ...(ps.reassuranceText ? { reassurance: ps.reassuranceText } : {}),
  };

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <MarketingPixels config={store?.integrations?.marketing} />
      <StoreTracker storeId={store?._id} productId={product._id} type="product_view" />
      <TrackEvent
        payload={{
          event: 'ViewContent',
          contentIds: [product._id],
          contentName: product.name,
          contentType: 'product',
          value: product.price,
          currency,
          items: [{ id: product._id, name: product.name, price: product.price, quantity: 1 }],
        }}
      />
      <div
        dir={direction}
        lang={language}
        className="min-h-screen"
        style={tokensToCssVars(theme)}
      >
        <StoreNavbar
          storeName={store?.name || storeSlug}
          storeSlug={storeSlug}
          storeLogo={store?.logo}
          theme={theme}
          config={store?.settings?.storefront?.navbar}
        />

        {/* Main split */}
        <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-14">
          <div className="grid gap-6 sm:gap-10 lg:grid-cols-[1fr_1fr]">
            {/* LEFT — gallery */}
            <div className="space-y-3">
              <div
                className="relative aspect-square overflow-hidden border"
                style={{ backgroundColor: theme.surfaceMuted, borderColor: theme.border, borderRadius: radius }}
              >
                {product.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center" style={{ color: theme.muted }}>
                    Pas d&apos;image
                  </div>
                )}
                {hasDiscount && (
                  <span
                    className="absolute left-4 top-4 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: '#10b981',
                      color: '#fff',
                      borderRadius: theme.borderRadius === 'none' ? '0' : '999px',
                    }}
                  >
                    −{discountPct}%
                  </span>
                )}
                {isDigital && kindMeta && (
                  <span
                    className="absolute right-4 top-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold backdrop-blur"
                    style={{
                      backgroundColor: hexA(theme.surface, 0.9),
                      color: theme.foreground,
                      border: `1px solid ${theme.border}`,
                      borderRadius: theme.borderRadius === 'none' ? '0' : '999px',
                    }}
                  >
                    <span>{kindMeta.icon}</span>
                    {kindMeta.label}
                  </span>
                )}
              </div>
              {showGallery && (product.images || []).slice(1, 5).length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {(product.images || []).slice(1, 5).map((img, i) => (
                    <div
                      key={i}
                      className="aspect-square overflow-hidden border"
                      style={{ borderColor: theme.border, borderRadius: radius }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — sticky details */}
            <div className="lg:sticky lg:top-24 lg:self-start space-y-5 sm:space-y-6">
              <div>
                <h1
                  className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl"
                  style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
                >
                  {product.name}
                </h1>
                {product.description && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed sm:mt-4 sm:text-base" style={{ color: theme.muted }}>
                    {product.description.split(/\n\s*\n/)[0]}
                  </p>
                )}
              </div>

              {/* Pricing block */}
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <span className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: theme.primary }}>
                  {formatCurrency(product.price, currency)}
                </span>
                {hasDiscount && (
                  <>
                    <span className="text-xl line-through" style={{ color: theme.muted }}>
                      {formatCurrency(product.compareAtPrice!, currency)}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{ backgroundColor: '#10b98115', color: '#047857' }}
                    >
                      Économise {formatCurrency(product.compareAtPrice! - product.price, currency)}
                    </span>
                  </>
                )}
              </div>

              {/* Buy action — digital products redirect to online checkout;
                  physical products get the inline COD form right after the
                  price so customers can order without scrolling. */}
              {isDigital ? (
                <Link
                  href={`/${storeSlug}/checkout/${product.slug}`}
                  className="inline-flex h-14 w-full items-center justify-center gap-2 px-7 text-base font-semibold transition-all hover:scale-[1.01]"
                  style={{
                    background: theme.style === 'tech'
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
                  ⚡ Acheter — accès immédiat
                </Link>
              ) : (
                <div className="scroll-mt-24" id="cod-form">
                  <CodOrderForm
                    storeSlug={storeSlug}
                    storeId={store?._id}
                    productId={product._id}
                    productSlug={product.slug}
                    productName={product.name}
                    productPrice={product.price}
                    productStock={product.stock ?? 0}
                    trackInventory={!!product.trackInventory}
                    allowBackorder={!!product.allowBackorder}
                    currency={currency}
                    defaultCountry={store?.settings?.country}
                    config={codConfig}
                    bundle={product.bundle}
                    theme={theme}
                    radius={radius}
                  />
                </div>
              )}

              {/* Stock indicator (physical only) */}
              {!isDigital && product.trackInventory && !product.allowBackorder && (
                <p className="text-xs" style={{ color: (product.stock || 0) > 0 ? '#047857' : '#dc2626' }}>
                  {(product.stock || 0) > 0
                    ? `✓ ${product.stock} en stock — livraison sous 1 à 3 jours`
                    : 'Rupture de stock'}
                </p>
              )}

              {/* Digital "What you get" panel */}
              {isDigital && kindMeta && (
                <div
                  className="space-y-4 border p-5"
                  style={{
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.border,
                    borderRadius: radius,
                  }}
                >
                  <div>
                    <h3
                      className="text-base font-bold tracking-tight"
                      style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
                    >
                      Ce que tu obtiens
                    </h3>
                    <p className="mt-1 text-sm" style={{ color: theme.muted }}>
                      {kindMeta.what}
                    </p>
                  </div>

                  {assets.length > 0 && (
                    <ul className="space-y-2">
                      {assets.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 rounded-lg border bg-background/50 p-3 text-sm"
                          style={{ borderColor: theme.border }}
                        >
                          <span className="text-lg">{assetIcon(a.kind)}</span>
                          <span className="min-w-0 flex-1 truncate font-medium" style={{ color: theme.foreground }}>
                            {a.name}
                          </span>
                          <span className="shrink-0 text-xs" style={{ color: theme.muted }}>
                            {bytesHuman(a.size)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* License / access info */}
                  <div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2" style={{ borderColor: theme.border }}>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.muted }}>
                        Accès
                      </div>
                      <div className="mt-0.5 font-medium" style={{ color: theme.foreground }}>
                        {product.accessType === 'limited'
                          ? `${product.accessDays || 30} jours`
                          : 'À vie'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.muted }}>
                        Licence
                      </div>
                      <div className="mt-0.5 font-medium" style={{ color: theme.foreground }}>
                        {product.digitalKind === 'license' ? 'Clé unique par achat' : 'Usage personnel'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Trust badges */}
              {isDigital && showTrustBadges && (
                <div className="flex flex-wrap gap-2">
                  {[
                    { icon: '⚡', label: 'Livraison instantanée' },
                    { icon: '🔒', label: 'Paiement sécurisé' },
                    { icon: '✅', label: 'Garantie 14 jours' },
                  ].map((b, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium"
                      style={{
                        borderColor: theme.border,
                        color: theme.foreground,
                        backgroundColor: theme.surfaceMuted,
                        borderRadius: theme.borderRadius === 'none' ? '0' : '999px',
                      }}
                    >
                      {b.icon} {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description — full section below the gallery + details grid */}
          {showDescription && product.description && (
            <section className="mt-16 max-w-3xl">
              <div className="mb-5 flex items-center gap-3">
                <span
                  className="inline-block h-px flex-1"
                  style={{ backgroundColor: theme.border }}
                  aria-hidden
                />
                <h2
                  className="text-2xl font-bold tracking-tight sm:text-3xl"
                  style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
                >
                  Description
                </h2>
                <span
                  className="inline-block h-px flex-1"
                  style={{ backgroundColor: theme.border }}
                  aria-hidden
                />
              </div>
              <div className="space-y-4 text-base leading-relaxed sm:text-lg" style={{ color: theme.foreground }}>
                {product.description.split(/\n\s*\n/).map((para, i) => {
                  const trimmed = para.trim();
                  if (!trimmed) return null;
                  // Render bullet list when every non-empty line starts with "- " or "• "
                  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
                  const allBullets = lines.length > 1 && lines.every((l) => /^[-•]\s+/.test(l));
                  if (allBullets) {
                    return (
                      <ul key={i} className="space-y-2 pl-1">
                        {lines.map((l, j) => (
                          <li key={j} className="flex gap-2">
                            <span
                              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: theme.primary }}
                              aria-hidden
                            />
                            <span>{l.replace(/^[-•]\s+/, '')}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p key={i} style={{ color: theme.foreground }}>
                      {trimmed}
                    </p>
                  );
                })}
              </div>
            </section>
          )}

        </main>
      </div>
    </>
  );
}

function hexA(hex: string, a: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
