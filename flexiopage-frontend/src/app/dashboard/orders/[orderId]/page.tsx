'use client';

/**
 * Order detail — what opens when the seller clicks an order from the dashboard
 * home or the orders list. Single source of truth for one order: customer,
 * items, pricing breakdown, payment, delivery, COD confirmation status, and
 * the manual override / confirmation actions wired to the existing PATCH
 * endpoints. The list page already shows expanded cards inline, but a
 * dedicated URL is needed so links from emails, the dashboard home, and
 * deep-link bookmarks all resolve.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Hourglass,
  Loader2,
  MapPin,
  Package,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  RotateCcw,
  ShoppingCart,
  Truck,
  User as UserIcon,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { storesApi, extractApiError } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type ConfirmationStatus = 'pending' | 'confirmed' | 'no_answer' | 'callback' | 'declined';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'manual';
type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled' | 'cancelled';

interface OrderItem {
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  sku?: string;
}

interface OrderDoc {
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
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  paymentProvider?: string;
  paymentReference?: string;
  fulfillmentStatus: FulfillmentStatus;
  trackingNumber?: string;
  trackingUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  delivery?: {
    provider?: string;
    externalId?: string;
    externalStatus?: string;
    trackingUrl?: string;
    dispatchedAt?: string;
    error?: string;
  };
  statusHistory?: Array<{
    at: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    confirmationStatus?: string;
    note?: string;
  }>;
  confirmationStatus?: ConfirmationStatus;
  confirmationNote?: string;
  callbackAt?: string;
  confirmedAt?: string;
}

const PAYMENT_BADGE: Record<PaymentStatus, { label: string; cls: string }> = {
  paid:     { label: 'Payée',      cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  pending:  { label: 'En attente', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
  failed:   { label: 'Échec',      cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20' },
  refunded: { label: 'Remboursée', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
  manual:   { label: 'Manuelle',   cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
};

const FULFILL_BADGE: Record<FulfillmentStatus, { label: string; cls: string }> = {
  unfulfilled: { label: 'Non traitée', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
  partial:     { label: 'Partielle',   cls: 'bg-sky-500/10 text-sky-700 ring-sky-500/20' },
  fulfilled:   { label: 'Traitée',     cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  cancelled:   { label: 'Annulée',     cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20' },
};

const CONFIRMATION_BADGE: Record<ConfirmationStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:   { label: 'À confirmer',     cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20',     icon: PhoneCall },
  confirmed: { label: 'Confirmé',        cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20', icon: CheckCircle2 },
  no_answer: { label: 'Ne décroche pas', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',     icon: PhoneMissed },
  callback:  { label: 'À rappeler',      cls: 'bg-sky-500/10 text-sky-700 ring-sky-500/20',           icon: PhoneIncoming },
  declined:  { label: 'Refusé',          cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',        icon: PhoneOff },
};

const DELIVERY_BADGE: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:    { label: 'En attente',     cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',         icon: Hourglass },
  assigned:   { label: 'Assigné',        cls: 'bg-blue-500/10 text-blue-700 ring-blue-500/20',           icon: UserIcon },
  picked_up:  { label: 'Récupéré',       cls: 'bg-violet-500/10 text-violet-700 ring-violet-500/20',     icon: Package },
  in_transit: { label: 'En transit',     cls: 'bg-indigo-500/10 text-indigo-700 ring-indigo-500/20',     icon: Truck },
  delivered:  { label: 'Livré',          cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20', icon: CheckCircle2 },
  returned:   { label: 'Retourné',       cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',           icon: RotateCcw },
  cancelled:  { label: 'Annulé',         cls: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',           icon: AlertTriangle },
  failed:     { label: 'Échec dispatch', cls: 'bg-red-500/10 text-red-700 ring-red-500/20',             icon: AlertTriangle },
};

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params?.orderId;
  const storeIdParam = searchParams.get('storeId');
  const { storeId } = useScopedStoreId(storeIdParam);

  const [order, setOrder] = useState<OrderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!storeId || !orderId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await storesApi.getOrder(storeId, orderId);
      setOrder((res.data as { order: OrderDoc }).order);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger la commande.'));
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId]);

  useEffect(() => { void fetchOrder(); }, [fetchOrder]);

  // Auto-clear the inline action message after a short delay so it doesn't
  // pile up on a screen the seller might keep open.
  useEffect(() => {
    if (!actionMsg) return;
    const id = window.setTimeout(() => setActionMsg(null), 4000);
    return () => window.clearTimeout(id);
  }, [actionMsg]);

  const setConfirmation = useCallback(async (status: ConfirmationStatus) => {
    if (!storeId || !order) return;
    setSaving(true);
    try {
      const res = await storesApi.setOrderConfirmation(storeId, order._id, { confirmationStatus: status });
      setOrder((res.data as { order: OrderDoc }).order);
      setActionMsg({ kind: 'ok', text: `Statut d'appel mis à jour: ${CONFIRMATION_BADGE[status].label}` });
    } catch (err) {
      setActionMsg({ kind: 'err', text: extractApiError(err, "Échec de la mise à jour.") });
    } finally {
      setSaving(false);
    }
  }, [storeId, order]);

  const setPaymentStatus = useCallback(async (paymentStatus: PaymentStatus) => {
    if (!storeId || !order) return;
    setSaving(true);
    try {
      const res = await storesApi.manualOrderStatus(storeId, order._id, { paymentStatus, force: true });
      setOrder((res.data as { order: OrderDoc }).order);
      setActionMsg({ kind: 'ok', text: `Paiement marqué: ${PAYMENT_BADGE[paymentStatus].label}` });
    } catch (err) {
      setActionMsg({ kind: 'err', text: extractApiError(err, "Échec de la mise à jour.") });
    } finally {
      setSaving(false);
    }
  }, [storeId, order]);

  const setFulfillmentStatus = useCallback(async (fulfillmentStatus: FulfillmentStatus) => {
    if (!storeId || !order) return;
    setSaving(true);
    try {
      const res = await storesApi.manualOrderStatus(storeId, order._id, { fulfillmentStatus, force: true });
      setOrder((res.data as { order: OrderDoc }).order);
      setActionMsg({ kind: 'ok', text: `Traitement: ${FULFILL_BADGE[fulfillmentStatus].label}` });
    } catch (err) {
      setActionMsg({ kind: 'err', text: extractApiError(err, "Échec de la mise à jour.") });
    } finally {
      setSaving(false);
    }
  }, [storeId, order]);

  const copyOrderNumber = useCallback(async () => {
    if (!order?.orderNumber) return;
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked — silent fail, user can still select manually
    }
  }, [order]);

  const backHref = useMemo(() => (storeId ? `/dashboard/orders?storeId=${storeId}` : '/dashboard/orders'), [storeId]);
  const currentConf: ConfirmationStatus = order?.confirmationStatus || 'pending';

  // ── Loading / error states ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement de la commande…
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour aux commandes
        </Link>
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-700">
          {error || 'Commande introuvable.'}
        </div>
      </div>
    );
  }

  const paymentBadge = PAYMENT_BADGE[order.paymentStatus];
  const fulfillBadge = FULFILL_BADGE[order.fulfillmentStatus];
  const confBadge = CONFIRMATION_BADGE[currentConf];
  const deliveryStatus = order.delivery?.externalStatus;
  const deliveryBadge = deliveryStatus ? DELIVERY_BADGE[deliveryStatus] : null;
  const trackingUrl = order.delivery?.trackingUrl || order.trackingUrl;

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb + back ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={backHref} className="hover:text-foreground">Commandes</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="truncate text-foreground/70">#{order.orderNumber}</span>
      </div>

      {/* ── Header card ───────────────────────────────────────── */}
      <header className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
              Commande #{order.orderNumber}
            </h1>
            <button
              type="button"
              onClick={copyOrderNumber}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Copier le numéro"
              aria-label="Copier le numéro de commande"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(order.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Banknote className="h-3 w-3" />
              {formatCurrency(order.total, order.currency)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', paymentBadge.cls)}>
            <CreditCard className="h-3 w-3" /> {paymentBadge.label}
          </span>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', fulfillBadge.cls)}>
            <Package className="h-3 w-3" /> {fulfillBadge.label}
          </span>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', confBadge.cls)}>
            <confBadge.icon className="h-3 w-3" /> {confBadge.label}
          </span>
          {deliveryBadge && (
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', deliveryBadge.cls)}>
              <deliveryBadge.icon className="h-3 w-3" /> {deliveryBadge.label}
            </span>
          )}
        </div>
      </header>

      {/* ── Action result banner (auto-clears after 4s) ───────── */}
      {actionMsg && (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-xs font-medium',
            actionMsg.kind === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700'
              : 'border-rose-500/30 bg-rose-500/5 text-rose-700'
          )}
        >
          {actionMsg.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Left: items + pricing ─────────────────────────── */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <h2 className="text-sm font-semibold">Articles ({order.items.length})</h2>
              <span className="text-xs text-muted-foreground">
                {order.items.reduce((s, i) => s + i.quantity, 0)} unité{order.items.reduce((s, i) => s + i.quantity, 0) > 1 ? 's' : ''}
              </span>
            </div>
            <ul className="divide-y divide-border/40">
              {order.items.map((item, idx) => (
                <li key={`${item.productId}-${item.variantId || idx}`} className="flex items-start gap-3 px-4 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted/60">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{item.quantity} × {formatCurrency(item.price, order.currency)}</span>
                      {item.variantId && <span>Variante: {item.variantId}</span>}
                      {item.sku && <span>SKU: {item.sku}</span>}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(item.total, order.currency)}
                  </div>
                </li>
              ))}
            </ul>
            {/* Totals */}
            <dl className="space-y-1.5 border-t border-border/40 px-4 py-3 text-sm">
              <Row label="Sous-total" value={formatCurrency(order.subtotal, order.currency)} />
              {order.shippingCost > 0 && (
                <Row label="Livraison" value={formatCurrency(order.shippingCost, order.currency)} />
              )}
              {(order.tax ?? 0) > 0 && (
                <Row label="Taxe" value={formatCurrency(order.tax ?? 0, order.currency)} />
              )}
              {(order.discount ?? 0) > 0 && (
                <Row label="Remise" value={`− ${formatCurrency(order.discount ?? 0, order.currency)}`} tone="emerald" />
              )}
              <div className="my-1 h-px bg-border/60" />
              <Row label={<span className="font-semibold">Total</span>} value={<span className="text-base font-bold">{formatCurrency(order.total, order.currency)}</span>} />
            </dl>
          </section>

          {/* Notes */}
          {order.notes && (
            <section className="rounded-2xl border border-border/60 bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Notes</h2>
              <p className="whitespace-pre-line text-sm text-foreground/80">{order.notes}</p>
            </section>
          )}

          {/* Status history — only shown when there is something to show. */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <section className="rounded-2xl border border-border/60 bg-card">
              <div className="border-b border-border/40 px-4 py-3">
                <h2 className="text-sm font-semibold">Historique</h2>
              </div>
              <ul className="divide-y divide-border/40">
                {order.statusHistory.slice().reverse().map((h, i) => (
                  <li key={i} className="px-4 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-foreground/80">
                      <span className="text-muted-foreground">{formatDate(h.at)}</span>
                      {h.paymentStatus && <Pill>{`Paiement → ${PAYMENT_BADGE[h.paymentStatus as PaymentStatus]?.label || h.paymentStatus}`}</Pill>}
                      {h.fulfillmentStatus && <Pill>{`Traitement → ${FULFILL_BADGE[h.fulfillmentStatus as FulfillmentStatus]?.label || h.fulfillmentStatus}`}</Pill>}
                      {h.confirmationStatus && <Pill>{`Appel → ${CONFIRMATION_BADGE[h.confirmationStatus as ConfirmationStatus]?.label || h.confirmationStatus}`}</Pill>}
                    </div>
                    {h.note && <div className="mt-1 text-muted-foreground">{h.note}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── Right: customer, delivery, actions ────────────── */}
        <aside className="space-y-4">
          {/* Customer */}
          <section className="rounded-2xl border border-border/60 bg-card p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <UserIcon className="h-4 w-4 text-muted-foreground" /> Client
            </h2>
            <div className="space-y-2 text-sm">
              <div className="font-medium">{order.customerName || '—'}</div>
              {order.email && (
                <div className="break-all text-xs text-muted-foreground">{order.email}</div>
              )}
              {order.customerPhone && (
                <a
                  href={`tel:${order.customerPhone}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Phone className="h-3 w-3" /> {order.customerPhone}
                </a>
              )}
            </div>
            {/* Address */}
            {order.shippingAddress && (
              <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs">
                <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Adresse de livraison
                </div>
                <div className="space-y-0.5 text-foreground/80">
                  {order.shippingAddress.line1 && <div>{order.shippingAddress.line1}</div>}
                  {order.shippingAddress.line2 && <div>{order.shippingAddress.line2}</div>}
                  <div>
                    {[order.shippingAddress.postalCode, order.shippingAddress.city]
                      .filter(Boolean)
                      .join(' ')}
                  </div>
                  {order.shippingAddress.country && <div>{order.shippingAddress.country}</div>}
                </div>
              </div>
            )}
          </section>

          {/* Payment */}
          <section className="rounded-2xl border border-border/60 bg-card p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <CreditCard className="h-4 w-4 text-muted-foreground" /> Paiement
            </h2>
            <div className="space-y-1 text-xs text-foreground/80">
              {order.paymentMethod && <div><span className="text-muted-foreground">Méthode: </span>{order.paymentMethod}</div>}
              {order.paymentProvider && <div><span className="text-muted-foreground">Prestataire: </span>{order.paymentProvider}</div>}
              {order.paymentReference && <div className="break-all"><span className="text-muted-foreground">Référence: </span>{order.paymentReference}</div>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['paid', 'pending', 'failed', 'refunded'] as PaymentStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={saving || order.paymentStatus === s}
                  onClick={() => setPaymentStatus(s)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition-colors',
                    order.paymentStatus === s
                      ? PAYMENT_BADGE[s].cls
                      : 'bg-card text-muted-foreground ring-border/60 hover:bg-muted',
                    saving && 'opacity-60'
                  )}
                >
                  {PAYMENT_BADGE[s].label}
                </button>
              ))}
            </div>
          </section>

          {/* Fulfillment / delivery */}
          <section className="rounded-2xl border border-border/60 bg-card p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Truck className="h-4 w-4 text-muted-foreground" /> Traitement & livraison
            </h2>
            {order.delivery?.provider && (
              <div className="mb-2 space-y-0.5 text-xs text-foreground/80">
                <div><span className="text-muted-foreground">Transporteur: </span>{order.delivery.provider}</div>
                {order.delivery.externalId && (
                  <div><span className="text-muted-foreground">ID dispatch: </span>{order.delivery.externalId}</div>
                )}
                {order.delivery.dispatchedAt && (
                  <div><span className="text-muted-foreground">Envoyé le: </span>{formatDate(order.delivery.dispatchedAt)}</div>
                )}
                {order.delivery.error && (
                  <div className="text-rose-700"><span className="text-muted-foreground">Erreur: </span>{order.delivery.error}</div>
                )}
              </div>
            )}
            {trackingUrl && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Suivre le colis <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(['unfulfilled', 'fulfilled', 'cancelled'] as FulfillmentStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={saving || order.fulfillmentStatus === s}
                  onClick={() => setFulfillmentStatus(s)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition-colors',
                    order.fulfillmentStatus === s
                      ? FULFILL_BADGE[s].cls
                      : 'bg-card text-muted-foreground ring-border/60 hover:bg-muted',
                    saving && 'opacity-60'
                  )}
                >
                  {FULFILL_BADGE[s].label}
                </button>
              ))}
            </div>
          </section>

          {/* Confirmation call (COD) */}
          <section className="rounded-2xl border border-border/60 bg-card p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <PhoneCall className="h-4 w-4 text-muted-foreground" /> Confirmation (appel COD)
            </h2>
            {order.confirmationNote && (
              <div className="mb-2 rounded-lg bg-muted/40 p-2 text-xs text-foreground/80">
                {order.confirmationNote}
              </div>
            )}
            {order.callbackAt && currentConf === 'callback' && (
              <div className="mb-2 text-xs text-muted-foreground">
                Rappel prévu: <span className="font-medium text-foreground">{formatDate(order.callbackAt)}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(['pending', 'confirmed', 'no_answer', 'callback', 'declined'] as ConfirmationStatus[]).map((s) => {
                const b = CONFIRMATION_BADGE[s];
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={saving || currentConf === s}
                    onClick={() => setConfirmation(s)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition-colors',
                      currentConf === s
                        ? b.cls
                        : 'bg-card text-muted-foreground ring-border/60 hover:bg-muted',
                      saving && 'opacity-60'
                    )}
                  >
                    <b.icon className="h-3 w-3" /> {b.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Back to list */}
          <Button
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={() => router.push(backHref)}
          >
            <ArrowLeft className="h-4 w-4" /> Retour à la liste
          </Button>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tiny presentational helpers — kept inline to avoid scattering 8-line
// components across the codebase.
// ─────────────────────────────────────────────────────────────────────

function Row({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: 'emerald' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', tone === 'emerald' && 'text-emerald-700')}>{value}</dd>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground/80">
      {children}
    </span>
  );
}
