'use client';

/**
 * Suivi — storefront funnel tracking for the seller. Shows product views,
 * add-to-cart, orders and abandoned carts over a date range, plus a
 * per-product funnel table. Data comes from anonymous StoreEvent records.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { storesApi, type TrackingStats, type TrackingRange } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Activity, Eye, ShoppingCart, PackageCheck, CircleSlash, Loader2,
} from 'lucide-react';

interface StoreLite { _id: string; name: string }

const RANGES: { value: TrackingRange; label: string }[] = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
];

export default function TrackingPage() {
  const searchParams = useSearchParams();
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState(searchParams.get('storeId') || '');
  const [range, setRange] = useState<TrackingRange>('30d');
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storesApi.list()
      .then((res) => {
        const list = (res.data as { stores: StoreLite[] }).stores;
        setStores(list);
        if (!storeId && list.length > 0) setStoreId(list[0]._id);
      })
      .catch(() => setStores([]));
  }, [storeId]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await storesApi.getTracking(storeId, range);
      setStats(res.data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, range]);

  useEffect(() => { void load(); }, [load]);

  const t = stats?.totals;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full gradient-brand opacity-10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <Activity className="h-3 w-3" />
              Suivi
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Suivi du trafic</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Vues produit, ajouts au panier, commandes et paniers abandonnés — pour comprendre
              où tu perds des clients.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {stores.length > 1 && (
              <select
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            )}
            <div className="inline-flex rounded-xl bg-muted/50 p-1">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    range === r.value ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="grid h-64 place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : !t ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center text-sm text-muted-foreground">
          Aucune donnée de suivi. Crée une boutique et publie un produit pour commencer à collecter.
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<Eye className="h-5 w-5" />} label="Vues produit" value={t.productViews} accent="from-sky-500 to-blue-600" />
            <Kpi
              icon={<ShoppingCart className="h-5 w-5" />}
              label="Ajouts au panier"
              value={t.addToCart}
              sub={`${t.viewToCartRate}% des vues`}
              accent="from-violet-500 to-fuchsia-600"
            />
            <Kpi
              icon={<PackageCheck className="h-5 w-5" />}
              label="Commandes"
              value={t.purchases}
              sub={`${t.conversionRate}% de conversion`}
              accent="from-emerald-500 to-green-600"
            />
            <Kpi
              icon={<CircleSlash className="h-5 w-5" />}
              label="Paniers abandonnés"
              value={t.abandonedCarts}
              sub={`${t.cartToPurchaseRate}% de paniers convertis`}
              accent="from-amber-500 to-orange-600"
            />
          </div>

          {/* Funnel bar */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">Entonnoir de conversion</h2>
            <div className="mt-4 space-y-2.5">
              <FunnelRow label="Vues produit" value={t.productViews} max={t.productViews} color="#0ea5e9" />
              <FunnelRow label="Ajouts au panier" value={t.addToCart} max={t.productViews} color="#a855f7" />
              <FunnelRow label="Commandes" value={t.purchases} max={t.productViews} color="#10b981" />
            </div>
          </div>

          {/* Per-product table */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <div className="border-b border-border/60 p-4">
              <h2 className="text-sm font-semibold tracking-tight">Par produit</h2>
              <p className="text-xs text-muted-foreground">Performance de chaque produit sur la période.</p>
            </div>
            {stats!.products.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Aucun événement enregistré sur cette période.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="p-3 font-medium">Produit</th>
                      <th className="p-3 text-right font-medium">Vues</th>
                      <th className="p-3 text-right font-medium">Paniers</th>
                      <th className="p-3 text-right font-medium">Commandes</th>
                      <th className="p-3 text-right font-medium">Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats!.products.map((p) => {
                      const conv = p.views > 0 ? Math.round((p.purchases / p.views) * 1000) / 10 : 0;
                      return (
                        <tr key={p.productId} className="border-b border-border/40 last:border-0">
                          <td className="p-3 font-medium">{p.name}</td>
                          <td className="p-3 text-right tabular-nums">{p.views}</td>
                          <td className="p-3 text-right tabular-nums">{p.addToCart}</td>
                          <td className="p-3 text-right tabular-nums">{p.purchases}</td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={cn(conv >= 2 ? 'text-emerald-600' : 'text-muted-foreground')}>
                              {conv}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5">
      <div className={cn('pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-15 blur-2xl', accent)} aria-hidden />
      <div className={cn('grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md', accent)}>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums">{value.toLocaleString('fr-FR')}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function FunnelRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value.toLocaleString('fr-FR')}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
