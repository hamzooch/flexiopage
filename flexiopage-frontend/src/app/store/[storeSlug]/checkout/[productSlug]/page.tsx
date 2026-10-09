'use client';

/**
 * Checkout page for a digital product — single-page form.
 *
 * Contact + phone (WhatsApp) + payment method all on one screen. Submit
 * POSTs /api/public/checkout/init, which creates the order and returns the
 * gateway checkout URL. After payment the provider posts the webhook →
 * backend finalises + emails → user is redirected to /thanks/[orderId]
 * which polls for paid status and then jumps to /d/[downloadToken].
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';
import { Loader2, ShieldCheck, Zap, ArrowLeft, CreditCard, CheckCircle2, MessageCircle, Mail, User, Package, AlertCircle } from 'lucide-react';
import { cn, mediaUrl } from '@/lib/utils';
import { StoreNavbar, type NavbarConfig } from '@/components/storefront/StoreNavbar';
import {
  PhoneCountryField,
  defaultPhoneCountry,
  joinPhone,
  phoneCountryByCode,
} from '@/components/storefront/phone-country-field';
import { resolveStoreTheme } from '@/data/store-themes';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

type Channel = 'wave' | 'orange_money' | 'mtn_momo' | 'moov_money' | 'card' | 'all';

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
    checkoutPage?: {
      title?: string;
      reassurance?: string;
      submitLabel?: string;
    };
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

type FieldErrors = { email?: string; phone?: string };
type FormAlert = { title: string; message: string };

function friendlyCheckoutError(status: number, data: { error?: string; code?: string }): FormAlert {
  if (data.code === 'product_missing_content') {
    return {
      title: 'Produit indisponible',
      message: data.error || 'Ce produit n’est pas encore disponible au téléchargement.',
    };
  }
  if (data.code === 'invalid_form') {
    return {
      title: 'Informations à corriger',
      message: data.error || 'Vérifie les champs indiqués.',
    };
  }
  if (status === 404) {
    return {
      title: 'Produit introuvable',
      message: data.error || 'Ce produit n’est plus disponible.',
    };
  }
  if (data.code === 'payment_init_failed' || data.code === 'order_create_failed' || status >= 500) {
    return {
      title: 'Paiement momentanément indisponible',
      message: data.error || 'Le paiement n’a pas pu démarrer. Réessaie dans un instant.',
    };
  }
  const raw = data.error || '';
  if (raw && raw.length < 180 && !/failed|required|exception|error:/i.test(raw)) {
    return { title: 'Impossible de continuer', message: raw };
  }
  return {
    title: 'Impossible de continuer',
    message: 'Vérifie tes informations et réessaie.',
  };
}

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;
  const productSlug = params.productSlug as string;

  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [store, setStore] = useState<StoreDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('SN');
  const [channel, setChannel] = useState<Channel>('all');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formAlert, setFormAlert] = useState<FormAlert | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const countryPicked = useRef(false);

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
        if (sRes.ok) {
          const payload = await sRes.json();
          setStore(payload.store);
          if (!countryPicked.current) {
            setPhoneCountry(defaultPhoneCountry(payload.geoCountry, payload.store?.settings?.country));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeSlug, productSlug, router]);

  function revealAlert(alert: FormAlert) {
    setFormAlert(alert);
    requestAnimationFrame(() => {
      alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const prefix = phoneCountryByCode(phoneCountry)?.phonePrefix || '';
    const fullPhone = joinPhone(prefix, phone);
    const nextFields: FieldErrors = {};
    if (!email.trim()) nextFields.email = 'Indique ton adresse email.';
    else if (!isValidEmail(email)) nextFields.email = 'Cette adresse email n’est pas valide.';
    if (!phone.trim()) nextFields.phone = 'Indique ton numéro WhatsApp.';
    else if (!fullPhone) nextFields.phone = 'Ce numéro est incomplet. Vérifie l’indicatif et les chiffres.';
    if (nextFields.email || nextFields.phone) {
      setFieldErrors(nextFields);
      revealAlert({
        title: 'Informations à corriger',
        message: nextFields.email && nextFields.phone
          ? 'L’email et le numéro WhatsApp doivent être remplis correctement.'
          : (nextFields.email || nextFields.phone) as string,
      });
      return;
    }

    setFieldErrors({});
    setFormAlert(null);
    setSubmitting(true);
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
          phone: fullPhone,
          whatsapp: fullPhone,
          channel,
        }),
      });
      let data: { error?: string; code?: string; fields?: FieldErrors; checkoutUrl?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        if (data.fields) setFieldErrors(data.fields);
        revealAlert(friendlyCheckoutError(res.status, data));
        setSubmitting(false);
        return;
      }
      if (!data.checkoutUrl) {
        revealAlert({
          title: 'Paiement momentanément indisponible',
          message: 'Le paiement n’a pas pu démarrer. Réessaie dans un instant.',
        });
        setSubmitting(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      revealAlert({
        title: 'Connexion impossible',
        message: 'Impossible de joindre le serveur. Vérifie ta connexion et réessaie.',
      });
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
  const themeTokens = resolveStoreTheme(store);

  return (
    <div className="min-h-screen" style={{ backgroundColor: themeTokens.background, color: themeTokens.foreground }}>
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
        {/* ─── Récap compact mobile ──────────────────────────────
            Sans ce bloc, sur mobile le client remplissait 10+ champs sans jamais voir
            ce qu'il achète ni le prix (le récap complet est en bas du grid, après le
            formulaire). On remet le visuel + prix immédiatement visibles, format
            compact pour pas prendre tout l'écran. */}
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 lg:hidden">
          {product.images?.[0] ? (
            <Image
              src={mediaUrl(product.images[0]) || product.images[0]}
              alt=""
              width={56}
              height={56}
              placeholder="blur"
              blurDataURL={IMAGE_BLUR_DATA_URL}
              className="h-14 w-14 shrink-0 rounded-xl border border-border/60 object-cover"
              unoptimized={mediaUrl(product.images[0])?.includes('cloudinary') ?? false}
            />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{product.name}</p>
            <p className="text-xs text-emerald-600">Livraison instantanée</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-base font-bold">{fmtPrice(product.price, currency)}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:gap-8">
          {/* ─── Formulaire ─────────────────────────────────────── */}
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {store.settings?.checkoutPage?.title || 'Finaliser ton achat'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {store.settings?.checkoutPage?.reassurance || 'Paiement sécurisé · Accès instantané après confirmation'}
              </p>
            </div>

            {/* Contact */}
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
              <div>
                <h2 className="text-sm font-semibold">Tes coordonnées</h2>
                <p className="text-xs text-muted-foreground">
                  On envoie ton accès digital à cet email. Le WhatsApp sert pour le paiement Mobile Money.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="name" className="flex items-center gap-1.5 text-xs font-semibold">
                    <User className="h-3.5 w-3.5" />
                    Nom complet <span className="font-normal text-muted-foreground">(optionnel)</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ton nom"
                    className="mt-1.5 flex h-12 w-full rounded-xl border border-input bg-background px-4 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="flex items-center gap-1.5 text-xs font-semibold">
                    <Mail className="h-3.5 w-3.5" /> Email *
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    aria-invalid={fieldErrors.email ? true : undefined}
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
                      if (formAlert) setFormAlert(null);
                    }}
                    placeholder="ton@email.com"
                    className={cn(
                      'mt-1.5 flex h-12 w-full rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-4',
                      fieldErrors.email
                        ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-100 dark:focus:ring-rose-950'
                        : 'border-input focus:border-primary/40 focus:ring-primary/10',
                    )}
                  />
                  {fieldErrors.email && (
                    <p id="email-error" className="mt-1.5 text-xs font-medium text-rose-600">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="phone" className="flex items-center gap-1.5 text-xs font-semibold">
                    <MessageCircle className="h-3.5 w-3.5" /> Numéro WhatsApp *
                  </label>
                  <div className="mt-1.5">
                    <PhoneCountryField
                      id="phone"
                      value={phone}
                      country={phoneCountry}
                      error={fieldErrors.phone}
                      describedBy={fieldErrors.phone ? 'phone-error' : 'phone-hint'}
                      onChange={(next) => {
                        setPhone(next);
                        if (fieldErrors.phone) setFieldErrors((current) => ({ ...current, phone: undefined }));
                        if (formAlert) setFormAlert(null);
                      }}
                      onCountryChange={(code) => {
                        countryPicked.current = true;
                        setPhoneCountry(code);
                        if (fieldErrors.phone) setFieldErrors((current) => ({ ...current, phone: undefined }));
                        if (formAlert) setFormAlert(null);
                      }}
                    />
                  </div>
                  {fieldErrors.phone ? (
                    <p id="phone-error" className="mt-1.5 text-xs font-medium text-rose-600">
                      {fieldErrors.phone}
                    </p>
                  ) : (
                    <p id="phone-hint" className="mt-1.5 text-xs text-muted-foreground">
                      Choisis ton pays, puis saisis ton numéro. Il sert aussi au paiement Mobile Money.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
              <div>
                <h2 className="text-sm font-semibold">Mode de paiement</h2>
                <p className="text-xs text-muted-foreground">
                  Choisis ton opérateur — ou laisse-nous te proposer tous les modes sur la page de paiement.
                </p>
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
                  {channel === 'all' && (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  )}
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold">{c.label}</span>
                          {c.badge && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{c.badge}</span>}
                        </div>
                        <div className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">{c.countries}</div>
                      </div>
                      {channel === c.id && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {formAlert && (
              <div
                ref={alertRef}
                role="alert"
                className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-50"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                <div>
                  <p className="font-semibold">{formAlert.title}</p>
                  <p className="mt-0.5 text-rose-800 dark:text-rose-100/90">{formAlert.message}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl gradient-brand px-4 py-4 text-base font-bold text-white shadow-xl shadow-primary/30 transition-all hover:scale-[1.01] disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Initialisation…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5" />
                  {store.settings?.checkoutPage?.submitLabel || 'Payer'} {fmtPrice(product.price, currency)}
                </>
              )}
            </button>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Paiement sécurisé</span>
              <span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Accès immédiat</span>
              <span className="inline-flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Garantie 14 jours</span>
            </div>
          </form>

          {/* ─── Récapitulatif complet (desktop uniquement) ──────
              Sur mobile ce bloc est remplacé par le récap compact en haut
              de page (voir plus haut, lg:hidden). hidden lg:block l'enlève
              aussi du flow du grid côté mobile. */}
          <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
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
                      unoptimized={mediaUrl(product.images[0])?.includes('cloudinary') ?? false}
                    />
                  ) : (
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-muted text-2xl">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
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
