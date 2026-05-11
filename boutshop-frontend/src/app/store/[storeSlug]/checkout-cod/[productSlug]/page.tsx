'use client';

/**
 * COD checkout for physical-product stores. No online payment — buyer
 * pays the courier on delivery. Required fields:
 *   - identity: name, phone (international format), email
 *   - shipping: address line + city + country (state/postal optional)
 *   - quantity (1..99)
 *
 * Submits to POST /api/public/checkout/cod which:
 *   - creates a paymentMethod='cod' order
 *   - decrements stock
 *   - dispatches to MogaDelivery (autoDispatch=true on the store)
 * On success → /thanks/cod/<orderId>.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import {
  STORE_THEME_TEMPLATES,
  RADIUS_PX,
  tokensToCssVars,
  googleFontsHref,
  type ThemeTokens,
} from '@/data/store-themes';
import { MarketingPixels, type MarketingConfig } from '@/components/storefront/MarketingPixels';
import { TrackEvent } from '@/components/storefront/TrackEvent';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

interface ProductDoc {
  _id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  images?: string[];
  description?: string;
  type: 'physical' | 'digital';
  stock: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  sku?: string;
}

interface StoreDoc {
  name: string;
  slug: string;
  storeType?: 'physical' | 'digital';
  theme?: { templateId?: string };
  settings?: { currency?: string; country?: string; direction?: 'ltr' | 'rtl' };
  integrations?: { marketing?: MarketingConfig };
}

const FALLBACK_THEME = STORE_THEME_TEMPLATES[0].theme;
function resolveTheme(store: StoreDoc | null): ThemeTokens {
  if (!store) return FALLBACK_THEME;
  return STORE_THEME_TEMPLATES.find((t) => t.id === store.theme?.templateId)?.theme || FALLBACK_THEME;
}

// West Africa + Maghreb — countries we ship to.
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

export default function CodCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;
  const productSlug = params.productSlug as string;

  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [store, setStore] = useState<StoreDoc | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<string>('SN');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch(`${API_BASE}/api/public/stores/${storeSlug}/products/${productSlug}`),
          fetch(`${API_BASE}/api/public/store-by-slug/${storeSlug}`),
        ]);
        if (cancelled) return;
        if (pRes.ok) setProduct((await pRes.json()).product);
        if (sRes.ok) {
          const s = (await sRes.json()).store as StoreDoc;
          setStore(s);
          if (s.settings?.country) setCountry(s.settings.country);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeSlug, productSlug]);

  const theme = resolveTheme(store);
  const radius = RADIUS_PX[theme.borderRadius];
  const cssVars = tokensToCssVars(theme);
  const fontsHref = googleFontsHref(theme);

  const currency = store?.settings?.currency || 'XOF';
  const subtotal = (product?.price || 0) * quantity;
  const shippingDisplay = '—'; // courier-set on delivery
  const total = subtotal;
  const phonePrefix = useMemo(
    () => COUNTRIES.find((c) => c.code === country)?.phonePrefix || '',
    [country]
  );

  const stockLeft = product
    ? product.trackInventory && !product.allowBackorder
      ? product.stock
      : 999
    : 0;
  const maxQty = Math.max(1, Math.min(stockLeft, 10));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setError('Nom, téléphone et email obligatoires.');
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
          email: email.trim(),
          customerName: name.trim(),
          customerPhone: phone.trim(),
          shippingAddress: {
            line1: line1.trim(),
            line2: line2.trim() || undefined,
            city: city.trim(),
            state: state.trim() || undefined,
            postalCode: postalCode.trim() || undefined,
            country,
          },
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur lors de la création de la commande');
        setSubmitting(false);
        return;
      }
      router.push(`/thanks/cod/${data.orderId}`);
    } catch {
      setError('Impossible de joindre le serveur. Réessaie.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product || !store || product.type !== 'physical') {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Produit introuvable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {product && product.type !== 'physical'
              ? 'Cet article est digital — utilise le checkout en ligne.'
              : ''}
          </p>
          <Link href={`/store/${storeSlug}`} className="mt-4 inline-block text-sm underline">
            ← Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      <MarketingPixels config={store?.integrations?.marketing} />
      {product && (
        <TrackEvent
          payload={{
            event: 'InitiateCheckout',
            contentIds: [product._id],
            contentName: product.name,
            value: product.price,
            currency: store?.settings?.currency || 'EUR',
            items: [{ id: product._id, name: product.name, price: product.price, quantity: 1 }],
          }}
        />
      )}
      <div
        className="min-h-screen"
        style={{ ...cssVars, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontBody }}
      >
        <header className="border-b" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
            <Link
              href={`/store/${storeSlug}/product/${productSlug}`}
              className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Link>
            <span className="text-sm font-semibold" style={{ fontFamily: theme.fontHeading }}>
              {store.name}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
            {/* ── Left: form ────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: theme.fontHeading }}>
                  Commander · Paiement à la livraison
                </h1>
                <p className="mt-1.5 text-sm opacity-70">
                  Remplis tes coordonnées — tu paies en espèces au livreur quand tu reçois le colis.
                </p>
              </div>

              {/* Identity */}
              <section
                className="space-y-4 border p-5"
                style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radius }}
              >
                <div>
                  <h2 className="text-sm font-semibold">Tes coordonnées</h2>
                  <p className="text-xs opacity-70">On te contacte avant le passage du livreur.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nom complet *" value={name} onChange={setName} placeholder="Aïssatou Diallo" theme={theme} radius={radius} />
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
                <Field label="Email *" value={email} onChange={setEmail} type="email" placeholder="ton@email.com" theme={theme} radius={radius} />
              </section>

              {/* Shipping */}
              <section
                className="space-y-4 border p-5"
                style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radius }}
              >
                <div>
                  <h2 className="text-sm font-semibold">Adresse de livraison</h2>
                  <p className="text-xs opacity-70">Le livreur t’appelle pour confirmer avant de venir.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium opacity-70">Pays *</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-11 w-full border bg-transparent px-3 text-sm focus:outline-none"
                    style={{ borderColor: theme.border, borderRadius: radius, backgroundColor: theme.background }}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name} ({c.phonePrefix})</option>
                    ))}
                  </select>
                </div>
                <Field label="Adresse *" value={line1} onChange={setLine1} placeholder="12 Rue Mohammed V" theme={theme} radius={radius} />
                <Field label="Complément (optionnel)" value={line2} onChange={setLine2} placeholder="Appartement, étage, repère…" theme={theme} radius={radius} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Ville *" value={city} onChange={setCity} placeholder="Dakar" theme={theme} radius={radius} />
                  <Field label="Région" value={state} onChange={setState} placeholder="Optionnel" theme={theme} radius={radius} />
                  <Field label="Code postal" value={postalCode} onChange={setPostalCode} placeholder="Optionnel" theme={theme} radius={radius} />
                </div>
                <Field label="Note pour le livreur (optionnel)" value={notes} onChange={setNotes} placeholder="Sonnez à la porte de droite…" theme={theme} radius={radius} />
              </section>

              {error && (
                <div className="border p-3 text-sm" style={{ borderColor: '#ef4444', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: radius }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-14 w-full items-center justify-center gap-2 px-7 text-base font-bold transition-all hover:scale-[1.01] disabled:opacity-60"
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
                    Confirmer la commande · {formatCurrency(total, currency)}
                  </>
                )}
              </button>

              <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] opacity-70">
                <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" /> Paiement à la livraison</span>
                <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> Livraison 1 à 3 jours</span>
                <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Aucun prépaiement</span>
              </div>
            </form>

            {/* ── Right: order summary ──────────────────────────────── */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div
                className="overflow-hidden border"
                style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radius }}
              >
                <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wider opacity-60" style={{ backgroundColor: theme.surfaceMuted }}>
                  Récapitulatif
                </div>
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    {product.images?.[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={product.images[0]} alt="" className="h-20 w-20 shrink-0 border object-cover" style={{ borderColor: theme.border, borderRadius: radius }} />
                    ) : (
                      <div className="grid h-20 w-20 shrink-0 place-items-center text-2xl" style={{ backgroundColor: theme.surfaceMuted, borderRadius: radius }}>📦</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{product.name}</h3>
                      {product.sku && <p className="mt-0.5 text-[10px] uppercase tracking-wider opacity-60">SKU · {product.sku}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs opacity-70">Qté</span>
                        <div className="inline-flex items-center border" style={{ borderColor: theme.border, borderRadius: radius }}>
                          <button
                            type="button"
                            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                            disabled={quantity <= 1}
                            className="h-7 w-7 text-sm disabled:opacity-30"
                          >−</button>
                          <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                            disabled={quantity >= maxQty}
                            className="h-7 w-7 text-sm disabled:opacity-30"
                          >+</button>
                        </div>
                        {product.trackInventory && !product.allowBackorder && (
                          <span className="text-[10px] opacity-60">{product.stock} en stock</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.border }}>
                    <div className="flex justify-between">
                      <span className="opacity-70">Sous-total</span>
                      <span>{formatCurrency(subtotal, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-70">Livraison</span>
                      <span className="text-xs opacity-70">{shippingDisplay} (à la livraison)</span>
                    </div>
                    <div className="flex justify-between border-t pt-3 text-base font-bold" style={{ borderColor: theme.border }}>
                      <span>À payer au livreur</span>
                      <span>{formatCurrency(total, currency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="mt-4 flex items-start gap-2 border p-4 text-xs"
                style={{ borderColor: theme.border, backgroundColor: theme.surfaceMuted, borderRadius: radius }}
              >
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                <div>
                  <strong>Paiement en espèces à la réception.</strong> Tu vérifies le colis, puis tu paies. Aucune carte bancaire requise.
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </>
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
      <label className="mb-1 block text-xs font-medium opacity-70">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('h-11 w-full border bg-transparent px-3 text-sm focus:outline-none')}
        style={{ borderColor: theme.border, borderRadius: radius, backgroundColor: theme.background }}
      />
    </div>
  );
}
