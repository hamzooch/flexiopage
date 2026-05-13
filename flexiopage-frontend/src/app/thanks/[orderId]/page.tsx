'use client';

/**
 * Thank-you page — landing target after the buyer comes back from the payment
 * provider (CinetPay return_url) or from the dev mock simulator.
 *
 * Polls /api/public/orders/:orderId/status every 2s :
 *   - paymentStatus === 'paid' → redirect to /d/<downloadToken>
 *   - paymentStatus === 'failed' → show retry CTA
 *   - else → keep polling with progress UI
 *
 * In mock mode (?simulate=1), shows a "Simulate paid" button that posts the
 * mock webhook so devs can demo the full flow without a real provider.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { MarketingPixels, type MarketingConfig } from '@/components/storefront/MarketingPixels';
import { TrackEvent } from '@/components/storefront/TrackEvent';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

interface StatusPayload {
  orderId: string;
  orderNumber: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'manual';
  downloadToken?: string;
  total: number;
  currency: string;
  mockMode?: boolean;
}

function fmtPrice(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

export default function ThanksPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params.orderId as string;
  const simulate = searchParams.get('simulate') === '1';

  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState('');
  const [simulating, setSimulating] = useState(false);

  // Poll status every 2s until paid / failed
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/public/orders/${orderId}/status`);
        if (cancelled) return;
        if (!res.ok) {
          setError(`Erreur ${res.status}`);
          return;
        }
        const data = (await res.json()) as StatusPayload;
        setStatus(data);
        if (data.paymentStatus === 'paid' && data.downloadToken) {
          // Redirect to the buyer download portal
          router.replace(`/d/${data.downloadToken}`);
        }
      } catch {
        if (!cancelled) setError('Impossible de joindre le serveur');
      }
    };
    void tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId, router]);

  async function handleSimulatePaid() {
    setSimulating(true);
    try {
      await fetch(`${API_BASE}/api/webhooks/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      // Next poll will see 'paid' and redirect
    } catch {
      setError('Simulation échouée');
      setSimulating(false);
    }
  }

  const isPaid = status?.paymentStatus === 'paid';
  const isFailed = status?.paymentStatus === 'failed';
  const isMock = status?.mockMode || simulate;

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-fuchsia-50 via-background to-indigo-50/30 px-3 py-8 dark:from-fuchsia-950/10 dark:via-background dark:to-indigo-950/10 sm:px-4 sm:py-10">
      <div className="w-full max-w-md text-center">
        {isFailed ? (
          <FailedView orderId={orderId} />
        ) : (
          <>
            <div className={`mx-auto grid h-16 w-16 place-items-center rounded-3xl text-3xl text-white shadow-2xl sm:h-20 sm:w-20 sm:text-4xl ${
              isPaid ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30'
                     : 'bg-gradient-to-br from-fuchsia-500 to-indigo-600 shadow-primary/30 animate-pulse'
            }`}>
              {isPaid ? <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10" /> : <Loader2 className="h-8 w-8 animate-spin sm:h-10 sm:w-10" />}
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight sm:mt-6 sm:text-3xl">
              {isPaid ? 'Paiement reçu !' : 'On confirme ton paiement…'}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              {isPaid
                ? 'Redirection vers tes téléchargements…'
                : 'Cette page se met à jour automatiquement dès que ton opérateur confirme le paiement. Garde-la ouverte.'}
            </p>

            {status && (
              <div className="mt-6 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/70 px-4 py-2 text-xs backdrop-blur">
                <span className="font-semibold text-foreground">Commande #{status.orderNumber}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-semibold">{fmtPrice(status.total, status.currency)}</span>
                <span className="text-muted-foreground">·</span>
                <span
                  className={
                    isPaid
                      ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-700'
                      : 'rounded-full bg-amber-500/10 px-2 py-0.5 font-bold text-amber-700'
                  }
                >
                  {isPaid ? 'Payé' : 'En attente'}
                </span>
              </div>
            )}

            {/* Mock mode dev helper */}
            {isMock && !isPaid && (
              <div className="mt-8 rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-5">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  <Sparkles className="h-3 w-3" /> Mode développement
                </div>
                <p className="text-xs text-amber-900">
                  CinetPay n'est pas configuré (CINETPAY_API_KEY manquant). Tu peux simuler un paiement réussi pour tester le flow complet.
                </p>
                <button
                  type="button"
                  onClick={handleSimulatePaid}
                  disabled={simulating}
                  className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.02] disabled:opacity-60"
                >
                  {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : '✓'}
                  Simuler le paiement réussi
                </button>
              </div>
            )}

            {error && !isPaid && (
              <p className="mt-4 text-xs text-destructive">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FailedView({ orderId }: { orderId: string }) {
  return (
    <>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-red-500 to-rose-600 text-3xl text-white shadow-2xl shadow-red-500/30 sm:h-20 sm:w-20 sm:text-4xl">
        <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10" />
      </div>
      <h1 className="mt-5 text-2xl font-bold tracking-tight sm:mt-6 sm:text-3xl">Paiement non confirmé</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Ton paiement n'a pas pu être validé. Tu n'as pas été débité — tu peux réessayer ou contacter le vendeur.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Link
          href={typeof window !== 'undefined' ? document.referrer || '/' : '/'}
          className="inline-flex h-11 items-center justify-center rounded-xl gradient-brand px-5 text-sm font-semibold text-white shadow-md shadow-primary/25"
        >
          Réessayer le paiement
        </Link>
        <p className="text-[11px] text-muted-foreground">Référence : {orderId}</p>
      </div>
    </>
  );
}
