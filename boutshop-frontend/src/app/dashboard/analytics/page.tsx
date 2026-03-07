'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { BarChart3, DollarSign, ShoppingCart, TrendingUp } from 'lucide-react';

interface StoreType {
  _id: string;
  name: string;
}

interface AnalyticsType {
  totalOrders: number;
  totalRevenue: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
}

export default function DashboardAnalyticsPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const [stores, setStores] = useState<StoreType[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsType | null>(null);
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
      setAnalytics(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    storesApi
      .getAnalytics(selectedStoreId)
      .then((res) => setAnalytics(res.data as AnalyticsType))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [selectedStoreId]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Store performance and sales stats.</p>
      </div>

      {stores.length > 0 && (
        <div className="flex gap-2">
          {stores.map((s) => (
            <button
              key={s._id}
              type="button"
              onClick={() => setSelectedStoreId(s._id)}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                selectedStoreId === s._id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input hover:bg-muted'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {!selectedStoreId ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Select a store to view analytics.
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : analytics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analytics.totalRevenue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalOrders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Revenue this month</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analytics.revenueThisMonth)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Orders this month</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.ordersThisMonth}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
