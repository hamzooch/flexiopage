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
  ShieldCheck,
  ShieldAlert,
  Shield,
  Printer,
} from 'lucide-react';
import { storesApi, extractApiError } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { formatCurrency, formatDate, cn, mediaUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { CustomerReliability, ReliabilityBadge } from '@/types/reliability';

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
  customerWhatsapp?: string;
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
  // Lookup productId → image, hydraté depuis listProducts (les snapshots
  // OrderItem ne stockent que name/price/qty, pas d'image).
  const [productImages, setProductImages] = useState<Record<string, string>>({});

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

  // Charge les images produits du store (une seule requête). On borne à 500 —
  // les gros catalogues afficheront un placeholder pour les items absents.
  useEffect(() => {
    if (!storeId) { setProductImages({}); return; }
    let cancelled = false;
    storesApi.listProducts(storeId, { limit: 500 })
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
  }, [storeId]);

  // Fiabilité client (score de retours) — chargé en parallèle pour aider
  // l'agent de confirmation. N'interrompt jamais l'affichage de la commande.
  const [reliability, setReliability] = useState<CustomerReliability | null>(null);
  const [relLoading, setRelLoading] = useState(false);
  useEffect(() => {
    if (!storeId || !orderId) return;
    let cancelled = false;
    setRelLoading(true);
    setReliability(null);
    storesApi
      .getCustomerReliability(storeId, { orderId })
      .then((res) => { if (!cancelled) setReliability(res.data.reliability); })
      .catch(() => { if (!cancelled) setReliability(null); })
      .finally(() => { if (!cancelled) setRelLoading(false); });
    return () => { cancelled = true; };
  }, [storeId, orderId]);

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
          {order.shippingAddress && (
            <a
              href={`/bordereau?storeId=${storeId}&ids=${order._id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mr-1 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
              title="Ouvrir le bordereau de livraison (impression / PDF)"
            >
              <Printer className="h-3.5 w-3.5" /> Bordereau
            </a>
          )}
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
              {order.items.map((item, idx) => {
                const img = mediaUrl(productImages[item.productId]);
                return (
                <li key={`${item.productId}-${item.variantId || idx}`} className="flex items-start gap-3 px-4 py-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/60 bg-muted/60">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Package className="h-4 w-4 text-muted-foreground" />
                    )}
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
                );
              })}
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

          {/* Timeline lifecycle — vue verticale des grandes étapes.
              Dérive les timestamps de statusHistory + fields explicites de
              l'order. Chaque étape a un état (done/current/upcoming) et
              une couleur qui reflète le stade actuel. */}
          <OrderLifecycleTimeline order={order} />

          {/* Historique brut — restant utile pour l'audit détaillé (chaque
              action manuelle du vendeur avec la note associée). */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <section className="rounded-2xl border border-border/60 bg-card">
              <div className="border-b border-border/40 px-4 py-3">
                <h2 className="text-sm font-semibold">Historique détaillé</h2>
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
              {order.customerWhatsapp && (
                <a
                  href={`https://wa.me/${order.customerWhatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20"
                >
                  💬 WhatsApp
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

          {/* Fiabilité client — aide l'agent avant de confirmer. */}
          <ReliabilityPanel loading={relLoading} data={reliability} />

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

// ─────────────────────────────────────────────────────────────────────
// Fiabilité client — panneau d'aide à la décision pour l'agent de
// confirmation COD. Système « conseil seulement » : on informe, on ne
// bloque pas. Cf. backend customerReliability.service.ts.
// ─────────────────────────────────────────────────────────────────────

const REL_BADGE: Record<ReliabilityBadge, {
  label: string;
  advice: string;
  icon: typeof ShieldCheck;
  card: string;
  chip: string;
}> = {
  reliable: {
    label: 'Client fiable',
    advice: 'Aucun historique de retour. Confirmation standard.',
    icon: ShieldCheck,
    card: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20',
    chip: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800',
  },
  watch: {
    label: 'À surveiller',
    advice: 'Incident(s) passé(s). Bien reconfirmer l’adresse et la disponibilité du client.',
    icon: Shield,
    card: 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
    chip: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800',
  },
  risky: {
    label: 'Risque élevé',
    advice: 'Retours répétés. Insister sur la confirmation — envisager un acompte ou un contact vidéo avant expédition.',
    icon: ShieldAlert,
    card: 'border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20',
    chip: 'bg-red-100 text-red-800 ring-red-200 dark:bg-red-900/40 dark:text-red-200 dark:ring-red-800',
  },
};

/** Libellé court de l'issue d'une commande passée. */
function orderOutcome(o: CustomerReliability['store']['orders'][number]): { text: string; tone: string } {
  if (o.isReturn) return { text: 'Retourné', tone: 'text-red-700 dark:text-red-300' };
  if (o.deliveryStatus === 'delivered' || o.fulfillmentStatus === 'fulfilled')
    return { text: 'Livré', tone: 'text-emerald-700 dark:text-emerald-300' };
  if (o.confirmationStatus === 'declined') return { text: 'Refusé (appel)', tone: 'text-red-700 dark:text-red-300' };
  if (o.fulfillmentStatus === 'cancelled') return { text: 'Annulé', tone: 'text-muted-foreground' };
  return { text: 'En cours', tone: 'text-muted-foreground' };
}

function ReliabilityPanel({ loading, data }: { loading: boolean; data: CustomerReliability | null }) {
  if (loading && !data) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse de la fiabilité client…
        </div>
      </section>
    );
  }
  if (!data) return null;

  // Pas de numéro exploitable → note discrète, pas de faux « fiable ».
  if (!data.phoneKey) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-4 text-xs text-muted-foreground">
        <Shield className="mr-1.5 inline h-3.5 w-3.5" /> Fiabilité indisponible (numéro absent ou invalide).
      </section>
    );
  }

  const b = REL_BADGE[data.badge];
  const Icon = b.icon;
  const s = data.store;
  const p = data.platform;
  const platformExtra = Math.max(0, p.returned - s.returned); // retours vus ailleurs sur la plateforme

  return (
    <section className={cn('rounded-2xl border p-4', b.card)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="h-4 w-4" /> Fiabilité client
        </h2>
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', b.chip)}>
          {b.label} · {data.score}/100
        </span>
      </div>

      <p className="mb-3 text-xs text-foreground/80">{b.advice}</p>

      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background/60 p-2">
          <div className="text-base font-semibold tabular-nums">{s.returned}</div>
          <div className="text-[10px] text-muted-foreground">Retours (boutique)</div>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <div className="text-base font-semibold tabular-nums">{Math.round(p.returnRate * 100)}%</div>
          <div className="text-[10px] text-muted-foreground">Taux de retour</div>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <div className="text-base font-semibold tabular-nums">{p.returned}</div>
          <div className="text-[10px] text-muted-foreground">Retours (plateforme)</div>
        </div>
      </div>

      {platformExtra > 0 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-background/60 px-2 py-1.5 text-[11px] text-foreground/80">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          {platformExtra} retour(s) supplémentaire(s) signalé(s) chez d’autres vendeurs FlexioPage.
        </div>
      )}

      {data.reasons.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[11px] text-foreground/70">
          {data.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" /> {r}
            </li>
          ))}
        </ul>
      )}

      {/* Historique de la boutique */}
      {s.orders.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground hover:text-foreground">
            Historique boutique ({s.orders.length}) ▾
          </summary>
          <ul className="mt-1.5 space-y-1">
            {s.orders.slice(0, 8).map((o) => {
              const out = orderOutcome(o);
              return (
                <li key={o._id} className="flex items-center justify-between gap-2 rounded-md bg-background/50 px-2 py-1 text-[11px]">
                  <Link href={`/dashboard/orders/${o._id}`} className="font-medium hover:underline">
                    #{o.orderNumber}
                  </Link>
                  <span className="text-muted-foreground">{formatDate(o.createdAt)}</span>
                  <span className={cn('font-semibold', out.tone)}>{out.text}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * Timeline verticale du cycle de vie d'une commande. Dérive les timestamps
 * des grandes étapes depuis `order.statusHistory` + les fields directs
 * (createdAt, delivery.dispatchedAt). Chaque étape a un état :
 *   - done       : passée (timestamp connu)
 *   - current    : en cours (dernière étape done)
 *   - upcoming   : pas encore atteinte (grisée)
 *   - cancelled  : commande annulée à cette étape (rouge)
 *
 * L'ordre est fixe (Créée → Contactée → Confirmée → Dispatchée → Livrée →
 * Payée) — reflète le funnel COD standard.
 */
function OrderLifecycleTimeline({ order }: { order: OrderDoc }) {
  // Trouve le 1er statusHistory entry où la confirmation a changé depuis
  // 'pending' (= agent a contacté le client pour la première fois).
  const contactedAt = order.statusHistory?.find(
    (h) => h.confirmationStatus && h.confirmationStatus !== 'pending',
  )?.at;
  const confirmedAt = order.statusHistory?.find(
    (h) => h.confirmationStatus === 'confirmed',
  )?.at || (order.confirmationStatus === 'confirmed' ? order.confirmedAt : undefined);
  const isCancelled = order.fulfillmentStatus === 'cancelled' || order.confirmationStatus === 'declined';
  const dispatchedAt = order.delivery?.dispatchedAt;
  const deliveredAt = order.delivery?.externalStatus === 'delivered'
    ? order.statusHistory?.slice().reverse().find(
      (h) => h.fulfillmentStatus === 'fulfilled',
    )?.at
    : undefined;
  const paidAt = order.paymentStatus === 'paid'
    ? order.statusHistory?.slice().reverse().find((h) => h.paymentStatus === 'paid')?.at
    : undefined;

  const steps = [
    { key: 'created',    label: 'Commande créée',   icon: ShoppingCart,   at: order.createdAt as string | undefined },
    { key: 'contacted',  label: 'Client contacté',  icon: PhoneCall,      at: contactedAt },
    { key: 'confirmed',  label: 'Confirmée',        icon: CheckCircle2,   at: confirmedAt },
    { key: 'dispatched', label: 'Dispatchée',       icon: Truck,          at: dispatchedAt },
    { key: 'delivered',  label: 'Livrée',           icon: Package,        at: deliveredAt },
    { key: 'paid',       label: 'Payée',            icon: Banknote,       at: paidAt },
  ];

  // Dernière étape done = "current" (highlighted). Les upcoming sont grisées.
  const lastDoneIdx = steps.reduce((last, s, i) => (s.at ? i : last), -1);

  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <div className="border-b border-border/40 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Cycle de vie
          {isCancelled && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700">
              <AlertTriangle className="h-2.5 w-2.5" />
              Annulée
            </span>
          )}
        </h2>
      </div>
      <ol className="relative space-y-3 px-4 py-4">
        {/* Ligne verticale reliant les étapes — pos abs pour ne pas décaler
            les items. Étend jusqu'à la dernière étape done + 1. */}
        <div
          className="absolute left-[27px] top-6 w-px bg-border"
          style={{ height: `calc((100% - 3rem) * ${Math.max(0, lastDoneIdx) / Math.max(1, steps.length - 1)})` }}
          aria-hidden
        />
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = !!s.at;
          const current = done && i === lastDoneIdx;
          const cancelled = isCancelled && !done;
          return (
            <li key={s.key} className="relative flex items-start gap-3">
              <div
                className={cn(
                  'relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 shadow-sm',
                  done && current && 'border-primary bg-primary text-primary-foreground',
                  done && !current && 'border-emerald-500 bg-emerald-500 text-white',
                  !done && !cancelled && 'border-border bg-muted text-muted-foreground/60',
                  cancelled && 'border-rose-300 bg-rose-100 text-rose-500',
                )}
              >
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      !done && !current && 'text-muted-foreground/70',
                      current && 'text-primary',
                    )}
                  >
                    {s.label}
                  </span>
                  {done && s.at && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(s.at)}
                    </span>
                  )}
                  {current && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
                      En cours
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
