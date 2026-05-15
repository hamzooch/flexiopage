'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
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
  const { storeId: selectedStoreId, setStoreId: setSelectedStoreId } = useScopedStoreId(storeIdParam);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
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
    <div className="space-y-5 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Clients</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">Clients issus de tes commandes.</p>
      </div>

      {stores.length > 0 && (
        <div className="-mx-3 overflow-x-auto pb-1 sm:mx-0">
          <div className="flex w-max gap-2 px-3 sm:flex-wrap sm:px-0">
            {stores.map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => setSelectedStoreId(s._id)}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium sm:px-4 sm:py-2 sm:text-sm ${
                  selectedStoreId === s._id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input hover:bg-muted'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!selectedStoreId ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Sélectionne une boutique pour voir les clients.
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 font-medium">Pas encore de clients</p>
            <p className="text-sm text-muted-foreground">Les clients apparaissent après les commandes.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {customers.map((c) => {
              const initials = (c.name || c.email).split(/[\s@]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
              return (
                <li key={c._id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-violet-600 text-xs font-semibold text-white shadow-sm">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c.name || c.email.split('@')[0]}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{c.email}</div>
                  </div>
                  <div className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Email</th>
                      <th className="p-4 text-left font-medium">Nom</th>
                      <th className="p-4 text-left font-medium">Ajouté le</th>
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
        </>
      )}
    </div>
  );
}
