'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Clock,
  DollarSign,
  Download,
  Eye,
  MousePointerClick,
  Percent,
  RefreshCcw,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { formatCurrency, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/charts/KpiCard';
import { RangeSwitcher } from '@/components/charts/RangeSwitcher';
import { RevenueAreaChart } from '@/components/charts/RevenueAreaChart';
import { PaymentDonutChart } from '@/components/charts/PaymentDonutChart';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { TopProductsList } from '@/components/charts/TopProductsList';
import { RecentOrdersPanel } from '@/components/charts/RecentOrdersPanel';
import type { RangeKey, StoreAnalyticsRich } from '@/types/analytics';
import { CANCEL_REASON_LABELS } from '@/types/analytics';

interface StoreType {
  _id: string;
  name: string;
}

function toCsv(data: StoreAnalyticsRich): string {
  const header = ['date', 'revenue', 'orders', 'paid'].join(',');
  const rows = data.timeseries.map((p) => [p.date, p.revenue, p.orders, p.paid].join(','));
  return [header, ...rows].join('\n');
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardAnalyticsPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const { storeId: selectedStoreId, setStoreId: setSelectedStoreId } = useScopedStoreId(storeIdParam);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [range, setRange] = useState<RangeKey>('30d');
  const [data, setData] = useState<StoreAnalyticsRich | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    storesApi
      .list()
      .then((res) => {
        const list = (res.data as { stores: StoreType[] }).stores;
        setStores(list);
        if (!selectedStoreId && list.length) setSelectedStoreId(list[0]._id);
      })
      .catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedStoreId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    storesApi
      .getAnalyticsRich(selectedStoreId, range)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedStoreId, range]);

  const refresh = async () => {
    if (!selectedStoreId) return;
    setRefreshing(true);
    try {
      const res = await storesApi.getAnalyticsRich(selectedStoreId, range);
      setData(res.data);
    } catch {
      // swallow — error state already shown via empty data
    } finally {
      setRefreshing(false);
    }
  };

  const currency = data?.currency || 'USD';
  const monthly = range === '12m';
  const selectedStore = useMemo(() => stores.find((s) => s._id === selectedStoreId), [stores, selectedStoreId]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500/10 to-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-violet-700">
            <Sparkles className="h-3 w-3" />
            Tableau de bord
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Analytics</h1>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">
            Performance de {selectedStore?.name || 'ta boutique'} en temps réel.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeSwitcher value={range} onChange={setRange} />
          <button
            type="button"
            onClick={refresh}
            disabled={!selectedStoreId || refreshing}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-card px-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50 sm:px-3"
            title="Rafraîchir"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
          <button
            type="button"
            onClick={() => data && downloadCsv(`analytics-${selectedStore?.name || 'store'}-${range}.csv`, toCsv(data))}
            disabled={!data}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-card px-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50 sm:px-3"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Store switcher — horizontal scroll on mobile so it doesn't wrap into
          a multi-row jumble when the seller has many stores. */}
      {stores.length > 1 && (
        <div className="-mx-3 overflow-x-auto pb-1 sm:mx-0">
          <div className="flex w-max gap-2 px-3 sm:flex-wrap sm:px-0">
            {stores.map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => setSelectedStoreId(s._id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all sm:px-3.5 ${
                  selectedStoreId === s._id
                    ? 'border-transparent bg-gradient-to-r from-pink-500 to-violet-600 text-white shadow-md'
                    : 'border-border/60 bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
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
            Sélectionne une boutique pour voir les statistiques.
          </CardContent>
        </Card>
      ) : loading && !data ? (
        <LoadingSkeleton />
      ) : !data ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Aucune donnée pour cette boutique pour le moment.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI grid — denser: 2 cols mobile, 3 tablet, 4 desktop, 5 xl. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4 xl:grid-cols-5">
            <KpiCard
              label="Ventes totales"
              value={formatCurrency(data.kpis.sales.value, currency)}
              delta={data.kpis.sales.deltaPct}
              icon={DollarSign}
              accent="pink"
              hint="toutes commandes"
            />
            <KpiCard
              label="Revenu encaissé"
              value={formatCurrency(data.kpis.revenue.value, currency)}
              delta={data.kpis.revenue.deltaPct}
              icon={DollarSign}
              accent="emerald"
              hint="commandes payées"
            />
            <KpiCard
              label="Commandes payées"
              value={String(data.kpis.paidOrders.value)}
              delta={data.kpis.paidOrders.deltaPct}
              icon={ShoppingCart}
              accent="violet"
              hint="vs période préc."
            />
            <KpiCard
              label="Panier moyen"
              value={formatCurrency(data.kpis.averageOrderValue.value, currency)}
              delta={data.kpis.averageOrderValue.deltaPct}
              icon={TrendingUp}
              accent="emerald"
              hint="par commande payée"
            />
            <KpiCard
              label="Clients uniques"
              value={String(data.kpis.uniqueCustomers.value)}
              delta={data.kpis.uniqueCustomers.deltaPct}
              icon={Users}
              accent="sky"
              hint="emails distincts"
            />
            <KpiCard
              label="Commandes totales"
              value={String(data.kpis.orders.value)}
              delta={data.kpis.orders.deltaPct}
              icon={BarChart3}
              accent="slate"
            />
            <KpiCard
              label="Taux de livraison"
              value={`${data.kpis.fulfillmentRate.value.toFixed(1)}%`}
              delta={data.kpis.fulfillmentRate.deltaPct}
              icon={Activity}
              accent="emerald"
            />
            <KpiCard
              label="Taux remboursement"
              value={`${data.kpis.refundRate.value.toFixed(1)}%`}
              delta={data.kpis.refundRate.deltaPct}
              invertDelta
              icon={RotateCcw}
              accent="amber"
            />
            <KpiCard
              label="Paiements en attente"
              value={String(data.kpis.pendingOrders.value)}
              icon={Clock}
              accent="amber"
              hint="à confirmer"
            />
            <KpiCard
              label="Vues de page"
              value={String(data.kpis.pageViews.value)}
              delta={data.kpis.pageViews.deltaPct}
              icon={Eye}
              accent="sky"
              hint="trafic storefront"
            />
            <KpiCard
              label="Vues produits"
              value={String(data.kpis.productViews.value)}
              delta={data.kpis.productViews.deltaPct}
              icon={MousePointerClick}
              accent="violet"
              hint="fiches produit ouvertes"
            />
            <KpiCard
              label="Taux de conversion"
              value={`${data.kpis.conversionRate.value.toFixed(2)}%`}
              delta={data.kpis.conversionRate.deltaPct}
              icon={Percent}
              accent="pink"
              hint="visites → commandes"
            />
          </div>

          {/* Revenue chart (full width) */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base">Revenu &amp; commandes</CardTitle>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">
                  {monthly ? 'Mensuel' : 'Quotidien'} ·{' '}
                  {new Date(data.window.from).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} →{' '}
                  {new Date(data.window.to).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <Legend />
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <RevenueAreaChart data={data.timeseries} currency={currency} monthly={monthly} />
            </CardContent>
          </Card>

          {/* Top products + funnel + payment mix */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Top produits</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Classés par revenu sur la période</p>
              </CardHeader>
              <CardContent>
                <TopProductsList products={data.topProducts} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Funnel COD</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">
                  Créée → contactée → confirmée → dispatchée → livrée → payée
                </p>
              </CardHeader>
              <CardContent>
                <FunnelChart funnel={data.funnel} mode="full" />
              </CardContent>
            </Card>
          </div>

          {/* Top motifs de refus + Pays */}
          {(data.cancelReasons?.length > 0 || data.byCountry?.length > 0) && (
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              {data.cancelReasons?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm sm:text-base">Top motifs de refus</CardTitle>
                    <p className="text-[11px] text-muted-foreground sm:text-xs">
                      Où corriger la cause racine — chaque motif suggère une action.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <CancelReasonsWidget items={data.cancelReasons} />
                  </CardContent>
                </Card>
              )}
              {data.byCountry?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm sm:text-base">Performance par pays</CardTitle>
                    <p className="text-[11px] text-muted-foreground sm:text-xs">
                      CA + taux de livraison — sur la période.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ByCountryWidget items={data.byCountry} currency={currency} />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Payment mix + Recent orders */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Méthodes de paiement</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Répartition par fournisseur sur la période</p>
              </CardHeader>
              <CardContent>
                <PaymentDonutChart data={data.paymentBreakdown} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Commandes récentes</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">8 dernières commandes</p>
              </CardHeader>
              <CardContent>
                <RecentOrdersPanel orders={data.recentOrders} />
              </CardContent>
            </Card>
          </div>

          {/* Totals footer — all-time numbers, deliberately understated. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base">Depuis le début</CardTitle>
              <p className="text-[11px] text-muted-foreground sm:text-xs">Cumul total de la boutique, hors filtre de période</p>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 py-4 lg:grid-cols-4">
              <FooterStat label="Ventes totales" value={formatCurrency(data.totals.totalSales, currency)} />
              <FooterStat label="Revenu encaissé" value={formatCurrency(data.totals.totalRevenue, currency)} />
              <FooterStat label="Commandes" value={String(data.totals.totalOrders)} />
              <FooterStat label="Clients" value={String(data.totals.totalCustomers)} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-pink-500" /> Revenu
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-violet-500" /> Commandes payées
      </span>
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-border/60 pl-3 first:border-l-0 first:pl-0 lg:pl-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">{label}</div>
      <div className="mt-1 break-words text-lg font-bold tabular-nums sm:text-xl">{value}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-xl border border-border/60 bg-card" />
        ))}
      </div>
      <div className="h-[380px] animate-pulse rounded-xl border border-border/60 bg-card" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-[280px] animate-pulse rounded-xl border border-border/60 bg-card lg:col-span-2" />
        <div className="h-[280px] animate-pulse rounded-xl border border-border/60 bg-card" />
      </div>
    </div>
  );
}

/** Top motifs de refus — bar chart CSS-only avec % + libellé humain. */
function CancelReasonsWidget({ items }: { items: Array<{ code: string; count: number }> }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Aucun motif structuré saisi sur cette période.</p>;
  }
  return (
    <div className="space-y-2.5">
      {items.map((r) => {
        const pct = (r.count / total) * 100;
        return (
          <div key={r.code}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">{CANCEL_REASON_LABELS[r.code] || r.code}</span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-bold text-foreground">{r.count}</span>
                <span className="ml-1.5">({pct.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="mt-3 text-[10px] text-muted-foreground">
        Total {total} refus/annulations. Chaque motif suggère une action corrective
        (adresse incorrecte → améliorer le form, prix trop cher → tester A/B, doublons → détection auto).
      </p>
    </div>
  );
}

/** Performance par pays — table compacte CA + livraisons + taux. */
function ByCountryWidget({ items, currency }: { items: Array<{ country: string; orders: number; revenue: number; delivered: number }>; currency: string }) {
  const fmt = (n: number) => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
    catch { return `${n} ${currency}`; }
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-2 font-semibold">Pays</th>
            <th className="py-1.5 px-2 text-right font-semibold">CA</th>
            <th className="py-1.5 px-2 text-right font-semibold">Cmd</th>
            <th className="py-1.5 pl-2 text-right font-semibold">Livrées</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {items.map((c) => {
            const rate = c.orders > 0 ? (c.delivered / c.orders) * 100 : 0;
            return (
              <tr key={c.country}>
                <td className="py-2 pr-2 font-medium">{c.country || '—'}</td>
                <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmt(c.revenue)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{c.orders}</td>
                <td className="py-2 pl-2 text-right tabular-nums">
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    rate >= 60 ? 'bg-emerald-500/10 text-emerald-700'
                      : rate >= 40 ? 'bg-amber-500/10 text-amber-700'
                      : 'bg-rose-500/10 text-rose-700',
                  )}>
                    {rate.toFixed(0)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
