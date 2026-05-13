'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ShoppingCart } from 'lucide-react';

interface StoreType {
  _id: string;
  name: string;
}

interface OrderType {
  _id: string;
  orderNumber: string;
  email: string;
  total: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  delivery?: {
    provider?: string;
    externalId?: string;
    externalStatus?: string;
    trackingUrl?: string;
    error?: string;
  };
}

const DELIVERY_BADGE: Record<string, { label: string; cls: string }> = {
  pending:        { label: 'En attente',      cls: 'bg-amber-500/10 text-amber-700' },
  assigned:       { label: 'Assigné',         cls: 'bg-blue-500/10 text-blue-700' },
  picked_up:      { label: 'Récupéré',        cls: 'bg-violet-500/10 text-violet-700' },
  in_transit:     { label: 'En transit',      cls: 'bg-indigo-500/10 text-indigo-700' },
  delivered:      { label: 'Livré',           cls: 'bg-emerald-500/10 text-emerald-700' },
  returned:       { label: 'Retourné',        cls: 'bg-rose-500/10 text-rose-700' },
  cancelled:      { label: 'Annulé',          cls: 'bg-rose-500/10 text-rose-700' },
  failed:         { label: 'Échec dispatch',  cls: 'bg-red-500/10 text-red-700' },
};

export default function DashboardOrdersPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const [stores, setStores] = useState<StoreType[]>([]);
  const [orders, setOrders] = useState<OrderType[]>([]);
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
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    storesApi
      .listOrders(selectedStoreId)
      .then((res) => setOrders((res.data as { orders: OrderType[] }).orders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [selectedStoreId]);

  return (
    <div className="space-y-5 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Orders</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">Voir et gérer les commandes.</p>
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
            Sélectionne une boutique pour voir les commandes.
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShoppingCart className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 font-medium">Pas encore de commandes</p>
            <p className="text-sm text-muted-foreground">Les commandes apparaîtront ici.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="space-y-2.5 md:hidden">
            {orders.map((o) => <OrderMobileCard key={o._id} order={o} />)}
          </ul>

          {/* Desktop: table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Commande</th>
                      <th className="p-4 text-left font-medium">Client</th>
                      <th className="p-4 text-left font-medium">Total</th>
                      <th className="p-4 text-left font-medium">Paiement</th>
                      <th className="p-4 text-left font-medium">Livraison</th>
                      <th className="p-4 text-left font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const delivery = o.delivery;
                      const badgeKey = (delivery?.externalStatus || '').toLowerCase();
                      const badge = DELIVERY_BADGE[badgeKey];
                      return (
                        <tr key={o._id} className="border-b">
                          <td className="p-4 font-medium">{o.orderNumber}</td>
                          <td className="max-w-[200px] truncate p-4">{o.email}</td>
                          <td className="p-4 tabular-nums">{formatCurrency(o.total)}</td>
                          <td className="p-4">
                            <span
                              className={
                                o.paymentStatus === 'paid'
                                  ? 'text-green-600'
                                  : o.paymentStatus === 'failed'
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                              }
                            >
                              {o.paymentStatus}
                            </span>
                          </td>
                          <td className="p-4">
                            {delivery?.error ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-700" title={delivery.error}>
                                ⚠ Échec dispatch
                              </span>
                            ) : badge ? (
                              <a
                                href={delivery?.trackingUrl || '#'}
                                target={delivery?.trackingUrl ? '_blank' : undefined}
                                rel="noopener"
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls} ${delivery?.trackingUrl ? 'hover:underline' : 'cursor-default'}`}
                                onClick={(e) => { if (!delivery?.trackingUrl) e.preventDefault(); }}
                              >
                                {badge.label}
                                {delivery?.externalId && <span className="font-mono text-[10px] opacity-70">·{delivery.externalId.slice(-6)}</span>}
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-4 text-muted-foreground">{formatDate(o.createdAt)}</td>
                        </tr>
                      );
                    })}
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

function OrderMobileCard({ order: o }: { order: OrderType }) {
  const delivery = o.delivery;
  const badgeKey = (delivery?.externalStatus || '').toLowerCase();
  const badge = DELIVERY_BADGE[badgeKey];
  const payCls = o.paymentStatus === 'paid'
    ? 'bg-emerald-500/10 text-emerald-700'
    : o.paymentStatus === 'failed'
      ? 'bg-rose-500/10 text-rose-700'
      : 'bg-amber-500/10 text-amber-700';
  return (
    <li className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      {/* Top row: order number + total */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-semibold">#{o.orderNumber}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{o.email}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold tabular-nums">{formatCurrency(o.total)}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(o.createdAt)}</div>
        </div>
      </div>

      {/* Badges row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${payCls}`}>
          {o.paymentStatus}
        </span>
        {delivery?.error ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-700" title={delivery.error}>
            ⚠ Échec dispatch
          </span>
        ) : badge ? (
          <a
            href={delivery?.trackingUrl || '#'}
            target={delivery?.trackingUrl ? '_blank' : undefined}
            rel="noopener"
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls} ${delivery?.trackingUrl ? 'underline-offset-2 hover:underline' : 'cursor-default'}`}
            onClick={(e) => { if (!delivery?.trackingUrl) e.preventDefault(); }}
          >
            {badge.label}
            {delivery?.externalId && <span className="font-mono text-[9px] opacity-70">·{delivery.externalId.slice(-6)}</span>}
          </a>
        ) : null}
      </div>
    </li>
  );
}
