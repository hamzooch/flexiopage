import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import type { PageSection } from '@/components/landing/SectionEditor';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import { STORE_THEME_TEMPLATES } from '@/data/store-themes';

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
    storefront?: { navbar?: NavbarConfig };
  };
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
  if (!data) return { title: 'Page not found' };
  return {
    title: data.page.seoTitle || `${data.page.name} | ${data.store.name}`,
    description: data.page.seoDescription,
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
          <Link href={`/store/${storeSlug}`} className="text-primary hover:underline">
            Back to store
          </Link>
        </div>
      </div>
    );
  }

  const products = await fetchProducts(storeSlug);
  const themeTokens =
    STORE_THEME_TEMPLATES.find((t) => t.id === data.store.theme?.templateId)?.theme ||
    STORE_THEME_TEMPLATES[0].theme;

  return (
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
  );
}
