'use client';

/**
 * Checkout page for a digital product. Chariow-style multi-step wizard.
 *
 *   Step 1  Récapitulatif commande
 *   Step 2  Contact (email + nom)
 *   Step 3  Choix méthode de paiement (Wave / OM / MTN / Moov / Carte)
 *   Step 4  Numéro Mobile Money → POST /api/public/checkout/init → redirect
 *
 * The buyer is then sent to CinetPay's hosted page for the OTP flow. After
 * payment, the provider posts the webhook → backend finalises + emails →
 * user is redirected to /thanks/[orderId] which polls for paid status and
 * then jumps to /d/[downloadToken].
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';
import { Loader2, ShieldCheck, Zap, ArrowLeft, ArrowRight, CreditCard, CheckCircle2, Phone, Mail, User, Package } from 'lucide-react';
import { cn, mediaUrl } from '@/lib/utils';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import { STORE_THEME_TEMPLATES } from '@/data/store-themes';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

type Channel = 'wave' | 'orange_money' | 'mtn_momo' | 'moov_money' | 'card' | 'all';
type Step = 1 | 2 | 3 | 4;

interface ChannelOption {
  id: Channel;
  label: string;
  badge?: string;
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

const ALL_METHODS_OPTION: ChannelOption = {
  id: 'all', label: 'Tous les modes',
  emoji: '✨', gradient: 'from-fuchsia-500 to-indigo-600',
  countries: 'Wave · OM · MTN · Moov · Carte',
};

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

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;
  const productSlug = params.productSlug as string;

  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [store, setStore] = useState<StoreDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<Channel>('all');
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

  const currency = store?.settings?.currency || 'USD';
  const selectedChannel = useMemo(
    () => (channel === 'all' ? ALL_METHODS_OPTION : CHANNELS.find((c) => c.id === channel)) || ALL_METHODS_OPTION,
    [channel],
  );

  function goNext() {
    setError('');
    if (step === 2) {
      if (!isValidEmail(email)) {
        setError('Adresse email invalide');
        return;
      }
    }
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  function goBack() {
    setError('');
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function submitPayment() {
    if (!phone.trim()) {
      setError('Numéro de téléphone obligatoire');
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
      window.location.href = data.checkoutUrl;
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
          {/* Left — wizard */}
          <div className="space-y-6">
            <StepHeader step={step} />

            {step === 1 && (
              <StepSummary product={product} currency={currency} onNext={goNext} />
            )}
            {step === 2 && (
              <StepContact
                email={email}
                name={name}
                onEmailChange={setEmail}
                onNameChange={setName}
                onBack={goBack}
                onNext={goNext}
              />
            )}
            {step === 3 && (
              <StepChannel channel={channel} onSelect={setChannel} onBack={goBack} onNext={goNext} />
            )}
            {step === 4 && (
              <StepPhone
                phone={phone}
                onPhoneChange={setPhone}
                selectedChannel={selectedChannel}
                submitting={submitting}
                amount={product.price}
                currency={currency}
                onBack={goBack}
                onSubmit={submitPayment}
              />
            )}

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Paiement sécurisé</span>
              <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3" /> Accès immédiat</span>
              <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" /> Garantie 14 jours</span>
            </div>
          </div>

          {/* Right — order summary sticky */}
          <OrderSummary product={product} currency={currency} email={email} />
        </div>
      </main>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                         */
/* ────────────────────────────────────────────────────────────────────── */

function StepHeader({ step }: { step: Step }) {
  const labels: Record<Step, string> = {
    1: 'Récapitulatif',
    2: 'Tes coordonnées',
    3: 'Mode de paiement',
    4: 'Confirmation',
  };
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-all',
                n < step && 'bg-emerald-500 text-white',
                n === step && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                n > step && 'bg-muted text-muted-foreground',
              )}
            >
              {n < step ? <CheckCircle2 className="h-4 w-4" /> : n}
            </div>
            {n < 4 && (
              <div className={cn('h-0.5 flex-1 transition-all', n < step ? 'bg-emerald-500' : 'bg-muted')} />
            )}
          </div>
        ))}
      </div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{labels[step]}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Étape {step} sur 4</p>
    </div>
  );
}

