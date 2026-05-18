'use client';

/**
 * Inline cash-on-delivery order form rendered on the public product page.
 * No separate checkout step — the buyer fills in name + phone + address
 * here and the order goes straight to /api/public/checkout/cod, which
 * dispatches it to MogaDelivery.
 *
 * Field visibility is driven by `store.settings.codForm` so each seller can
 * shape the form (email on/off, postalCode on/off, etc.) from the dashboard.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Truck, Wallet, Check, BadgePercent, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { ThemeTokens } from '@/data/store-themes';
import type { ProductBundle } from '@/lib/api';
import { getSessionId, trackStoreEvent } from '@/lib/storefront-track';
import { fireMarketingEvent } from '@/components/storefront/TrackEvent';
import type { CouponValidationResponse } from '@/types/coupon';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export interface CodFormConfig {
  headline?: string;
  submitLabel?: string;
  showEmail?: boolean;
  requireEmail?: boolean;
  showAddressLine2?: boolean;
  showCity?: boolean;
  showPostalCode?: boolean;
  showState?: boolean;
  showNotes?: boolean;
  showQuantity?: boolean;
  reassurance?: string;
  /** Flat per-store shipping fee added on top of the product subtotal. */
  shippingFee?: number;
  // Visual customization
  backgroundColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonShape?: 'pill' | 'rounded' | 'square';
  buttonAnimated?: boolean;
  buttonAnimation?: 'pulse' | 'shimmer' | 'bounce' | 'none';
}

/** A subset of the IProductVariant shape — only what the COD form needs. */
export interface CodVariant {
  name: string;
  sku?: string;
  price?: number;
  stock?: number;
  options?: Record<string, string>;
}

interface Props {
  storeSlug: string;
  /** Store + product ids — used for anonymous funnel tracking. */
  storeId?: string;
  productId?: string;
  productSlug: string;
  productName: string;
  productPrice: number;
  productStock: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  currency: string;
  defaultCountry?: string;
  config?: CodFormConfig;
  /** Quantity-tier bundle — when enabled, replaces the quantity stepper with a tier picker. */
  bundle?: ProductBundle;
  /** Per-product variants (Couleur/Taille). When set, the buyer must pick one. */
  variants?: CodVariant[];
  theme: ThemeTokens;
  radius: string;
}

/** Total price for a quantity, honoring the bundle tiers when one matches. */
function bundleTotal(basePrice: number, bundle: ProductBundle | undefined, qty: number): number {
  if (bundle?.enabled && Array.isArray(bundle.tiers)) {
    const tier = bundle.tiers.find((t) => t && t.quantity === qty && t.totalPrice > 0);
    if (tier) return tier.totalPrice;
  }
  return basePrice * qty;
}

const COUNTRIES: { code: string; name: string; phonePrefix: string }[] = [
  { code: 'SN', name: 'Sénégal',         phonePrefix: '+221' },
  { code: 'CI', name: 'Côte d’Ivoire',   phonePrefix: '+225' },
  { code: 'ML', name: 'Mali',            phonePrefix: '+223' },
  { code: 'BF', name: 'Burkina Faso',    phonePrefix: '+226' },
  { code: 'BJ', name: 'Bénin',           phonePrefix: '+229' },
  { code: 'TG', name: 'Togo',            phonePrefix: '+228' },
  { code: 'GN', name: 'Guinée',          phonePrefix: '+224' },
  { code: 'NE', name: 'Niger',           phonePrefix: '+227' },
  { code: 'GM', name: 'Gambie',          phonePrefix: '+220' },
  { code: 'GH', name: 'Ghana',           phonePrefix: '+233' },
  { code: 'NG', name: 'Nigeria',         phonePrefix: '+234' },
  { code: 'CM', name: 'Cameroun',        phonePrefix: '+237' },
  { code: 'MA', name: 'Maroc',           phonePrefix: '+212' },
  { code: 'TN', name: 'Tunisie',         phonePrefix: '+216' },
  { code: 'DZ', name: 'Algérie',         phonePrefix: '+213' },
  { code: 'LY', name: 'Libye',           phonePrefix: '+218' },
];

