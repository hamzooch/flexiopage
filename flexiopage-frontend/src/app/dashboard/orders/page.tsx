'use client';

/**
 * Orders dashboard — designed as expandable rich cards rather than a dense
 * table. Each card surfaces everything the seller needs to act:
 *   - customer name, phone, address (email intentionally hidden per spec)
 *   - line items with quantity + unit/total prices
 *   - subtotal/shipping/total breakdown
 *   - payment + MogaDelivery status (tracking link when available)
 *
 * Filtering: free-text search across order number / customer / city / phone,
 * plus quick status pills. All client-side over the 50-order page returned
 * by storesApi.listOrders().
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/components/ui/confirm-dialog';
import {
  ShoppingCart,
  Search,
  User as UserIcon,
  Phone,
  MapPin,
  Package,
  ChevronDown,
  ExternalLink,
  Calendar,
  CreditCard,
  Truck,
  CheckCircle2,
  Hourglass,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Banknote,
  X,
  Filter,
  Store as StoreIcon,
  TrendingUp,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  PhoneMissed,
  Check,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Pagination } from '@/components/ui/pagination';

interface StoreType {
  _id: string;
  name: string;
}

interface OrderItem {
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  sku?: string;
}

interface OrderType {
  _id: string;
  orderNumber: string;
  email: string;
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  tax?: number;
  discount?: number;
  total: number;
  currency: string;
  paymentStatus: string;
  paymentMethod?: string;
  fulfillmentStatus: string;
  notes?: string;
  createdAt: string;
  delivery?: {
    provider?: string;
    externalId?: string;
    externalStatus?: string;
    trackingUrl?: string;
    dispatchedAt?: string;
    error?: string;
  };
  /** Set after a cancel that restored stock — prevents double-restock. */
  inventoryRestored?: boolean;
  /** Append-only audit trail of manual status changes. */
  statusHistory?: Array<{
    at: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    confirmationStatus?: string;
    note?: string;
  }>;
  /** COD call-confirmation state (pending/confirmed/no_answer/callback/declined). */
  confirmationStatus?: ConfirmationStatus;
  confirmationNote?: string;
  callbackAt?: string;
  confirmedAt?: string;
}

type ConfirmationStatus = 'pending' | 'confirmed' | 'no_answer' | 'callback' | 'declined';
type StatusFilter = 'all' | 'pending' | 'paid' | 'delivered' | 'cancelled';
type ConfirmFilter = 'all' | ConfirmationStatus;
type DayFilter = 'all' | 'today' | '7d' | '30d';

