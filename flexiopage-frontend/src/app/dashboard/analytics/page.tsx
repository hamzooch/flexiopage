'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Download,
  PackageCheck,
  Percent,
  PhoneCall,
  Receipt,
  RefreshCcw,
} from 'lucide-react';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { formatCurrency, cn, formatYmdLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/dashboard/page-header';
import { KpiCard } from '@/components/charts/KpiCard';
import { RangeSwitcher } from '@/components/charts/RangeSwitcher';
import { RevenueAreaChart } from '@/components/charts/RevenueAreaChart';
import { PaymentDonutChart } from '@/components/charts/PaymentDonutChart';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { TopProductsList } from '@/components/charts/TopProductsList';
import type { RangeKey, StoreAnalyticsRich } from '@/types/analytics';
import { CANCEL_REASON_LABELS } from '@/types/analytics';

interface StoreType {
  _id: string;
  name: string;
}

function toCsv(data: StoreAnalyticsRich): string {
  const header = ['date', 'sales', 'revenue', 'orders', 'paid'].join(',');
  const rows = data.timeseries.map((p) => [p.date, p.sales, p.revenue, p.orders, p.paid].join(','));
  return [header, ...rows].join('\n');
}

function windowLabel(data: StoreAnalyticsRich): string {
  const from = data.window.fromYmd || data.window.from;
  const to = data.window.toYmd || data.window.to;
  return `${formatYmdLabel(from.slice(0, 10), { day: '2-digit', month: 'short' })} → ${formatYmdLabel(to.slice(0, 10), { day: '2-digit', month: 'short', year: 'numeric' })}`;
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
    let cancelled = false;
    setLoading(true);
    storesApi
      .getAnalyticsRich(selectedStoreId, range)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
    <div className="space-y-5">
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        description={
          data
            ? `${selectedStore?.name || 'Boutique'} · ${windowLabel(data)}`
            : `Funnel, trafic et zones de ${selectedStore?.name || 'ta boutique'}.`
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={!selectedStoreId || refreshing}
              className="h-10 gap-1.5"
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => data && downloadCsv(`analytics-${selectedStore?.name || 'store'}-${range}.csv`, toCsv(data))}
              disabled={!data}
              className="h-10 gap-1.5"
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </>
        }
      />

      <div className="overflow-x-auto">
        <RangeSwitcher value={range} onChange={setRange} />
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
                className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedStoreId === s._id
                    ? 'border-transparent bg-foreground text-background'
                    : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Conversion"
              value={`${data.kpis.conversionRate.value.toFixed(2)}%`}
              delta={data.kpis.conversionRate.deltaPct}
              icon={Percent}
              accent="pink"
              hint="visites vers commandes"
            />
            <KpiCard
              label="Confirmation"
              value={`${data.kpis.codConfirmationRate.value.toFixed(0)}%`}
              delta={data.kpis.codConfirmationRate.deltaPct}
              icon={PhoneCall}
              accent="amber"
              hint="confirmées / créées"
            />
            <KpiCard
              label="Livraison"
              value={`${data.kpis.codDeliveryRate.value.toFixed(0)}%`}
              delta={data.kpis.codDeliveryRate.deltaPct}
              icon={PackageCheck}
              accent="emerald"
              hint="livrées / confirmées"
            />
            <KpiCard
              label="Panier moyen"
              value={formatCurrency(data.kpis.averageOrderValue.value, currency)}
              delta={data.kpis.averageOrderValue.deltaPct}
              icon={Receipt}
              accent="violet"
              hint="sur la période"
            />
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-4">
            <MetricCell label="Vues" value={String(data.kpis.pageViews.value)} delta={data.kpis.pageViews.deltaPct} />
            <MetricCell label="Clients" value={String(data.kpis.uniqueCustomers.value)} delta={data.kpis.uniqueCustomers.deltaPct} />
            <MetricCell label="Commandes" value={String(data.kpis.orders.value)} delta={data.kpis.orders.deltaPct} />
            <MetricCell label="Remboursement" value={`${data.kpis.refundRate.value.toFixed(1)}%`} delta={data.kpis.refundRate.deltaPct} invert />
          </div>

          {/* Revenue chart (full width) */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base">Ventes &amp; encaissé</CardTitle>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {monthly ? 'Mensuel' : 'Quotidien'} · {windowLabel(data)}
                </p>
              </div>
              <Legend />
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <RevenueAreaChart data={data.timeseries} currency={currency} monthly={monthly} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base">Funnel cash-on-delivery</CardTitle>
              <p className="text-xs text-muted-foreground">
                Créée, contactée, confirmée, expédiée, livrée, payée
              </p>
            </CardHeader>
            <CardContent>
              <FunnelChart funnel={data.funnel} mode="full" />
            </CardContent>
          </Card>

          <AcquisitionSection data={data} currency={currency} />

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Motifs de refus</CardTitle>
                <p className="text-xs text-muted-foreground">Les causes les plus fréquentes sur la période</p>
              </CardHeader>
              <CardContent>
                <CancelReasonsWidget items={data.cancelReasons || []} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Villes</CardTitle>
                <p className="text-xs text-muted-foreground">Où partent les commandes, et lesquelles sont livrées</p>
              </CardHeader>
              <CardContent>
                {(data.byCity || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune commande avec une ville sur cette période.</p>
                ) : (
                  <ByCityWidget items={data.byCity} currency={currency} />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Pays</CardTitle>
                <p className="text-xs text-muted-foreground">Chiffre et livraisons par pays</p>
              </CardHeader>
              <CardContent>
                {(data.byCountry || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune commande sur cette période.</p>
                ) : (
                  <ByCountryWidget items={data.byCountry} currency={currency} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Moyens de paiement</CardTitle>
                <p className="text-xs text-muted-foreground">Répartition de l&apos;encaissé</p>
              </CardHeader>
              <CardContent>
                <PaymentDonutChart data={data.paymentBreakdown} currency={currency} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base">Produits</CardTitle>
              <p className="text-xs text-muted-foreground">Classés par ventes sur la période</p>
            </CardHeader>
            <CardContent>
              <TopProductsList products={data.topProducts} currency={currency} />
            </CardContent>
          </Card>

          {/* Totals footer — all-time numbers, deliberately understated. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base">Depuis le début</CardTitle>
              <p className="text-xs text-muted-foreground">Cumul total de la boutique, hors filtre de période</p>
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

const SOURCE_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  google: 'Google',
  youtube: 'YouTube',
  twitter: 'X / Twitter',
  snapchat: 'Snapchat',
  whatsapp: 'WhatsApp',
  direct: 'Trafic direct',
  other: 'Autres sites',
  unknown: 'Non identifié',
};

function AcquisitionSection({ data, currency }: { data: StoreAnalyticsRich; currency: string }) {
  const devices = data.devices ?? { mobile: 0, desktop: 0, unknown: 0 };
  const detected = devices.mobile + devices.desktop;
  const mobilePct = detected > 0 ? Math.round((devices.mobile / detected) * 100) : 0;
  const sources = (data.trafficSources || []).filter((row) => row.visitors > 0);
  const sourceTotal = sources.reduce((sum, row) => sum + row.visitors, 0);
  const hours = data.hourlySales || [];
  const maxOrders = Math.max(1, ...hours.map((row) => row.orders));
  const peak = hours.reduce((best, row) => (row.orders > best.orders ? row : best), { hour: 0, orders: 0, sales: 0 });

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">Sources de trafic</CardTitle>
          <p className="text-xs text-muted-foreground">Sessions classées sur la période</p>
        </CardHeader>
        <CardContent>
          {sourceTotal === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun visiteur classé pour l&apos;instant.</p>
          ) : (
            <ul className="space-y-2">
              {sources.slice(0, 6).map((row) => (
                <li key={row.source} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{SOURCE_LABEL[row.source] || row.source}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {row.visitors} · {Math.round((row.visitors / sourceTotal) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">Appareils</CardTitle>
          <p className="text-xs text-muted-foreground">Visiteurs mobile et desktop</p>
        </CardHeader>
        <CardContent>
          {detected === 0 ? (
            <p className="text-xs text-muted-foreground">Pas encore de donnée appareil.</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between text-sm">
                <span>Mobile <strong className="tabular-nums">{devices.mobile}</strong></span>
                <span>Desktop <strong className="tabular-nums">{devices.desktop}</strong></span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                <div className="bg-emerald-500" style={{ width: `${mobilePct}%` }} />
                <div className="bg-indigo-500" style={{ width: `${100 - mobilePct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{mobilePct}% des visites viennent du mobile.</p>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">Ventes par heure</CardTitle>
          <p className="text-xs text-muted-foreground">
            {peak.orders > 0 ? `Pic à ${peak.hour}h · ${formatCurrency(peak.sales, currency)}` : 'Aucune commande sur la période'}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-end gap-px">
            {hours.map((row) => (
              <div
                key={row.hour}
                title={`${row.hour}h · ${row.orders} commande${row.orders > 1 ? 's' : ''}`}
                className="min-w-0 flex-1 rounded-sm bg-primary/80"
                style={{ height: `${Math.max(4, (row.orders / maxOrders) * 100)}%` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCell({
  label,
  value,
  delta,
  invert,
}: {
  label: string;
  value: string;
  delta?: number | null;
  invert?: boolean;
}) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const isUp = hasDelta && (delta as number) > 0;
  const isDown = hasDelta && (delta as number) < 0;
  const positive = invert ? isDown : isUp;
  const negative = invert ? isUp : isDown;
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold tabular-nums">{value}</span>
        {hasDelta && (
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              positive && 'text-emerald-700',
              negative && 'text-rose-700',
              !positive && !negative && 'text-muted-foreground',
            )}
          >
            {(delta as number) > 0 ? '+' : ''}
            {(delta as number).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-pink-500" /> Ventes
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Encaissé
      </span>
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-border/60 pl-3 first:border-l-0 first:pl-0 lg:pl-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-lg font-bold tabular-nums sm:text-xl">{value}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
      <p className="mt-3 text-xs text-muted-foreground">
        Total {total} refus/annulations. Chaque motif suggère une action corrective
        (adresse incorrecte → améliorer le form, prix trop cher → tester A/B, doublons → détection auto).
      </p>
    </div>
  );
}

/**
 * Répartition des commandes par ville — tableau avec barre visuelle pour le %.
 * Deux buckets spéciaux :
 *   - `__others__` : villes hors top 15 (agrégat)
 *   - `__unknown__` : commandes sans ville renseignée — signale un défaut de
 *     collecte côté formulaire, on l'affiche en bas avec un tooltip.
 */
function ByCityWidget({
  items,
  currency,
}: {
  items: Array<{ city: string; orders: number; revenue: number; delivered: number; pct: number }>;
  currency: string;
}) {
  const fmt = (n: number) => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
    catch { return `${n} ${currency}`; }
  };
  const labelFor = (city: string) => {
    if (city === '__others__') return 'Autres villes';
    if (city === '__unknown__') return 'Non renseignée';
    return city;
  };
  // On sépare les buckets spéciaux pour les afficher en fin de liste avec un
  // style discret — le top réel reste au-dessus.
  const known = items.filter((r) => r.city !== '__others__' && r.city !== '__unknown__');
  const others = items.find((r) => r.city === '__others__');
  const unknown = items.find((r) => r.city === '__unknown__');
  const maxPct = Math.max(1, ...known.map((r) => r.pct));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] text-sm">
        <thead className="text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-2 font-semibold">Ville</th>
            <th className="py-1.5 px-2 font-semibold">Part</th>
            <th className="py-1.5 px-2 text-right font-semibold">Cmd</th>
            <th className="py-1.5 px-2 text-right font-semibold">CA</th>
            <th className="py-1.5 pl-2 text-right font-semibold">Livrées</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {known.map((c) => {
            const rate = c.orders > 0 ? (c.delivered / c.orders) * 100 : 0;
            // Barre normalisée sur la plus grande ville → l'écart visuel
            // reste lisible même quand la 1re ville domine (ex: 40% vs 4%).
            const barPct = (c.pct / maxPct) * 100;
            return (
              <tr key={c.city}>
                <td className="py-2 pr-2 font-medium">{labelFor(c.city)}</td>
                <td className="py-2 px-2 min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-full max-w-[110px] overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${barPct}%` }} />
                    </div>
                    <span className="tabular-nums text-[11px] font-semibold text-muted-foreground">{c.pct.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-semibold">{c.orders}</td>
                <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmt(c.revenue)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium',
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
          {others && (
            <tr className="text-muted-foreground">
              <td className="py-2 pr-2 italic">{labelFor(others.city)}</td>
              <td className="py-2 px-2 tabular-nums text-[11px]">{others.pct.toFixed(1)}%</td>
              <td className="py-2 px-2 text-right tabular-nums">{others.orders}</td>
              <td className="py-2 px-2 text-right tabular-nums">{fmt(others.revenue)}</td>
              <td className="py-2 pl-2 text-right tabular-nums text-[11px]">—</td>
            </tr>
          )}
          {unknown && (
            <tr
              className="text-muted-foreground"
              title="Commandes créées sans ville dans l'adresse. Vérifier le formulaire de checkout ou les questions du bot COD."
            >
              <td className="py-2 pr-2 italic">
                {labelFor(unknown.city)}
                <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-600">à collecter</span>
              </td>
              <td className="py-2 px-2 tabular-nums text-[11px]">{unknown.pct.toFixed(1)}%</td>
              <td className="py-2 px-2 text-right tabular-nums">{unknown.orders}</td>
              <td className="py-2 px-2 text-right tabular-nums">{fmt(unknown.revenue)}</td>
              <td className="py-2 pl-2 text-right tabular-nums text-[11px]">—</td>
            </tr>
          )}
        </tbody>
      </table>
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
        <thead className="text-left text-xs font-medium text-muted-foreground">
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
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium',
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
