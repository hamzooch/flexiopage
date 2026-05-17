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
  Hash,
  RotateCcw,
  Banknote,
  X,
} from 'lucide-react';

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
    note?: string;
  }>;
}

type StatusFilter = 'all' | 'pending' | 'paid' | 'delivered' | 'cancelled';
type DayFilter = 'all' | 'today' | '7d' | '30d';

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

  const refreshOrders = useCallback(() => {
    if (!selectedStoreId) {
      setOrders([]);
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    return storesApi
      .listOrders(selectedStoreId)
      .then((res) => setOrders((res.data as { orders: OrderType[] }).orders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [selectedStoreId]);

  useEffect(() => { void refreshOrders(); }, [refreshOrders]);

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

  // ── Filter / search ──────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    let list = orders;

    // Custom range takes precedence over the preset chips. Either bound
    // can be set alone; missing bound means "no limit on that side".
    const fromMs = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null;
    const toMs = customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : null;
    if (fromMs !== null || toMs !== null) {
      list = list.filter((o) => {
        if (!o.createdAt) return false;
        const t = new Date(o.createdAt).getTime();
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
        return true;
      });
    } else if (dayFilter !== 'all') {
      // Preset chip — `today` means since local midnight, not "last 24h".
      const cutoff = new Date();
      if (dayFilter === 'today') {
        cutoff.setHours(0, 0, 0, 0);
      } else if (dayFilter === '7d') {
        cutoff.setDate(cutoff.getDate() - 7);
      } else if (dayFilter === '30d') {
        cutoff.setDate(cutoff.getDate() - 30);
      }
      const cutoffMs = cutoff.getTime();
      list = list.filter((o) => o.createdAt && new Date(o.createdAt).getTime() >= cutoffMs);
    }

    if (statusFilter !== 'all') {
      list = list.filter((o) => {
        if (statusFilter === 'pending') return o.paymentStatus === 'pending';
        if (statusFilter === 'paid') return o.paymentStatus === 'paid';
        if (statusFilter === 'delivered') return o.delivery?.externalStatus === 'delivered';
        if (statusFilter === 'cancelled')
          return o.fulfillmentStatus === 'cancelled' || o.delivery?.externalStatus === 'cancelled';
        return true;
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          (o.customerName?.toLowerCase() || '').includes(q) ||
          (o.customerPhone || '').includes(q) ||
          (o.shippingAddress?.city?.toLowerCase() || '').includes(q) ||
          (o.shippingAddress?.line1?.toLowerCase() || '').includes(q)
        );
      });
    }
    return list;
  }, [orders, dayFilter, customFrom, customTo, statusFilter, search]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full gradient-brand opacity-10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <ShoppingCart className="h-3 w-3" /> Commandes
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Commandes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Toutes les commandes reçues — détails client, articles, livraison.
          </p>
        </div>
      </header>

      {/* Store tabs */}
      {stores.length > 1 && (
        <div className="-mx-3 overflow-x-auto pb-1 sm:mx-0">
          <div className="flex w-max gap-2 px-3 sm:flex-wrap sm:px-0">
            {stores.map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => setSelectedStoreId(s._id)}
                className={cn(
                  'shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:py-2 sm:text-sm',
                  selectedStoreId === s._id
                    ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'border-border/70 hover:border-primary/40 hover:bg-muted'
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={ShoppingCart} tint="indigo" />
        <StatCard label="En attente" value={stats.pending} icon={Hourglass} tint="amber" />
        <StatCard label="Payées" value={stats.paid} icon={CheckCircle2} tint="emerald" />
        <StatCard
          label="Revenu"
          value={formatCurrency(stats.revenue)}
          sublabel="Livrées + payées"
          icon={Banknote}
          tint="fuchsia"
        />
      </section>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par n° commande, nom, téléphone, ville…"
            className="h-11 rounded-xl pl-10"
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'today', '7d', '30d'] as DayFilter[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDayFilter(d);
                  // Selecting a preset clears any custom range so the two
                  // can't visually contradict each other.
                  setCustomFrom('');
                  setCustomTo('');
                }}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                  dayFilter === d && !customFrom && !customTo
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                )}
              >
                {d === 'all' ? 'Toute période' : d === 'today' ? "Aujourd'hui" : d === '7d' ? '7 derniers jours' : '30 derniers jours'}
              </button>
            ))}

            {/* Custom date range — when either is set, presets visually deselect */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 py-1">
              <span className="text-[11px] font-medium text-muted-foreground">Du</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  if (e.target.value) setDayFilter('all');
                }}
                className="h-6 rounded bg-transparent text-xs outline-none focus:ring-1 focus:ring-primary/40"
              />
              <span className="text-[11px] font-medium text-muted-foreground">au</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  if (e.target.value) setDayFilter('all');
                }}
                className="h-6 rounded bg-transparent text-xs outline-none focus:ring-1 focus:ring-primary/40"
              />
              {(customFrom || customTo) && (
                <button
                  type="button"
                  onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                  className="ml-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Effacer la plage personnalisée"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'pending', 'paid', 'delivered', 'cancelled'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                  statusFilter === s
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                )}
              >
                {s === 'all' ? 'Tout statut' : s === 'pending' ? 'En attente' : s === 'paid' ? 'Payées' : s === 'delivered' ? 'Livrées' : 'Annulées'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {!selectedStoreId ? (
        <EmptyState title="Sélectionne une boutique" body="Choisis une boutique ci-dessus pour voir ses commandes." />
      ) : loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title={orders.length === 0 ? 'Pas encore de commandes' : 'Aucun résultat'}
          body={orders.length === 0
            ? 'Les nouvelles commandes apparaîtront ici dès qu\'un client commande.'
            : 'Aucune commande ne correspond aux filtres.'}
        />
      ) : (
        <ul className="space-y-3">
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
      )}
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: 'indigo' | 'amber' | 'emerald' | 'fuchsia';
}) {
  const tintMap = {
    indigo: 'from-indigo-500/15 to-violet-500/10 bg-indigo-500/15 text-indigo-700',
    amber: 'from-amber-500/15 to-orange-500/10 bg-amber-500/15 text-amber-700',
    emerald: 'from-emerald-500/15 to-teal-500/10 bg-emerald-500/15 text-emerald-700',
    fuchsia: 'from-fuchsia-500/15 to-pink-500/10 bg-fuchsia-500/15 text-fuchsia-700',
  };
  const [grad, , iconBg, iconColor] = tintMap[tint].split(/\s+/);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <div className={cn('pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br blur-3xl', grad)} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1.5 truncate text-xl font-bold tracking-tight sm:text-2xl">{value}</div>
          {sublabel && <div className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</div>}
        </div>
        <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', iconBg, iconColor)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
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

  return (
    <li className="overflow-hidden rounded-2xl border border-border/60 bg-card transition-all hover:border-primary/30 hover:shadow-lg">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30 sm:gap-4 sm:p-5"
      >
        {/* Order # tile */}
        <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl gradient-brand text-white shadow-md sm:grid">
          <Hash className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-foreground">{o.orderNumber}</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(o.createdAt)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {o.customerName && (
                  <span className="inline-flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    <span className="font-medium text-foreground/80">{o.customerName}</span>
                  </span>
                )}
                {o.customerPhone && (
                  <a href={`tel:${o.customerPhone}`} className="inline-flex items-center gap-1 hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                    <Phone className="h-3 w-3" />
                    {o.customerPhone}
                  </a>
                )}
                {o.shippingAddress?.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {o.shippingAddress.city}
                    {o.shippingAddress.country && ` · ${o.shippingAddress.country}`}
                  </span>
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

          {/* Badges row */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', payment.cls)}>
              <CreditCard className="h-3 w-3" />
              {payment.label}
            </span>
            {o.paymentMethod && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {o.paymentMethod === 'cod' ? 'Paiement à la livraison' : o.paymentMethod}
              </span>
            )}
            {o.delivery?.error ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-500/20" title={o.delivery.error}>
                <AlertTriangle className="h-3 w-3" />
                Échec dispatch
              </span>
            ) : delivery && DeliveryIcon ? (
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', delivery.cls)}>
                <DeliveryIcon className="h-3 w-3" />
                {delivery.label}
              </span>
            ) : null}
          </div>
        </div>

        {/* Expand chevron */}
        <ChevronDown
          className={cn(
            'mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 p-4 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-3">
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
                  <p className="text-xs text-muted-foreground">Tu peux retenter depuis le détail de la commande.</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Pas encore dispatchée.</p>
              )}
            </DetailSection>
          </div>

          {/* Items */}
          <div className="mt-6">
            <h3 className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Articles ({o.items.length})
            </h3>
            <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
              <table className="w-full text-sm">
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
    const reason = window.prompt('Raison de l\'annulation (visible dans l\'historique)', isMoving ? 'Annulation manuelle après dispatch' : 'Annulation manuelle');
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
