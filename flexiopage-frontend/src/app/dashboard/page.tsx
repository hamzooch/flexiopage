'use client';

/**
 * Pro dashboard overview. The seller lands here every day and needs to
 * answer three questions in 5 seconds:
 *
 *   1. Combien j'ai vendu sur la période ?  → KPI row with vs-previous deltas
 *   2. Qu'est-ce qui exige une action ?     → "À traiter" panel (orders, carts, stock)
 *   3. Qu'est-ce qui marche / qui pue ?     → revenue sparkline + top products + recent orders
 *
 * Everything is scoped to the active store (picker in the header). Switching
 * range (today / 7d / 30d / 90d) refreshes the KPIs + chart + lists.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Store,
  Package,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Sparkles,
  Plus,
  ChevronRight,
  Cloud,
  Eye,
  AlertTriangle,
  ShoppingBag,
  Truck,
  Wallet,
  Layers,
  ExternalLink,
  Receipt,
  Users,
  Activity,
  Settings as SettingsIcon,
  RefreshCw,
  CheckCircle2,
  CalendarRange,
  Percent,
  Smartphone,
  Monitor,
  CreditCard,
  Rocket,
  XCircle,
  Banknote,
  Target,
  PhoneCall,
  PackageCheck,
  Pencil,
  Globe2,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useStoreStore } from '@/stores/store-store';
import { storesApi } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import type { StoreAnalyticsRich, RangeKey } from '@/types/analytics';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/dashboard/page-header';
import { EarningsWidget } from '@/components/dashboard/earnings-widget';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
  settings?: { currency?: string };
  goals?: { monthlyRevenue?: number };
}

interface ProductLite {
  _id: string;
  name: string;
  stock?: number;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  isPublished?: boolean;
}

interface AbandonedCart { _id: string; recovered: boolean }

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  '7d': '7 jours',
  '30d': '30 jours',
  '90d': '90 jours',
  '12m': '12 mois',
  all: 'Tous les temps',
  custom: 'Personnalisé',
};

/** Preset chips shown on the overview — kept short on purpose. The seller
 *  reaches for longer windows (90j / 12m) via the "Personnaliser" picker.
 *  'all' = tous les temps (depuis la 1re commande de la boutique). */