function StepSummary({
  product,
  currency,
  onNext,
}: {
  product: ProductDoc;
  currency: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="flex items-start gap-4 p-5">
          {product.images?.[0] ? (
            <Image
              src={mediaUrl(product.images[0]) || product.images[0]}
              alt=""
              width={80}
              height={80}
              placeholder="blur"
              blurDataURL={IMAGE_BLUR_DATA_URL}
              className="h-20 w-20 shrink-0 rounded-xl border border-border/60 object-cover"
            />
          ) : (
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted text-3xl">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">{product.name}</h3>
            {product.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
            )}
            <div className="mt-2 text-lg font-bold">{fmtPrice(product.price, currency)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          <span className="font-semibold">Livraison instantanée</span>
        </div>
        <p className="mt-1 pl-6 text-[11px] opacity-80">Ton accès arrive par email dès que le paiement est confirmé.</p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl gradient-brand py-4 text-base font-bold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.01]"
      >
        Continuer <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function StepContact({
  email,
  name,
  onEmailChange,
  onNameChange,
  onBack,
  onNext,
}: {
  email: string;
  name: string;
  onEmailChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="space-y-5"
    >
      <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
        <div>
          <label htmlFor="email" className="flex items-center gap-1.5 text-xs font-semibold">
            <Mail className="h-3.5 w-3.5" /> Email *
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            autoFocus
            placeholder="ton@email.com"
            className="mt-1.5 flex h-12 w-full rounded-xl border border-input bg-background px-4 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">Ton accès digital est envoyé à cet email.</p>
        </div>
        <div>
          <label htmlFor="name" className="flex items-center gap-1.5 text-xs font-semibold">
            <User className="h-3.5 w-3.5" /> Nom complet <span className="font-normal text-muted-foreground">(optionnel)</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Ton nom"
            className="mt-1.5 flex h-12 w-full rounded-xl border border-input bg-background px-4 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 text-sm font-semibold hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <button
          type="submit"
          className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl gradient-brand py-4 text-base font-bold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.01]"
        >
          Continuer <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}

function StepChannel({
  channel,
  onSelect,
  onBack,
  onNext,
}: {
  channel: Channel;
  onSelect: (c: Channel) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
        <p className="text-xs text-muted-foreground">
          Choisis ton opérateur — ou laisse-nous proposer tous les choix sur la page de paiement.
        </p>

        <button
          type="button"
          onClick={() => onSelect('all')}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all',
            channel === 'all' ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40',
          )}
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-lg text-white">
            ✨
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Tous les modes de paiement</div>
            <div className="text-xs text-muted-foreground">Wave, Orange Money, MTN, Moov, Carte</div>
          </div>
          {channel === 'all' && (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
          )}
        </button>

        <div className="grid gap-2 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-all',
                channel === c.id ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40',
              )}
            >
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-base text-white', c.gradient)}>
                {c.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{c.label}</span>
                  {c.badge && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{c.badge}</span>}
                </div>
                <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{c.countries}</div>
              </div>
              {channel === c.id && (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 text-sm font-semibold hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl gradient-brand py-4 text-base font-bold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.01]"
        >
          Continuer <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function StepPhone({
  phone,
  onPhoneChange,
  selectedChannel,
  submitting,
  amount,
  currency,
  onBack,
  onSubmit,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
  selectedChannel: ChannelOption;
  submitting: boolean;
  amount: number;
  currency: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const isCard = selectedChannel.id === 'card';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-5"
    >
      <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-lg text-white', selectedChannel.gradient)}>
            {selectedChannel.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{selectedChannel.label}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{selectedChannel.countries}</div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-primary hover:underline"
          >
            Changer
          </button>
        </div>

        <div>
          <label htmlFor="phone" className="flex items-center gap-1.5 text-xs font-semibold">
            <Phone className="h-3.5 w-3.5" />
            {isCard ? 'Numéro de téléphone *' : `Numéro ${selectedChannel.label} *`}
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            autoFocus
            placeholder="+225 07 00 00 00 00"
            className="mt-1.5 flex h-13 w-full rounded-xl border border-input bg-background px-4 text-base font-medium focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {isCard
              ? 'Ton téléphone sera utilisé pour la confirmation SMS.'
              : `On enverra une demande de paiement sur ce numéro. Tape ton PIN ${selectedChannel.label} pour valider.`}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
          <span className="text-xs text-muted-foreground">Montant à payer</span>
          <span className="text-lg font-bold">{fmtPrice(amount, currency)}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl gradient-brand py-4 text-base font-bold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.01] disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Initialisation…
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" />
              Payer {fmtPrice(amount, currency)}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function OrderSummary({
  product,
  currency,
  email,
}: {
  product: ProductDoc;
  currency: string;
  email: string;
}) {
  return (
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
  );
}
