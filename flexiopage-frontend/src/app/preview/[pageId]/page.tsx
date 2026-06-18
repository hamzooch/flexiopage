'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { storesApi } from '@/lib/api';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import { AuthGuard } from '@/components/dashboard/auth-guard';
import type { PageSection } from '@/components/landing/SectionEditor';

interface PageDoc {
  _id: string;
  name: string;
  slug: string;
  sections?: PageSection[];
  isPublished?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  language?: string;
  country?: string;
  currency?: string;
  direction?: 'ltr' | 'rtl';
}

interface ProductLite {
  _id: string;
  name: string;
  price?: number;
  slug?: string;
  images?: string[];
}

interface StoreLite {
  _id: string;
  slug: string;
  settings?: { currency?: string; country?: string; language?: string };
  theme?: { templateId?: string };
}

export default function PreviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pageId = params.pageId as string;
  const storeId = searchParams.get('storeId');

  const [page, setPage] = useState<PageDoc | null>(null);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [store, setStore] = useState<StoreLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId || !pageId) {
      // Cas où l'URL n'a pas le storeId : on évite le spinner infini.
      setLoading(false);
      if (!storeId) setError('Paramètre storeId manquant dans l\'URL.');
      return;
    }
    setLoading(true);
    Promise.all([
      storesApi.getPage(storeId, pageId),
      storesApi.listProducts(storeId, { published: 'true' }).catch(() => ({ data: { products: [] } })),
      storesApi.get(storeId).catch(() => ({ data: { store: null } })),
    ])
      .then(([pageRes, prodRes, storeRes]) => {
        const p = (pageRes.data as { page: PageDoc }).page;
        setPage(p);
        const list = (prodRes.data as { products?: ProductLite[] }).products || [];
        setProducts(list);
        const s = (storeRes.data as { store?: StoreLite | null }).store || null;
        setStore(s);
      })
      .catch((err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || 'Page introuvable.');
      })
      .finally(() => setLoading(false));
  }, [storeId, pageId]);

  return (
    <AuthGuard>
      {loading ? (
        <div className="grid min-h-screen place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error || !page ? (
        <div className="grid min-h-screen place-items-center">
          <div className="space-y-3 text-center">
            <p className="text-destructive">{error || 'Page not found'}</p>
            <Link href={`/dashboard/pages?storeId=${storeId}`} className="text-primary hover:underline">
              Back to pages
            </Link>
          </div>
        </div>
      ) : (
        <LandingRenderer
          sections={page.sections || []}
          products={products}
          direction={page.direction}
          language={page.language || store?.settings?.language}
          currency={page.currency || store?.settings?.currency}
          country={store?.settings?.country}
          themeId={store?.theme?.templateId}
          banner={
            <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-5 py-2.5 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={
                    page.isPublished
                      ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700'
                      : 'rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700'
                  }
                >
                  {page.isPublished ? 'Live' : 'Draft preview'}
                </span>
                <span className="font-medium text-foreground">{page.name}</span>
                <span className="hidden text-muted-foreground sm:inline">/{page.slug}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Link
                  href={`/dashboard/pages/${pageId}?storeId=${storeId}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to editor
                </Link>
                <span className="hidden items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1 text-muted-foreground sm:inline-flex">
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </span>
              </div>
            </div>
          }
        />
      )}
    </AuthGuard>
  );
}
