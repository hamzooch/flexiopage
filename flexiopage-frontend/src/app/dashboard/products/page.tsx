'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { cn, formatCurrency, mediaUrl } from '@/lib/utils';
import { Package, Plus, ImageIcon, Edit3, Cloud } from 'lucide-react';

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
      setLoading(false);
      return;
    }
    setLoading(true);
    storesApi
      .listProducts(selectedStoreId)
      .then((res) => setProducts((res.data as { products: ProductType[] }).products))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [selectedStoreId]);

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => {
            const cover = mediaUrl(p.images?.[0]);
            const currency = activeStore?.settings?.currency || 'USD';
            const isDigital = p.type === 'digital';
            const hasDiscount = !!p.compareAtPrice && p.compareAtPrice > p.price;
            const lowStock = !isDigital && typeof p.stock === 'number' && p.stock > 0 && p.stock <= 5;
            const outOfStock = !isDigital && p.stock === 0;
            return (
              <Link
                key={p._id}
                href={`/dashboard/products/${p._id}?storeId=${selectedStoreId}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
              >
                {/* Cover image */}
                <div className="relative aspect-square overflow-hidden bg-muted/40">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">
                      {isDigital ? <Cloud className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
                    </div>
                  )}

                  {/* Discount badge */}
                  {hasDiscount && (
                    <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                      −{Math.round(((p.compareAtPrice! - p.price) / p.compareAtPrice!) * 100)}%
                    </span>
                  )}

                  {/* Status pill */}
                  <span
                    className={cn(
                      'absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur',
                      p.isPublished
                        ? 'bg-emerald-500/90 text-white'
                        : 'bg-amber-500/90 text-white'
                    )}
                  >
                    {p.isPublished ? 'Live' : 'Draft'}
                  </span>

                  {/* Type pill (only for digital) */}
                  {isDigital && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                      <Cloud className="h-2.5 w-2.5" /> Digital
                    </span>
                  )}

                  {/* Low / out of stock pill */}
                  {outOfStock && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                      Rupture
                    </span>
                  )}
                  {!outOfStock && lowStock && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                      Stock bas · {p.stock}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight sm:text-base">
                    {p.name}
                  </h3>

                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
                    <span className="whitespace-nowrap text-base font-bold text-primary sm:text-lg">
                      {formatCurrency(p.price, currency)}
                    </span>
                    {hasDiscount && (
                      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground line-through sm:text-[13px]">
                        {formatCurrency(p.compareAtPrice!, currency)}
                      </span>
                    )}
                  </div>

                  {!isDigital && typeof p.stock === 'number' && !outOfStock && !lowStock && (
                    <div className="text-[11px] text-muted-foreground">{p.stock} en stock</div>
                  )}

                  <div className="mt-auto pt-2">
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      <Edit3 className="h-3 w-3" />
                      Modifier
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
