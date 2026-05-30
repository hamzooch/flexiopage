'use client';

/**
 * Checkout page for a digital product. Inspired by chariow.com.
 *
 * 1. Choose payment channel (Wave / Orange Money / MTN / Moov / Card / Auto)
 * 2. Enter email + phone
 * 3. POST /api/public/checkout/init  → server creates the order, calls CinetPay,
 *    returns { checkoutUrl }
 * 4. Browser redirects to CinetPay's hosted checkout
 * 5. Provider posts the webhook → backend finalizes order + sends email
 * 6. Provider redirects buyer to /thanks/[orderId] which polls for paid status
 *    and then redirects to /d/[downloadToken].
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';
import { Loader2, ShieldCheck, Zap, ArrowLeft, CreditCard } from 'lucide-react';
import { cn, mediaUrl } from '@/lib/utils';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import { STORE_THEME_TEMPLATES } from '@/data/store-themes';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

type Channel = 'wave' | 'orange_money' | 'mtn_momo' | 'moov_money' | 'card' | 'all';

interface ChannelOption {
  id: Channel;
  label: string;
  badge?: string;
  /** colored gradient + emoji used as the visual when no SVG is available. */
  gradient: string;
  emoji: string;
  countries: string;
}

const CHANNELS: ChannelOption[] = [
  { id: 'wave',         label: 'Wave',         emoji: '🌊', gradient: 'from-cyan-500 to-blue-600',     countries: 'SN · CI · ML · BF · GM · UG' },
  { id: 'orange_money', label: 'Orange Money', emoji: '🟠', gradient: 'from-orange-500 to-orange-700', countries: 'SN · CI · CM · ML · BF · MA · TN · MG' },
  { id: 'mtn_momo',     label: 'MTN MoMo',     emoji: '🟡', gradient: 'from-yellow-400 to-amber-600',  countries: 'GH · CI · CM · UG · RW · ZM' },
  { id: 'moov_money',   label: 'Moov Money',   emoji: '🔵', gradient: 'from-sky-500 to-indigo-600',    countries: 'BJ · TG · CI · BF · NE · SN' },
  { id: 'card',         label: 'Carte bancaire', badge: 'Visa / Mastercard', emoji: '💳', gradient: 'from-slate-700 to-slate-900', countries: 'International' },
];

interface ProductDoc {
  _id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  images?: string[];
  digitalKind?: string;
  description?: string;
  type?: 'physical' | 'digital';
}

interface StoreDoc {
  name: string;
  slug: string;
  logo?: string;
  theme?: { templateId?: string };
  settings?: {
    currency?: string;
    country?: string;
    storefront?: { navbar?: NavbarConfig };
  };
}

