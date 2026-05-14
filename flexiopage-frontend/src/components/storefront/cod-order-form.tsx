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

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Truck, Wallet, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { ThemeTokens } from '@/data/store-themes';
import type { ProductBundle } from '@/lib/api';
import { getSessionId, trackStoreEvent } from '@/lib/storefront-track';

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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Funnel tracking: fire `add_to_cart` once, the first time the visitor
  // engages with the order form.
  const cartTracked = useRef(false);
  function handleFirstEngagement() {
    if (cartTracked.current) return;
    cartTracked.current = true;
    trackStoreEvent({ storeId, productId, type: 'add_to_cart' });
  }

  const phonePrefix = useMemo(
    () => COUNTRIES.find((c) => c.code === country)?.phonePrefix || '',
    [country]
  );

  const stockLeft = trackInventory && !allowBackorder ? productStock : 999;
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

  const total = bundleTotal(productPrice, bundle, quantity);

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
          items: [{ productSlug, quantity }],
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur lors de la commande');
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
      className="space-y-5 border p-5 sm:p-6"
      style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radius }}
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

      {/* Total */}
      <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: theme.border }}>
        <span className="text-sm" style={{ color: theme.muted }}>À payer à la livraison</span>
        <span className="text-2xl font-extrabold" style={{ color: theme.primary }}>
          {formatCurrency(total, currency)}
        </span>
      </div>

      {error && (
        <div
          className="border p-3 text-sm"
          style={{ borderColor: '#ef4444', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: radius }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-13 w-full items-center justify-center gap-2 px-7 py-4 text-base font-bold transition-all hover:scale-[1.01] disabled:opacity-60"
        style={{
          background: theme.style === 'tech'
            ? `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`
            : theme.primary,
          color: theme.primaryFg,
          borderRadius: radius === '0px' ? '0' : '999px',
        }}
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
