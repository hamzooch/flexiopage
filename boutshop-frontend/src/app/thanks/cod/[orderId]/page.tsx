'use client';

/**
 * COD thank-you page. No polling — the order is final the moment it's
 * created. We fetch a summary (items, address, total) and display it.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, Home, Loader2, Phone, Truck, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

interface CodOrder {
  orderNumber: string;
  paymentMethod: 'cod';
  paymentStatus: string;
  fulfillmentStatus: string;
  total: number;
  currency: string;
  subtotal: number;
  shippingCost: number;
  customerName?: string;
  customerPhone?: string;
  email: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  items: Array<{ name: string; quantity: number; price: number; sku?: string }>;
  createdAt: string;
  delivery?: { provider?: string; externalStatus?: string; trackingUrl?: string };
}

export default function CodThanksPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<CodOrder | null>(null);
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/public/orders/${orderId}/cod-summary`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || 'Commande introuvable');
          return;
        }
        setOrder(data.order);
        setStoreName(data.store?.name || '');
        setStoreSlug(data.store?.slug || '');
      } catch {
        if (!cancelled) setError('Impossible de charger la commande.');
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">{error}</h1>
          <Link href="/" className="mt-4 inline-block text-sm underline">Retour à l’accueil</Link>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ship = order.shippingAddress || {};
  const dispatched = !!order.delivery?.provider;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-background to-amber-50/30 dark:from-emerald-950/10 dark:via-background dark:to-amber-950/10">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Hero */}
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Commande confirmée 🎉</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Merci {order.customerName || ''} ! Ta commande{' '}
            <span className="font-mono font-semibold">{order.orderNumber}</span> est enregistrée.
          </p>
        </div>

        {/* COD payment notice */}
        <div className="mt-8 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h2 className="font-semibold text-amber-900 dark:text-amber-200">Paiement à la livraison</h2>
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
                Tu paies <strong>{formatCurrency(order.total, order.currency)}</strong> en espèces au livreur quand tu reçois ton colis.
                Aucun prépaiement n’est demandé.
              </p>
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Prochaines étapes</h2>
          <ol className="mt-3 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
              <div>
                <strong>Confirmation par téléphone</strong>
                <p className="text-xs text-muted-foreground">Le livreur t’appellera au {order.customerPhone} pour confirmer.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
              <div>
                <strong>Livraison sous 1 à 3 jours</strong>
                <p className="text-xs text-muted-foreground">À l’adresse indiquée. Tu peux refuser le colis si non conforme.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span>
              <div>
                <strong>Paiement en espèces</strong>
                <p className="text-xs text-muted-foreground">Tu vérifies le contenu, puis tu règles {formatCurrency(order.total, order.currency)}.</p>
              </div>
            </li>
          </ol>
        </div>

        {/* Order recap */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4" /> Livraison
            </h3>
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-medium">{order.customerName}</p>
              <p className="text-muted-foreground">{ship.line1}</p>
              {ship.line2 && <p className="text-muted-foreground">{ship.line2}</p>}
              <p className="text-muted-foreground">
                {[ship.postalCode, ship.city, ship.state, ship.country].filter(Boolean).join(', ')}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" /> {order.customerPhone}
              </p>
            </div>
            {dispatched && (
              <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                ✓ Envoyée au livreur ({order.delivery?.provider})
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold">Articles</h3>
            <ul className="mt-3 space-y-3">
              {order.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">Qté {it.quantity}{it.sku ? ` · ${it.sku}` : ''}</p>
                  </div>
                  <span className="text-sm">{formatCurrency(it.price * it.quantity, order.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sous-total</span>
                <span>{formatCurrency(order.subtotal, order.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Livraison</span>
                <span className="text-xs text-muted-foreground">{order.shippingCost ? formatCurrency(order.shippingCost, order.currency) : '— (à la livraison)'}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-bold">
                <span>Total</span>
                <span className="text-base">{formatCurrency(order.total, order.currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {storeSlug && (
            <Link
              href={`/store/${storeSlug}`}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold hover:bg-muted"
            >
              <Home className="h-4 w-4" /> Continuer sur {storeName}
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