export function CodOrderForm({
  storeSlug,
  storeId,
  productId,
  productSlug,
  productName,
  productPrice,
  productStock,
  trackInventory,
  allowBackorder,
  currency,
  defaultCountry,
  config,
  bundle,
  variants,
  theme,
  radius,
}: Props) {
  const router = useRouter();

  // Defaults are intentionally minimal: only full name, phone (+ country code)
  // and address show out of the box. Every other field is opt-in from the
  // seller's COD-form settings.
  const showEmail = config?.showEmail ?? false;
  const requireEmail = config?.requireEmail ?? false;
  const showAddressLine2 = config?.showAddressLine2 ?? false;
  const showCity = config?.showCity ?? false;
  const showPostal = config?.showPostalCode ?? false;
  const showState = config?.showState ?? false;
  const showNotes = config?.showNotes ?? false;
  const showQuantity = config?.showQuantity ?? true;
  const headline = config?.headline || 'Commander · Paiement à la livraison';
  const submitLabel = config?.submitLabel || 'Commander';
  const reassurance = config?.reassurance;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(defaultCountry || 'SN');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [stateValue, setStateValue] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);

  // ── Variant selection ─────────────────────────────────────────────
  // Active variant — defaults to the first one (or null if no variants).
  // When variants exist, productPrice / productStock are effectively
  // ignored in favor of the selected variant's price & stock.
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  const [variantIdx, setVariantIdx] = useState(0);
  const activeVariant = hasVariants ? variants![Math.min(variantIdx, variants!.length - 1)] : null;
  // Group variants by their first attribute key for the picker UI (e.g.
  // all "Couleur" values shown as swatches). When a variant has no
  // options, it still appears as a single chip with its `name`.
  const effectivePrice = activeVariant?.price ?? productPrice;
  const effectiveStock = activeVariant?.stock ?? productStock;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Promo code state ──────────────────────────────────────────────
  // The seller-facing dashboard creates these in /coupons. The buyer
  // expands the "J'ai un code promo" row, types, hits Apply → we hit
  // /api/public/stores/<slug>/coupons/validate and store the discount.
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponApplied, setCouponApplied] = useState<{
    code: string;
    discountAmount: number;
    type: 'percent' | 'fixed';
    value: number;
  } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Funnel tracking: fire `add_to_cart` once, the first time the visitor
  // engages with the order form. Both our anonymous tracker AND the seller's
  // marketing pixels (Meta / TikTok / GA4) get a synchronised event so
  // attribution dashboards line up with the in-app "Suivi" funnel.
  const cartTracked = useRef(false);
  function handleFirstEngagement() {
    if (cartTracked.current) return;
    cartTracked.current = true;
    trackStoreEvent({ storeId, productId, type: 'add_to_cart' });
    fireMarketingEvent({
      event: 'AddToCart',
      contentIds: productId ? [productId] : undefined,
      contentName: productName,
      value: productPrice,
      currency,
      items: productId ? [{ id: productId, name: productName, quantity: 1, price: productPrice }] : undefined,
    });
  }

  // Abandoned cart capture — fired on input blur once the buyer has
  // typed enough to be chase-worthy (phone or email present). Uses
  // navigator.sendBeacon when available so the request survives page-hide.
  function captureAbandonedCart() {
    if (!storeSlug) return;
    if (!phone.trim() && !email.trim()) return;
    const payload = {
      sessionId: getSessionId(),
      productSlug,
      productName,
      productPrice: effectivePrice,
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      city: city.trim() || undefined,
      country,
    };
    const url = `${API_BASE}/api/public/stores/${storeSlug}/abandoned-cart`;
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
        navigator.sendBeacon(url, blob);
        return;
      }
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      // never block UI
    }
  }

  const phonePrefix = useMemo(
    () => COUNTRIES.find((c) => c.code === country)?.phonePrefix || '',
    [country]
  );

  const stockLeft = trackInventory && !allowBackorder ? effectiveStock : 999;
  const maxQty = Math.max(1, Math.min(stockLeft, 10));

  // Bundle: when enabled with valid tiers, the customer picks a quantity
  // tier instead of free-stepping. Option 1 is always the base unit price.
  const bundleActive = !!(
    bundle?.enabled && bundle.tiers?.some((t) => t.quantity >= 2 && t.totalPrice > 0)
  );
  const bundleOptions = bundleActive
    ? [
        { quantity: 1, totalPrice: productPrice, label: undefined as string | undefined },
        ...[...bundle!.tiers]
          .filter((t) => t.quantity >= 2 && t.totalPrice > 0)
          .sort((a, b) => a.quantity - b.quantity),
      ]
    : [];

  // Server-side flat shipping fee applied once per COD order. Display-only —
  // the backend re-reads the same value from the store doc to compute the
  // authoritative total, so a tampered client never charges the wrong amount.
  const shippingFee = Math.max(0, Number(config?.shippingFee) || 0);
  const productsTotal = bundleTotal(effectivePrice, bundle, quantity);
  // Recompute the applied discount when the subtotal moves (qty / bundle tier
  // change) — coupon stays applied but the absolute amount follows the cart.
  // Percent coupons rescale automatically; fixed ones cap at the new subtotal.
  const liveDiscount = useMemo(() => {
    if (!couponApplied) return 0;
    if (couponApplied.type === 'percent') {
      return Math.round(productsTotal * (couponApplied.value / 100) * 100) / 100;
    }
    return Math.min(couponApplied.value, productsTotal);
  }, [couponApplied, productsTotal]);
  const total = Math.max(0, productsTotal - liveDiscount + shippingFee);

  // Re-validate the coupon when the subtotal changes — the server may flip
  // it to invalid if minPurchase is no longer met. We don't block the buyer
  // while waiting; if it becomes invalid we just clear the discount.
  useEffect(() => {
    if (!couponApplied) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/public/stores/${storeSlug}/coupons/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: couponApplied.code,
            subtotal: productsTotal,
            productIds: productId ? [productId] : undefined,
          }),
        });
        const data = (await res.json()) as CouponValidationResponse;
        if (cancelled) return;
        if (!data.ok) {
          setCouponApplied(null);
          setCouponError(data.message);
        } else {
          setCouponApplied({
            code: data.code,
            discountAmount: data.discountAmount,
            type: data.type,
            value: data.value,
          });
        }
      } catch {
        // Network blip — keep the optimistic local discount, server will
        // re-validate at checkout-submit time.
      }
    })();
    return () => { cancelled = true; };
    // We only depend on subtotal here — re-running on couponApplied changes
    // would loop because we setState inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsTotal]);

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await fetch(`${API_BASE}/api/public/stores/${storeSlug}/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          subtotal: productsTotal,
          productIds: productId ? [productId] : undefined,
        }),
      });
      const data = (await res.json()) as CouponValidationResponse;
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
      setCouponError('');
      setCouponInput('');
    } catch {
      setCouponError('Impossible de vérifier le code. Réessaie.');
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setCouponApplied(null);
    setCouponInput('');
    setCouponError('');
  }

  // Page-hide capture for abandoned carts — fires when the buyer tabs
  // away or closes the window. Independent from blur so we always
  // capture the latest state even if no field was blurred.
  useEffect(() => {
    function onHide() {
      captureAbandonedCart();
    }
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    return () => {
      window.removeEventListener('pagehide', onHide);
    };
    // captureAbandonedCart closes over latest state — re-binding on
    // every render would be wasteful. We accept the trade-off of a
    // slightly-stale snapshot in the listener (this is best-effort
    // chase lead capture, not transactional).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !phone.trim()) {
      setError('Nom et téléphone obligatoires.');
      return;
    }
    if (showEmail && requireEmail && !email.trim()) {
      setError('Email obligatoire.');
      return;
    }
    if (!line1.trim() || !country) {
      setError('Adresse et pays obligatoires.');
      return;
    }
    if (showCity && !city.trim()) {
      setError('Ville obligatoire.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/checkout/cod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeSlug,
          sessionId: getSessionId(),
          items: [{ productSlug, quantity, variantId: activeVariant?.name }],
          email: email.trim() || `cod-${phone.replace(/\D/g, '')}@flexiopage.local`,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          shippingAddress: {
            line1: line1.trim(),
            line2: showAddressLine2 ? (line2.trim() || undefined) : undefined,
            city: showCity ? (city.trim() || undefined) : undefined,
            state: showState ? (stateValue.trim() || undefined) : undefined,
            postalCode: showPostal ? (postalCode.trim() || undefined) : undefined,
            country,
          },
          notes: showNotes ? (notes.trim() || undefined) : undefined,
          couponCode: couponApplied?.code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Surface coupon-specific errors in the coupon row so the buyer
        // sees why their code didn't take rather than a generic banner.
        if (data.code === 'coupon_invalid') {
          setCouponApplied(null);
          setCouponError(data.error || 'Code promo invalide.');
        } else {
          setError(data.error || 'Erreur lors de la commande');
        }
        setSubmitting(false);
        return;
      }
      router.push(`/thanks/cod/${data.orderId}`);
    } catch {
      setError('Impossible de joindre le serveur. Réessaie.');
      setSubmitting(false);
    }
  }

  return (
    <form
      id="cod-order-form"
      onSubmit={handleSubmit}
      onFocusCapture={handleFirstEngagement}
      onBlurCapture={captureAbandonedCart}
      className="space-y-5 border p-5 sm:p-6"
      style={{
        backgroundColor: config?.backgroundColor || theme.surface,
        borderColor: theme.border,
        borderRadius: radius,
      }}
    >
      <div>
        <h2
          className="text-xl font-bold tracking-tight sm:text-2xl"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          {headline}
        </h2>
        <p className="mt-1 text-sm" style={{ color: theme.muted }}>
          Tu paies <strong>{formatCurrency(total, currency)}</strong> en espèces au livreur.
        </p>
      </div>

      {/* Identity */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom complet *" value={name} onChange={setName} placeholder="Ex. Aïssatou Diallo" theme={theme} radius={radius} />
        <Field
          label="Téléphone *"
          value={phone}
          onChange={setPhone}
          type="tel"
          placeholder={`${phonePrefix} 70 000 00 00`}
          theme={theme}
          radius={radius}
        />
      </div>
      {showEmail && (
        <Field
          label={`Email${requireEmail ? ' *' : ' (optionnel)'}`}
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="ton@email.com"
          theme={theme}
          radius={radius}
        />
      )}

      {/* Address */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: theme.muted }}>Pays *</label>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="h-11 w-full border bg-transparent px-3 text-sm focus:outline-none"
          style={{ borderColor: theme.border, borderRadius: radius, backgroundColor: theme.background, color: theme.foreground }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name} ({c.phonePrefix})</option>
          ))}
        </select>
      </div>
      <Field label="Adresse *" value={line1} onChange={setLine1} placeholder="N° + rue, quartier" theme={theme} radius={radius} />
      {showAddressLine2 && (
        <Field label="Complément (optionnel)" value={line2} onChange={setLine2} placeholder="Étage, repère, app…" theme={theme} radius={radius} />
      )}
      {(showCity || showState || showPostal) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {showCity && (
            <Field label="Ville *" value={city} onChange={setCity} placeholder="Dakar" theme={theme} radius={radius} />
          )}
          {showState && (
            <Field label="Région" value={stateValue} onChange={setStateValue} theme={theme} radius={radius} />
          )}
          {showPostal && (
            <Field label="Code postal" value={postalCode} onChange={setPostalCode} theme={theme} radius={radius} />
          )}
        </div>
      )}

      {showNotes && (
        <Field label="Note pour le livreur (optionnel)" value={notes} onChange={setNotes} placeholder="Sonnez à la porte de droite…" theme={theme} radius={radius} />
      )}

      {/* Variant picker — Couleur/Taille swatches. Shown only when the
          seller configured variants. Selecting one updates the unit
          price + stock used by the rest of the form. */}
      {hasVariants && (
        <div className="border-t pt-4" style={{ borderColor: theme.border }}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: theme.muted }}>
            Choisis une variante
          </div>
          <div className="flex flex-wrap gap-1.5">
            {variants!.map((v, i) => {
              const active = i === variantIdx;
              const outOfStock = (v.stock ?? 0) <= 0 && trackInventory && !allowBackorder;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => setVariantIdx(i)}
                  className={cn(
                    'inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:line-through disabled:opacity-50'
                  )}
                  style={{
                    borderColor: active ? theme.primary : theme.border,
                    backgroundColor: active ? theme.primary : 'transparent',
                    color: active ? theme.primaryFg : theme.foreground,
                    borderRadius: radius,
                    borderWidth: active ? 2 : 1,
                  }}
                  title={outOfStock ? 'En rupture' : v.name}
                >
                  {v.name}
                  {typeof v.price === 'number' && v.price !== productPrice && (
                    <span className="ml-1 opacity-80">· {formatCurrency(v.price, currency)}</span>
                  )}
                </button>
              );
            })}
          </div>
          {activeVariant && (
            <p className="mt-1.5 text-[10px]" style={{ color: theme.muted }}>
              {(activeVariant.stock ?? 0) > 0
                ? `✓ ${activeVariant.stock} en stock`
                : 'Rupture de stock'}
            </p>
          )}
        </div>
      )}

      {/* Bundle tier picker — "buy more, save more" — replaces the stepper */}
      {bundleActive ? (
        <div className="border-t pt-4" style={{ borderColor: theme.border }}>
          <div className="mb-2.5 text-sm font-bold" style={{ color: theme.foreground }}>
            {bundle?.title || 'Offre spéciale — économise en achetant plus'}
          </div>
          <div className="space-y-2">
            {bundleOptions.map((opt) => {
              const selected = quantity === opt.quantity;
              const unit = opt.totalPrice / opt.quantity;
              const savePct =
                opt.quantity > 1
                  ? Math.round((1 - opt.totalPrice / (productPrice * opt.quantity)) * 100)
                  : 0;
              const outOfStock = opt.quantity > stockLeft;
              return (
                <button
                  key={opt.quantity}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => setQuantity(opt.quantity)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors disabled:opacity-40"
                  style={{
                    border: `${selected ? 2 : 1}px solid ${selected ? theme.primary : theme.border}`,
                    backgroundColor: selected ? theme.surfaceMuted : theme.background,
                    borderRadius: radius,
                  }}
                >
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                    style={{
                      border: `1px solid ${selected ? theme.primary : theme.border}`,
                      backgroundColor: selected ? theme.primary : 'transparent',
                    }}
                  >
                    {selected && (
                      <Check className="h-3 w-3" style={{ color: theme.primaryFg }} strokeWidth={3} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: theme.foreground }}>
                        {opt.quantity} {opt.quantity > 1 ? 'pièces' : 'pièce'}
                      </span>
                      {opt.label ? (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: theme.primary, color: theme.primaryFg }}
                        >
                          {opt.label}
                        </span>
                      ) : savePct > 0 ? (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: '#10b98118', color: '#047857' }}
                        >
                          −{savePct}%
                        </span>
                      ) : null}
                      {outOfStock && (
                        <span className="text-[10px] font-semibold" style={{ color: '#dc2626' }}>
                          Stock insuffisant
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs" style={{ color: theme.muted }}>
                      {formatCurrency(unit, currency)} / pièce
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-base font-extrabold"
                    style={{ color: theme.primary }}
                  >
                    {formatCurrency(opt.totalPrice, currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : showQuantity ? (
        <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: theme.border }}>
          <span className="text-sm font-medium">Quantité</span>
          <div className="inline-flex items-center border" style={{ borderColor: theme.border, borderRadius: radius }}>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="h-9 w-9 text-base disabled:opacity-30"
              aria-label="Diminuer"
            >−</button>
            <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              disabled={quantity >= maxQty}
              className="h-9 w-9 text-base disabled:opacity-30"
              aria-label="Augmenter"
            >+</button>
          </div>
        </div>
      ) : null}

      {/* Promo code — collapsible row, expands into "input + Apply" then
          replaces itself with an applied chip once a code is accepted. */}
      <div className="border-t pt-4" style={{ borderColor: theme.border }}>
        {couponApplied ? (
          <div
            className="flex items-center justify-between gap-3 border p-3"
            style={{ borderColor: theme.border, borderRadius: radius, backgroundColor: theme.surfaceMuted }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
                style={{ backgroundColor: theme.primary, color: theme.primaryFg }}
              >
                <BadgePercent className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: theme.foreground }}>
                  <code className="font-mono">{couponApplied.code}</code>
                  <span className="text-[10px] font-medium" style={{ color: theme.muted }}>
                    appliqué
                  </span>
                </div>
                <div className="text-[11px]" style={{ color: theme.muted }}>
                  −{couponApplied.type === 'percent' ? `${couponApplied.value}%` : formatCurrency(couponApplied.value, currency)} sur la commande
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={removeCoupon}
              className="grid h-8 w-8 place-items-center transition-colors hover:opacity-80"
              style={{ color: theme.muted, borderRadius: radius }}
              aria-label="Retirer le code"
              title="Retirer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : !couponOpen ? (
          <button
            type="button"
            onClick={() => setCouponOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
            style={{ color: theme.primary }}
          >
            <BadgePercent className="h-3.5 w-3.5" />
            J&apos;ai un code promo
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); } }}
                placeholder="CODE PROMO"
                autoFocus
                className="h-11 flex-1 border bg-transparent px-3 text-sm font-mono uppercase tracking-wider focus:outline-none"
                style={{
                  borderColor: couponError ? '#ef4444' : theme.border,
                  borderRadius: radius,
                  backgroundColor: theme.background,
                  color: theme.foreground,
                }}
              />
              <button
                type="button"
                onClick={() => void applyCoupon()}
                disabled={couponLoading || !couponInput.trim()}
                className="inline-flex h-11 items-center justify-center gap-1.5 px-4 text-sm font-bold disabled:opacity-50"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryFg,
                  borderRadius: radius,
                }}
              >
                {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Appliquer'}
              </button>
              <button
                type="button"
                onClick={() => { setCouponOpen(false); setCouponInput(''); setCouponError(''); }}
                className="text-sm underline-offset-2 hover:underline"
                style={{ color: theme.muted }}
              >
                Annuler
              </button>
            </div>
            {couponError && (
              <p className="text-xs" style={{ color: '#ef4444' }}>
                {couponError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Total — adds a discount line when a coupon is applied, on top of
          the existing shipping line when shipping is non-zero. */}
      {(shippingFee > 0 || liveDiscount > 0) ? (
        <div className="space-y-1.5 border-t pt-4" style={{ borderColor: theme.border }}>
          <div className="flex items-center justify-between text-sm" style={{ color: theme.muted }}>
            <span>Sous-total</span>
            <span>{formatCurrency(productsTotal, currency)}</span>
          </div>
          {liveDiscount > 0 && couponApplied && (
            <div className="flex items-center justify-between text-sm" style={{ color: theme.primary }}>
              <span className="inline-flex items-center gap-1">
                <BadgePercent className="h-3 w-3" />
                Code <code className="font-mono">{couponApplied.code}</code>
              </span>
              <span>− {formatCurrency(liveDiscount, currency)}</span>
            </div>
          )}
          {shippingFee > 0 && (
            <div className="flex items-center justify-between text-sm" style={{ color: theme.muted }}>
              <span>Livraison</span>
              <span>+ {formatCurrency(shippingFee, currency)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium" style={{ color: theme.foreground }}>À payer à la livraison</span>
            <span className="text-2xl font-extrabold" style={{ color: theme.primary }}>
              {formatCurrency(total, currency)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: theme.border }}>
          <span className="text-sm" style={{ color: theme.muted }}>À payer à la livraison</span>
          <span className="text-2xl font-extrabold" style={{ color: theme.primary }}>
            {formatCurrency(total, currency)}
          </span>
        </div>
      )}

      {error && (
        <div
          className="border p-3 text-sm"
          style={{ borderColor: '#ef4444', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: radius }}
        >
          {error}
        </div>
      )}

      {(() => {
        // Resolve the visual config — fall back to the active theme so old
        // stores without custom values keep their previous look.
        const btnBg = config?.buttonColor
          || (theme.style === 'tech'
              ? `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`
              : theme.primary);
        const btnFg = config?.buttonTextColor || theme.primaryFg;
        const shape = config?.buttonShape || 'pill';
        const btnRadius =
          shape === 'pill'    ? '999px'
          : shape === 'rounded' ? '12px'
          : '0';
        const animEnabled = config?.buttonAnimated !== false;
        const animKind = animEnabled ? (config?.buttonAnimation || 'pulse') : 'none';
        const animClass =
          animKind === 'pulse'   ? 'cod-submit-pulse'
          : animKind === 'shimmer' ? 'cod-submit-shimmer'
          : animKind === 'bounce'  ? 'cod-submit-bounce'
          : '';
        const accentForGlow = config?.buttonColor || theme.primary;
        return (
          <>
            <button
              type="submit"
              disabled={submitting}
              className={`relative inline-flex h-13 w-full items-center justify-center gap-2 overflow-hidden px-7 py-4 text-base font-bold transition-all hover:scale-[1.01] disabled:opacity-60 ${animClass}`}
              style={{ background: btnBg, color: btnFg, borderRadius: btnRadius }}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Wallet className="h-5 w-5" />
                  {submitLabel} · {formatCurrency(total, currency)}
                </>
              )}
            </button>
            {/* Inline keyframes — colocated so the form is self-contained and
                survives an SSR/CSR boundary without a separate stylesheet. */}
            <style>{`
              @keyframes codSubmitPulse {
                0%, 100% { box-shadow: 0 0 0 0 ${accentForGlow}66; transform: scale(1); }
                50%      { box-shadow: 0 0 0 14px ${accentForGlow}00; transform: scale(1.02); }
              }
              @keyframes codSubmitBounce {
                0%, 100% { transform: translateY(0); }
                50%      { transform: translateY(-4px); }
              }
              @keyframes codSubmitShimmerBg {
                0%   { background-position: -200% center; }
                100% { background-position:  200% center; }
              }
              .cod-submit-pulse  { animation: codSubmitPulse 1.6s ease-in-out infinite; }
              .cod-submit-bounce { animation: codSubmitBounce 1.2s ease-in-out infinite; }
              .cod-submit-shimmer {
                background-image: linear-gradient(110deg, ${typeof btnBg === 'string' ? btnBg : accentForGlow} 30%, ${accentForGlow}cc 50%, ${typeof btnBg === 'string' ? btnBg : accentForGlow} 70%) !important;
                background-size: 200% 100% !important;
                animation: codSubmitShimmerBg 2.4s linear infinite;
              }
            `}</style>
          </>
        );
      })()}

      <div
        className="flex flex-wrap items-center justify-center gap-4 text-[11px]"
        style={{ color: theme.muted }}
      >
        <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" /> Paiement à la livraison</span>
        <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> Livraison 1 à 3 jours</span>
        <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Aucun prépaiement</span>
      </div>
      {reassurance && (
        <p className="text-center text-xs" style={{ color: theme.muted }}>{reassurance}</p>
      )}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  theme,
  radius,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  theme: ThemeTokens;
  radius: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: theme.muted }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full border bg-transparent px-3 text-sm focus:outline-none"
        style={{ borderColor: theme.border, borderRadius: radius, backgroundColor: theme.background, color: theme.foreground }}
      />
    </div>
  );
}
