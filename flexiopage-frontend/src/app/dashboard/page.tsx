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
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useStoreStore } from '@/stores/store-store';
import { storesApi } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import type { StoreAnalyticsRich, RangeKey } from '@/types/analytics';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/dashboard/page-header';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
  settings?: { currency?: string };
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
  custom: 'Personnalisé',
};

/** Preset chips shown on the overview — kept short on purpose. The seller
 *  reaches for longer windows (90j / 12m) via the "Personnaliser" picker. */
const QUICK_RANGES: ReadonlyArray<Exclude<RangeKey, 'custom' | '90d' | '12m'>> = ['today', 'yesterday', '7d', '30d'];

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

      {/* ── KPI cards (4) — 2 colonnes en mobile pour que les chiffres
            restent lisibles, 4 colonnes à partir de sm: pour scanner
            l'ensemble d'un coup d'œil. ── */}
      {activeStore && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <KpiCard
            label="Revenu total"
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
            previousValue={`${k?.orders.previous ?? 0} avant`}
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
            label="Visiteurs"
            value={String(k?.pageViews.value ?? 0)}
            deltaPct={k?.pageViews.deltaPct ?? null}
            previousValue={`${k?.pageViews.previous ?? 0} avant`}
            icon={Eye}
            tone="indigo"
            loading={loadingAnalytics && !analytics}
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

      {/* ── Stores list (slim) ──────────────────────────────── */}
      {stores.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div>
              <h2 className="text-sm font-bold">Mes boutiques</h2>
              <p className="text-[11px] text-muted-foreground">{stores.length} boutique{stores.length > 1 ? 's' : ''} au total · clique pour basculer</p>
            </div>
            <Link href="/dashboard/profile#stores">
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
  'emerald' | 'amber' | 'violet' | 'indigo',
  { iconBg: string; glow: string }
> = {
  emerald: { iconBg: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/20' },
  amber:   { iconBg: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/20' },
  violet:  { iconBg: 'from-violet-500 to-fuchsia-600', glow: 'shadow-violet-500/20' },
  indigo:  { iconBg: 'from-indigo-500 to-blue-600', glow: 'shadow-indigo-500/20' },
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
          href={`/dashboard/stores/${storeId}/abandoned-carts`}
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
  timeseries: Array<{ date: string; revenue: number; orders: number; paid: number }>;
  currency: string;
  loading?: boolean;
}) {
  const data = timeseries.length > 0 ? timeseries : [];
  const maxRev = Math.max(1, ...data.map((d) => d.revenue));
  const totalRev = data.reduce((a, d) => a + d.revenue, 0);
  const totalOrders = data.reduce((a, d) => a + d.orders, 0);
  const w = 480, h = 100;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => ({
    x: i * stepX,
    y: h - (d.revenue / maxRev) * (h - 8) - 4,
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
        {data.length === 0 ? (
          <div className="grid h-[100px] place-items-center text-xs text-muted-foreground">
            Pas encore de données — passe ta 1<sup>re</sup> commande pour voir le graphique.
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
                      {o.paymentStatus}
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
