/**
 * Public collection page — `/<storeSlug>/c/<collectionSlug>`. Renders the
 * collection banner + a product grid using the store's active theme.
 *
 * Server component: fetches store + collection + resolved products in
 * parallel from the public API. No client JS shipped beyond what the
 * shared storefront components already require.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  STORE_THEME_TEMPLATES,
  RADIUS_PX,
  tokensToCssVars,
  googleFontsHref,
  withLayoutFallback,
  type ThemeTokens,
} from '@/data/store-themes';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import { StoreFooter, type FooterConfig } from '@/components/storefront/StoreFooter';
import { AnnouncementBar, type AnnouncementBarConfig } from '@/components/storefront/AnnouncementBar';
import { MarketingPixels, type MarketingConfig } from '@/components/storefront/MarketingPixels';
import { StoreTracker } from '@/components/storefront/StoreTracker';

interface Props {
  params: Promise<{ storeSlug: string; collectionSlug: string }>;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  favicon?: string;
  storeType?: 'physical' | 'digital';
  theme?: { templateId?: string } & Record<string, unknown>;
  settings?: {
    currency?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    storefront?: {
      announcementBar?: AnnouncementBarConfig;
      navbar?: NavbarConfig;
      showFooter?: boolean;
      footerNote?: string;
      footer?: FooterConfig;
    };
  };
  integrations?: { marketing?: MarketingConfig };
}

interface CollectionDoc {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  seoTitle?: string;
  seoDescription?: string;
}

interface ProductDoc {
  _id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  images?: string[];
  type?: 'physical' | 'digital';
}

interface FetchResult {
  store?: StoreDoc;
  collection?: CollectionDoc;
  products?: ProductDoc[];
}

const FALLBACK_THEME = STORE_THEME_TEMPLATES[0].theme;

async function fetchData(storeSlug: string, collectionSlug: string): Promise<FetchResult> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  try {
    const res = await fetch(
      `${apiBase}/api/public/stores/${storeSlug}/collections/${collectionSlug}`,
      { next: { revalidate: 60, tags: [`store:${storeSlug}`, `collection:${storeSlug}:${collectionSlug}`] } }
    );
    if (!res.ok) return {};
    return (await res.json()) as FetchResult;
  } catch {
    return {};
  }
}

function resolveTheme(store: StoreDoc): ThemeTokens {
  const saved = store.theme as Partial<ThemeTokens> | undefined;
  if (saved && saved.primary && saved.background && saved.foreground) {
    return withLayoutFallback(saved as ThemeTokens);
  }
  const found = STORE_THEME_TEMPLATES.find((t) => t.id === saved?.templateId);
  return found?.theme || FALLBACK_THEME;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug, collectionSlug } = await params;
  const data = await fetchData(storeSlug, collectionSlug);
  if (!data.store || !data.collection) return {};
  const title = data.collection.seoTitle
    || `${data.collection.name} · ${data.store.name}`;
  const description = data.collection.seoDescription
    || data.collection.description
    || `Découvre la collection ${data.collection.name} de ${data.store.name}.`;
  return {
    // `absolute` court-circuite le template `%s · FlexioPage` du root layout
    // pour ne pas leak la marque sur les pages collection des vendeurs.
    title: { absolute: title },
    description,
    openGraph: data.collection.image
      ? { images: [{ url: mediaUrl(data.collection.image) || data.collection.image }] }
      : undefined,
  };
}

export default async function CollectionPage({ params }: Props) {
  const { storeSlug, collectionSlug } = await params;
  const data = await fetchData(storeSlug, collectionSlug);

  if (!data.store || !data.collection) {
    notFound();
  }

  const store = data.store;
  const collection = data.collection;
  const products = data.products || [];
  const theme = resolveTheme(store);
  const direction = store.settings?.direction || 'ltr';
  const language = store.settings?.language;
  const currency = store.settings?.currency || 'USD';
  const fontsUrl = googleFontsHref(theme);
  const radius = RADIUS_PX[theme.borderRadius];
  const sf = store.settings?.storefront || {};

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <MarketingPixels config={store.integrations?.marketing} />
      <StoreTracker storeId={store._id} type="page_view" />
      <div
        dir={direction}
        lang={language}
        className="min-h-screen flex flex-col"
        style={{ ...tokensToCssVars(theme), backgroundColor: theme.background, color: theme.foreground }}
      >
        <AnnouncementBar config={sf.announcementBar} theme={theme} />
        <StoreNavbar
          storeName={store.name}
          storeSlug={store.slug}
          storeLogo={store.logo}
          theme={theme}
          config={sf.navbar}
        />

        <main className="flex-1">
          {/* Banner — image overlay or solid gradient when no image */}
          <section
            className="relative overflow-hidden"
            style={
              collection.image
                ? {
                    background:
                      `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55)),`
                      + ` url(${mediaUrl(collection.image) || collection.image}) center/cover`,
                  }
                : {
                    background:
                      `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
                  }
            }
          >
            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
              <Link
                href={`/${storeSlug}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{ color: collection.image ? 'rgba(255,255,255,0.85)' : theme.primaryFg }}
              >
                ← {store.name}
              </Link>
              <h1
                className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl"
                style={{
                  color: collection.image ? '#ffffff' : theme.primaryFg,
                  fontFamily: theme.fontHeading,
                }}
              >
                {collection.name}
              </h1>
              {collection.description && (
                <p
                  className="mt-3 max-w-2xl text-sm sm:text-base"
                  style={{
                    color: collection.image ? 'rgba(255,255,255,0.92)' : theme.primaryFg,
                    fontFamily: theme.fontBody,
                  }}
                >
                  {collection.description}
                </p>
              )}
              <p
                className="mt-4 text-xs"
                style={{ color: collection.image ? 'rgba(255,255,255,0.85)' : theme.primaryFg }}
              >
                {products.length} produit{products.length > 1 ? 's' : ''}
              </p>
            </div>
          </section>

          {/* Grid */}
          <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            {products.length === 0 ? (
              <div
                className="mx-auto max-w-md rounded-2xl border border-dashed p-10 text-center"
                style={{ borderColor: theme.border }}
              >
                <p className="text-sm font-semibold" style={{ color: theme.foreground }}>
                  Aucun produit dans cette collection pour le moment.
                </p>
                <Link
                  href={`/${storeSlug}`}
                  className="mt-3 inline-block text-sm font-medium"
                  style={{ color: theme.primary }}
                >
                  ← Retour à la boutique
                </Link>
              </div>
            ) : (
              <ul
                className="grid gap-4 sm:gap-6"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
              >
                {products.map((p) => {
                  const hasDiscount = p.compareAtPrice && p.compareAtPrice > p.price;
                  const discountPct = hasDiscount
                    ? Math.round(((p.compareAtPrice! - p.price) / p.compareAtPrice!) * 100)
                    : 0;
                  return (
                    <li key={p._id}>
                      <Link
                        href={`/${storeSlug}/product/${p.slug}`}
                        className="group block overflow-hidden border transition-transform hover:-translate-y-0.5"
                        style={{
                          borderColor: theme.border,
                          backgroundColor: theme.surface,
                          borderRadius: radius,
                        }}
                      >
                        <div
                          className="relative aspect-[4/5] overflow-hidden"
                          style={{ backgroundColor: theme.surfaceMuted }}
                        >
                          {p.images?.[0] ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={mediaUrl(p.images[0]) || p.images[0]}
                              alt={p.name}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div
                              className="grid h-full place-items-center text-xs"
                              style={{ color: theme.muted }}
                            >
                              No image
                            </div>
                          )}
                          {hasDiscount && (
                            <span
                              className="absolute left-3 top-3 px-2 py-1 text-[10px] font-bold uppercase"
                              style={{
                                backgroundColor: theme.primary,
                                color: theme.primaryFg,
                                borderRadius: theme.borderRadius === 'none' ? 0 : '999px',
                              }}
                            >
                              −{discountPct}%
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 p-3">
                          <h3
                            className="line-clamp-2 text-sm font-semibold leading-snug"
                            style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
                          >
                            {p.name}
                          </h3>
                          <div className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                            <span
                              className="text-sm font-extrabold"
                              style={{ color: theme.primary }}
                            >
                              {formatCurrency(p.price, currency)}
                            </span>
                            {hasDiscount && (
                              <span
                                className="text-xs font-medium line-through"
                                style={{ color: theme.muted }}
                              >
                                {formatCurrency(p.compareAtPrice!, currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>

        {(sf.showFooter ?? true) && (
          <StoreFooter
            storeName={store.name}
            storeSlug={store.slug}
            storeLogo={store.logo}
            footerNote={sf.footerNote}
            config={sf.footer}
            theme={theme}
          />
        )}
      </div>
    </>
  );
}