const CONFIRMATION_BADGE: Record<ConfirmationStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }>; dot: string }> = {
  pending:   { label: 'À confirmer',     cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20',     icon: PhoneCall,     dot: 'bg-slate-400' },
  confirmed: { label: 'Confirmé',        cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20', icon: CheckCircle2,  dot: 'bg-emerald-500' },
  no_answer: { label: 'Ne décroche pas', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',     icon: PhoneMissed,   dot: 'bg-amber-500' },
  callback:  { label: 'À rappeler',      cls: 'bg-sky-500/10 text-sky-700 ring-sky-500/20',           icon: PhoneIncoming, dot: 'bg-sky-500' },
  declined:  { label: 'Refusé',          cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',        icon: PhoneOff,      dot: 'bg-rose-500' },
};

const DELIVERY_BADGE: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:    { label: 'En attente',      cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',   icon: Hourglass },
  assigned:   { label: 'Assigné',         cls: 'bg-blue-500/10 text-blue-700 ring-blue-500/20',     icon: UserIcon },
  picked_up:  { label: 'Récupéré',        cls: 'bg-violet-500/10 text-violet-700 ring-violet-500/20', icon: Package },
  in_transit: { label: 'En transit',      cls: 'bg-indigo-500/10 text-indigo-700 ring-indigo-500/20', icon: Truck },
  delivered:  { label: 'Livré',           cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20', icon: CheckCircle2 },
  returned:   { label: 'Retourné',        cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',     icon: RotateCcw },
  cancelled:  { label: 'Annulé',          cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',     icon: AlertTriangle },
  failed:     { label: 'Échec dispatch',  cls: 'bg-red-500/10 text-red-700 ring-red-500/20',        icon: AlertTriangle },
};

const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  paid:     { label: 'Payée',      cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  pending:  { label: 'En attente', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
  failed:   { label: 'Échec',      cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20' },
  refunded: { label: 'Remboursée', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
  manual:   { label: 'Manuelle',   cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
};

export default function DashboardOrdersPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const { storeId: selectedStoreId, setStoreId: setSelectedStoreId } = useScopedStoreId(storeIdParam);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [orders, setOrders] = useState<OrderType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Recherche debouncée → envoyée au serveur (évite une requête par frappe).
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confirmFilter, setConfirmFilter] = useState<ConfirmFilter>('all');
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  // Custom range (YYYY-MM-DD). When either is set, takes precedence over dayFilter.
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    storesApi.list().then((res) => {
      const list = (res.data as { stores: StoreType[] }).stores;
      setStores(list);
      if (!selectedStoreId && list.length) setSelectedStoreId(list[0]._id);
    }).catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calcule la plage de dates [from, to] (ISO) depuis les filtres date.
  // Le custom range prime sur les chips préréglées.
  const computeRange = useCallback((): { from?: string; to?: string } => {
    if (customFrom || customTo) {
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined,
        to: customTo ? new Date(`${customTo}T23:59:59.999`).toISOString() : undefined,
      };
    }
    if (dayFilter === 'all') return {};
    const d = new Date();
    if (dayFilter === 'today') d.setHours(0, 0, 0, 0);
    else if (dayFilter === '7d') d.setDate(d.getDate() - 7);
    else if (dayFilter === '30d') d.setDate(d.getDate() - 30);
    return { from: d.toISOString() };
  }, [dayFilter, customFrom, customTo]);

  const refreshOrders = useCallback(() => {
    if (!selectedStoreId) {
      setOrders([]);
      setTotal(0);
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    const skip = (page - 1) * pageSize;
    return storesApi
      .listOrders(selectedStoreId, {
        limit: pageSize,
        skip,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        confirmation: confirmFilter !== 'all' ? confirmFilter : undefined,
        ...computeRange(),
      })
      .then((res) => {
        const data = res.data as { orders: OrderType[]; total: number };
        setOrders(data.orders);
        setTotal(data.total ?? 0);
      })
      .catch(() => {
        setOrders([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [selectedStoreId, page, pageSize, debouncedSearch, statusFilter, confirmFilter, computeRange]);

  useEffect(() => { void refreshOrders(); }, [refreshOrders]);

  // Debounce de la recherche (350ms) avant l'appel serveur.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Tout changement de filtre/recherche/boutique remet à la page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, confirmFilter, dayFilter, customFrom, customTo, selectedStoreId]);

  // ── Stats over the loaded orders ─────────────────────────────────────
  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter((o) => o.paymentStatus === 'paid').length;
    const pending = orders.filter((o) => o.paymentStatus === 'pending').length;
    const delivered = orders.filter((o) => o.delivery?.externalStatus === 'delivered').length;
    const revenue = orders
      .filter((o) => o.paymentStatus === 'paid' || o.delivery?.externalStatus === 'delivered')
      .reduce((sum, o) => sum + o.total, 0);
    const currency = orders[0]?.currency || 'TND';
    return { total, paid, pending, delivered, revenue, currency };
  }, [orders]);

  // Le filtrage (recherche, statut, confirmation, dates) est désormais fait
  // CÔTÉ SERVEUR (cf. refreshOrders) → `orders` est déjà la page filtrée.
  // On garde l'alias pour ne pas réécrire tout le JSX qui l'utilise.
  const filteredOrders = orders;

  // Quick KPIs on confirmation buckets — used by the new toolbar row + KPI card.
  const confirmStats = useMemo(() => ({
    pending:   orders.filter((o) => !o.confirmationStatus || o.confirmationStatus === 'pending').length,
    confirmed: orders.filter((o) => o.confirmationStatus === 'confirmed').length,
    no_answer: orders.filter((o) => o.confirmationStatus === 'no_answer').length,
    callback:  orders.filter((o) => o.confirmationStatus === 'callback').length,
    declined:  orders.filter((o) => o.confirmationStatus === 'declined').length,
  }), [orders]);

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (confirmFilter !== 'all' ? 1 : 0) +
    (dayFilter !== 'all' || customFrom || customTo ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function resetFilters() {
    setStatusFilter('all');
    setConfirmFilter('all');
    setDayFilter('all');
    setCustomFrom('');
    setCustomTo('');
    setSearch('');
  }

  const currentStore = stores.find((s) => s._id === selectedStoreId);

  return (
    <div className="space-y-5">
      {/* ── Page header — clean, sober, business-app feel ─────── */}
      <PageHeader
        icon={ShoppingCart}
        title="Commandes"
        description="Toutes les commandes reçues — détails client, articles, livraison."
        actions={
          stores.length > 1 ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-1">
              <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={selectedStoreId || ''}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="bg-transparent text-xs font-medium outline-none"
              >
                {stores.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : currentStore ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1 text-xs">
              <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {currentStore.name}
            </span>
          ) : undefined
        }
      />

      {/* ── KPI cards — modern, denser, with trend hint ────────── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total"
          value={stats.total}
          icon={ShoppingCart}
          tint="indigo"
          hint={loading ? '…' : `${filteredOrders.length} affichées`}
        />
        <KpiCard
          label="En attente"
          value={stats.pending}
          icon={Hourglass}
          tint="amber"
          hint={stats.pending > 0 ? 'Action requise' : 'Tout traité'}
        />
        <KpiCard
          label="Payées"
          value={stats.paid}
          icon={CheckCircle2}
          tint="emerald"
          hint={stats.total > 0 ? `${Math.round((stats.paid / stats.total) * 100)}% du total` : '—'}
        />
        <KpiCard
          label="Revenu"
          value={formatCurrency(stats.revenue, stats.currency)}
          icon={Banknote}
          tint="fuchsia"
          hint="Payées + livrées"
        />
      </section>

      {/* ── Filter toolbar — single elegant card ─────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        {/* Row 1 — search + active count + reset */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border/40 p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° commande, nom, téléphone, ville…"
              className="h-10 rounded-lg border-border/60 pl-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Effacer la recherche"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              {activeFiltersCount === 0
                ? 'Aucun filtre'
                : `${activeFiltersCount} filtre${activeFiltersCount > 1 ? 's' : ''}`}
            </span>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* Row 2 — period chips + custom range */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Période
          </span>
          {(['all', 'today', '7d', '30d'] as DayFilter[]).map((d) => (
            <Chip
              key={d}
              active={dayFilter === d && !customFrom && !customTo}
              onClick={() => {
                setDayFilter(d);
                setCustomFrom('');
                setCustomTo('');
              }}
            >
              {d === 'all' ? 'Toutes' : d === 'today' ? "Aujourd'hui" : d === '7d' ? '7 jours' : '30 jours'}
            </Chip>
          ))}
          <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Du</span>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                if (e.target.value) setDayFilter('all');
              }}
              className="h-6 rounded bg-transparent text-xs outline-none"
            />
            <span className="text-[10px] font-medium text-muted-foreground">au</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => {
                setCustomTo(e.target.value);
                if (e.target.value) setDayFilter('all');
              }}
              className="h-6 rounded bg-transparent text-xs outline-none"
            />
            {(customFrom || customTo) && (
              <button
                type="button"
                onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                className="ml-0.5 rounded-md px-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Effacer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Row 3 — status chips with counts */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Statut
          </span>
          <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
            Tous <span className="ml-1 text-[10px] opacity-70">{stats.total}</span>
          </Chip>
          <Chip
            active={statusFilter === 'pending'}
            onClick={() => setStatusFilter('pending')}
            dot="bg-amber-500"
          >
            En attente <span className="ml-1 text-[10px] opacity-70">{stats.pending}</span>
          </Chip>
          <Chip
            active={statusFilter === 'paid'}
            onClick={() => setStatusFilter('paid')}
            dot="bg-emerald-500"
          >
            Payées <span className="ml-1 text-[10px] opacity-70">{stats.paid}</span>
          </Chip>
          <Chip
            active={statusFilter === 'delivered'}
            onClick={() => setStatusFilter('delivered')}
            dot="bg-indigo-500"
          >
            Livrées <span className="ml-1 text-[10px] opacity-70">{stats.delivered}</span>
          </Chip>
          <Chip
            active={statusFilter === 'cancelled'}
            onClick={() => setStatusFilter('cancelled')}
            dot="bg-rose-500"
          >
            Annulées
          </Chip>
        </div>

        {/* Row 4 — confirmation chips (the call-confirmation workflow) */}
        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <PhoneCall className="h-3 w-3" />
            Confirmation
          </span>
          <Chip active={confirmFilter === 'all'} onClick={() => setConfirmFilter('all')}>
            Tous
          </Chip>
          <Chip
            active={confirmFilter === 'pending'}
            onClick={() => setConfirmFilter('pending')}
            dot="bg-slate-400"
          >
            À confirmer <span className="ml-1 text-[10px] opacity-70">{confirmStats.pending}</span>
          </Chip>
          <Chip
            active={confirmFilter === 'confirmed'}
            onClick={() => setConfirmFilter('confirmed')}
            dot="bg-emerald-500"
          >
            Confirmées <span className="ml-1 text-[10px] opacity-70">{confirmStats.confirmed}</span>
          </Chip>
          <Chip
            active={confirmFilter === 'no_answer'}
            onClick={() => setConfirmFilter('no_answer')}
            dot="bg-amber-500"
          >
            Ne décroche pas <span className="ml-1 text-[10px] opacity-70">{confirmStats.no_answer}</span>
          </Chip>
          <Chip
            active={confirmFilter === 'callback'}
            onClick={() => setConfirmFilter('callback')}
            dot="bg-sky-500"
          >
            À rappeler <span className="ml-1 text-[10px] opacity-70">{confirmStats.callback}</span>
          </Chip>
          <Chip
            active={confirmFilter === 'declined'}
            onClick={() => setConfirmFilter('declined')}
            dot="bg-rose-500"
          >
            Refusées <span className="ml-1 text-[10px] opacity-70">{confirmStats.declined}</span>
          </Chip>
        </div>
      </div>

      {/* ── List header — count + sorting hint ──────────────── */}
      {selectedStoreId && !loading && filteredOrders.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-muted-foreground">
            <strong className="text-foreground">{filteredOrders.length}</strong> commande{filteredOrders.length > 1 ? 's' : ''} affichée{filteredOrders.length > 1 ? 's' : ''}
          </span>
          <span className="text-[11px] text-muted-foreground">Plus récentes en premier</span>
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────── */}
      {!selectedStoreId ? (
        <EmptyState title="Sélectionne une boutique" body="Choisis une boutique en haut à droite pour voir ses commandes." />
      ) : loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title={orders.length === 0 ? 'Pas encore de commandes' : 'Aucun résultat'}
          body={orders.length === 0
            ? 'Les nouvelles commandes apparaîtront ici dès qu\'un client commande.'
            : 'Aucune commande ne correspond à tes filtres.'}
        />
      ) : (
        <>
          <ul className="space-y-2.5">
            {filteredOrders.map((o) => (
              <OrderCard
                key={o._id}
                order={o}
                storeId={selectedStoreId || ''}
                expanded={expandedId === o._id}
                onToggle={() => setExpandedId((id) => (id === o._id ? null : o._id))}
                onChanged={refreshOrders}
              />
            ))}
          </ul>
          <div className="mt-4 rounded-2xl border border-border/60 bg-card">
            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              disabled={loading}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Filter chip — used in the toolbar ─────────────────────────────────
function Chip({
  active,
  onClick,
  children,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Optional colored dot before the label (status indicator). */
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
        active
          ? 'border-primary bg-primary/10 text-primary shadow-sm'
          : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
      {children}
    </button>
  );
}

// ─── KPI Card — clean business-app stat, no decorative blur ─────────────
function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: 'indigo' | 'amber' | 'emerald' | 'fuchsia';
}) {
  const tintMap: Record<string, { bg: string; text: string; border: string; accent: string }> = {
    indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-700',  border: 'border-indigo-500/20',  accent: 'from-indigo-500 to-violet-500' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-700',   border: 'border-amber-500/20',   accent: 'from-amber-500 to-orange-500' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-700', border: 'border-emerald-500/20', accent: 'from-emerald-500 to-teal-500' },
    fuchsia: { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-700', border: 'border-fuchsia-500/20', accent: 'from-fuchsia-500 to-pink-500' },
  };
  const c = tintMap[tint];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md">
      {/* Top accent bar — subtle brand mark */}
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r opacity-70', c.accent)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
          <div className="mt-1.5 truncate text-2xl font-bold tracking-tight">{value}</div>
        </div>
        <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', c.bg, c.text)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {hint && (
        <div className="mt-2.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          {hint}
        </div>
      )}
    </div>
  );
}

// ─── Order Card (expandable) ────────────────────────────────────────────
function OrderCard({
  order: o,
  storeId,
  expanded,
  onToggle,
  onChanged,
}: {
  order: OrderType;
  storeId: string;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const payment = PAYMENT_BADGE[o.paymentStatus] || { label: o.paymentStatus, cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' };
  const deliveryKey = (o.delivery?.externalStatus || '').toLowerCase();
  const delivery = DELIVERY_BADGE[deliveryKey];
  const DeliveryIcon = delivery?.icon;
  const totalQty = o.items.reduce((sum, it) => sum + (it.quantity || 0), 0);

  // Customer initials for the avatar — uses the customer name when present,
  // falls back to the phone or order number's last 2 chars.
  const initials = (o.customerName || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || o.orderNumber.slice(-2).toUpperCase();

  // Deterministic gradient per order so the avatars feel personal but stable.
  const avatarHues = [
    'from-indigo-500 to-violet-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-fuchsia-500 to-pink-600',
    'from-sky-500 to-blue-600',
    'from-rose-500 to-red-600',
  ];
  const avatarGrad = avatarHues[
    Array.from(o._id).reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatarHues.length
  ];

  // ── Dispatch manuel ──────────────────────────────────────────────
  // L'auto-dispatch fait du best-effort à la création/paiement, mais peut
  // échouer silencieusement (SKU manquant, MogaDelivery 4xx, timeout réseau).
  // Le bouton ci-dessous expose le endpoint backend `/dispatch` pour
  // permettre au vendeur de pousser ou de retenter manuellement.
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const isDispatched = !!o.delivery?.externalId;
  const hasDispatchError = !!o.delivery?.error;
  // On ne propose le bouton que pour les commandes qui n'ont pas été dispatch
  // OU qui ont échoué — pas pour celles déjà acceptées par le transporteur.
  const canDispatch = !isDispatched;

  async function handleDispatch() {
    setDispatching(true);
    setDispatchMessage(null);
    try {
      // `retry: true` quand on a déjà tenté ET échoué — le backend efface
      // l'externalId avant de relancer pour ne pas tomber dans l'idempotence.
      const res = await storesApi.dispatchOrder(storeId, o._id, hasDispatchError ? { retry: true } : {});
      if (res.data.ok) {
        setDispatchMessage({ kind: 'success', text: res.data.alreadyDispatched ? 'Déjà envoyée au transporteur.' : 'Envoyée au transporteur ✓' });
        await onChanged();
      } else {
        setDispatchMessage({ kind: 'error', text: 'Échec du dispatch.' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau.';
      const apiMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setDispatchMessage({ kind: 'error', text: apiMsg || msg });
    } finally {
      setDispatching(false);
    }
  }

  return (
    <li
      className={cn(
        'overflow-hidden rounded-2xl border bg-card transition-all',
        expanded
          ? 'border-primary/40 shadow-md shadow-primary/5'
          : 'border-border/60 hover:border-primary/30 hover:shadow-md'
      )}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/20 sm:gap-4 sm:p-4"
      >
        {/* Customer avatar — initials in colored gradient */}
        <div
          className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-md',
            avatarGrad
          )}
          aria-hidden
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {/* Customer name + order number */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {o.customerName || 'Client anonyme'}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{o.orderNumber}</span>
              </div>
              {/* Meta row — date / phone / city */}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(o.createdAt)}
                </span>
                {o.customerPhone && (
                  <>
                    <span className="opacity-40">·</span>
                    <a
                      href={`tel:${o.customerPhone}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3 w-3" />
                      {o.customerPhone}
                    </a>
                  </>
                )}
                {o.shippingAddress?.city && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {o.shippingAddress.city}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-lg font-bold tabular-nums sm:text-xl">
                {formatCurrency(o.total, o.currency)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {totalQty} article{totalQty > 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Badges row — confirmation + payment + method + delivery */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {(() => {
              const c = CONFIRMATION_BADGE[o.confirmationStatus || 'pending'];
              const CIcon = c.icon;
              return (
                <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1', c.cls)}>
                  <CIcon className="h-3 w-3" />
                  {c.label}
                </span>
              );
            })()}
            <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1', payment.cls)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', payment.cls.includes('emerald') ? 'bg-emerald-500' : payment.cls.includes('amber') ? 'bg-amber-500' : payment.cls.includes('rose') ? 'bg-rose-500' : 'bg-slate-500')} />
              {payment.label}
            </span>
            {o.paymentMethod && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {o.paymentMethod === 'cod' ? 'COD' : o.paymentMethod.toUpperCase()}
              </span>
            )}
            {o.delivery?.error ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-500/20" title={o.delivery.error}>
                <AlertTriangle className="h-3 w-3" />
                Échec dispatch
              </span>
            ) : delivery && DeliveryIcon ? (
              <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1', delivery.cls)}>
                <DeliveryIcon className="h-3 w-3" />
                {delivery.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Hourglass className="h-3 w-3" />
                Non dispatchée
              </span>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180 text-primary'
          )}
        />
      </button>

      {/* Quick-confirm strip — visible UNIQUEMENT pour les commandes en
          attente de confirmation (pending). Permet à l'agent de cliquer
          Confirmé / Pas de réponse / À rappeler directement depuis la
          liste, sans déplier. Mode COD-heavy : c'est l'action #1 du
          quotidien — chaque clic économisé = 50× par jour. Caché dès que
          la commande passe à un autre statut pour ne pas polluer. */}
      {(!o.confirmationStatus || o.confirmationStatus === 'pending') && !expanded && (
        <QuickConfirmBar order={o} storeId={storeId} onChanged={onChanged} />
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 p-4 sm:p-6">
          {/* Confirmation client (appel) — promue tout en haut.
              Pour un funnel COD c'est l'action #1 que l'agent fait quand
              il ouvre une commande : confirmer / rappel / refus. Avoir les
              boutons au-dessus de tout évite de scroller. */}
          <OrderConfirmationActions order={o} storeId={storeId} onChanged={onChanged} />

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            {/* Customer */}
            <DetailSection icon={<UserIcon className="h-4 w-4" />} title="Client">
              <DetailRow label="Nom" value={o.customerName || '—'} />
              <DetailRow
                label="Téléphone"
                value={o.customerPhone ? (
                  <a href={`tel:${o.customerPhone}`} className="text-primary hover:underline">{o.customerPhone}</a>
                ) : '—'}
              />
            </DetailSection>

            {/* Shipping address */}
            <DetailSection icon={<MapPin className="h-4 w-4" />} title="Adresse de livraison">
              {o.shippingAddress ? (
                <div className="space-y-1 text-sm">
                  {o.shippingAddress.line1 && <div>{o.shippingAddress.line1}</div>}
                  {o.shippingAddress.line2 && <div>{o.shippingAddress.line2}</div>}
                  {(o.shippingAddress.postalCode || o.shippingAddress.city) && (
                    <div className="text-foreground/80">
                      {o.shippingAddress.postalCode} {o.shippingAddress.city}
                    </div>
                  )}
                  {o.shippingAddress.state && (
                    <div className="text-muted-foreground">{o.shippingAddress.state}</div>
                  )}
                  {o.shippingAddress.country && (
                    <div className="text-muted-foreground">{o.shippingAddress.country}</div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Pas d'adresse renseignée.</p>
              )}
            </DetailSection>

            {/* Delivery tracking */}
            <DetailSection icon={<Truck className="h-4 w-4" />} title="Livraison">
              {o.delivery?.externalId ? (
                <div className="space-y-2 text-sm">
                  <DetailRow label="Statut" value={delivery?.label || o.delivery.externalStatus || '—'} />
                  <DetailRow label="Transporteur" value={o.delivery.provider || '—'} />
                  <DetailRow label="ID externe" value={<code className="font-mono text-xs">{o.delivery.externalId}</code>} />
                  {o.delivery.dispatchedAt && (
                    <DetailRow label="Dispatché le" value={formatDate(o.delivery.dispatchedAt)} />
                  )}
                  {o.delivery.trackingUrl && (
                    <a
                      href={o.delivery.trackingUrl}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Suivre la livraison
                    </a>
                  )}
                </div>
              ) : o.delivery?.error ? (
                <div className="space-y-2">
                  <p className="text-sm text-rose-700">⚠ {o.delivery.error}</p>
                  <p className="text-xs text-muted-foreground">
                    {/* Indice contextuel selon le message renvoyé par le provider.
                        Le hint générique "SKU/téléphone/adresse" était trompeur sur
                        des erreurs structurelles côté provider (store inconnu,
                        signature HMAC invalide, etc.). */}
                    {(() => {
                      const err = (o.delivery.error || '').toLowerCase();
                      if (err.includes('unknown store') || err.includes('store not found') || err.includes('404')) {
                        return 'Ta boutique n\'est pas encore enregistrée côté MogaDelivery. Donne-leur ton Store ID + secret HMAC pour l\'onboarding (visible dans Intégrations → Société de logistique).';
                      }
                      if (err.includes('signature') || err.includes('hmac') || err.includes('401')) {
                        return 'La clé secrète HMAC ne correspond pas entre FlexioPage et MogaDelivery. Régénère-la et donne-leur la même.';
                      }
                      if (err.includes('duplicate') || err.includes('e11000')) {
                        return 'Bug connu côté MogaDelivery (E11000). Contacte-les pour qu\'ils corrigent leur upsert sur la collection `stores`.';
                      }
                      if (err.includes('sku') || err.includes('product')) {
                        return 'Au moins un produit n\'a pas de SKU côté FlexioPage, ou son SKU ne matche pas le catalogue MogaDelivery. Vérifie la fiche produit.';
                      }
                      return 'Vérifie que la commande a tous ses champs (SKU, téléphone, adresse) puis retente.';
                    })()}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Pas encore dispatchée.</p>
              )}

              {/* Bouton manuel — visible quand la commande n'a pas encore
                 d'externalId (que ce soit après un échec ou jamais tenté). */}
              {canDispatch && (
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={handleDispatch}
                    disabled={dispatching}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors',
                      hasDispatchError
                        ? 'bg-rose-500/10 text-rose-700 hover:bg-rose-500/20'
                        : 'bg-primary/10 text-primary hover:bg-primary/20',
                      dispatching && 'cursor-wait opacity-60',
                    )}
                  >
                    {dispatching ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Envoi…
                      </>
                    ) : hasDispatchError ? (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Réessayer le dispatch
                      </>
                    ) : (
                      <>
                        <Truck className="h-3.5 w-3.5" />
                        Envoyer au transporteur
                      </>
                    )}
                  </button>
                  {dispatchMessage && (
                    <p
                      className={cn(
                        'text-xs font-medium',
                        dispatchMessage.kind === 'success' ? 'text-emerald-700' : 'text-rose-700',
                      )}
                    >
                      {dispatchMessage.text}
                    </p>
                  )}
                </div>
              )}
            </DetailSection>
          </div>

          {/* Items */}
          <div className="mt-6">
            <h3 className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Articles ({o.items.length})
            </h3>
            <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-semibold">Produit</th>
                    <th className="hidden px-4 py-2 font-semibold sm:table-cell">SKU</th>
                    <th className="px-4 py-2 text-right font-semibold">Qté</th>
                    <th className="hidden px-4 py-2 text-right font-semibold sm:table-cell">Prix</th>
                    <th className="px-4 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {o.items.map((it, i) => (
                    <tr key={`${it.productId}-${i}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{it.name}</div>
                        {it.variantId && (
                          <div className="text-[11px] text-muted-foreground">Variante : {it.variantId}</div>
                        )}
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        {it.sku ? (
                          <code className="font-mono text-[11px] text-muted-foreground">{it.sku}</code>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
                          ×{it.quantity}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
                        {formatCurrency(it.price, o.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {formatCurrency(it.total, o.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr className="text-sm">
                    <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">Sous-total</td>
                    <td colSpan={2} className="px-4 py-2 text-right tabular-nums">{formatCurrency(o.subtotal, o.currency)}</td>
                  </tr>
                  {o.shippingCost > 0 && (
                    <tr className="text-sm">
                      <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">Livraison</td>
                      <td colSpan={2} className="px-4 py-2 text-right tabular-nums">{formatCurrency(o.shippingCost, o.currency)}</td>
                    </tr>
                  )}
                  {!!o.discount && o.discount > 0 && (
                    <tr className="text-sm">
                      <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">Remise</td>
                      <td colSpan={2} className="px-4 py-2 text-right tabular-nums">-{formatCurrency(o.discount, o.currency)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-border/60 text-base font-bold">
                    <td colSpan={3} className="px-4 py-3 text-right">Total</td>
                    <td colSpan={2} className="px-4 py-3 text-right tabular-nums">{formatCurrency(o.total, o.currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {o.notes && (
            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Note du client
              </div>
              <p className="text-foreground/80">{o.notes}</p>
            </div>
          )}

          {/* OrderConfirmationActions est désormais en HAUT de la vue
              dépliée (cf. début de l'expanded panel) — l'agent ne scrolle
              plus pour confirmer. */}

          {/* Manual status override — seller can fix a stuck order without
              touching the courier. The component disables irrelevant actions
              once the colis is moving at the provider. */}
          <OrderStatusActions order={o} storeId={storeId} onChanged={onChanged} />

          {/* Quick contact / tracking links */}
          <div className="mt-5 flex flex-wrap gap-2">
            {o.customerPhone && (
              <a href={`tel:${o.customerPhone}`} className="inline-flex">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  Appeler
                </Button>
              </a>
            )}
            {o.delivery?.trackingUrl && (
              <a href={o.delivery.trackingUrl} target="_blank" rel="noopener" className="inline-flex">
                <Button size="sm" className="gap-1.5 gradient-brand text-white">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Suivre le colis
                </Button>
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function DetailSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted">
        <ShoppingCart className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Manual order status override
// ─────────────────────────────────────────────────────────────────────
// Sellers occasionally need to fix an order that won't move through the
// normal courier flow — customer called to cancel, manual delivery,
// payment received offline, etc. This panel exposes the three actions
// the seller actually reaches for, plus a sentinel banner when the colis
// is already moving at the provider (silently overriding then would
// desynchronise FlexioPage from the courier's reality).
const MOVING_STATES = new Set(['assigned', 'picked_up', 'in_transit', 'delivered', 'returned']);

function OrderStatusActions({
  order,
  storeId,
  onChanged,
}: {
  order: OrderType;
  storeId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForce, setShowForce] = useState(false);
  const prompt = usePrompt();

  const isMoving = !!order.delivery?.externalId && MOVING_STATES.has((order.delivery?.externalStatus || '').toLowerCase());
  const isCancelled = order.fulfillmentStatus === 'cancelled';
  const isPaid = order.paymentStatus === 'paid';
  const isFulfilled = order.fulfillmentStatus === 'fulfilled';

  async function call(
    label: string,
    data: { paymentStatus?: 'paid' | 'pending' | 'refunded'; fulfillmentStatus?: 'fulfilled' | 'cancelled' | 'unfulfilled'; reason?: string; force?: boolean },
  ) {
    setBusy(label);
    setError(null);
    try {
      await storesApi.manualOrderStatus(storeId, order._id, data);
      await onChanged();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string; message?: string }; status?: number } };
      if (ax?.response?.status === 409) {
        setError(ax.response.data?.message || 'Commande déjà chez le transporteur. Coche "forcer" pour passer outre.');
        setShowForce(true);
      } else {
        setError(ax?.response?.data?.message || ax?.response?.data?.error || 'Action impossible.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    const reason = await prompt({
      title: 'Annuler la commande',
      description: 'La raison sera gardée dans l\'historique de la commande.',
      defaultValue: isMoving ? 'Annulation manuelle après dispatch' : 'Annulation manuelle',
      placeholder: 'Ex: Client a changé d\'avis, double commande…',
      multiline: true,
      confirmLabel: 'Annuler la commande',
      tone: 'destructive',
    });
    if (reason === null) return;
    await call('cancel', { fulfillmentStatus: 'cancelled', reason, force: showForce || isMoving });
  }

  if (!storeId) return null;

  return (
    <div className="mt-5 rounded-xl border border-border/60 bg-card p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CreditCard className="h-3.5 w-3.5" />
          Changer le statut
        </h3>
        {isMoving && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Chez le transporteur
          </span>
        )}
      </div>

      {isMoving && (
        <p className="mb-3 text-[11px] text-muted-foreground">
          La commande est déjà <strong>{order.delivery?.externalStatus}</strong> chez {order.delivery?.provider || 'le transporteur'}.
          Toute action ici sera marquée comme override manuel.
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!isPaid && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => call('paid', { paymentStatus: 'paid', force: showForce })}
            className="gap-1.5"
          >
            {busy === 'paid' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            Marquer payé
          </Button>
        )}
        {!isFulfilled && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => call('fulfilled', { fulfillmentStatus: 'fulfilled', paymentStatus: isPaid ? undefined : 'paid', force: showForce })}
            className="gap-1.5"
          >
            {busy === 'fulfilled' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5 text-emerald-600" />}
            Marquer livré
          </Button>
        )}
        {!isCancelled && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={cancel}
            className="gap-1.5 border-red-500/30 text-red-700 hover:bg-red-500/10"
          >
            {busy === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Annuler {order.inventoryRestored ? '' : '+ remettre stock'}
          </Button>
        )}
        {isMoving && !showForce && (
          <button
            type="button"
            onClick={() => setShowForce(true)}
            className="text-[11px] font-medium text-amber-700 underline-offset-2 hover:underline"
          >
            Activer le mode "force"
          </button>
        )}
      </div>

      {order.statusHistory && order.statusHistory.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
            Historique ({order.statusHistory.length})
          </summary>
          <ul className="mt-2 space-y-1 text-[11px]">
            {order.statusHistory.slice().reverse().map((h, i) => (
              <li key={i} className="rounded-lg bg-muted/40 px-2 py-1.5 text-muted-foreground">
                <span className="font-mono text-foreground/80">{formatDate(h.at)}</span>
                {h.paymentStatus && <> · paiement → <strong>{h.paymentStatus}</strong></>}
                {h.fulfillmentStatus && <> · livraison → <strong>{h.fulfillmentStatus}</strong></>}
                {h.note && <div className="mt-0.5 italic">{h.note}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COD call-confirmation panel — quick actions for the tele-confirm flow
// ─────────────────────────────────────────────────────────────────────
// Standard MENA / Maghreb COD dropshipping workflow: the seller (or an
// agent) calls the buyer BEFORE dispatching to confirm the order. The
// outcome of that call drives whether the order moves forward or gets
// cancelled. This panel exposes the 4 actions an agent reaches for in a
// single tap, with optional note + scheduled callback time.

function OrderConfirmationActions({
  order,
  storeId,
  onChanged,
}: {
  order: OrderType;
  storeId: string;
  onChanged: () => void | Promise<void>;
}) {
  const current = (order.confirmationStatus || 'pending') as ConfirmationStatus;
  const [busy, setBusy] = useState<ConfirmationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCallbackPicker, setShowCallbackPicker] = useState(false);
  const prompt = usePrompt();
  const [callbackAt, setCallbackAt] = useState<string>(() => {
    // Default callback = today + 2h, rounded to next half-hour, in the
    // local input format (yyyy-MM-ddThh:mm).
    const d = new Date();
    d.setMinutes(d.getMinutes() + 120);
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [noteDraft, setNoteDraft] = useState<string>('');

  async function apply(status: ConfirmationStatus, extra?: { note?: string; callbackAt?: string }) {
    setBusy(status);
    setError(null);
    try {
      await storesApi.setOrderConfirmation(storeId, order._id, {
        confirmationStatus: status,
        note: extra?.note,
        callbackAt: extra?.callbackAt,
      });
      await onChanged();
      setShowCallbackPicker(false);
      setNoteDraft('');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string; message?: string } } };
      setError(ax?.response?.data?.message || ax?.response?.data?.error || 'Action impossible.');
    } finally {
      setBusy(null);
    }
  }

  async function handleCallback() {
    if (!callbackAt) return;
    // The HTML datetime-local input gives a local-time string with no TZ;
    // sending the local-aware Date.toISOString() makes the backend store
    // the correct absolute instant.
    const iso = new Date(callbackAt).toISOString();
    await apply('callback', { callbackAt: iso, note: noteDraft || undefined });
  }

  async function handleDeclined() {
    const reason = await prompt({
      title: 'Refus du client',
      description: 'Note gardée dans l\'historique pour le suivi.',
      defaultValue: 'Refusé à la confirmation',
      placeholder: 'Ex: client a dit non, prix trop élevé, double commande…',
      multiline: true,
      confirmLabel: 'Marquer comme refusé',
      tone: 'destructive',
    });
    if (reason === null) return;
    await apply('declined', { note: reason });
  }

  const currentBadge = CONFIRMATION_BADGE[current];
  const CurrentIcon = currentBadge.icon;

  return (
    <div className="mt-5 rounded-xl border border-border/60 bg-gradient-to-br from-sky-500/5 via-card to-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <PhoneCall className="h-3.5 w-3.5 text-sky-600" />
          Confirmation client (appel)
        </h3>
        <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1', currentBadge.cls)}>
          <CurrentIcon className="h-3 w-3" />
          {currentBadge.label}
        </span>
      </div>

      {order.confirmationStatus === 'callback' && order.callbackAt && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-800">
          <Calendar className="h-3.5 w-3.5" />
          Rappel programmé : <strong>{formatDate(order.callbackAt)}</strong>
        </div>
      )}
      {order.confirmationNote && (
        <p className="mb-3 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
          « {order.confirmationNote} »
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-700">{error}</p>
      )}

      {!showCallbackPicker ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={current === 'confirmed' ? 'default' : 'outline'}
            disabled={busy !== null}
            onClick={() => apply('confirmed')}
            className={cn(
              'gap-1.5',
              current === 'confirmed' && 'bg-emerald-600 text-white hover:bg-emerald-600/90',
              current !== 'confirmed' && 'border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10'
            )}
          >
            {busy === 'confirmed' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Confirmé
          </Button>

          <Button
            size="sm"
            variant={current === 'no_answer' ? 'default' : 'outline'}
            disabled={busy !== null}
            onClick={() => apply('no_answer')}
            className={cn(
              'gap-1.5',
              current === 'no_answer' && 'bg-amber-600 text-white hover:bg-amber-600/90',
              current !== 'no_answer' && 'border-amber-500/30 text-amber-700 hover:bg-amber-500/10'
            )}
          >
            {busy === 'no_answer' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneMissed className="h-3.5 w-3.5" />}
            Ne décroche pas
          </Button>

          <Button
            size="sm"
            variant={current === 'callback' ? 'default' : 'outline'}
            disabled={busy !== null}
            onClick={() => setShowCallbackPicker(true)}
            className={cn(
              'gap-1.5',
              current === 'callback' && 'bg-sky-600 text-white hover:bg-sky-600/90',
              current !== 'callback' && 'border-sky-500/30 text-sky-700 hover:bg-sky-500/10'
            )}
          >
            <PhoneIncoming className="h-3.5 w-3.5" />
            À rappeler
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={handleDeclined}
            className="gap-1.5 border-rose-500/30 text-rose-700 hover:bg-rose-500/10"
          >
            {busy === 'declined' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneOff className="h-3.5 w-3.5" />}
            Refusé
          </Button>

          {/* Quick-call link — same number as the contact button below, but
              right here so the agent can dial and update in one motion. */}
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              <Phone className="h-3.5 w-3.5" />
              Appeler {order.customerPhone}
            </a>
          )}
        </div>
      ) : (
        // Callback picker — datetime + optional note + confirm/cancel
        <div className="space-y-2.5 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rappeler le
              </label>
              <input
                type="datetime-local"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border/60 bg-card px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Note (optionnel)
              </label>
              <input
                type="text"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Ex: appeler après 17h, préfère WhatsApp…"
                className="mt-1 h-9 w-full rounded-md border border-border/60 bg-card px-2 text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCallbackPicker(false)}
              disabled={busy === 'callback'}
              className="h-8 text-xs"
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleCallback}
              disabled={!callbackAt || busy === 'callback'}
              className="h-8 gap-1.5 bg-sky-600 text-xs text-white hover:bg-sky-600/90"
            >
              {busy === 'callback' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneIncoming className="h-3.5 w-3.5" />}
              Planifier le rappel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// QuickConfirmBar — barre d'actions rapide affichée DANS la card
// collapsée, juste sous le toggle expand. Tirée hors du bouton toggle
// pour éviter les nested-buttons (HTML invalide). Cible : agents COD qui
// font 50+ confirmations par jour — économise 1 clic + un scroll par
// commande, soit l'expand/scroll/click cycle complet.
// ─────────────────────────────────────────────────────────────────────
function QuickConfirmBar({
  order,
  storeId,
  onChanged,
}: {
  order: OrderType;
  storeId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<ConfirmationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply(status: ConfirmationStatus) {
    setBusy(status);
    setError(null);
    try {
      await storesApi.setOrderConfirmation(storeId, order._id, { confirmationStatus: status });
      await onChanged();
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string; message?: string } } };
      setError(ax?.response?.data?.error || 'Action impossible.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-border/60 bg-gradient-to-r from-sky-500/5 via-card to-card px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-700">
          <PhoneCall className="h-3.5 w-3.5" />
          Confirmer l&apos;appel
        </span>
        <button
          type="button"
          onClick={() => apply('confirmed')}
          disabled={busy !== null}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:opacity-60"
        >
          {busy === 'confirmed' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Confirmé
        </button>
        <button
          type="button"
          onClick={() => apply('no_answer')}
          disabled={busy !== null}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/15 disabled:opacity-60"
        >
          {busy === 'no_answer' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneMissed className="h-3.5 w-3.5" />}
          Pas de réponse
        </button>
        {order.customerPhone && (
          <a
            href={`tel:${order.customerPhone}`}
            onClick={(e) => e.stopPropagation()}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Phone className="h-3.5 w-3.5" />
            Appeler
          </a>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-700">{error}</p>
      )}
    </div>
  );
}
