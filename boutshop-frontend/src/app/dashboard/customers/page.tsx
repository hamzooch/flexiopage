'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { Users } from 'lucide-react';

interface StoreType {
  _id: string;
  name: string;
}

interface CustomerType {
  _id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export default function DashboardCustomersPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const [stores, setStores] = useState<StoreType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
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
      setCustomers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    storesApi
      .listCustomers(selectedStoreId)
      .then((res) => setCustomers((res.data as { customers: CustomerType[] }).customers))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [selectedStoreId]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Customers</h1>
        <p className="text-muted-foreground">Customers from your orders.</p>
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
            Select a store to view customers.
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 font-medium">No customers yet</p>
            <p className="text-sm text-muted-foreground">Customers appear after orders.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">Email</th>
                    <th className="p-4 text-left font-medium">Name</th>
                    <th className="p-4 text-left font-medium">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c._id} className="border-b">
                      <td className="p-4">{c.email}</td>
                      <td className="p-4">{c.name || '—'}</td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
