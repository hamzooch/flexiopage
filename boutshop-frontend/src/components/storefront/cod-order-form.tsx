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

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { ThemeTokens } from '@/data/store-themes';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export interface CodFormConfig {
  headline?: string;
  submitLabel?: string;
  showEmail?: boolean;
  requireEmail?: boolean;
  showPostalCode?: boolean;
  showState?: boolean;
  showNotes?: boolean;
  showQuantity?: boolean;
  reassurance?: string;
}

interface Props {
  storeSlug: string;
  productSlug: string;
  productName: string;
  productPrice: number;
  productStock: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  currency: string;
  defaultCountry?: string;
  config?: CodFormConfig;
  theme: ThemeTokens;
  radius: string;
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
  productSlug,
  productName,
  productPrice,
  productStock,
  trackInventory,
  allowBackorder,
  currency,
  defaultCountry,
  config,
  theme,
  radius,
}: Props) {
  const router = useRouter();

  const showEmail = config?.showEmail ?? true;
  const requireEmail = config?.requireEmail ?? false;
  const showPostal = config?.showPostalCode ?? false;
  const showState = config?.showState ?? false;
  const showNotes = config?.showNotes ?? true;
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

  const phonePrefix = useMemo(
    () => COUNTRIES.find((c) => c.code === country)?.phonePrefix || '',
    [country]
  );

  const stockLeft = trackInventory && !allowBackorder ? productStock : 999;
  const maxQty = Math.max(1, Math.min(stockLeft, 10));
  const total = productPrice * quantity;

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
    if (!line1.trim() || !city.trim() || !country) {
      setError('Adresse, ville et pays obligatoires.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/checkout/cod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeSlug,
          items: [{ productSlug, quantity }],
          email: email.trim() || `cod-${phone.replace(/\D/g, '')}@boutshop.local`,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          shippingAddress: {
            line1: line1.trim(),
            line2: line2.trim() || undefined,
            city: city.trim(),
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
      <Field label="Complément (optionnel)" value={line2} onChange={setLine2} placeholder="Étage, repère, app…" theme={theme} radius={radius} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Ville *" value={city} onChange={setCity} placeholder="Dakar" theme={theme} radius={radius} />
        {showState && (
          <Field label="Région" value={stateValue} onChange={setStateValue} theme={theme} radius={radius} />
        )}
        {showPostal && (
          <Field label="Code postal" value={postalCode} onChange={setPostalCode} theme={theme} radius={radius} />
        )}
      </div>

      {showNotes && (
        <Field label="Note pour le livreur (optionnel)" value={notes} onChange={setNotes} placeholder="Sonnez à la porte de droite…" theme={theme} radius={radius} />
      )}

      {showQuantity && (
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
      )}

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
