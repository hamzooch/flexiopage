'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { cn, formatCurrency, mediaUrl } from '@/lib/utils';
import { Package, Plus, ImageIcon, Cloud } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
  storeType?: 'physical' | 'digital';
  settings?: { currency?: string };
}

interface ProductType {
  _id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  type: string;
  stock?: number;
  isPublished?: boolean;
  images?: string[];
}

export default function DashboardProductsPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const { storeId: selectedStoreId, setStoreId: setSelectedStoreId } = useScopedStoreId(storeIdParam);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storesApi.list().then((res) => {
      const list = (res.data as { stores: StoreType[] }).stores;
      setStores(list);
      if (!selectedStoreId && list.length) setSelectedStoreId(list[0]._id);
    }).catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedStoreId) {
      setProducts([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const skip = (page - 1) * pageSize;
    storesApi
      .listProducts(selectedStoreId, { limit: pageSize, skip })
      .then((res) => {
        const data = res.data as { products: ProductType[]; total: number };
        setProducts(data.products);
        setTotal(data.total ?? 0);
      })
      .catch(() => {
        setProducts([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [selectedStoreId, page, pageSize]);

  const activeStore = stores.find((s) => s._id === selectedStoreId);
  const isDigitalStore = activeStore?.storeType === 'digital';
  const newProductHref = selectedStoreId
    ? (isDigitalStore
        ? `/dashboard/products/new/digital?storeId=${selectedStoreId}`
        : `/dashboard/products/new?storeId=${selectedStoreId}`)
    : '#';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground">
            {isDigitalStore ? 'Tes produits digitaux : téléchargements, cours, licences, abonnements.' : 'Manage your store products.'}
          </p>
        </div>
        {selectedStoreId && (
          <Link href={newProductHref}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {isDigitalStore ? 'Nouveau produit digital' : 'Add product'}
            </Button>
          </Link>
        )}
      </div>

      {stores.length > 0 && (
        <div className="flex gap-2">
          {stores.map((s) => (
            <Button
              key={s._id}
              variant={selectedStoreId === s._id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedStoreId(s._id)}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {!selectedStoreId ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Create a store first to add products.
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-muted-foreground">Loading products...</p>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 font-medium">No products</p>
            <Link href={newProductHref}>
              <Button className="mt-2">{isDigitalStore ? 'Nouveau produit digital' : 'Add product'}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p, i) => {
            const cover = mediaUrl(p.images?.[0]);
            const currency = activeStore?.settings?.currency || 'USD';
            const isDigital = p.type === 'digital';
            const hasDiscount = !!p.compareAtPrice && p.compareAtPrice > p.price;
            const lowStock = !isDigital && typeof p.stock === 'number' && p.stock > 0 && p.stock <= 5;
            const outOfStock = !isDigital && p.stock === 0;
            // Stagger reveal — capped so big grids stay snappy.
            const revealDelay = `${Math.min(i, 11) * 55}ms`;
            return (
              <Link
                key={p._id}
                href={`/dashboard/products/${p._id}?storeId=${selectedStoreId}`}
                className="dpc-card group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-500 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
                style={{ animationDelay: revealDelay }}
              >
                {/* Cover image */}
                <div className="relative aspect-square overflow-hidden bg-muted/40">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-110 group-hover:rotate-[0.6deg]"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground transition-transform duration-500 group-hover:scale-110">
                      {isDigital ? <Cloud className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
                    </div>
                  )}

                  {/* Diagonal gloss sweep — luxury e-commerce micro-detail */}
                  <span className="dpc-shimmer pointer-events-none absolute inset-0" aria-hidden />

                  {/* Discount badge — gentle pulse */}
                  {hasDiscount && (
                    <span className="dpc-badge-pulse absolute left-1.5 top-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
                      −{Math.round(((p.compareAtPrice! - p.price) / p.compareAtPrice!) * 100)}%
                    </span>
                  )}

                  {/* Status pill */}
                  <span
                    className={cn(
                      'absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm backdrop-blur transition-transform duration-300 group-hover:scale-105',
                      p.isPublished
                        ? 'bg-emerald-500/90 text-white'
                        : 'bg-amber-500/90 text-white'
                    )}
                  >
                    {p.isPublished ? 'Live' : 'Draft'}
                  </span>

                  {/* Type pill (only for digital) */}
                  {isDigital && (
                    <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                      <Cloud className="h-2.5 w-2.5" /> Digital
                    </span>
                  )}

                  {/* Low / out of stock pill */}
                  {outOfStock && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                      Rupture
                    </span>
                  )}
                  {!outOfStock && lowStock && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                      {p.stock}
                    </span>
                  )}

                  {/* Quick-edit pill — slides up on hover */}
                  <span
                    className="dpc-quickedit pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2 opacity-0 transition-all duration-300"
                    aria-hidden
                  >
                    <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-1 text-[10px] font-semibold text-foreground shadow-md backdrop-blur">
                      Modifier <span aria-hidden>→</span>
                    </span>
                  </span>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                  <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
                    {p.name}
                  </h3>

                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 tabular-nums">
                    <span className="whitespace-nowrap text-sm font-bold text-primary">
                      {formatCurrency(p.price, currency)}
                    </span>
                    {hasDiscount && (
                      <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground line-through">
                        {formatCurrency(p.compareAtPrice!, currency)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-4 rounded-2xl border border-border/60 bg-card">
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            disabled={loading}
          />
        </div>
        </>
      )}

      {/* Card animations — keyframes colocated; pure CSS, no JS. */}
      <style jsx global>{`
        @keyframes dpcReveal {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dpc-card {
          opacity: 0;
          animation: dpcReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes dpcBadgePulse {
          0%, 100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(244,63,94,0.45); }
          50%      { transform: scale(1.06); box-shadow: 0 0 0 6px rgba(244,63,94,0); }
        }
        .dpc-badge-pulse { animation: dpcBadgePulse 2.2s ease-in-out infinite; }

        .dpc-shimmer {
          background: linear-gradient(115deg,
            transparent 0%,
            transparent 42%,
            rgba(255,255,255,0.22) 50%,
            transparent 58%,
            transparent 100%);
          background-size: 200% 100%;
          background-position: 200% 0;
          opacity: 0;
          transition: opacity 0.35s ease, background-position 0.9s ease;
        }
        .group:hover .dpc-shimmer {
          opacity: 1;
          background-position: -100% 0;
        }

        .group:hover .dpc-quickedit {
          opacity: 1;
          transform: translateY(-4px);
        }

        @media (prefers-reduced-motion: reduce) {
          .dpc-card,
          .dpc-badge-pulse,
          .dpc-shimmer,
          .dpc-quickedit {
            animation: none !important;
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
