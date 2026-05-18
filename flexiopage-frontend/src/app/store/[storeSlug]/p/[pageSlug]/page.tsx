import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import type { PageSection } from '@/components/landing/SectionEditor';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import { StoreFooter, type FooterConfig } from '@/components/storefront/StoreFooter';
import { MarketingPixels, type MarketingConfig } from '@/components/storefront/MarketingPixels';
import { STORE_THEME_TEMPLATES } from '@/data/store-themes';
import { renderMarkdown } from '@/lib/markdown';
import { StoreTracker } from '@/components/storefront/StoreTracker';

interface Props {
  params: Promise<{ storeSlug: string; pageSlug: string }>;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
  theme?: { templateId?: string };
  settings?: {
    country?: string;
    currency?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    storefront?: {
      navbar?: NavbarConfig;
      showFooter?: boolean;
      footerNote?: string;
      footer?: FooterConfig;
    };
  };
  integrations?: { marketing?: MarketingConfig };
  layout?: {
    footer?: {
      social?: { whatsapp?: string };
      contact?: { phone?: string };
    };
  };
}
interface PageDoc {
  _id: string;
  name: string;
  slug: string;
  kind?: 'landing' | 'info';
  body?: string;
  sections?: PageSection[];
  seoTitle?: string;
  seoDescription?: string;
  isPublished?: boolean;
  language?: string;
  direction?: 'ltr' | 'rtl';
  currency?: string;
}
interface ProductLite {
  _id: string;
  name: string;
  price?: number;
  slug?: string;
  images?: string[];
  stock?: number;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  sku?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

async function fetchPage(storeSlug: string, pageSlug: string): Promise<{ store: StoreDoc; page: PageDoc } | null> {
  const r = await fetch(`${API}/api/public/stores/${storeSlug}/pages/${pageSlug}`, { cache: 'no-store' });
  if (!r.ok) return null;
  return (await r.json()) as { store: StoreDoc; page: PageDoc };
}

async function fetchProducts(storeSlug: string): Promise<ProductLite[]> {
  try {
    const r = await fetch(`${API}/api/public/stores/${storeSlug}/products`, { cache: 'no-store' });
    if (!r.ok) return [];
    const d = (await r.json()) as { products?: ProductLite[] };
    return d.products || [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug, pageSlug } = await params;
  const data = await fetchPage(storeSlug, pageSlug);
  if (!data) {
    return {
      title: 'Page introuvable',
      robots: { index: false, follow: false },
    };
  }
  const title = data.page.seoTitle || `${data.page.name} · ${data.store.name}`;
  const description =
    data.page.seoDescription ||
    `Découvre les produits de ${data.store.name}. Commande facilement, paiement à la livraison.`;
  const canonical = `/${storeSlug}/p/${pageSlug}`;
  const ogImage = data.store.logo || '/opengraph-image';

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      siteName: data.store.name,
      locale: (data.page.language || data.store.settings?.language || 'fr') + '_FR',
      images: [{ url: ogImage, alt: data.store.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicLandingPage({ params }: Props) {
  const { storeSlug, pageSlug } = await params;
  const data = await fetchPage(storeSlug, pageSlug);

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-bold">Page not found</h1>
          <Link href={`/${storeSlug}`} className="text-primary hover:underline">
            Back to store
          </Link>
        </div>
      </div>
    );
  }

  const themeTokens =
    STORE_THEME_TEMPLATES.find((t) => t.id === data.store.theme?.templateId)?.theme ||
    STORE_THEME_TEMPLATES[0].theme;

  // Info page (Conditions, FAQ, About…) — render markdown body with the
  // same chrome (navbar + footer) as the rest of the storefront so it
  // feels native, not like a generic legal text dump.
  if (data.page.kind === 'info') {
    const bodyHtml = renderMarkdown(data.page.body || '');
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: themeTokens.background, color: themeTokens.foreground }}
      >
        <MarketingPixels config={data.store.integrations?.marketing} />
        <StoreTracker storeId={data.store._id} type="page_view" />
        <StoreNavbar
          storeName={data.store.name}
          storeSlug={storeSlug}
          storeLogo={data.store.logo}
          theme={themeTokens}
          config={data.store.settings?.storefront?.navbar}
        />
        <main className="flex-1">
          <article
            className="prose-storefront mx-auto max-w-3xl px-4 py-10 sm:py-14"
            style={{ fontFamily: themeTokens.fontBody }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </main>
        {(data.store.settings?.storefront?.showFooter ?? true) && (
          <StoreFooter
            storeName={data.store.name}
            storeSlug={storeSlug}
            storeLogo={data.store.logo}
            footerNote={data.store.settings?.storefront?.footerNote}
            config={data.store.settings?.storefront?.footer}
            theme={themeTokens}
          />
        )}
      </div>
    );
  }

  const products = await fetchProducts(storeSlug);

  return (
    <>
      <MarketingPixels config={data.store.integrations?.marketing} />
      <StoreTracker storeId={data.store._id} type="page_view" />
      <LandingRenderer
      sections={data.page.sections || []}
      products={products}
      storeSlug={storeSlug}
      country={data.store.settings?.country}
      themeId={data.store.theme?.templateId}
      currency={data.page.currency || data.store.settings?.currency}
      language={data.page.language || data.store.settings?.language}
      direction={data.page.direction || data.store.settings?.direction || 'ltr'}
      storeChat={{
        name: data.store.name,
        whatsapp: data.store.layout?.footer?.social?.whatsapp,
        phone: data.store.layout?.footer?.contact?.phone,
      }}
      banner={
        <StoreNavbar
          storeName={data.store.name}
          storeSlug={storeSlug}
          storeLogo={data.store.logo}
          theme={themeTokens}
          config={data.store.settings?.storefront?.navbar}
        />
      }
    />
    </>
  );
}
