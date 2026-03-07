'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Package, Plus } from 'lucide-react';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
}

interface ProductType {
  _id: string;
  name: string;
  price: number;
  type: string;
  stock?: number;
  isPublished?: boolean;
  images?: string[];
}

export default function DashboardProductsPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const [stores, setStores] = useState<StoreType[]>([]);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(storeIdParam);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storesApi.list().then((res) => {
      const list = (res.data as { stores: StoreType[] }).stores;
      setStores(list);
      if (!selectedStoreId && list.length) setSelectedStoreId(list[0]._id);
    }).catch(() => setStores([]));
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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground">Manage your store products.</p>
        </div>
        {selectedStoreId && (
          <Link href={`/dashboard/products/new?storeId=${selectedStoreId}`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add product
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
            <Link href={`/dashboard/products/new?storeId=${selectedStoreId}`}>
              <Button className="mt-2">Add product</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p._id}>
              <CardContent className="p-4">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(p.price)} · {p.type}
                    </p>
                  </div>
                  <span className={`text-xs ${p.isPublished ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {p.isPublished ? 'Published' : 'Draft'}
                  </span>
                </div>
                <Link href={`/dashboard/products/${p._id}?storeId=${selectedStoreId}`}>
                  <Button variant="outline" size="sm" className="mt-4 w-full">
                    Edit
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
