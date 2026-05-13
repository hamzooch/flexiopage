'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, type AdminOrder } from '@/lib/api';
import { Loader2 } from 'lucide-react';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.orders().then((res) => {
      setOrders(res.data.orders);
      setTotal(res.data.total);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Commandes ({total})</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Toutes les commandes de la plateforme, plus récentes en premier.</CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : orders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Aucune commande pour l&apos;instant.
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="space-y-2.5 md:hidden">
              {orders.map((o) => <AdminOrderMobileCard key={o._id} order={o} />)}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">N°</th>
                    <th className="py-2 text-left font-medium">Boutique</th>
                    <th className="py-2 text-left font-medium">Client</th>
                    <th className="py-2 text-right font-medium">Montant</th>
                    <th className="py-2 text-left font-medium">Paiement</th>
                    <th className="py-2 text-left font-medium">Livraison</th>
                    <th className="py-2 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-3 font-mono text-xs">{o.orderNumber}</td>
                      <td className="py-3 text-xs">
                        {o.storeId?.name || '—'}<br />
                        <span className="text-muted-foreground">/{o.storeId?.slug}</span>
                      </td>
                      <td className="max-w-[200px] truncate py-3 text-xs">
                        <div className="font-medium">{o.customerName || '—'}</div>
                        <div className="truncate text-muted-foreground">{o.email}</div>
                      </td>
                      <td className="py-3 text-right font-bold tabular-nums">{fmt(o.total, o.currency)}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor(o.paymentStatus)}`}>
                          {labelPaymentStatus(o.paymentStatus)}
                        </span>
                        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{o.paymentMethod}</div>
                      </td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${fulfillmentColor(o.fulfillmentStatus)}`}>
                          {labelFulfillment(o.fulfillmentStatus)}
                        </span>
                      </td>
                      <td className="py-3 text-right text-xs text-muted-foreground">
                        {o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AdminOrderMobileCard({ order: o }: { order: AdminOrder }) {
  return (
    <li className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-semibold">#{o.orderNumber}</div>
          {o.storeId?.name && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {o.storeId.name}{o.storeId.slug ? ` · /${o.storeId.slug}` : ''}
            </div>
          )}
          <div className="mt-1 truncate text-[11px]">
            <span className="font-medium">{o.customerName || '—'}</span>
            {o.email && <span className="text-muted-foreground"> · {o.email}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold tabular-nums">{fmt(o.total, o.currency)}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor(o.paymentStatus)}`}>
          {labelPaymentStatus(o.paymentStatus)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${fulfillmentColor(o.fulfillmentStatus)}`}>
          {labelFulfillment(o.fulfillmentStatus)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{o.paymentMethod}</span>
      </div>
    </li>
  );
}

function badgeColor(s: string): string {
  switch (s) {
    case 'paid': return 'bg-emerald-500/10 text-emerald-700';
    case 'failed': return 'bg-rose-500/10 text-rose-700';
    case 'refunded': return 'bg-amber-500/10 text-amber-700';
    default: return 'bg-amber-500/10 text-amber-700';
  }
}
function labelPaymentStatus(s: string): string {
  return ({ pending: 'En attente', paid: 'Payée', failed: 'Échec', refunded: 'Remboursée', manual: 'Manuel' } as Record<string, string>)[s] || s;
}
function fulfillmentColor(s: string): string {
  switch (s) {
    case 'fulfilled': return 'bg-emerald-500/10 text-emerald-700';
    case 'cancelled': return 'bg-rose-500/10 text-rose-700';
    case 'partial': return 'bg-indigo-500/10 text-indigo-700';
    default: return 'bg-muted text-muted-foreground';
  }
}
function labelFulfillment(s: string): string {
  return ({ unfulfilled: 'Non livrée', partial: 'En route', fulfilled: 'Livrée', cancelled: 'Annulée' } as Record<string, string>)[s] || s;
}
