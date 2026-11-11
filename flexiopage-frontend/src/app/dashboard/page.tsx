'use client';

/**
 * Vue d'ensemble vendeur. Quatre zones, dans cet ordre sur desktop :
 *
 *   1. Bandeau du jour — ventes, commandes, file d'appels, encaissé
 *   2. À faire maintenant — rappels, confirmation, expédition, relances
 *   3. Courbe des ventes, globe live, objectif du mois, santé COD
 *   4. Top produits et dernières commandes
 *
 * Sur mobile les actions passent avant les chiffres, et la courbe est repliée.
 * Trafic, appareils, ventes par heure et moyens de paiement vivent sur Analytics.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AutoFitValue } from '@/components/dashboard/auto-fit-value';
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
  ShoppingBag,
  Truck,
  Wallet,
  Receipt,
  Activity,
  Settings as SettingsIcon,
  RefreshCw,
  CheckCircle2,
  CalendarRange,
  Check,
  ChevronDown,
  Phone,
  Rocket,
  Banknote,
  Target,
  PhoneCall,
  Pencil,
  Globe2,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { readPersistedUser, useAuthStore } from '@/stores/auth-store';
import { useStoreStore } from '@/stores/store-store';
import { storesApi } from '@/lib/api';
import { formatCurrency, cn, mediaUrl, formatYmdLabel } from '@/lib/utils';
import { timezoneLabel } from '@/lib/store-timezone';
import { CANCEL_REASON_LABELS, type StoreAnalyticsRich, type RangeKey } from '@/types/analytics';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/dashboard/page-header';
import { EarningsWidget } from '@/components/dashboard/earnings-widget';
import { LiveGlobe } from '@/components/dashboard/live-globe';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
  settings?: { currency?: string; timezone?: string; country?: string };
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

/** Presets listed in the overview period menu. Custom dates sit under the list. */
const MENU_RANGES: ReadonlyArray<Exclude<RangeKey, 'custom'>> = [
  'today',
  'yesterday',
  '7d',
  '30d',
  '90d',
  '12m',
  'all',
];

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
  const liveUser = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const user = liveUser ?? (mounted ? readPersistedUser() : null);
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);

  const [stores, setStores] = useState<StoreType[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [range, setRange] = useState<RangeKey>('today');
  const [analytics, setAnalytics] = useState<StoreAnalyticsRich | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<string>(() => daysAgoISO(13));
  const [draftTo, setDraftTo] = useState<string>(() => todayISO());
  const menuRef = useRef<HTMLDivElement>(null);

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
  const loadActiveStoreData = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!activeStoreId) {
      setAnalytics(null);
      setAnalyticsError(null);
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
      if (signal?.cancelled) return;
      if (analyticsRes) {
        setAnalytics(analyticsRes.data as StoreAnalyticsRich);
        setAnalyticsError(null);
      } else {
        setAnalytics(null);
        setAnalyticsError('Impossible de charger les stats. Vérifie ta connexion puis réessaie.');
      }
      const carts = (cartsRes.data as { carts: AbandonedCart[] }).carts || [];
      setAbandoned(carts.filter((c) => !c.recovered).length);
      const products = (productsRes.data as { products: ProductLite[] }).products || [];
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
      if (!signal?.cancelled) setLoadingAnalytics(false);
    }
  }, [activeStoreId, range, customFrom, customTo]);

  useEffect(() => {
    const signal = { cancelled: false };
    void loadActiveStoreData(signal);
    return () => { signal.cancelled = true; };
  }, [loadActiveStoreData, refreshKey]);

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
  const toConfirm = analytics?.queue?.toConfirm ?? 0;
  const toShip = analytics?.queue?.toShip ?? 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const rangeButtonLabel = range === 'custom'
    ? `${formatDateFR(customFrom)} → ${formatDateFR(customTo)}`
    : RANGE_LABELS[range];
  const draftInvalid = Boolean(draftFrom && draftTo && draftFrom > draftTo);

  const openRangeMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    setDraftFrom(customFrom);
    setDraftTo(customTo);
    setMenuOpen(true);
  };

  const applyCustomRange = () => {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    setCustomFrom(draftFrom);
    setCustomTo(draftTo);
    setRange('custom');
    setMenuOpen(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <PageHeader
        title={
          <>
            Bonjour <span className="gradient-brand-text">{firstName || 'à toi'}</span> 👋
          </>
        }
        description={
          activeStore ? (
            <span className="flex flex-wrap items-center gap-1.5">
              Vue d&apos;ensemble de{' '}
              <Link
                href={`/dashboard/stores/${activeStore.slug || activeStore._id}`}
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
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            {activeStore && (
              <Link href={`/dashboard/stores/${activeStore.slug || activeStore._id}`} className="min-w-0">
                <Button variant="outline" size="sm" className="h-9 w-full gap-1.5 rounded-xl sm:w-auto">
                  <SettingsIcon className="h-3.5 w-3.5" />
                  Configurer
                </Button>
              </Link>
            )}
            <Link href="/dashboard/profile?create=1" className="min-w-0">
              <Button size="sm" className="h-9 w-full gap-1.5 rounded-xl gradient-brand text-white shadow-md shadow-primary/25 sm:w-auto">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Nouvelle boutique</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Range selector + refresh ─────────────────────────── */}
      {activeStore && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={openRangeMenu}
              className="inline-flex h-9 max-w-full items-center gap-2 rounded-xl border border-border/60 bg-card px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/30"
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
            >
              <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{rangeButtonLabel}</span>
              <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200', menuOpen && 'rotate-180')} />
            </button>
            {menuOpen && (
              <div
                role="listbox"
                aria-label="Choisir une période"
                className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(16.5rem,calc(100vw-2rem))] rounded-xl border border-border/60 bg-card p-1.5 shadow-lg"
              >
                {MENU_RANGES.map((r) => {
                  const selected = range === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => { setRange(r); setMenuOpen(false); }}
                      className={cn(
                        'flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-sm transition-colors',
                        selected
                          ? 'bg-muted font-semibold text-foreground'
                          : 'text-foreground hover:bg-muted/60'
                      )}
                    >
                      {RANGE_LABELS[r]}
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  );
                })}
                <div className="mt-1.5 space-y-2 border-t border-border/60 px-1.5 pb-1 pt-2.5">
                  <label className="block text-[11px] font-semibold text-muted-foreground">
                    Du
                    <input
                      type="date"
                      value={draftFrom}
                      max={draftTo || todayISO()}
                      onChange={(e) => setDraftFrom(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-muted-foreground">
                    Au
                    <input
                      type="date"
                      value={draftTo}
                      min={draftFrom || undefined}
                      max={todayISO()}
                      onChange={(e) => setDraftTo(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  {draftInvalid && (
                    <p className="text-[11px] font-medium text-rose-700">La date de début est après la date de fin.</p>
                  )}
                  <button
                    type="button"
                    disabled={!draftFrom || !draftTo || draftInvalid}
                    onClick={applyCustomRange}
                    className="h-8 w-full rounded-md bg-gradient-to-br from-primary to-fuchsia-600 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeStore && (
              <Link
                href={`/dashboard/stores/${activeStore.slug || activeStore._id}?block=identity`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary/30 hover:text-foreground"
                title="Fuseau utilisé pour Aujourd’hui et les graphes"
              >
                <Globe2 className="h-3 w-3" />
                {timezoneLabel(analytics?.window.timezone || activeStore.settings?.timezone)}
              </Link>
            )}
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

      {activeStore && analyticsError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-800"
        >
          <span>{analyticsError}</span>
          <button
            type="button"
            onClick={() => setRefreshKey((n) => n + 1)}
            className="rounded-md border border-rose-500/30 bg-card px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-500/10"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ── No-store fallback ─────────────────────────────────── */}
      {!loadingStores && stores.length === 0 && <EmptyState />}

      {/* ── Draft banner — la #1 raison "mon dash est vide" ────
            Placé juste avant les KPIs pour être vu tout de suite. ── */}
      {activeStore && activeStore.isPublished === false && (
        <DraftBanner storeId={activeStore.slug || activeStore._id} storeName={activeStore.name} />
      )}

      {/* ── Bandeau du jour. Sur mobile, après la file d'actions. ── */}
      {activeStore && (
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <KpiCard
              label="Ventes"
              value={<KpiMoney amount={k?.sales.value ?? 0} currency={currency} />}
              deltaPct={k?.sales.deltaPct ?? null}
              previousValue={formatCurrency(k?.sales.previous ?? 0, currency)}
              icon={Wallet}
              tone="emerald"
              loading={loadingAnalytics && !analytics}
            />
            <KpiCard
              label="Commandes"
              value={(k?.orders.value ?? 0).toLocaleString('fr-FR')}
              deltaPct={k?.orders.deltaPct ?? null}
              previousValue={String(k?.orders.previous ?? 0)}
              icon={ShoppingCart}
              tone="amber"
              loading={loadingAnalytics && !analytics}
            />
            <div className="max-lg:hidden">
              <Link href={`/dashboard/orders?storeId=${activeStoreId}&confirmation=pending`} className="block h-full">
                <KpiCard
                  label="À confirmer"
                  value={toConfirm.toLocaleString('fr-FR')}
                  deltaPct={null}
                  previousValue=""
                  hint="File d'appels, hors période"
                  icon={PhoneCall}
                  tone="rose"
                  loading={loadingAnalytics && !analytics}
                />
              </Link>
            </div>
            <div className="max-lg:hidden">
              <KpiCard
                label="Encaissé"
                value={<KpiMoney amount={k?.revenue.value ?? 0} currency={currency} />}
                deltaPct={k?.revenue.deltaPct ?? null}
                previousValue={formatCurrency(k?.revenue.previous ?? 0, currency)}
                icon={Banknote}
                tone="indigo"
                loading={loadingAnalytics && !analytics}
              />
            </div>
          </section>

          {analytics && (
            <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground lg:flex">
              <span>Panier moyen <strong className="font-semibold text-foreground">{formatCurrency(k?.averageOrderValue.value ?? 0, currency)}</strong></span>
              <span>Vues <strong className="font-semibold text-foreground">{(k?.pageViews.value ?? 0).toLocaleString('fr-FR')}</strong></span>
              <span>Conversion <strong className="font-semibold text-foreground">{(k?.conversionRate.value ?? 0).toFixed(2)}%</strong></span>
              <Link href="/dashboard/analytics" className="font-semibold text-primary hover:underline">
                Analytics
              </Link>
            </div>
          )}

          <EarningsWidget />
        </div>
      )}

      {/* ── À faire maintenant — premier bloc sur mobile. ── */}
      {activeStore && (
        <div className="order-1 lg:order-2">
          <ActionQueue
            storeId={activeStoreId!}
            toConfirm={toConfirm}
            toShip={toShip}
            abandonedCount={abandoned}
            lowStockCount={lowStock.length}
            lowStockItems={lowStock.slice(0, 3)}
            unpaidCheckouts={analytics?.unpaidCheckouts ?? 0}
          />
        </div>
      )}

      {/* ── Courbe + objectif + santé COD. ── */}
      {activeStore && (
        <section className="order-3 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <RevenueChart
            timeseries={analytics?.timeseries || []}
            previousTimeseries={analytics?.previousTimeseries || []}
            range={range}
            currency={currency}
            loading={loadingAnalytics && !analytics}
          />
          <div className="flex min-w-0 flex-col gap-4">
            <LiveGlobe storeId={activeStoreId ?? null} fallbackCountry={activeStore.settings?.country} />
            {analytics && (
              <>
                <MonthlyGoalCard
                  store={activeStore}
                  goal={analytics.monthlyGoal}
                  currency={currency}
                  onSaved={loadActiveStoreData}
                />
                <PeriodHealthCard
                  confirmationRate={k?.codConfirmationRate.value ?? 0}
                  deliveryRate={k?.codDeliveryRate.value ?? 0}
                  created={analytics.funnel.created}
                  confirmed={analytics.funnel.confirmed}
                  delivered={analytics.funnel.delivered}
                  fulfilled={analytics.funnel.fulfilled}
                  reasons={analytics.cancelReasons || []}
                />
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Ce qui se vend. ── */}
      {activeStore && (
        <section className="order-3 grid min-w-0 gap-4 lg:order-4 lg:grid-cols-2">
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
  label, value, deltaPct, previousValue, icon: Icon, tone, loading, hint,
}: {
  label: string;
  value: ReactNode;
  deltaPct: number | null;
  previousValue: string;
  icon: typeof Wallet;
  tone: keyof typeof KPI_TONE;
  loading?: boolean;
  hint?: string;
}) {
  const t = KPI_TONE[tone];
  const positive = typeof deltaPct === 'number' && deltaPct > 0;
  const negative = typeof deltaPct === 'number' && deltaPct < 0;
  const TrendIcon = positive ? TrendingUp : negative ? TrendingDown : Activity;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-4">
      <div
        className={cn(
          'absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm',
          t.iconBg,
          t.glow
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 pe-10">
        <div className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
      <AutoFitValue className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">
        {loading ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-muted" /> : value}
      </AutoFitValue>
      {!loading && deltaPct !== null && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
              positive ? 'bg-emerald-500/10 text-emerald-700' : negative ? 'bg-rose-500/10 text-rose-700' : 'bg-muted text-muted-foreground'
            )}
          >
            <TrendIcon className="h-2.5 w-2.5" />
            {positive ? '+' : ''}{deltaPct.toFixed(0)}%
          </span>
          <span className="text-[11px] text-muted-foreground">
            vs {previousValue}
          </span>
        </div>
      )}
      {!loading && deltaPct === null && hint && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// À faire maintenant — une seule file, du plus urgent au moins urgent.
// Les lignes à zéro restent masquées pour que la liste ne soit que du travail.
// ─────────────────────────────────────────────────────────────────────

interface TodoCounts {
  callbacksOverdue: number;
  callbacksToday: number;
  noAnswers24h: number;
}

function ActionQueue({
  storeId, toConfirm, toShip, abandonedCount, lowStockCount, lowStockItems, unpaidCheckouts,
}: {
  storeId: string;
  toConfirm: number;
  toShip: number;
  abandonedCount: number;
  lowStockCount: number;
  lowStockItems: ProductLite[];
  unpaidCheckouts: number;
}) {
  const [todo, setTodo] = useState<TodoCounts | null>(null);
  const [todoLoaded, setTodoLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTodoLoaded(false);
    storesApi.listOrdersTodo(storeId)
      .then((res) => { if (!cancelled) setTodo(res.data.counts); })
      .catch(() => { if (!cancelled) setTodo(null); })
      .finally(() => { if (!cancelled) setTodoLoaded(true); });
    return () => { cancelled = true; };
  }, [storeId]);

  const callbacks = (todo?.callbacksToday ?? 0) + (todo?.noAnswers24h ?? 0);
  const callbackHref = (todo?.callbacksToday ?? 0) > 0
    ? `/dashboard/orders?storeId=${storeId}&confirmation=callback`
    : `/dashboard/orders?storeId=${storeId}&confirmation=no_answer`;
  const stockHint = lowStockItems.map((item) => item.name).join(', ');

  const rows: Array<{
    key: string;
    icon: typeof Phone;
    tone: keyof typeof ACTION_TONE;
    label: string;
    count: number;
    hint: string;
    href: string;
    action: string;
  }> = [
    {
      key: 'callbacks',
      icon: Phone,
      tone: 'rose',
      label: 'Rappels du jour',
      count: callbacks,
      hint: todo
        ? `${todo.callbacksOverdue} en retard · ${todo.noAnswers24h} sans réponse`
        : 'Callbacks et appels sans réponse',
      href: callbackHref,
      action: 'Appeler',
    },
    {
      key: 'confirm',
      icon: PhoneCall,
      tone: 'amber',
      label: 'À confirmer',
      count: toConfirm,
      hint: 'Commandes jamais appelées',
      href: `/dashboard/orders?storeId=${storeId}&confirmation=pending`,
      action: 'Confirmer',
    },
    {
      key: 'ship',
      icon: Truck,
      tone: 'indigo',
      label: 'À expédier',
      count: toShip,
      hint: 'Confirmées, pas encore livrées',
      href: `/dashboard/orders?storeId=${storeId}&confirmation=confirmed&fulfillment=open`,
      action: 'Expédier',
    },
    {
      key: 'carts',
      icon: ShoppingBag,
      tone: 'rose',
      label: 'Paniers abandonnés',
      count: abandonedCount,
      hint: 'Relance par WhatsApp',
      href: `/dashboard/stores/${storeId}?block=abandoned`,
      action: 'Relancer',
    },
    {
      key: 'stock',
      icon: Package,
      tone: 'violet',
      label: 'Stock faible',
      count: lowStockCount,
      hint: stockHint || 'Produits à réapprovisionner',
      href: `/dashboard/products?storeId=${storeId}&view=low`,
      action: 'Voir',
    },
    {
      key: 'unpaid',
      icon: Banknote,
      tone: 'amber',
      label: 'Paiements non terminés',
      count: unpaidCheckouts,
      hint: 'Sur la période affichée',
      href: '/dashboard/analytics',
      action: 'Voir',
    },
  ];

  const open = rows.filter((row) => row.count > 0);
  const waiting = !todoLoaded && open.length === 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold">À faire maintenant</h3>
          <p className="text-[11px] text-muted-foreground">
            {waiting
              ? 'Chargement…'
              : open.length === 0
                ? 'Rien en attente'
                : `${open.length} file${open.length > 1 ? 's' : ''} ouverte${open.length > 1 ? 's' : ''}`}
          </p>
        </div>
        {!waiting && open.length === 0 && (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
      </div>
      {waiting ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Rappels, confirmations, expéditions et stocks sont à jour.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {open.map((row) => (
            <li key={row.key}>
              <Link href={row.href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', ACTION_TONE[row.tone])}>
                  <row.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{row.label}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', ACTION_TONE[row.tone])}>
                      {row.count}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{row.hint}</p>
                </div>
                <span className="hidden shrink-0 rounded-lg bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background sm:inline">
                  {row.action}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTION_TONE: Record<'amber' | 'rose' | 'violet' | 'indigo', string> = {
  amber:  'bg-amber-500/10 text-amber-700',
  rose:   'bg-rose-500/10 text-rose-700',
  violet: 'bg-violet-500/10 text-violet-700',
  indigo: 'bg-indigo-500/10 text-indigo-700',
};


// ─────────────────────────────────────────────────────────────────────
// Inline revenue chart — pure SVG sparkline, no chart lib
// ─────────────────────────────────────────────────────────────────────

function RevenueChart({
  timeseries, previousTimeseries, range, currency, loading,
}: {
  timeseries: Array<{ date: string; revenue: number; sales: number; orders: number; paid: number }>;
  previousTimeseries: Array<{ date: string; revenue: number; sales: number; orders: number; paid: number }>;
  range: RangeKey;
  currency: string;
  loading?: boolean;
}) {
  // Toggle entre Ventes (valeur en devise) et Commandes (nb).
  const [metric, setMetric] = useState<'sales' | 'orders'>('sales');
  const [chartOpen, setChartOpen] = useState(false);

  // On trace `sales` (valeur de TOUTES les commandes), pas `revenue` (payé) :
  // en COD le payé reste ~0 jusqu'à livraison → la courbe paraissait vide.
  const totalOrders = timeseries.reduce((a, d) => a + d.orders, 0);
  const totalSales = timeseries.reduce((a, d) => a + d.sales, 0);
  const prevTotalSales = previousTimeseries.reduce((a, d) => a + d.sales, 0);
  const prevTotalOrders = previousTimeseries.reduce((a, d) => a + d.orders, 0);

  // Zip index-à-index : à chaque bucket de la fenêtre actuelle on associe le
  // bucket de la fenêtre précédente à la même position (pour l'overlay pointillé).
  const data = timeseries.map((d, i) => ({
    date: d.date,
    prevDate: previousTimeseries[i]?.date,
    current: metric === 'sales' ? d.sales : d.orders,
    previous: metric === 'sales' ? previousTimeseries[i]?.sales ?? 0 : previousTimeseries[i]?.orders ?? 0,
  }));

  const monthly = range === '12m';
  const currentTotal = metric === 'sales' ? totalSales : totalOrders;
  const previousTotal = metric === 'sales' ? prevTotalSales : prevTotalOrders;
  const deltaPct = previousTotal === 0
    ? (currentTotal > 0 ? null : 0)
    : ((currentTotal - previousTotal) / previousTotal) * 100;
  const isUp = deltaPct !== null && deltaPct >= 0;

  const formatValue = (v: number) =>
    metric === 'sales' ? formatCurrency(v, currency) : `${v} cmd`;

  const formatYAxis = (v: number) => {
    if (metric === 'orders') return String(v);
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
    return String(v);
  };

  const formatTick = (v: string) =>
    formatYmdLabel(v, monthly ? { month: 'short' } : { day: '2-digit', month: 'short' });

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-bold">
              {metric === 'sales' ? 'Ventes sur la période' : 'Commandes sur la période'}
            </h3>
            {!loading && deltaPct !== null && previousTotal > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                  isUp ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600',
                )}
                title="vs période précédente"
              >
                {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(deltaPct).toFixed(1)}%
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {loading
              ? 'Chargement…'
              : metric === 'sales'
                ? `${formatCurrency(currentTotal, currency)} · ${totalOrders} commande${totalOrders > 1 ? 's' : ''}`
                : `${currentTotal} commande${currentTotal > 1 ? 's' : ''} · ${formatCurrency(totalSales, currency)}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="hidden rounded-lg border border-border/60 bg-muted/30 p-0.5 sm:flex">
            <button
              type="button"
              onClick={() => setMetric('sales')}
              className={cn(
                'rounded-md px-2 py-1 text-[10px] font-semibold transition',
                metric === 'sales' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Ventes
            </button>
            <button
              type="button"
              onClick={() => setMetric('orders')}
              className={cn(
                'rounded-md px-2 py-1 text-[10px] font-semibold transition',
                metric === 'orders' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Commandes
            </button>
          </div>
          <button
            type="button"
            onClick={() => setChartOpen((open) => !open)}
            className="rounded-lg border border-border/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground lg:hidden"
          >
            {chartOpen ? 'Masquer' : 'Voir la courbe'}
          </button>
          <Link href="/dashboard/analytics" className="hidden lg:inline-flex">
            <Button variant="ghost" size="sm" className="gap-1 rounded-lg text-xs">
              Analytics
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
      <div className={cn('p-3', !chartOpen && 'max-lg:hidden')}>
        {data.length === 0 || (currentTotal === 0 && previousTotal === 0) ? (
          <div className="grid h-[180px] place-items-center text-xs text-muted-foreground">
            Aucune commande sur cette période.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revChartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatTick}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxis}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 10,
                  fontSize: 11,
                  boxShadow: '0 8px 24px rgba(0,0,0,.08)',
                }}
                labelFormatter={(v) => formatTick(String(v))}
                formatter={(value, name) => {
                  const label = name === 'current' ? 'Actuel' : 'Période précédente';
                  return [formatValue(Number(value)), label];
                }}
              />
              {/* Overlay période précédente en pointillés — le signature move Shopify. */}
              <Line
                type="monotone"
                dataKey="previous"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="current"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revChartGrad)"
              />
            </ComposedChart>
          </ResponsiveContainer>
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
          <p className="text-[10px] text-muted-foreground">Les meilleures ventes — toutes commandes de la période</p>
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
          Aucune vente sur cette période.
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.slice(0, 5).map((p, i) => (
            <li key={p.productId}>
            <Link href={`/dashboard/products/${p.productId}?storeId=${storeId}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-amber-500/15 to-orange-500/10 text-[10px] font-bold text-amber-700">
                {i + 1}
              </span>
              {p.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={mediaUrl(p.image)} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
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
            </Link>
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
  items, unpaidCheckouts = 0, currency, loading, storeId,
}: {
  items: StoreAnalyticsRich['recentOrders'];
  unpaidCheckouts?: number;
  currency: string;
  loading?: boolean;
  storeId: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold">Commandes récentes</h3>
          <p className="text-[10px] text-muted-foreground">
            Les ventes de la période
            {unpaidCheckouts > 0 ? ` · ${unpaidCheckouts} paiement${unpaidCheckouts > 1 ? 's' : ''} non abouti${unpaidCheckouts > 1 ? 's' : ''}` : ''}
          </p>
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
          Aucune commande sur cette période.
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
            <h3 className="text-sm font-bold">Objectif du mois en cours</h3>
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
// Draft banner — the store isn't published, alert the seller loudly
// so they don't wonder why their dashboard is empty.
// ─────────────────────────────────────────────────────────────────────

function PeriodHealthCard({
  confirmationRate, deliveryRate, created, confirmed, delivered, fulfilled, reasons,
}: {
  confirmationRate: number;
  deliveryRate: number;
  created: number;
  confirmed: number;
  delivered: number;
  fulfilled: number;
  reasons: Array<{ code: string; count: number }>;
}) {
  const deliveredCount = delivered || fulfilled;
  const top = reasons.slice(0, 3);
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <h3 className="text-sm font-bold">Santé de la période</h3>
      <p className="text-[11px] text-muted-foreground">Confirmation et livraison, sur les dates choisies.</p>
      <div className="mt-3 space-y-3">
        <HealthRate label="Confirmation" value={confirmationRate} hint={`${confirmed} / ${created}`} benchmark={50} />
        <HealthRate label="Livraison" value={deliveryRate} hint={`${deliveredCount} / ${confirmed}`} benchmark={70} />
      </div>
      {top.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
          {top.map((reason) => (
            <li key={reason.code} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{CANCEL_REASON_LABELS[reason.code] || reason.code}</span>
              <span className="font-semibold tabular-nums">{reason.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HealthRate({ label, value, hint, benchmark }: { label: string; value: number; hint: string; benchmark: number }) {
  const tone = value >= benchmark ? 'bg-emerald-500' : value >= benchmark * 0.6 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm font-bold tabular-nums">{value.toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full', tone)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

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