const QUICK_RANGES: ReadonlyArray<Exclude<RangeKey, 'custom' | '90d' | '12m'>> = ['today', 'yesterday', '7d', '30d', 'all'];

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDateFR(iso: string): string {
  // iso = "YYYY-MM-DD" — parse without timezone shenanigans.
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DashboardOverviewPage() {
  const user = useAuthStore((s) => s.user);
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);

  const [stores, setStores] = useState<StoreType[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [range, setRange] = useState<RangeKey>('today');
  const [analytics, setAnalytics] = useState<StoreAnalyticsRich | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [abandoned, setAbandoned] = useState<number>(0);
  const [lowStock, setLowStock] = useState<ProductLite[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveVisitors, setLiveVisitors] = useState<number>(0);
  // Custom range picker — only sent to the API when the user explicitly opens
  // the popover and applies a date pair. Seeded with the last 14 days so the
  // first open is never blank.
  const [customFrom, setCustomFrom] = useState<string>(() => daysAgoISO(13));
  const [customTo, setCustomTo] = useState<string>(() => todayISO());
  const [customOpen, setCustomOpen] = useState(false);

  // ── Bootstrap stores ──────────────────────────────────────────────
  useEffect(() => {
    storesApi
      .list()
      .then((res) => {
        const list = (res.data as { stores: StoreType[] }).stores || [];
        setStores(list);
        if (!currentStoreId && list[0]) setCurrentStore(list[0]._id);
      })
      .catch(() => setStores([]))
      .finally(() => setLoadingStores(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeStore = useMemo(
    () => stores.find((s) => s._id === currentStoreId) || stores[0],
    [stores, currentStoreId]
  );
  const activeStoreId = activeStore?._id;
  const currency = analytics?.currency || activeStore?.settings?.currency || 'USD';

  // ── Load analytics, abandoned carts, products in parallel ────────
  const loadActiveStoreData = useCallback(async () => {
    if (!activeStoreId) {
      setAnalytics(null);
      setAbandoned(0);
      setLowStock([]);
      return;
    }
    setLoadingAnalytics(true);
    try {
      const [analyticsRes, cartsRes, productsRes] = await Promise.all([
        storesApi
          .getAnalyticsRich(
            activeStoreId,
            range,
            range === 'custom' ? { from: customFrom, to: customTo } : undefined,
          )
          .catch(() => null),
        storesApi.listAbandonedCarts(activeStoreId).catch(() => ({ data: { carts: [] } })),
        storesApi.listProducts(activeStoreId).catch(() => ({ data: { products: [] } })),
      ]);
      if (analyticsRes) setAnalytics(analyticsRes.data as StoreAnalyticsRich);
      const carts = (cartsRes.data as { carts: AbandonedCart[] }).carts || [];
      setAbandoned(carts.filter((c) => !c.recovered).length);
      const products = (productsRes.data as { products: ProductLite[] }).products || [];
      // "Low stock" = published + tracking inventory + stock ≤ 5 + no backorder.
      // Threshold 5 is conservative — the seller can ignore the alert by
      // disabling trackInventory or by lifting the stock count.
      setLowStock(
        products.filter(
          (p) =>
            p.isPublished &&
            p.trackInventory !== false &&
            !p.allowBackorder &&
            (p.stock ?? 0) <= 5
        )
      );
    } finally {
      setLoadingAnalytics(false);
    }
  }, [activeStoreId, range, customFrom, customTo]);

  useEffect(() => { void loadActiveStoreData(); }, [loadActiveStoreData, refreshKey]);

  // ── Live visitors — Shopify-style. Poll every 30s while the tab is visible.
  // The endpoint is cheap (one distinct() over a tiny indexed window) so this
  // stays well under any rate concern. We reset to 0 when switching store so
  // the badge from a previous store never bleeds into the next one.
  useEffect(() => {
    if (!activeStoreId) { setLiveVisitors(0); return; }
    let cancelled = false;
    const fetchLive = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      storesApi
        .getLiveVisitors(activeStoreId)
        .then((res) => { if (!cancelled) setLiveVisitors(res.data.count || 0); })
        .catch(() => { /* silent — live count is non-critical */ });
    };
    fetchLive();
    const id = window.setInterval(fetchLive, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeStoreId]);

  // ── Derive presentation values ───────────────────────────────────
  const k = analytics?.kpis;
  const pendingOrders = k?.pendingOrders.value ?? 0;
  const totalActionItems = pendingOrders + abandoned + lowStock.length;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <PageHeader
        title={
          <>
            Bonjour <span className="gradient-brand-text">{user?.name?.split(' ')[0] || 'à toi'}</span> 👋
          </>
        }
        description={
          activeStore ? (
            <span className="flex flex-wrap items-center gap-1.5">
              Vue d&apos;ensemble de{' '}
              <Link
                href={`/dashboard/stores/${activeStore._id}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20"
              >
                <Store className="h-3 w-3" />
                {activeStore.name}
              </Link>
              {' · '}
              <Link href="/select-store" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                changer
              </Link>
            </span>
          ) : (
            'Construis, vends, grandis — tout en un seul endroit.'
          )
        }
        actions={
          <>
            {activeStore && (
              <Link href={`/dashboard/stores/${activeStore._id}`}>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl">
                  <SettingsIcon className="h-3.5 w-3.5" />
                  Configurer
                </Button>
              </Link>
            )}
            <Link href="/dashboard/profile?create=1">
              <Button size="sm" className="h-9 gap-1.5 rounded-xl gradient-brand text-white shadow-md shadow-primary/25">
                <Plus className="h-3.5 w-3.5" />
                Nouvelle boutique
              </Button>
            </Link>
          </>
        }
      />

      {/* ── Range selector + refresh ─────────────────────────── */}
      {activeStore && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-card p-1 shadow-sm">
            {QUICK_RANGES.map((r) => {
              const active = range === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setRange(r); setCustomOpen(false); }}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                    active
                      ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  {RANGE_LABELS[r]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                range === 'custom'
                  ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              aria-expanded={customOpen}
              aria-haspopup="dialog"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              {range === 'custom' ? `${formatDateFR(customFrom)} → ${formatDateFR(customTo)}` : 'Personnaliser'}
            </button>
            {customOpen && (
              <div
                role="dialog"
                aria-label="Choisir une période personnalisée"
                className="absolute left-0 top-[calc(100%+6px)] z-30 w-[280px] rounded-xl border border-border/60 bg-card p-3 shadow-lg"
              >
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-muted-foreground">
                    Du
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || todayISO()}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-muted-foreground">
                    Au
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      max={todayISO()}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomOpen(false)}
                    className="rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted/60"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={!customFrom || !customTo || customFrom > customTo}
                    onClick={() => { setRange('custom'); setCustomOpen(false); }}
                    className="rounded-md bg-gradient-to-br from-primary to-fuchsia-600 px-3 py-1 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {liveVisitors > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                title={`${liveVisitors} visiteur${liveVisitors > 1 ? 's' : ''} actif${liveVisitors > 1 ? 's' : ''} sur la boutique (5 dernières minutes)`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {liveVisitors} en ligne
              </span>
            )}
            {loadingAnalytics && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="h-3 w-3 animate-pulse" />
                Mise à jour…
              </span>
            )}
            <button
              type="button"
              onClick={() => setRefreshKey((n) => n + 1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              aria-label="Rafraîchir"
              title="Rafraîchir"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loadingAnalytics && 'animate-spin')} />
            </button>
          </div>
        </div>
      )}

      {/* ── No-store fallback ─────────────────────────────────── */}
      {!loadingStores && stores.length === 0 && <EmptyState />}

      {/* ── Draft banner — la #1 raison "mon dash est vide" ────
            Placé juste avant les KPIs pour être vu tout de suite. ── */}
      {activeStore && activeStore.isPublished === false && (
        <DraftBanner storeId={activeStore._id} storeName={activeStore.name} />
      )}

      {/* ── KPI cards (5 principaux) — 2 col en mobile pour lire les
            chiffres, 5 col en desktop pour tout scanner d'un coup. ── */}
      {activeStore && (
        <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
          <KpiCard
            label="Revenu créé"
            value={<KpiMoney amount={k?.sales.value ?? 0} currency={currency} />}
            deltaPct={k?.sales.deltaPct ?? null}
            previousValue={formatCurrency(k?.sales.previous ?? 0, currency)}
            icon={Wallet}
            tone="emerald"
            loading={loadingAnalytics && !analytics}
          />
          <KpiCard
            label="Commandes"
            value={String(k?.orders.value ?? 0)}
            deltaPct={k?.orders.deltaPct ?? null}
            previousValue={String(k?.orders.previous ?? 0)}
            icon={ShoppingCart}
            tone="amber"
            loading={loadingAnalytics && !analytics}
          />
          <KpiCard
            label="Panier moyen"
            value={<KpiMoney amount={k?.averageOrderValue.value ?? 0} currency={currency} />}
            deltaPct={k?.averageOrderValue.deltaPct ?? null}
            previousValue={formatCurrency(k?.averageOrderValue.previous ?? 0, currency)}
            icon={Receipt}
            tone="violet"
            loading={loadingAnalytics && !analytics}
          />
          <KpiCard
            label="Vues de pages"
            value={String(k?.pageViews.value ?? 0)}
            deltaPct={k?.pageViews.deltaPct ?? null}
            previousValue={String(k?.pageViews.previous ?? 0)}
            icon={Eye}
            tone="indigo"
            loading={loadingAnalytics && !analytics}
          />
          <KpiCard
            label="Taux de conversion"
            value={`${(k?.conversionRate.value ?? 0).toFixed(2)}%`}
            deltaPct={k?.conversionRate.deltaPct ?? null}
            previousValue={`${(k?.conversionRate.previous ?? 0).toFixed(2)}%`}
            icon={Percent}
            tone="rose"
            loading={loadingAnalytics && !analytics}
          />
        </section>
      )}

      {/* ── Earnings widget — solde vendeur des ventes en ligne (chariow).
            N'apparaît que si le vendeur a des revenus en ligne, sinon la
            page reste épurée pour les vendeurs COD-only. ── */}
      {activeStore && <EarningsWidget />}

      {/* ── Quality strip — 4 métriques "santé business" en petit,
            à côté des KPIs primaires pour ne pas surcharger. Ces
            données étaient déjà calculées côté backend mais jamais
            affichées. ── */}
      {activeStore && analytics && (
        <QualityStrip
          revenue={k?.revenue.value ?? 0}
          uniqueCustomers={k?.uniqueCustomers.value ?? 0}
          fulfillmentRate={k?.fulfillmentRate.value ?? 0}
          refundRate={k?.refundRate.value ?? 0}
          currency={currency}
        />
      )}

      {/* ── Goal + COD funnel — 2 colonnes desktop pour aligner la
            jauge d'objectif à côté du triage COD, qui sont les 2
            leviers principaux pour scaler en dropshipping. ── */}
      {activeStore && analytics && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <MonthlyGoalCard
            store={activeStore}
            goal={analytics.monthlyGoal}
            currency={currency}
            onSaved={loadActiveStoreData}
          />
          <CodFunnelCard
            confirmationRate={k?.codConfirmationRate.value ?? 0}
            deliveryRate={k?.codDeliveryRate.value ?? 0}
            created={analytics.funnel.created}
            paid={analytics.funnel.paid}
            fulfilled={analytics.funnel.fulfilled}
          />
        </section>
      )}

      {/* ── Action panel + sparkline ─────────────────────────── */}
      {activeStore && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* Action items */}
          <ActionPanel
            storeId={activeStoreId!}
            pendingOrders={pendingOrders}
            abandonedCount={abandoned}
            lowStockCount={lowStock.length}
            lowStockItems={lowStock.slice(0, 3)}
            totalActions={totalActionItems}
          />

          {/* Sparkline */}
          <RevenueChart
            timeseries={analytics?.timeseries || []}
            currency={currency}
            loading={loadingAnalytics && !analytics}
          />
        </section>
      )}

      {/* ── Top products + Recent orders ────────────────────── */}
      {activeStore && (
        <section className="grid gap-4 lg:grid-cols-2">
          <TopProductsCard
            items={analytics?.topProducts || []}
            currency={currency}
            loading={loadingAnalytics && !analytics}
            storeId={activeStoreId!}
          />
          <RecentOrdersCard
            items={analytics?.recentOrders || []}
            currency={currency}
            loading={loadingAnalytics && !analytics}
            storeId={activeStoreId!}
          />
        </section>
      )}

      {/* ── Funnel mini ─────────────────────────────────────── */}
      {activeStore && analytics && (
        <FunnelStrip funnel={analytics.funnel} pageViews={analytics.kpis.pageViews.value} />
      )}

      {/* ── Payment methods breakdown ─────────────────────────
            Data was already computed but never rendered. Utile pour
            décider où pousser (Wave / Orange / COD / Stripe). ── */}
      {activeStore && analytics && (
        <PaymentBreakdownCard
          items={analytics.paymentBreakdown}
          currency={currency}
        />
      )}

      {/* ── Traffic sources + sales by hour ───────────────────
            Deux blocs "d'où viennent tes clients" + "à quelle
            heure ils achètent" — indispensables pour cibler la pub. ── */}
      {activeStore && analytics && (
        <section className="grid gap-4 lg:grid-cols-2">
          <TrafficSourcesCard items={analytics.trafficSources} />
          <SalesByHourCard items={analytics.hourlySales} currency={currency} />
        </section>
      )}

      {/* ── Visiteurs par appareil (mobile vs desktop/web) ──── */}
      {activeStore && analytics && (
        <section className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Visiteurs par appareil</h2>
          </div>
          {(() => {
            const d = analytics.devices ?? { mobile: 0, desktop: 0, unknown: 0 };
            const detected = d.mobile + d.desktop;
            if (detected === 0) {
              return (
                <p className="text-xs text-muted-foreground">
                  Pas encore de donnée appareil — les visites seront classées mobile / desktop dès le prochain trafic
                  {d.unknown ? ` (${d.unknown} visite(s) enregistrée(s) avant l’activation de la mesure)` : ''}.
                </p>
              );
            }
            const mPct = Math.round((d.mobile / detected) * 100);
            const dPct = 100 - mPct;
            return (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Smartphone className="h-4 w-4 text-emerald-600" /> Mobile
                    </div>
                    <div className="mt-1 text-2xl font-bold tabular-nums">{d.mobile}</div>
                    <div className="text-[11px] text-muted-foreground">{mPct}% des visiteurs</div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Monitor className="h-4 w-4 text-indigo-600" /> Desktop / Web
                    </div>
                    <div className="mt-1 text-2xl font-bold tabular-nums">{d.desktop}</div>
                    <div className="text-[11px] text-muted-foreground">{dPct}% des visiteurs</div>
                  </div>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="bg-emerald-500" style={{ width: `${mPct}%` }} />
                  <div className="bg-indigo-500" style={{ width: `${dPct}%` }} />
                </div>
                {d.unknown > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    + {d.unknown} non détecté(s) (visites antérieures à la mesure).
                  </p>
                )}
              </>
            );
          })()}
        </section>
      )}

      {/* ── Stores list (slim) ──────────────────────────────── */}
      {stores.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div>
              <h2 className="text-sm font-bold">Mes boutiques</h2>
              <p className="text-[11px] text-muted-foreground">{stores.length} boutique{stores.length > 1 ? 's' : ''} au total · clique pour basculer</p>
            </div>
            <Link href="/dashboard/stores">
              <Button variant="ghost" size="sm" className="gap-1 rounded-lg text-xs">
                Voir tout
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <ul className="divide-y divide-border/60">
            {stores.slice(0, 5).map((s) => {
              const isDigital = s.storeType === 'digital';
              const TypeIcon = isDigital ? Cloud : Package;
              const isActive = s._id === activeStoreId;
              return (
                <li key={s._id}>
                  <button
                    type="button"
                    onClick={() => setCurrentStore(s._id)}
                    className={cn(
                      'group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors',
                      isActive ? 'bg-primary/5' : 'hover:bg-muted/40'
                    )}
                  >
                    <div
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm',
                        isDigital ? 'from-fuchsia-500 to-pink-600' : 'from-indigo-500 to-violet-600'
                      )}
                    >
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {s.name}
                        {isActive && (
                          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">/{s.slug} · {isDigital ? 'Digital' : 'Physique'}</div>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        s.isPublished ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
                      )}
                    >
                      {s.isPublished ? 'Live' : 'Brouillon'}
                    </span>
                    <Link
                      href={`/dashboard/stores/${s._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Configurer"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// KPI card with delta-vs-previous indicator
// ─────────────────────────────────────────────────────────────────────

const KPI_TONE: Record<
  'emerald' | 'amber' | 'violet' | 'indigo' | 'rose',
  { iconBg: string; glow: string }
> = {
  emerald: { iconBg: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/20' },
  amber:   { iconBg: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/20' },
  violet:  { iconBg: 'from-violet-500 to-fuchsia-600', glow: 'shadow-violet-500/20' },
  indigo:  { iconBg: 'from-indigo-500 to-blue-600', glow: 'shadow-indigo-500/20' },
  rose:    { iconBg: 'from-rose-500 to-pink-600', glow: 'shadow-rose-500/20' },
};

/** Money figure for a KPI headline: renders the currency symbol/code at a
 *  smaller size than the digits, and drops the cents — so the amount stays
 *  readable in the 4-up grid on a phone, even with 3-letter codes (TND, DZD,
 *  XOF) that are wider than a "$" or "€" symbol. */
function KpiMoney({ amount, currency }: { amount: number; currency: string }) {
  let parts: Intl.NumberFormatPart[];
  try {
    parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).formatToParts(amount);
  } catch {
    // Unknown currency code — Intl throws; fall back to a plain join.
    return <>{`${Math.round(amount)} ${currency}`}</>;
  }
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'currency' ? (
          <span key={i} className="align-baseline text-[0.62em] font-bold text-muted-foreground sm:text-[0.7em]">
            {p.value}
          </span>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </>
  );
}

function KpiCard({
  label, value, deltaPct, previousValue, icon: Icon, tone, loading,
}: {
  label: string;
  value: ReactNode;
  deltaPct: number | null;
  previousValue: string;
  icon: typeof Wallet;
  tone: keyof typeof KPI_TONE;
  loading?: boolean;
}) {
  const t = KPI_TONE[tone];
  const positive = typeof deltaPct === 'number' && deltaPct > 0;
  const negative = typeof deltaPct === 'number' && deltaPct < 0;
  const TrendIcon = positive ? TrendingUp : negative ? TrendingDown : Activity;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md sm:rounded-2xl sm:p-4">
      {/* Mobile: icon on top, value below — keeps the card narrow enough
          for 4 to fit on a 375px phone. Desktop: classic side-by-side. */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm sm:order-2 sm:h-10 sm:w-10 sm:rounded-xl',
            t.iconBg,
            t.glow
          )}
        >
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
        <div className="min-w-0 sm:order-1">
          <div className="truncate text-[9px] font-bold uppercase tracking-wider text-muted-foreground sm:text-[10px]">
            {label}
          </div>
          <div className="mt-0.5 truncate text-base font-extrabold tracking-tight sm:mt-1.5 sm:text-2xl">
            {loading ? <span className="inline-block h-5 w-14 animate-pulse rounded bg-muted sm:h-6 sm:w-20" /> : value}
          </div>
          {!loading && deltaPct !== null && (
            <div className="mt-0.5 flex items-center gap-1 sm:mt-1 sm:gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[9px] font-semibold sm:px-1.5 sm:text-[11px]',
                  positive ? 'bg-emerald-500/10 text-emerald-700' : negative ? 'bg-rose-500/10 text-rose-700' : 'bg-muted text-muted-foreground'
                )}
              >
                <TrendIcon className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                {positive ? '+' : ''}{deltaPct.toFixed(0)}%
              </span>
              {/* "vs prev" only shown on tablet+ where there's room */}
              <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
                vs {previousValue}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Action panel — what the seller needs to handle right now
// ─────────────────────────────────────────────────────────────────────

function ActionPanel({
  storeId, pendingOrders, abandonedCount, lowStockCount, lowStockItems, totalActions,
}: {
  storeId: string;
  pendingOrders: number;
  abandonedCount: number;
  lowStockCount: number;
  lowStockItems: ProductLite[];
  totalActions: number;
}) {
  const allClear = totalActions === 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-br from-amber-500/5 to-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn(
            'grid h-7 w-7 place-items-center rounded-lg text-white shadow-sm',
            allClear ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-amber-500 to-orange-600'
          )}>
            {allClear ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          </span>
          <div>
            <h3 className="text-sm font-bold">À traiter</h3>
            <p className="text-[10px] text-muted-foreground">
              {allClear ? 'Tout est sous contrôle 🎉' : `${totalActions} action${totalActions > 1 ? 's' : ''} prioritaire${totalActions > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        <ActionRow
          icon={Truck}
          tone="amber"
          label="Commandes à expédier"
          count={pendingOrders}
          href={`/dashboard/orders?storeId=${storeId}&status=pending`}
          hint={pendingOrders ? 'Confirme + envoie chez le coursier' : 'Aucune commande en attente'}
        />
        <ActionRow
          icon={ShoppingBag}
          tone="rose"
          label="Paniers abandonnés"
          count={abandonedCount}
          href={`/dashboard/stores/${storeId}?block=abandoned`}
          hint={abandonedCount ? 'Relance par WhatsApp' : 'Aucun lead à relancer'}
        />
        <ActionRow
          icon={Package}
          tone="violet"
          label="Stock faible"
          count={lowStockCount}
          href={`/dashboard/products?storeId=${storeId}`}
          hint={lowStockCount ? `${lowStockItems.map((p) => p.name).join(', ').slice(0, 60)}${lowStockItems.length < lowStockCount ? '…' : ''}` : 'Aucun produit en stock faible'}
        />
      </div>
    </div>
  );
}

const ACTION_TONE: Record<'amber' | 'rose' | 'violet', string> = {
  amber:  'bg-amber-500/10 text-amber-700',
  rose:   'bg-rose-500/10 text-rose-700',
  violet: 'bg-violet-500/10 text-violet-700',
};

function ActionRow({
  icon: Icon, tone, label, count, href, hint,
}: {
  icon: typeof Truck;
  tone: keyof typeof ACTION_TONE;
  label: string;
  count: number;
  href: string;
  hint: string;
}) {
  const has = count > 0;
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 transition-colors',
        has ? 'hover:bg-muted/40' : 'opacity-60 hover:opacity-80'
      )}
    >
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', ACTION_TONE[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          {has && (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', ACTION_TONE[tone])}>
              {count}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Inline revenue chart — pure SVG sparkline, no chart lib
// ─────────────────────────────────────────────────────────────────────

function RevenueChart({
  timeseries, currency, loading,
}: {
  timeseries: Array<{ date: string; revenue: number; sales: number; orders: number; paid: number }>;
  currency: string;
  loading?: boolean;
}) {
  // On trace `sales` (valeur de TOUTES les commandes), pas `revenue` (payé) :
  // en COD le payé reste ~0 jusqu'à livraison → la courbe paraissait vide et
  // ne bougeait pas. `sales` est aligné sur le KPI « Revenu total ».
  const data = timeseries.length > 0 ? timeseries : [];
  const totalOrders = data.reduce((a, d) => a + d.orders, 0);
  const maxRev = Math.max(1, ...data.map((d) => d.sales));
  const totalRev = data.reduce((a, d) => a + d.sales, 0);
  const w = 480, h = 100;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => ({
    x: i * stepX,
    y: h - (d.sales / maxRev) * (h - 8) - 4,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${w.toFixed(1)} ${h} L 0 ${h} Z`;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold">Revenu sur la période</h3>
          <p className="text-[10px] text-muted-foreground">
            {loading ? 'Chargement…' : `${formatCurrency(totalRev, currency)} · ${totalOrders} commande${totalOrders > 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/dashboard/analytics">
          <Button variant="ghost" size="sm" className="gap-1 rounded-lg text-xs">
            Analytics détaillés
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
      <div className="bg-gradient-to-br from-primary/[0.02] to-transparent p-4">
        {data.length === 0 || totalOrders === 0 ? (
          <div className="grid h-[100px] place-items-center text-xs text-muted-foreground">
            Aucune commande sur cette période.
          </div>
        ) : (
          <svg viewBox={`0 0 ${w} ${h}`} className="h-[100px] w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" className="text-primary" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-primary" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#revenueGradient)" />
            <path d={linePath} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="text-primary" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="currentColor" className="text-primary" />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Top products
// ─────────────────────────────────────────────────────────────────────

function TopProductsCard({
  items, currency, loading, storeId,
}: {
  items: StoreAnalyticsRich['topProducts'];
  currency: string;
  loading?: boolean;
  storeId: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold">Top produits</h3>
          <p className="text-[10px] text-muted-foreground">Les meilleures ventes sur la période</p>
        </div>
        <Link href={`/dashboard/products?storeId=${storeId}`}>
          <Button variant="ghost" size="sm" className="gap-1 rounded-lg text-xs">
            Voir tout
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
      {loading ? (
        <ul className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-2 w-1/3 animate-pulse rounded bg-muted/70" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Aucune vente pour le moment.
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.slice(0, 5).map((p, i) => (
            <li key={p.productId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-amber-500/15 to-orange-500/10 text-[10px] font-bold text-amber-700">
                {i + 1}
              </span>
              {p.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">{p.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {p.unitsSold} vendu{p.unitsSold > 1 ? 's' : ''}
                </div>
              </div>
              <div className="text-xs font-bold text-primary tabular-nums">
                {formatCurrency(p.revenue, currency)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Recent orders
// ─────────────────────────────────────────────────────────────────────

const PAYMENT_BADGE: Record<string, string> = {
  paid:    'bg-emerald-500/10 text-emerald-700',
  pending: 'bg-amber-500/10 text-amber-700',
  refunded: 'bg-rose-500/10 text-rose-700',
  failed: 'bg-rose-500/10 text-rose-700',
  cancelled: 'bg-muted text-muted-foreground',
  manual: 'bg-indigo-500/10 text-indigo-700',
};

const PAYMENT_LABEL_FR: Record<string, string> = {
  paid: 'payé',
  pending: 'en attente',
  refunded: 'remboursé',
  failed: 'échoué',
  cancelled: 'annulé',
  manual: 'manuel',
};

function RecentOrdersCard({
  items, currency, loading, storeId,
}: {
  items: StoreAnalyticsRich['recentOrders'];
  currency: string;
  loading?: boolean;
  storeId: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold">Commandes récentes</h3>
          <p className="text-[10px] text-muted-foreground">Les 5 dernières — clique pour gérer</p>
        </div>
        <Link href={`/dashboard/orders?storeId=${storeId}`}>
          <Button variant="ghost" size="sm" className="gap-1 rounded-lg text-xs">
            Voir tout
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
      {loading ? (
        <ul className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-2 w-1/3 animate-pulse rounded bg-muted/70" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Pas encore de commande. Lance ta première vente !
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.slice(0, 5).map((o) => (
            <li key={o.id}>
              <Link
                href={`/dashboard/orders/${o.id}?storeId=${storeId}`}
                className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/10 to-fuchsia-500/10 text-primary">
                  <Receipt className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold">{o.customer || 'Client'}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                        PAYMENT_BADGE[o.paymentStatus] || 'bg-muted text-muted-foreground'
                      )}
                    >
                      {PAYMENT_LABEL_FR[o.paymentStatus] || o.paymentStatus}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {o.orderNumber} · {new Date(o.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="text-xs font-bold tabular-nums">
                  {formatCurrency(o.total, o.currency || currency)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Funnel strip — visites → commandes → payées → expédiées
// ─────────────────────────────────────────────────────────────────────

function FunnelStrip({
  funnel, pageViews,
}: {
  funnel: StoreAnalyticsRich['funnel'];
  pageViews: number;
}) {
  const steps = [
    { label: 'Visites', value: pageViews, tone: 'from-indigo-500 to-blue-600' },
    { label: 'Commandes créées', value: funnel.created, tone: 'from-amber-500 to-orange-600' },
    { label: 'Commandes payées', value: funnel.paid, tone: 'from-emerald-500 to-teal-600' },
    { label: 'Expédiées', value: funnel.fulfilled, tone: 'from-violet-500 to-fuchsia-600' },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">Entonnoir de conversion</h3>
          <p className="text-[10px] text-muted-foreground">Du visiteur à la commande expédiée</p>
        </div>
        <Link href="/dashboard/tracking">
          <Button variant="ghost" size="sm" className="gap-1 rounded-lg text-xs">
            Tracking détaillé
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {steps.map((s, i) => {
          const pct = (s.value / max) * 100;
          const conversionFromPrev = i > 0 && steps[i - 1].value > 0
            ? (s.value / steps[i - 1].value) * 100
            : null;
          return (
            <div key={s.label} className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</span>
                {conversionFromPrev !== null && (
                  <span className="text-[9px] font-semibold text-muted-foreground">
                    {conversionFromPrev.toFixed(0)}%
                  </span>
                )}
              </div>
              <div className="text-lg font-extrabold">{s.value}</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full bg-gradient-to-r transition-all', s.tone)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Monthly revenue goal — jauge de progression sur le mois courant.
// Le seller peut saisir/modifier son objectif inline (PATCH sur le
// store) sans changer de page.
// ─────────────────────────────────────────────────────────────────────

function MonthlyGoalCard({
  store, goal, currency, onSaved,
}: {
  store: StoreType;
  goal?: { target: number; current: number; progressPct: number; daysLeft: number };
  currency: string;
  onSaved: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(String(store.goals?.monthlyRevenue ?? ''));
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return;
    setSaving(true);
    try {
      await storesApi.update(store._id, {
        goals: { monthlyRevenue: num > 0 ? num : undefined },
      });
      await onSaved();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // Pas d'objectif fixé → carte d'incitation, pas de jauge.
  if (!goal) {
    return (
      <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-fuchsia-500/5 to-card p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-sm">
            <Target className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold">Fixe-toi un objectif</h3>
            <p className="text-[11px] text-muted-foreground">
              Un chiffre d&apos;affaires cible sur le mois pour te motiver et mesurer ta progression.
            </p>
          </div>
        </div>
        {editing ? (
          <GoalInput value={value} onChange={setValue} onSave={save} onCancel={() => setEditing(false)} saving={saving} currency={currency} />
        ) : (
          <Button size="sm" className="mt-3 w-full gap-1.5 gradient-brand text-white" onClick={() => setEditing(true)}>
            <Target className="h-3.5 w-3.5" />
            Définir mon objectif
          </Button>
        )}
      </div>
    );
  }

  const pct = Math.min(200, goal.progressPct);
  const clampedPct = Math.min(100, pct);
  const reached = goal.progressPct >= 100;
  const dailyRequired = goal.daysLeft > 0 ? Math.max(0, goal.target - goal.current) / goal.daysLeft : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-sm',
          reached ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-primary to-fuchsia-600'
        )}>
          <Target className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold">Objectif du mois</h3>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Modifier l'objectif"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {reached
              ? `🎉 Objectif atteint (${pct.toFixed(0)}%)`
              : `${goal.daysLeft} jour${goal.daysLeft > 1 ? 's' : ''} restant${goal.daysLeft > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <GoalInput value={value} onChange={setValue} onSave={save} onCancel={() => setEditing(false)} saving={saving} currency={currency} />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-extrabold tracking-tight">
              {formatCurrency(goal.current, currency)}
            </span>
            <span className="text-xs text-muted-foreground">
              / {formatCurrency(goal.target, currency)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full bg-gradient-to-r transition-all',
                reached ? 'from-emerald-500 to-teal-600' : 'from-primary to-fuchsia-600'
              )}
              style={{ width: `${clampedPct}%` }}
            />
          </div>
          {!reached && dailyRequired > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              À rythme : <span className="font-semibold text-foreground">{formatCurrency(dailyRequired, currency)}</span> / jour pour finir dans les temps.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function GoalInput({
  value, onChange, onSave, onCancel, saving, currency,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  currency: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          placeholder="0"
          autoFocus
          className="h-9 w-full rounded-md border border-input bg-background pl-3 pr-12 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">
          {currency}
        </span>
      </div>
      <Button size="sm" onClick={onSave} disabled={saving} className="h-9 gap-1.5">
        {saving ? <Activity className="h-3.5 w-3.5 animate-pulse" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        OK
      </Button>
      <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
        Annuler
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COD funnel — spécifique dropshipping MENA / Afrique de l'Ouest :
// commande créée → appel confirmé → livrée. Les 2 taux clés à suivre.
// ─────────────────────────────────────────────────────────────────────

function CodFunnelCard({
  confirmationRate, deliveryRate, created, paid, fulfilled,
}: {
  confirmationRate: number;
  deliveryRate: number;
  created: number;
  paid: number;
  fulfilled: number;
}) {
  const confirmationTone = confirmationRate >= 50 ? 'emerald' : confirmationRate >= 30 ? 'amber' : 'rose';
  const deliveryTone = deliveryRate >= 70 ? 'emerald' : deliveryRate >= 50 ? 'amber' : 'rose';

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">Suivi cash-on-delivery</h3>
          <p className="text-[10px] text-muted-foreground">
            Les 2 taux qui décident si tu peux scaler la pub
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CodStat
          icon={PhoneCall}
          label="Taux de confirmation"
          value={`${confirmationRate.toFixed(0)}%`}
          hint={`${paid + fulfilled >= created ? created : paid + fulfilled} confirmées / ${created} créées`}
          tone={confirmationTone}
          benchmark="≥ 50% = OK"
        />
        <CodStat
          icon={PackageCheck}
          label="Taux de livraison"
          value={`${deliveryRate.toFixed(0)}%`}
          hint={`${fulfilled} livrées / ${paid + fulfilled >= created ? created : paid + fulfilled} confirmées`}
          tone={deliveryTone}
          benchmark="≥ 70% = OK"
        />
      </div>
    </div>
  );
}

const COD_TONE: Record<'emerald' | 'amber' | 'rose', { bg: string; text: string; bar: string }> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-700', bar: 'from-emerald-500 to-teal-600' },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-700',   bar: 'from-amber-500 to-orange-600' },
  rose:    { bg: 'bg-rose-500/10',    text: 'text-rose-700',    bar: 'from-rose-500 to-pink-600' },
};

function CodStat({
  icon: Icon, label, value, hint, tone, benchmark,
}: {
  icon: typeof PhoneCall;
  label: string;
  value: string;
  hint: string;
  tone: keyof typeof COD_TONE;
  benchmark: string;
}) {
  const t = COD_TONE[tone];
  const pct = Math.min(100, parseFloat(value));
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5">
        <span className={cn('grid h-6 w-6 place-items-center rounded-md', t.bg, t.text)}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className={cn('text-2xl font-extrabold tracking-tight', t.text)}>{value}</span>
        <span className={cn('text-[10px] font-semibold', t.text)}>{benchmark}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full bg-gradient-to-r transition-all', t.bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Draft banner — the store isn't published, alert the seller loudly
// so they don't wonder why their dashboard is empty.
// ─────────────────────────────────────────────────────────────────────

function DraftBanner({ storeId, storeName }: { storeId: string; storeName: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">
            <span className="text-amber-900 dark:text-amber-300">{storeName}</span> n&apos;est pas encore en ligne
          </div>
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            Tes visiteurs ne peuvent pas encore commander. Publie-la pour commencer à vendre.
          </p>
        </div>
        <Link href={`/dashboard/stores/${storeId}`}>
          <Button size="sm" className="h-9 gap-1.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm hover:from-amber-600 hover:to-orange-700">
            <Rocket className="h-3.5 w-3.5" />
            Publier maintenant
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Quality strip — 4 stats "santé business" (encaissé + qualité)
// Data déjà calculée dans analytics.service, on l'expose enfin.
// ─────────────────────────────────────────────────────────────────────

function QualityStrip({
  revenue, uniqueCustomers, fulfillmentRate, refundRate, currency,
}: {
  revenue: number;
  uniqueCustomers: number;
  fulfillmentRate: number;
  refundRate: number;
  currency: string;
}) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <MiniStat
        icon={Banknote}
        label="Revenu encaissé"
        value={formatCurrency(revenue, currency)}
        tone="emerald"
        hint="Commandes payées seulement"
      />
      <MiniStat
        icon={Users}
        label="Clients uniques"
        value={String(uniqueCustomers)}
        tone="indigo"
        hint="Emails distincts"
      />
      <MiniStat
        icon={Truck}
        label="Taux d'expédition"
        value={`${fulfillmentRate.toFixed(0)}%`}
        tone="violet"
        hint="Payées → expédiées"
      />
      <MiniStat
        icon={XCircle}
        label="Taux de remb."
        value={`${refundRate.toFixed(1)}%`}
        tone={refundRate > 5 ? 'rose' : 'muted'}
        hint="Remboursées / payées"
      />
    </section>
  );
}

const MINI_TONE: Record<'emerald' | 'indigo' | 'violet' | 'rose' | 'muted', { icon: string; ring: string }> = {
  emerald: { icon: 'text-emerald-600',  ring: 'ring-emerald-500/20' },
  indigo:  { icon: 'text-indigo-600',   ring: 'ring-indigo-500/20' },
  violet:  { icon: 'text-violet-600',   ring: 'ring-violet-500/20' },
  rose:    { icon: 'text-rose-600',     ring: 'ring-rose-500/20' },
  muted:   { icon: 'text-muted-foreground', ring: 'ring-border/40' },
};

function MiniStat({
  icon: Icon, label, value, tone, hint,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  tone: keyof typeof MINI_TONE;
  hint?: string;
}) {
  const t = MINI_TONE[tone];
  return (
    <div className={cn('rounded-xl border border-border/60 bg-card p-3 ring-1', t.ring)}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', t.icon)} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1 truncate text-lg font-extrabold tracking-tight sm:text-xl">
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Payment breakdown — la répartition des méthodes de paiement,
// classée par CA. Donne au seller un signal direct sur où pousser.
// ─────────────────────────────────────────────────────────────────────

/** Convertit une clé provider brute ('wave', 'orange_money', 'cinetpay'…)
 *  en libellé humain FR. Fallback = la clé, avec la 1re lettre en majuscule. */
function providerLabel(raw: string): string {
  const key = (raw || 'unknown').toLowerCase();
  const map: Record<string, string> = {
    wave: 'Wave',
    orange_money: 'Orange Money',
    mtn_momo: 'MTN Mobile Money',
    moov_money: 'Moov Money',
    cinetpay: 'CinetPay',
    paydunya: 'PayDunya',
    flutterwave: 'Flutterwave',
    stripe: 'Stripe',
    cod: 'Paiement à la livraison',
    manual: 'Virement / manuel',
    unknown: 'Non identifié',
  };
  return map[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function PaymentBreakdownCard({
  items, currency,
}: {
  items: StoreAnalyticsRich['paymentBreakdown'];
  currency: string;
}) {
  const totalRev = items.reduce((a, x) => a + x.revenue, 0);
  const totalOrd = items.reduce((a, x) => a + x.orders, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold">Moyens de paiement</h3>
            <p className="text-[10px] text-muted-foreground">
              {totalOrd > 0
                ? `${totalOrd} paiement${totalOrd > 1 ? 's' : ''} · ${formatCurrency(totalRev, currency)}`
                : 'Aucun paiement sur la période'}
            </p>
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Aucun paiement encaissé pour l&apos;instant.
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((row) => {
            const pct = totalRev > 0 ? (row.revenue / totalRev) * 100 : 0;
            return (
              <li key={row.provider} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{providerLabel(row.provider)}</span>
                  <span className="text-xs font-bold tabular-nums">
                    {formatCurrency(row.revenue, currency)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-fuchsia-600"
                      style={{ width: `${pct.toFixed(1)}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                    {row.orders} · {pct.toFixed(0)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Traffic sources — d'où viennent les visiteurs (utm_source ou Referer,
// classé côté serveur à l'ingestion).
// ─────────────────────────────────────────────────────────────────────

const SOURCE_LABEL_FR: Record<string, string> = {
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

const SOURCE_ACCENT: Record<string, string> = {
  facebook:  'from-blue-500 to-indigo-600',
  instagram: 'from-pink-500 to-rose-600',
  tiktok:    'from-zinc-800 to-zinc-950',
  google:    'from-red-500 to-orange-600',
  youtube:   'from-red-600 to-rose-700',
  twitter:   'from-sky-500 to-blue-600',
  snapchat:  'from-yellow-400 to-amber-500',
  whatsapp:  'from-emerald-500 to-green-600',
  direct:    'from-slate-500 to-slate-700',
  other:     'from-violet-500 to-purple-600',
  unknown:   'from-muted-foreground to-muted-foreground',
};

function TrafficSourcesCard({ items }: { items: StoreAnalyticsRich['trafficSources'] }) {
  const total = items.reduce((a, r) => a + r.visitors, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold">Sources de trafic</h3>
            <p className="text-[10px] text-muted-foreground">
              {total > 0
                ? `${total} visiteur${total > 1 ? 's' : ''} classé${total > 1 ? 's' : ''} sur la période`
                : 'Aucun visiteur classé pour l\'instant'}
            </p>
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Ajoute <code className="rounded bg-muted px-1 py-0.5 text-[10px]">?utm_source=facebook</code> à tes liens pub
          pour voir tes visiteurs classés ici.
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((row) => {
            const pct = total > 0 ? (row.visitors / total) * 100 : 0;
            const label = SOURCE_LABEL_FR[row.source] || row.source;
            const accent = SOURCE_ACCENT[row.source] || SOURCE_ACCENT.other;
            return (
              <li key={row.source} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn('h-6 w-6 shrink-0 rounded-md bg-gradient-to-br', accent)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-semibold">{label}</span>
                    <span className="text-xs font-bold tabular-nums">{row.visitors}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full bg-gradient-to-r', accent)} style={{ width: `${pct.toFixed(1)}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sales by hour — barres verticales 0..23 (UTC). Dit au seller à quelle
// heure il faut booster la pub Meta / TikTok.
// ─────────────────────────────────────────────────────────────────────

function SalesByHourCard({
  items, currency,
}: {
  items: StoreAnalyticsRich['hourlySales'];
  currency: string;
}) {
  const totalOrders = items.reduce((a, r) => a + r.orders, 0);
  const maxOrders = Math.max(1, ...items.map((r) => r.orders));
  const peak = items.reduce((best, r) => (r.orders > best.orders ? r : best), items[0] || { hour: 0, orders: 0, sales: 0 });

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold">Ventes par heure</h3>
            <p className="text-[10px] text-muted-foreground">
              {totalOrders > 0
                ? `Pic à ${String(peak.hour).padStart(2, '0')}h — ${peak.orders} commande${peak.orders > 1 ? 's' : ''}`
                : 'Pas encore de commande sur la période'}
            </p>
          </div>
        </div>
      </div>
      <div className="p-4">
        {totalOrders === 0 ? (
          <div className="grid h-[120px] place-items-center text-xs text-muted-foreground">
            Aucune commande à segmenter.
          </div>
        ) : (
          <>
            <div className="flex h-[120px] items-end gap-[3px]">
              {items.map((row) => {
                const h = maxOrders > 0 ? (row.orders / maxOrders) * 100 : 0;
                const isPeak = row.orders === peak.orders && row.orders > 0;
                return (
                  <div
                    key={row.hour}
                    className="group relative flex-1"
                    title={`${String(row.hour).padStart(2, '0')}h — ${row.orders} commande${row.orders > 1 ? 's' : ''} · ${formatCurrency(row.sales, currency)}`}
                  >
                    <div
                      className={cn(
                        'w-full rounded-t transition-all',
                        isPeak
                          ? 'bg-gradient-to-t from-primary to-fuchsia-500'
                          : 'bg-gradient-to-t from-primary/40 to-primary/70'
                      )}
                      style={{ height: `${Math.max(2, h)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[9px] font-semibold text-muted-foreground">
              <span>0h</span>
              <span>6h</span>
              <span>12h</span>
              <span>18h</span>
              <span>23h</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state — no stores yet
// ─────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-border/60 bg-gradient-to-br from-card to-muted/30 p-12 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl gradient-brand text-white shadow-lg shadow-primary/30">
        <Store className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-xl font-bold">Lance ta première boutique</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        En 3 minutes : choisis un type, un thème, ajoute tes produits et tu peux commencer à vendre.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href="/dashboard/profile?create=1">
          <Button size="lg" className="gap-1.5 gradient-brand text-white shadow-md shadow-primary/25">
            <Plus className="h-4 w-4" />
            Créer une boutique
          </Button>
        </Link>
        <Link href="/dashboard/pages">
          <Button variant="outline" size="lg" className="gap-1.5">
            <Sparkles className="h-4 w-4 text-fuchsia-500" />
            Générer avec l&apos;IA
          </Button>
        </Link>
      </div>
    </div>
  );
}