function fmtPrice(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;
  const productSlug = params.productSlug as string;

  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [store, setStore] = useState<StoreDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<Channel>('all');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Bootstrap product + store. Physical products go through /checkout-cod
  // (cash on delivery) — online payment is reserved for digital stores.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch(`${API_BASE}/api/public/stores/${storeSlug}/products/${productSlug}`),
          fetch(`${API_BASE}/api/public/store-by-slug/${storeSlug}`),
        ]);
        if (cancelled) return;
        if (pRes.ok) {
          const p: ProductDoc = (await pRes.json()).product;
          if (p?.type === 'physical') {
            router.replace(`/${storeSlug}/product/${productSlug}#cod-order-form`);
            return;
          }
          setProduct(p);
        }
        if (sRes.ok) setStore((await sRes.json()).store);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeSlug, productSlug, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !phone.trim()) {
      setError('Email et téléphone obligatoires');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/public/checkout/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeSlug,
          productSlug,
          quantity: 1,
          email: email.trim(),
          customerName: name.trim() || undefined,
          phone: phone.trim(),
          channel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur lors de l\'initialisation du paiement');
        setSubmitting(false);
        return;
      }
      // Redirect to provider's hosted checkout (or our mock simulator)
      window.location.href = data.checkoutUrl;
    } catch (err) {
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

  if (!product || !store) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Produit introuvable</h1>
          <Link href={`/${storeSlug}`} className="mt-4 inline-block text-sm text-primary hover:underline">
            ← Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  const currency = store.settings?.currency || 'USD';
  const themeTokens =
    STORE_THEME_TEMPLATES.find((t) => t.id === store.theme?.templateId)?.theme ||
    STORE_THEME_TEMPLATES[0].theme;

  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-50 via-background to-indigo-50/30 dark:from-fuchsia-950/10 dark:via-background dark:to-indigo-950/10">
      <StoreNavbar
        storeName={store.name}
        storeSlug={storeSlug}
        storeLogo={store.logo}
        theme={themeTokens}
        config={store.settings?.storefront?.navbar}
        trailing={
          <Link
            href={`/${storeSlug}/product/${productSlug}`}
            className="inline-flex items-center gap-1.5 text-xs hover:opacity-100 sm:text-sm"
            style={{ color: themeTokens.muted }}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au produit
          </Link>
        }
      />

      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-12">
        <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:gap-8">
          {/* Left — payment form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Finaliser ton achat</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Paiement sécurisé · Accès instantané après confirmation
              </p>
            </div>

            {/* Buyer info */}
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
              <div>
                <h2 className="text-sm font-semibold">Tes coordonnées</h2>
                <p className="text-xs text-muted-foreground">On envoie ton accès digital à cet email.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="email" className="text-xs font-medium">Email *</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ton@email.com"
                    className="mt-1 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
                  />
                </div>
                <div>
                  <label htmlFor="name" className="text-xs font-medium">Nom complet (optionnel)</label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ton nom"
                    className="mt-1 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="text-xs font-medium">Numéro de téléphone *</label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+221 70 000 00 00"
                    className="mt-1 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Format international avec indicatif pays</p>
                </div>
              </div>
            </div>

            {/* Payment channel picker */}
            <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
              <div>
                <h2 className="text-sm font-semibold">Mode de paiement</h2>
                <p className="text-xs text-muted-foreground">Choisis ton opérateur — ou laisse-nous proposer tous les choix sur la page de paiement.</p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setChannel('all')}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all',
                    channel === 'all' ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'
                  )}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-lg text-white">
                    ✨
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">Tous les modes de paiement</div>
                    <div className="text-xs text-muted-foreground">Wave, Orange Money, MTN, Moov, Carte — choisis sur la page suivante</div>
                  </div>
                  {channel === 'all' && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Choisi</span>}
                </button>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CHANNELS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChannel(c.id)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all',
                        channel === c.id ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'
                      )}
                    >
                      <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-base text-white', c.gradient)}>
                        {c.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold">{c.label}</span>
                          {c.badge && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{c.badge}</span>}
                        </div>
                        <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{c.countries}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl gradient-brand py-4 text-base font-bold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.01] disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5" />
                  Payer {fmtPrice(product.price, currency)}
                </>
              )}
            </button>

            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Paiement sécurisé</span>
              <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3" /> Accès immédiat</span>
              <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" /> Garantie 14 jours</span>
            </div>
          </form>

          {/* Right — order summary */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
              <div className="bg-muted/30 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Récapitulatif
              </div>
              <div className="p-5">
                <div className="flex items-start gap-3">
                  {product.images?.[0] ? (
                    <Image
                      src={mediaUrl(product.images[0]) || product.images[0]}
                      alt=""
                      width={64}
                      height={64}
                      placeholder="blur"
                      blurDataURL={IMAGE_BLUR_DATA_URL}
                      className="h-16 w-16 shrink-0 rounded-xl border border-border/60 object-cover"
                    />
                  ) : (
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-muted text-2xl">📦</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{product.name}</h3>
                    {product.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
                    )}
                  </div>
                </div>
                <div className="mt-5 space-y-2 border-t border-border/60 pt-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sous-total</span>
                    <span>{fmtPrice(product.price, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Livraison</span>
                    <span className="text-emerald-600">Instantanée</span>
                  </div>
                  <div className="flex justify-between border-t border-border/60 pt-3 font-bold">
                    <span>Total</span>
                    <span className="text-lg">{fmtPrice(product.price, currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Livraison instantanée :</strong> dès que ton paiement est confirmé,
              ton accès digital arrive sur <span className="font-medium text-foreground">{email || 'ton email'}</span>.
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
