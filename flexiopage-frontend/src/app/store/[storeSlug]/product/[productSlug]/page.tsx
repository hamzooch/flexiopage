import Link from 'next/link';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import { renderMarkdown } from '@/lib/markdown';
import {
  resolveProductPageOrder,
  DEFAULT_BADGES,
  type ProductPageSettings,
  type ProductPageSectionId,
} from '@/lib/product-page-order';
import { ProductPageTimer } from '@/components/storefront/product-page-timer';
import { ProductPageBadges } from '@/components/storefront/product-page-badges';
import type { ProductBundle } from '@/lib/api';
import {
  STORE_THEME_TEMPLATES,
  RADIUS_PX,
  tokensToCssVars,
  googleFontsHref,
  type ThemeTokens,
} from '@/data/store-themes';
import { CodOrderForm, type CodFormConfig, type CodVariant } from '@/components/storefront/cod-order-form';
import { MarketingPixels, type MarketingConfig } from '@/components/storefront/MarketingPixels';
import { TrackEvent } from '@/components/storefront/TrackEvent';
import { StoreTracker } from '@/components/storefront/StoreTracker';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import { StorefrontTestimonials } from '@/components/storefront/Testimonials';
import { MobileStickyCta } from '@/components/storefront/mobile-sticky-cta';
import { CrossSells, type CrossSellItem } from '@/components/storefront/cross-sells';
import { WishlistButton } from '@/components/storefront/wishlist-button';
import { AddToCartButton } from '@/components/storefront/add-to-cart-button';
import { ProductReviews } from '@/components/storefront/product-reviews';
import type { ThemeTokens as ThemeTokensType } from '@/data/store-themes';

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
  variants?: CodVariant[];
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
    storefront?: { navbar?: NavbarConfig; productPage?: ProductPageSettings };
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
  let crossSells: CrossSellItem[] = [];

  try {
    const [pRes, sRes] = await Promise.all([
      fetch(`${apiUrl}/api/public/stores/${storeSlug}/products/${productSlug}`, { cache: 'no-store' }),
      fetch(`${apiUrl}/api/public/store-by-slug/${storeSlug}`, { cache: 'no-store' }),
    ]);
    if (pRes.ok) {
      const body = await pRes.json();
      product = body.product;
      crossSells = Array.isArray(body.crossSells) ? body.crossSells : [];
    }
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
  // Store-wide product page palette (productPage.style). Every palette
  // field is gated behind useCustomPalette — when off, the storefront
  // ignores all custom colors and renders with the active theme tokens.
  // Lets the seller flip personalization on/off without losing their
  // saved colors. Layout choices (gallery, rating strip) stay through.
  const ppStyleRaw = store?.settings?.storefront?.productPage?.style || {};
  const useCustom = !!ppStyleRaw.useCustomPalette;
  const ppStyle = useCustom
    ? ppStyleRaw
    : ({ galleryLayout: ppStyleRaw.galleryLayout, showRatingStrip: ppStyleRaw.showRatingStrip } as typeof ppStyleRaw);
  // Per-product overrides merged over the store-level COD form config +
  // palette overrides from productPage.style. Order matters: store codForm
  // = baseline, palette wins over codForm, per-product wins over palette.
  const codConfig: CodFormConfig = {
    ...(store?.settings?.codForm || {}),
    // Palette overrides — the seller's chosen palette in Sections > Page produit
    // owns the COD form visual. These fields only override when explicitly set
    // so old stores without a palette keep their codForm settings.
    ...(ppStyle.buttonColor ? { buttonColor: ppStyle.buttonColor } : {}),
    ...(ppStyle.buttonTextColor ? { buttonTextColor: ppStyle.buttonTextColor } : {}),
    ...(ppStyle.buttonShape ? { buttonShape: ppStyle.buttonShape } : {}),
    ...(typeof ppStyle.buttonAnimated === 'boolean' ? { buttonAnimated: ppStyle.buttonAnimated } : {}),
    ...(ppStyle.buttonAnimation ? { buttonAnimation: ppStyle.buttonAnimation } : {}),
    // Per-product overrides (highest priority) for copy.
    ...(ps.codFormTitle ? { headline: ps.codFormTitle } : {}),
    ...(ps.reassuranceText ? { reassurance: ps.reassuranceText } : {}),
  };
  const pageBg = ppStyle.backgroundColor;

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <MarketingPixels config={store?.integrations?.marketing} />
      <StoreTracker storeId={store?._id} type="page_view" />
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
        style={{
          ...tokensToCssVars(theme),
          // Apply the palette's page background when set — wins over the theme bg
          // so a dark palette flips the whole product page convincingly.
          ...(pageBg ? { backgroundColor: pageBg } : {}),
        }}
      >
        <StoreNavbar
          storeName={store?.name || storeSlug}
          storeSlug={storeSlug}
          storeLogo={store?.logo}
          theme={theme}
          config={store?.settings?.storefront?.navbar}
          bgOverride={ppStyle.navbarColor}
          fgOverride={ppStyle.navbarTextColor}
        />

        {/* Main split — tight padding on mobile so the gallery + form fit in
            one screen scroll, generous on desktop where the layout has room. */}
        <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-14">
          <div className="grid gap-4 sm:gap-10 lg:grid-cols-[1fr_1fr]">
            {/* LEFT — gallery */}
            <div className="space-y-3">
              <div
                className="relative aspect-square overflow-hidden border"
                style={{ backgroundColor: theme.surfaceMuted, borderColor: theme.border, borderRadius: radius }}
              >
                {product.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(product.images[0]) || product.images[0]}
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
                {/* Heart toggle — saves to localStorage, accessible from /wishlist */}
                <div className="absolute right-4 bottom-4 z-10">
                  <WishlistButton
                    storeSlug={storeSlug}
                    size="md"
                    item={{
                      id: product._id,
                      slug: product.slug,
                      name: product.name,
                      image: product.images?.[0],
                      price: product.price,
                      currency,
                    }}
                  />
                </div>
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
                      <img src={mediaUrl(img) || img} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — sticky details */}
            <div className="lg:sticky lg:top-24 lg:self-start space-y-4 sm:space-y-6">
              <div>
                <h1
                  className="text-xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl"
                  style={{
                    fontFamily: theme.fontHeading,
                    color: store?.settings?.storefront?.productPage?.style?.titleColor || theme.foreground,
                  }}
                >
                  {product.name}
                </h1>
                {store?.settings?.storefront?.productPage?.style?.showRatingStrip && (
                  <div className="mt-1.5 flex items-center gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        aria-hidden
                        className="text-sm"
                        style={{ color: store?.settings?.storefront?.productPage?.style?.accentColor || theme.primary }}
                      >
                        ★
                      </span>
                    ))}
                    <span className="ml-1 text-xs" style={{ color: theme.muted }}>
                      (127 avis)
                    </span>
                  </div>
                )}
              </div>

              {/* Pricing block — compact prices on mobile so the CTA stays above the fold. */}
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <span
                  className="text-2xl font-extrabold tracking-tight sm:text-4xl"
                  style={{ color: store?.settings?.storefront?.productPage?.style?.priceColor || theme.primary }}
                >
                  {formatCurrency(product.price, currency)}
                </span>
                {hasDiscount && (
                  <>
                    <span className="text-base line-through sm:text-xl" style={{ color: theme.muted }}>
                      {formatCurrency(product.compareAtPrice!, currency)}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold sm:px-2.5 sm:py-1 sm:text-xs"
                      style={{ backgroundColor: '#10b98115', color: '#047857' }}
                    >
                      −{formatCurrency(product.compareAtPrice! - product.price, currency)}
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
                <>
                  {/* Add-to-cart — secondary path for buyers who want to grab
                      several items before checking out. The primary "Commander"
                      flow stays in the COD form below. */}
                  <AddToCartButton
                    storeSlug={storeSlug}
                    product={{
                      id: product._id,
                      slug: product.slug,
                      name: product.name,
                      image: product.images?.[0],
                      price: product.price,
                      currency,
                    }}
                    theme={theme}
                    radius={radius}
                  />
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
                      variants={product.variants}
                      theme={theme}
                      radius={radius}
                    />
                  </div>
                </>
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

          {/* ── Reorderable body sections (badges / timer / description / testimonials)
                Driven by store.settings.storefront.productPage configured by the
                seller in /dashboard/stores/[id]/sections (Page produit tab). ── */}
          {(() => {
            const pp = store?.settings?.storefront?.productPage || {};
            const order = resolveProductPageOrder(pp.sectionOrder);
            const showBadgesSection = pp.showBadges !== false;
            const badges = (pp.badges && pp.badges.length > 0) ? pp.badges : DEFAULT_BADGES;
            const showTimerSection = !!pp.showTimer && !!pp.timer?.endsAt;
            const showProductDesc = (pp.showDescription !== false) && showDescription && !!product.description;
            const showTestimonialsSection = !!pp.showTestimonials;

            const blocks: Record<ProductPageSectionId, React.ReactNode> = {
              badges: showBadgesSection ? (
                <section key="badges" className="mt-6 sm:mt-10">
                  <ProductPageBadges badges={badges} theme={theme} />
                </section>
              ) : null,
              timer: showTimerSection ? (
                <section key="timer" className="mt-6 sm:mt-10">
                  <ProductPageTimer
                    endsAt={pp.timer!.endsAt!}
                    headline={pp.timer?.headline}
                    accentColor={pp.timer?.accentColor || pp.style?.accentColor || theme.primary}
                  />
                </section>
              ) : null,
              description: showProductDesc ? (
                <ProductDescriptionSection
                  key="description"
                  description={product.description!}
                  theme={theme}
                  bodyColor={ppStyle.descriptionColor}
                />
              ) : null,
              testimonials: showTestimonialsSection ? (
                <section key="testimonials" className="mt-8 sm:mt-12">
                  <StorefrontTestimonials
                    config={(store?.settings as { storefront?: { testimonials?: unknown } } | undefined)?.storefront?.testimonials as never}
                    theme={theme}
                  />
                </section>
              ) : null,
            };
            return <>{order.map((id) => blocks[id])}</>;
          })()}

          {/* Cross-sells — "Tu aimeras aussi". Hidden on digital products
              since the buyer already left the funnel after the instant
              purchase CTA — extra grid would feel like noise. */}
          {!isDigital && crossSells.length > 0 && (
            <CrossSells
              items={crossSells}
              storeSlug={storeSlug}
              currency={currency}
              theme={theme}
            />
          )}

          {/* Product reviews — fetched client-side so seller moderation
              changes show up without a full SSR rebuild. */}
          <ProductReviews storeSlug={storeSlug} productSlug={product.slug} theme={theme} />

        </main>

        {/* Mobile sticky CTA — surfaces once the COD form scrolls off-screen.
            Skipped on digital products (no inline form, the Buy button is
            already always near the top of the viewport). */}
        {!isDigital && (
          <MobileStickyCta
            productName={product.name}
            productImage={product.images?.[0]}
            price={product.price}
            currency={currency}
            targetId="cod-order-form"
            accentColor={store?.settings?.codForm?.buttonColor || theme.primary}
            accentForeground={store?.settings?.codForm?.buttonTextColor || theme.primaryFg}
            ctaLabel={store?.settings?.codForm?.submitLabel || 'Commander'}
          />
        )}
      </div>
    </>
  );
}

