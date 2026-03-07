import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import type { PageSection } from '@/components/landing/SectionEditor';

interface Props {
  params: Promise<{ storeSlug: string; pageSlug: string }>;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  theme?: { templateId?: string };
  settings?: { country?: string; currency?: string; language?: string; direction?: 'ltr' | 'rtl' };
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
      banner={
        <header className="border-b border-border/60 bg-card/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            <Link href={`/store/${storeSlug}`} className="text-sm font-semibold tracking-tight">
              {data.store.name}
            </Link>
            <Link
              href={`/store/${storeSlug}`}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All products →
            </Link>
          </div>
        </header>
      }
    />
  );
}
