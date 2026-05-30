'use client';

/**
 * Multi-item COD checkout. Reads the localStorage cart, posts to
 * /api/public/checkout/cod with an `items[]` array (the backend already
 * supports multi-item COD orders), then redirects to /thanks/cod/<id>
 * and clears the cart.
 *
 * Visually mirrors the single-product COD form on the product page so
 * sellers don't have two different checkout aesthetics. Lighter on
 * customization (no buttonAnimation/shape — this is a multi-item flow,
 * the per-product palette doesn't apply since multiple items can come
 * from different palette contexts).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';
import {
  ArrowLeft, Loader2, ShoppingBag, Wallet, BadgePercent, X,
} from 'lucide-react';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import { clearCart, getCart, type CartItem } from '@/lib/cart';
import { getSessionId } from '@/lib/storefront-track';
import { publicApi } from '@/lib/api';
import type { CouponValidationResponse } from '@/types/coupon';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const COUNTRIES: { code: string; name: string; phonePrefix: string }[] = [
  { code: 'SN', name: 'Sénégal',   phonePrefix: '+221' },
  { code: 'CI', name: 'Côte d’Ivoire', phonePrefix: '+225' },
  { code: 'ML', name: 'Mali',      phonePrefix: '+223' },
  { code: 'BF', name: 'Burkina Faso', phonePrefix: '+226' },
  { code: 'BJ', name: 'Bénin',     phonePrefix: '+229' },
  { code: 'TG', name: 'Togo',      phonePrefix: '+228' },
  { code: 'GN', name: 'Guinée',    phonePrefix: '+224' },
  { code: 'NE', name: 'Niger',     phonePrefix: '+227' },
  { code: 'GM', name: 'Gambie',    phonePrefix: '+220' },
  { code: 'GH', name: 'Ghana',     phonePrefix: '+233' },
  { code: 'NG', name: 'Nigeria',   phonePrefix: '+234' },
  { code: 'CM', name: 'Cameroun',  phonePrefix: '+237' },
  { code: 'MA', name: 'Maroc',     phonePrefix: '+212' },
  { code: 'TN', name: 'Tunisie',   phonePrefix: '+216' },
  { code: 'DZ', name: 'Algérie',   phonePrefix: '+213' },
  { code: 'LY', name: 'Libye',     phonePrefix: '+218' },
];

export default function CartCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;

  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  // Identity + address
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('SN');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');

  // Promo
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponApplied, setCouponApplied] = useState<{ code: string; discountAmount: number; type: 'percent' | 'fixed'; value: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => setItems(getCart(storeSlug)), [storeSlug]);

  useEffect(() => {
    setMounted(true);
    refresh();
  }, [refresh]);

  const currency = items[0]?.currency || 'TND';
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = couponApplied
    ? (couponApplied.type === 'percent'
        ? Math.round(subtotal * (couponApplied.value / 100) * 100) / 100
        : Math.min(couponApplied.value, subtotal))
    : 0;
  const total = Math.max(0, subtotal - discount);

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await publicApi.validateCoupon(storeSlug, {
        code,
        subtotal,
        productIds: items.map((i) => i.id),
      });
      const data = res.data as CouponValidationResponse;
      if (!data.ok) {
        setCouponApplied(null);
        setCouponError(data.message);
        return;
      }
      setCouponApplied({
        code: data.code,
        discountAmount: data.discountAmount,
        type: data.type,
        value: data.value,
      });
      setCouponInput('');
    } catch {
      setCouponError('Impossible de vérifier le code.');
    } finally {
      setCouponLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!items.length) { setError('Panier vide.'); return; }
    if (!name.trim() || !phone.trim()) { setError('Nom et téléphone obligatoires.'); return; }
    if (!line1.trim() || !country) { setError('Adresse et pays obligatoires.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/checkout/cod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeSlug,
          sessionId: getSessionId(),
          items: items.map((i) => ({
            productSlug: i.slug,
            variantId: i.variantName,
            quantity: i.quantity,
          })),
          email: email.trim() || `cod-${phone.replace(/\D/g, '')}@flexiopage.local`,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          shippingAddress: {
            line1: line1.trim(),
            line2: line2.trim() || undefined,
            city: city.trim() || undefined,
            country,
          },
          notes: notes.trim() || undefined,
          couponCode: couponApplied?.code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'coupon_invalid') {
          setCouponApplied(null);
          setCouponError(data.error || 'Code invalide.');
        } else {
          setError(data.error || 'Erreur lors de la commande');
        }
        setSubmitting(false);
        return;
      }
      // Order created — clear the cart before redirecting so the thanks
      // page doesn't show stale badge counts.
      clearCart(storeSlug);
      router.push(`/thanks/cod/${data.orderId}`);
    } catch {
      setError('Impossible de joindre le serveur. Réessaie.');
      setSubmitting(false);
    }
  }

  if (!mounted) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground">…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Panier vide</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ajoute d&apos;abord des articles pour passer commande.</p>
        <Link
          href={`/${storeSlug}`}
          className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Voir les produits
        </Link>
      </div>
    );
  }

  const phonePrefix = COUNTRIES.find((c) => c.code === country)?.phonePrefix || '';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-12">
      <Link
        href={`/${storeSlug}/cart`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour au panier
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
        Finaliser ma commande
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Paiement à la livraison · pas de prépaiement
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        {/* LEFT — form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Tes coordonnées
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom complet *" value={name} onChange={setName} placeholder="Votre nom" />
              <Field label="Téléphone *" value={phone} onChange={setPhone} type="tel" placeholder={`${phonePrefix} 70 000 00 00`} />
            </div>
            <Field label="Email (optionnel)" value={email} onChange={setEmail} type="email" placeholder="ton@email.com" />
          </section>

          <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Adresse de livraison
            </h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Pays *</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name} ({c.phonePrefix})</option>
                ))}
              </select>
            </div>
            <Field label="Adresse *" value={line1} onChange={setLine1} placeholder="N° + rue, quartier" />
            <Field label="Complément (optionnel)" value={line2} onChange={setLine2} placeholder="Étage, repère, app…" />
            <Field label="Ville" value={city} onChange={setCity} placeholder="Dakar" />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Note pour le livreur (optionnel)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-fuchsia-600 px-6 text-base font-bold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.005] disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Wallet className="h-5 w-5" />
                Confirmer la commande · {formatCurrency(total, currency)}
              </>
            )}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            Tu paies {formatCurrency(total, currency)} en espèces au livreur. Aucun prépaiement.
          </p>
        </form>

        {/* RIGHT — order summary (sticky on desktop) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Ta commande ({items.length} article{items.length > 1 ? 's' : ''})
            </h2>
            <ul className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
              {items.map((it) => (
                <li key={`${it.id}::${it.variantName || ''}`} className="flex items-start gap-2">
                  <div className="relative aspect-square w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    {it.image && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <Image
                        src={mediaUrl(it.image) || it.image}
                        alt=""
                        fill
                        sizes="96px"
                        placeholder="blur"
                        blurDataURL={IMAGE_BLUR_DATA_URL}
                        className="object-cover"
                      />
                    )}
                    <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background">
                      {it.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{it.name}</div>
                    {it.variantName && (
                      <div className="text-[10px] text-muted-foreground">{it.variantName}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-xs font-bold tabular-nums">
                    {formatCurrency(it.price * it.quantity, it.currency)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Promo code */}
            <div className="border-t border-border/60 pt-3">
              {couponApplied ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                  <div className="flex items-center gap-2">
                    <BadgePercent className="h-3.5 w-3.5 text-emerald-700" />
                    <div className="text-[11px]">
                      <code className="font-mono font-bold text-emerald-800">{couponApplied.code}</code>
                      <span className="ml-1 text-emerald-700">
                        −{couponApplied.type === 'percent' ? `${couponApplied.value}%` : formatCurrency(couponApplied.value, currency)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCouponApplied(null); setCouponInput(''); }}
                    aria-label="Retirer"
                    className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : !couponOpen ? (
                <button
                  type="button"
                  onClick={() => setCouponOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  <BadgePercent className="h-3.5 w-3.5" />
                  J&apos;ai un code promo
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); } }}
                      placeholder="CODE"
                      autoFocus
                      className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs uppercase tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => void applyCoupon()}
                      disabled={couponLoading || !couponInput.trim()}
                      className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {couponLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'OK'}
                    </button>
                  </div>
                  {couponError && <p className="text-[11px] text-rose-600">{couponError}</p>}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="space-y-1.5 border-t border-border/60 pt-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Sous-total</span>
                <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Remise</span>
                  <span className="tabular-nums">− {formatCurrency(discount, currency)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Livraison</span>
                <span>Selon ta zone</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-2">
                <span className="font-medium">À payer à la livraison</span>
                <span className="text-xl font-extrabold tabular-nums text-primary">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