function hexA(hex: string | undefined | null, a: number): string {
  if (!hex || typeof hex !== 'string') return 'transparent';
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Full description section — extracted from the inline render so it can be
 * slotted into the productPage sectionOrder loop. Keeps the original
 * bullet-vs-paragraph parsing behavior.
 */
function ProductDescriptionSection({
  description,
  theme,
  bodyColor,
}: {
  description: string;
  theme: ThemeTokensType;
  /** Palette override for the description body. Falls back to theme.foreground. */
  bodyColor?: string;
}) {
  const color = bodyColor || theme.foreground;
  return (
    <section className="mt-8 max-w-3xl sm:mt-14">
      <div className="mb-5 flex items-center gap-3">
        <span className="inline-block h-px flex-1" style={{ backgroundColor: theme.border }} aria-hidden />
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.fontHeading, color: theme.foreground }}>
          Description
        </h2>
        <span className="inline-block h-px flex-1" style={{ backgroundColor: theme.border }} aria-hidden />
      </div>
      {/* Render the description via the shared markdown helper — gives the
          seller paragraphs, bullets, bold/italic, links AND inline images
          (incl. GIFs via ![alt](url)). The prose-storefront class styles
          headings/p/ul/li/img; we set the body color via inline style so
          the palette descriptionColor still applies. */}
      <div
        className="prose-storefront text-base leading-relaxed sm:text-lg"
        style={{ color }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }}
      />
    </section>
  );
}
