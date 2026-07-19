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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { formatCurrency, formatDate, cn, mediaUrl } from '@/lib/utils';
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
  Store as StoreIcon,
  TrendingUp,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  PhoneMissed,
  Check,
  MoreHorizontal,
  Printer,
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

/**
 * STATUT UNIFIÉ — un seul statut de cycle de vie, le plus parlant pour le
 * vendeur, dérivé des 4 dimensions (confirmation, paiement, dispatch, livraison).
 * L'état terminal gagne. `stripe` = couleur de la barre latérale de la carte.
 */
type StageKey =
  | 'to_confirm' | 'no_answer' | 'callback' | 'confirmed' | 'dispatch_failed'
  | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'returned' | 'cancelled';

const STAGE: Record<StageKey, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  cls: string;     // badge (fond + texte + ring)
  stripe: string;  // barre latérale + point (couleur pleine)
}> = {
  to_confirm:      { label: 'À confirmer',     icon: PhoneCall,     cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20',     stripe: 'bg-slate-400' },
  no_answer:       { label: 'Ne décroche pas', icon: PhoneMissed,   cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',     stripe: 'bg-amber-500' },
  callback:        { label: 'À rappeler',      icon: PhoneIncoming, cls: 'bg-sky-500/10 text-sky-700 ring-sky-500/20',           stripe: 'bg-sky-500' },
  confirmed:       { label: 'Confirmée',       icon: CheckCircle2,  cls: 'bg-teal-500/10 text-teal-700 ring-teal-500/20',         stripe: 'bg-teal-500' },
  dispatch_failed: { label: 'Échec dispatch',  icon: AlertTriangle, cls: 'bg-red-500/10 text-red-700 ring-red-500/20',           stripe: 'bg-red-500' },
  assigned:        { label: 'Assignée',        icon: UserIcon,      cls: 'bg-blue-500/10 text-blue-700 ring-blue-500/20',         stripe: 'bg-blue-500' },
  picked_up:       { label: 'Récupérée',       icon: Package,       cls: 'bg-violet-500/10 text-violet-700 ring-violet-500/20',   stripe: 'bg-violet-500' },
  in_transit:      { label: 'En livraison',    icon: Truck,         cls: 'bg-indigo-500/10 text-indigo-700 ring-indigo-500/20',   stripe: 'bg-indigo-500' },
  delivered:       { label: 'Livrée',          icon: CheckCircle2,  cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20', stripe: 'bg-emerald-500' },
  returned:        { label: 'Retournée',       icon: RotateCcw,     cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',         stripe: 'bg-rose-500' },
  cancelled:       { label: 'Annulée',         icon: X,             cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',         stripe: 'bg-rose-400' },
};

function computeStage(o: OrderType): StageKey {
  const dk = (o.delivery?.externalStatus || '').toLowerCase();
  const conf = o.confirmationStatus || 'pending';
  // États terminaux d'abord.
  if (o.fulfillmentStatus === 'cancelled' || dk === 'cancelled' || conf === 'declined') return 'cancelled';
  if (dk === 'returned') return 'returned';
  if (dk === 'delivered' || o.fulfillmentStatus === 'fulfilled') return 'delivered';
  // En cours de livraison (déjà dispatchée).
  if (dk === 'in_transit') return 'in_transit';
  if (dk === 'picked_up') return 'picked_up';
  if (dk === 'assigned' || dk === 'pending') return 'assigned';
  if (dk === 'failed') return 'dispatch_failed';
  if (o.delivery?.error) return 'dispatch_failed';
  // Avant dispatch : piloté par la confirmation d'appel (funnel COD).
  if (conf === 'no_answer') return 'no_answer';
  if (conf === 'callback') return 'callback';
  if (conf === 'confirmed') return 'confirmed';
  return 'to_confirm';
}

// ─── Stepper de progression (Confirmation → Expédition → Livraison) ─────────
// Dérive 3 étapes du statut unifié. Les états terminaux « morts » (annulée /
// retournée) s'affichent en une seule pastille rouge à la place du stepper.
function OrderStepper({ order }: { order: OrderType }) {
  const key = computeStage(order);
  if (key === 'cancelled' || key === 'returned') {
    const s = STAGE[key];
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1', s.cls)}>
        <s.icon className="h-3.5 w-3.5" /> {s.label}
      </span>
    );
  }
  const confActive = key === 'to_confirm' || key === 'no_answer' || key === 'callback';
  const delivered = key === 'delivered';

  type StepState = 'done' | 'current' | 'todo';
  interface Step { label: string; state: StepState; tone?: string }

  const step1: Step = confActive
    ? { label: STAGE[key].label, state: 'current', tone: STAGE[key].stripe }
    : { label: 'Confirmée', state: 'done' };
  const step2: Step =
    key === 'dispatch_failed' ? { label: 'Échec dispatch', state: 'current', tone: 'bg-red-500' }
    : key === 'confirmed'     ? { label: 'À expédier',     state: 'current', tone: 'bg-indigo-500' }
    : (key === 'assigned' || key === 'picked_up' || key === 'in_transit')
                              ? { label: 'Expédiée',       state: 'current', tone: 'bg-indigo-500' }
    : delivered               ? { label: 'Expédiée',       state: 'done' }
                              : { label: 'Expédiée',       state: 'todo' };
  const step3: Step = delivered
    ? { label: 'Livrée', state: 'current', tone: 'bg-emerald-500' }
    : { label: 'Livrée', state: 'todo' };

  const pill = (s: Step) => (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition-colors',
        s.state === 'done' && 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30',
        s.state === 'current' && cn('text-white ring-transparent shadow-sm', s.tone),
        s.state === 'todo' && 'text-muted-foreground ring-border/70',
      )}
    >
      {s.label}
    </span>
  );
  const bar = (leftDone: boolean) => (
    <span className={cn('h-0.5 w-3.5 shrink-0 rounded-full sm:w-5', leftDone ? 'bg-emerald-500' : 'bg-border')} aria-hidden />
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pill(step1)}
      {bar(step1.state === 'done')}
      {pill(step2)}
      {bar(step2.state === 'done')}
      {pill(step3)}
    </div>
  );
}

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
  // Map productId → image URL, résolu depuis la liste des produits du store.
  // Les snapshots OrderItem ne contiennent pas l'image (juste name/price/qty),
  // donc on hydrate côté client pour éviter de modifier tous les orders passés.
  const [productImages, setProductImages] = useState<Record<string, string>>({});

  useEffect(() => {
    storesApi.list().then((res) => {
      const list = (res.data as { stores: StoreType[] }).stores;
      setStores(list);
      if (!selectedStoreId && list.length) setSelectedStoreId(list[0]._id);
    }).catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate le lookup productId→image pour la boutique sélectionnée. On demande
  // un limit élevé (500) pour couvrir la plupart des catalogues sans pagination —
  // les catalogues plus grands afficheront simplement un placeholder pour les
  // items absents de la première page.
  useEffect(() => {
    if (!selectedStoreId) { setProductImages({}); return; }
    let cancelled = false;
    storesApi.listProducts(selectedStoreId, { limit: 500 })
      .then((res) => {
        if (cancelled) return;
        const list = (res.data as { products?: Array<{ _id: string; images?: string[] }> }).products || [];
        const map: Record<string, string> = {};
        for (const p of list) {
          if (p._id && p.images?.[0]) map[p._id] = p.images[0];
        }
        setProductImages(map);
      })
      .catch(() => setProductImages({}));
    return () => { cancelled = true; };
  }, [selectedStoreId]);

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

  // Commandes « à livrer » de la vue courante : confirmées, non annulées, pas
  // encore livrées, avec une adresse physique → éligibles au bordereau (lot).
  const deliverableIds = useMemo(
    () =>
      filteredOrders
        .filter(
          (o) =>
            o.confirmationStatus === 'confirmed' &&
            o.fulfillmentStatus !== 'cancelled' &&
            o.fulfillmentStatus !== 'fulfilled' &&
            !!o.shippingAddress,
        )
        .map((o) => o._id),
    [filteredOrders],
  );

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
          hero
        />
      </section>

      {/* ── Filter toolbar — onglets de statut + recherche & filtres ───── */}
      <div className="space-y-2.5 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm">
        {/* Onglets de statut (avec compteurs) — remplace l'ancien menu Statut */}
        <div className="flex gap-1.5 overflow-x-auto">
          {([
            { value: 'all',       label: 'Toutes',     count: stats.total },
            { value: 'pending',   label: 'En attente', count: stats.pending },
            { value: 'paid',      label: 'Payées',     count: stats.paid },
            { value: 'delivered', label: 'Livrées',    count: stats.delivered },
            { value: 'cancelled', label: 'Annulées' },
          ] as { value: StatusFilter; label: string; count?: number }[]).map((t) => {
            const active = statusFilter === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setStatusFilter(t.value)}
                className={cn(
                  'inline-flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t.label}
                {typeof t.count === 'number' && (
                  <span className={cn('rounded-full px-1.5 text-[10px] font-bold tabular-nums', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Recherche + filtres secondaires */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recherche */}
          <div className="relative min-w-[220px] flex-1">
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

          {/* Période (préréglages + plage personnalisée dans le menu) */}
          <PeriodFilter
            dayFilter={dayFilter}
            customFrom={customFrom}
            customTo={customTo}
            onPreset={(d) => { setDayFilter(d); setCustomFrom(''); setCustomTo(''); }}
            onCustom={(from, to) => { setCustomFrom(from); setCustomTo(to); setDayFilter('all'); }}
            onClear={() => { setDayFilter('all'); setCustomFrom(''); setCustomTo(''); }}
          />

          {/* Confirmation d'appel (funnel COD) */}
          <FilterSelect
            icon={PhoneCall}
            label="Confirmation"
            value={confirmFilter}
            onChange={(v) => setConfirmFilter(v as ConfirmFilter)}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'pending', label: 'À confirmer', count: confirmStats.pending, dot: 'bg-slate-400' },
              { value: 'confirmed', label: 'Confirmées', count: confirmStats.confirmed, dot: 'bg-emerald-500' },
              { value: 'no_answer', label: 'Ne décroche pas', count: confirmStats.no_answer, dot: 'bg-amber-500' },
              { value: 'callback', label: 'À rappeler', count: confirmStats.callback, dot: 'bg-sky-500' },
              { value: 'declined', label: 'Refusées', count: confirmStats.declined, dot: 'bg-rose-500' },
            ]}
          />

          {/* Réinitialiser — visible seulement si un filtre est actif */}
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold">{activeFiltersCount}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── List header — count + sorting hint ──────────────── */}
      {selectedStoreId && !loading && filteredOrders.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-muted-foreground">
            <strong className="text-foreground">{filteredOrders.length}</strong> commande{filteredOrders.length > 1 ? 's' : ''} affichée{filteredOrders.length > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-3">
            {deliverableIds.length > 0 && (
              <a
                href={`/bordereau?storeId=${selectedStoreId}&ids=${deliverableIds.join(',')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                title="Imprimer les bordereaux des commandes confirmées à livrer"
              >
                <Printer className="h-3.5 w-3.5" /> Bordereaux à livrer ({deliverableIds.length})
              </a>
            )}
            <span className="text-[11px] text-muted-foreground">Plus récentes en premier</span>
          </div>
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
          {/* Vue tableau standard type Shopify — plus dense qu'une carte,
              scan plus rapide sur beaucoup de commandes. Overflow-x sur
              petit écran pour ne rien tronquer. Ligne de détail dépliable
              sous chaque row au clic. */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="border-b border-border/60 bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold sm:px-4">Commande</th>
                    <th className="px-3 py-2.5 font-semibold sm:px-4">Client</th>
                    <th className="px-3 py-2.5 font-semibold sm:px-4">Produits</th>
                    <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Total</th>
                    <th className="px-3 py-2.5 font-semibold sm:px-4">Paiement</th>
                    <th className="px-3 py-2.5 font-semibold sm:px-4">Statut</th>
                    <th className="w-10 px-2 py-2.5" aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredOrders.map((o) => (
                    <OrderCard
                      key={o._id}
                      order={o}
                      storeId={selectedStoreId || ''}
                      expanded={expandedId === o._id}
                      onToggle={() => setExpandedId((id) => (id === o._id ? null : o._id))}
                      onChanged={refreshOrders}
                      productImages={productImages}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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

// ─── Filtre compact type « select » — bouton + menu déroulant ───────────
// Remplace les longues rangées de chips par un dropdown pro : le libellé du
// filtre + la valeur active en pastille, un menu avec pastilles couleur +
// compteurs. Se ferme au clic extérieur.
function FilterSelect({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  options: Array<{ value: string; label: string; count?: number; dot?: string }>;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = options.find((o) => o.value === value);
  const active = value !== 'all';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
          active
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'border-border/60 text-muted-foreground hover:bg-muted/40',
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-medium">{label}</span>
        {active && current && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
            {current.dot && <span className={cn('h-1.5 w-1.5 rounded-full', current.dot)} />}
            {current.label}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-border/60 bg-card p-1 shadow-lg">
          {options.map((o) => {
            const sel = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={sel}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                  sel ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/70',
                )}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', o.dot || 'bg-transparent')} />
                <span className="flex-1">{o.label}</span>
                {typeof o.count === 'number' && (
                  <span className="text-[11px] tabular-nums opacity-60">{o.count}</span>
                )}
                {sel && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Filtre Période — préréglages + plage personnalisée dans un menu ─────
function PeriodFilter({
  dayFilter,
  customFrom,
  customTo,
  onPreset,
  onCustom,
  onClear,
}: {
  dayFilter: DayFilter;
  customFrom: string;
  customTo: string;
  onPreset: (d: DayFilter) => void;
  onCustom: (from: string, to: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const hasCustom = !!(customFrom || customTo);
  const active = dayFilter !== 'all' || hasCustom;
  const presets: Array<{ v: DayFilter; l: string }> = [
    { v: 'all', l: 'Toutes' },
    { v: 'today', l: "Aujourd'hui" },
    { v: '7d', l: '7 jours' },
    { v: '30d', l: '30 jours' },
  ];
  const valueLabel = hasCustom
    ? 'Personnalisé'
    : presets.find((p) => p.v === dayFilter)?.l || 'Toutes';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
          active
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'border-border/60 text-muted-foreground hover:bg-muted/40',
        )}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">Période</span>
        {active && (
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
            {valueLabel}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-border/60 bg-card p-2 shadow-lg">
          <div className="grid grid-cols-2 gap-1">
            {presets.map((p) => {
              const sel = !hasCustom && dayFilter === p.v;
              return (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => { onPreset(p.v); setOpen(false); }}
                  className={cn(
                    'rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                    sel ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/70',
                  )}
                >
                  {p.l}
                </button>
              );
            })}
          </div>

          <div className="my-2 h-px bg-border/60" />
          <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Plage personnalisée
          </p>
          <div className="flex items-center gap-1.5 px-1">
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => onCustom(e.target.value, customTo)}
              className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <span className="text-[10px] text-muted-foreground">au</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => onCustom(customFrom, e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {active && (
            <button
              type="button"
              onClick={() => { onClear(); setOpen(false); }}
              className="mt-2 w-full rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70"
            >
              Effacer la période
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── KPI Card — clean business-app stat, no decorative blur ─────────────
function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tint,
  hero,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: 'indigo' | 'amber' | 'emerald' | 'fuchsia';
  hero?: boolean;
}) {
  const tintMap: Record<string, { bg: string; text: string; border: string; accent: string }> = {
    indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-700',  border: 'border-indigo-500/20',  accent: 'from-indigo-500 to-violet-500' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-700',   border: 'border-amber-500/20',   accent: 'from-amber-500 to-orange-500' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-700', border: 'border-emerald-500/20', accent: 'from-emerald-500 to-teal-500' },
    fuchsia: { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-700', border: 'border-fuchsia-500/20', accent: 'from-fuchsia-500 to-pink-500' },
  };
  const c = tintMap[tint];
  return (
    <div className={cn(
      'group relative overflow-hidden rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md',
      hero ? 'border-primary/30 bg-gradient-to-b from-primary/[0.06] to-transparent' : 'border-border/60 bg-card hover:border-primary/30',
    )}>
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

// ─── Menu ⋯ de changement de statut ─────────────────────────────────────
// Regroupe TOUTES les actions de statut (confirmation d'appel, dispatch,
// paiement, annulation) dans un dropdown, pour désencombrer la carte : sur
// la carte on ne montre plus que LE statut unifié, et on agit via ce menu.
function StatusMenuItem({
  icon: Icon, label, onClick, danger, busy,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={busy}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors disabled:opacity-50',
        danger ? 'text-red-700 hover:bg-red-500/10' : 'text-foreground hover:bg-muted/70',
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', danger ? 'text-red-600' : 'text-muted-foreground')} />
      {label}
    </button>
  );
}

function StatusMenu({
  order,
  storeId,
  onChanged,
}: {
  order: OrderType;
  storeId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prompt = usePrompt();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!storeId) return null;

  const conf = order.confirmationStatus || 'pending';
  const dk = (order.delivery?.externalStatus || '').toLowerCase();
  const isPaid = order.paymentStatus === 'paid';
  const isDispatched = !!order.delivery?.externalId;
  const hasErr = !!order.delivery?.error;
  const isFulfilled = order.fulfillmentStatus === 'fulfilled';
  const isCancelled = order.fulfillmentStatus === 'cancelled';
  const isMoving = isDispatched && MOVING_STATES.has(dk);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
      setOpen(false);
    } catch {
      // L'erreur détaillée reste visible dans le panneau déplié (bloc actions).
      // Ici on garde le menu ouvert pour laisser réessayer.
    } finally {
      setBusy(false);
    }
  }

  const setConf = (c: 'confirmed' | 'callback' | 'no_answer' | 'declined') =>
    run(() => storesApi.setOrderConfirmation(storeId, order._id, { confirmationStatus: c }));
  const dispatch = () =>
    run(() => storesApi.dispatchOrder(storeId, order._id, hasErr ? { retry: true } : {}));
  const markPaid = () =>
    run(() => storesApi.manualOrderStatus(storeId, order._id, { paymentStatus: 'paid', force: isMoving }));
  const markFulfilled = () =>
    run(() => storesApi.manualOrderStatus(storeId, order._id, { fulfillmentStatus: 'fulfilled', paymentStatus: isPaid ? undefined : 'paid', force: isMoving }));
  const cancel = async () => {
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
    await run(() => storesApi.manualOrderStatus(storeId, order._id, { fulfillmentStatus: 'cancelled', reason, force: isMoving }));
  };

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Changer le statut"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'grid h-8 w-8 place-items-center rounded-lg transition-colors',
          open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-30 w-56 rounded-xl border border-border/60 bg-card p-1 shadow-lg"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Confirmation client</p>
          {conf !== 'confirmed' && <StatusMenuItem icon={CheckCircle2} label="Confirmer" onClick={() => setConf('confirmed')} busy={busy} />}
          {conf !== 'callback' && <StatusMenuItem icon={PhoneIncoming} label="À rappeler" onClick={() => setConf('callback')} busy={busy} />}
          {conf !== 'no_answer' && <StatusMenuItem icon={PhoneMissed} label="Ne décroche pas" onClick={() => setConf('no_answer')} busy={busy} />}
          {conf !== 'declined' && <StatusMenuItem icon={PhoneOff} label="Refuser" onClick={() => setConf('declined')} danger busy={busy} />}

          <div className="my-1 h-px bg-border/60" />
          <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Traitement</p>
          {(!isDispatched || hasErr) && (
            <StatusMenuItem icon={Truck} label={hasErr ? 'Renvoyer au transporteur' : 'Envoyer au transporteur'} onClick={dispatch} busy={busy} />
          )}
          {!isPaid && <StatusMenuItem icon={Banknote} label="Marquer payée" onClick={markPaid} busy={busy} />}
          {!isFulfilled && <StatusMenuItem icon={CheckCircle2} label="Marquer livrée" onClick={markFulfilled} busy={busy} />}
          {!isCancelled && <StatusMenuItem icon={X} label="Annuler la commande" onClick={cancel} danger busy={busy} />}
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
  productImages,
}: {
  order: OrderType;
  storeId: string;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void | Promise<void>;
  /** Lookup productId → première image, hydratée depuis listProducts en amont. */
  productImages: Record<string, string>;
}) {
  const payment = PAYMENT_BADGE[o.paymentStatus] || { label: o.paymentStatus, cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' };
  const deliveryKey = (o.delivery?.externalStatus || '').toLowerCase();
  const delivery = DELIVERY_BADGE[deliveryKey];
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

  const stage = STAGE[computeStage(o)];
  const firstItemImg = mediaUrl(productImages[o.items[0]?.productId || '']);
  const pendingConfirm = (!o.confirmationStatus || o.confirmationStatus === 'pending');

  return (
    <>
      {/* Row principale — cliquable pour déplier les détails. */}
      <tr
        onClick={onToggle}
        className={cn(
          'cursor-pointer transition-colors',
          expanded ? 'bg-primary/5' : 'hover:bg-muted/30',
        )}
      >
        {/* Commande — numéro + date, avec la barre de statut à gauche */}
        <td className="relative px-3 py-3 sm:px-4">
          <span className={cn('absolute inset-y-0 left-0 w-1', stage.stripe)} aria-hidden />
          <div className="font-mono text-xs font-semibold">{o.orderNumber}</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(o.createdAt)}
          </div>
        </td>

        {/* Client — avatar + nom + téléphone cliquable */}
        <td className="px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white shadow-sm',
                avatarGrad,
              )}
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {o.customerName || 'Anonyme'}
              </div>
              {o.customerPhone ? (
                <a
                  href={`tel:${o.customerPhone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-2.5 w-2.5" />
                  {o.customerPhone}
                </a>
              ) : o.shippingAddress?.city ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-2.5 w-2.5" />
                  {o.shippingAddress.city}
                </span>
              ) : null}
            </div>
          </div>
        </td>

        {/* Produits — thumbnail + nom du 1er + « +N » */}
        <td className="px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border/60 bg-muted"
              title={o.items[0]?.name}
            >
              {firstItemImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firstItemImg} alt={o.items[0]?.name || ''} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <Package className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {o.items[0]?.name || 'Produit'}
                {o.items[0]?.quantity > 1 && <span className="ml-1 text-muted-foreground">×{o.items[0].quantity}</span>}
              </div>
              {o.items.length > 1 && (
                <div className="text-[10px] text-muted-foreground">
                  +{o.items.length - 1} autre{o.items.length > 2 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Total — grand + nombre d'articles en sous-titre */}
        <td className="px-3 py-3 text-right sm:px-4">
          <div className="text-sm font-bold tabular-nums">
            {formatCurrency(o.total, o.currency)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {totalQty} art.
          </div>
        </td>

        {/* Paiement — pastille + label + badge COD */}
        <td className="px-3 py-3 sm:px-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                o.paymentStatus === 'paid'
                  ? 'bg-emerald-500'
                  : o.paymentStatus === 'refunded'
                    ? 'bg-slate-400'
                    : o.paymentStatus === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-amber-500',
              )}
            />
            {payment.label}
          </span>
          {o.paymentMethod === 'cod' && (
            <div className="mt-0.5">
              <span className="rounded bg-muted/70 px-1 py-px text-[9px] font-semibold uppercase text-muted-foreground">
                COD
              </span>
            </div>
          )}
        </td>

        {/* Statut — stepper compact */}
        <td className="px-3 py-3 sm:px-4">
          <OrderStepper order={o} />
        </td>

        {/* Actions — menu ⋯ + chevron d'expand */}
        <td className="w-10 px-2 py-3">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <StatusMenu order={o} storeId={storeId} onChanged={onChanged} />
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-180 text-primary',
              )}
            />
          </div>
        </td>
      </tr>

      {/* Quick-confirm — row auxiliaire visible seulement pour les commandes
          en attente de confirmation, non dépliées. Colspan = 7 pour couvrir
          toute la largeur. Économise 50 clics/jour à l'agent de confirmation. */}
      {pendingConfirm && !expanded && (
        <tr className="border-t border-border/40">
          <td colSpan={7} className="bg-amber-500/5 px-4 py-1.5">
            <QuickConfirmBar order={o} storeId={storeId} onChanged={onChanged} />
          </td>
        </tr>
      )}

      {/* Détails dépliés — row avec colspan qui prend toute la largeur. */}
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-muted/20 p-4 sm:p-6">
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
                  {o.items.map((it, i) => {
                    const img = mediaUrl(productImages[it.productId]);
                    return (
                    <tr key={`${it.productId}-${i}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-border/60 bg-muted">
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={img} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <Package className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{it.name}</div>
                            {it.variantId && (
                              <div className="text-[11px] text-muted-foreground">Variante : {it.variantId}</div>
                            )}
                          </div>
                        </div>
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
                    );
                  })}
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
          </td>
        </tr>
      )}
    </>
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
