'use client';

/**
 * Welcome popup that collects emails on the storefront. Mounted in the
 * shared /store/[storeSlug]/layout so it appears on every page.
 *
 * Trigger logic:
 *   - Wait `delaySeconds` after mount, then show.
 *   - Optional exit-intent: also surface when the cursor leaves the
 *     window through the top edge (desktop only).
 *   - Suppressed for `dismissalDays` after the visitor closes it OR
 *     after a successful subscribe — both stored in localStorage so the
 *     same browser doesn't see it again right away.
 *
 * On submit we POST to /api/public/stores/:slug/subscribe — the backend
 * is idempotent (re-submitting the same email is fine) and returns the
 * reward coupon code (if any) which we then display.
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, BadgePercent, X, Loader2, CheckCircle2, Copy, Check } from 'lucide-react';
import { mediaUrl } from '@/lib/utils';

export interface NewsletterConfig {
  enabled?: boolean;
  headline?: string;
  subheadline?: string;
  ctaLabel?: string;
  image?: string;
  delaySeconds?: number;
  exitIntent?: boolean;
  rewardCouponCode?: string;
  dismissalDays?: number;
  successMessage?: string;
}

interface Props {
  storeSlug: string;
  storeName?: string;
  config?: NewsletterConfig;
}

const DISMISS_KEY = (slug: string) => `flexio.newsletter.dismissed:${slug}`;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export function NewsletterPopup({ storeSlug, storeName, config }: Props) {
  // Pas de popup dans l'iframe d'aperçu vendeur — éviterait de masquer le
  // rendu et d'écrire dans le `localStorage` du dashboard.
  const searchParams = useSearchParams();
  const isPreview = searchParams?.get('preview') === '1';

  const enabled = !!config?.enabled && !isPreview;
  const delayMs = Math.max(0, (config?.delaySeconds ?? 5) * 1000);
  const exitIntent = config?.exitIntent !== false;
  const dismissalDays = Math.max(0, config?.dismissalDays ?? 7);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ rewardCode?: string; message?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Ref kept stable across renders — used to avoid double-firing the
  // exit-intent handler when the popup is open or already dismissed.
  const triggeredRef = useRef(false);

  // ── Trigger logic ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    // Honor dismissal flag
    const flag = window.localStorage.getItem(DISMISS_KEY(storeSlug));
    if (flag) {
      const dismissedAt = parseInt(flag, 10);
      if (Number.isFinite(dismissedAt)) {
        const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
        if (daysSince < dismissalDays) return;
      }
    }

    function fire() {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      setOpen(true);
    }

    const timer = window.setTimeout(fire, delayMs);

    function onMouseLeave(e: MouseEvent) {
      if (!exitIntent) return;
      // Only count "exit through top" — leaving sideways is just the user
      // moving to another window or tab on the same screen.
      if (e.clientY > 10) return;
      fire();
    }

    if (exitIntent) {
      // Desktop only — mobile doesn't have a meaningful mouseleave.
      const isCoarse = window.matchMedia('(pointer: coarse)').matches;
      if (!isCoarse) {
        document.addEventListener('mouseleave', onMouseLeave);
      }
    }

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [enabled, storeSlug, delayMs, exitIntent, dismissalDays]);

  function dismiss() {
    setOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY(storeSlug), String(Date.now()));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Email invalide.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/stores/${storeSlug}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        rewardCouponCode?: string;
        successMessage?: string;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setError(data.error || 'Inscription échouée.');
        return;
      }
      setSuccess({ rewardCode: data.rewardCouponCode, message: data.successMessage });
      // Persist dismissal so we don't re-trigger after they close it.
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DISMISS_KEY(storeSlug), String(Date.now()));
      }
    } catch {
      setError('Impossible de joindre le serveur. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — keep the popup useful on older browsers
    }
  }

  if (!enabled || !open) return null;

  const headline = config?.headline || `Bienvenue chez ${storeName || 'la boutique'}`;
  const sub = config?.subheadline || 'Inscris-toi pour recevoir nos meilleures offres.';
  const cta = config?.ctaLabel || "Je m'inscris";

  return (
    <div
      className="newsletter-pop-backdrop fixed inset-0 z-[60] grid place-items-center bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-popup-title"
      onClick={dismiss}
    >
      <div
        className="newsletter-pop-card relative grid w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl sm:max-w-2xl sm:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — top-right of the whole modal, not the form column */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-card/80 text-muted-foreground shadow backdrop-blur hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {config?.image && (
          <div
            className="hidden bg-cover bg-center sm:block"
            style={{ backgroundImage: `url(${mediaUrl(config.image) || config.image})` }}
            aria-hidden
          />
        )}

        <div className="space-y-4 p-6 sm:p-7">
          {success ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">Merci !</h2>
              <p className="text-sm text-muted-foreground">
                {success.message || config?.successMessage || 'Tu es bien inscrit.'}
              </p>

              {success.rewardCode && (
                <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Ton code de remise
                  </div>
                  <button
                    type="button"
                    onClick={() => copyCode(success.rewardCode!)}
                    className="mt-1.5 inline-flex items-center gap-2 rounded-md bg-card px-3 py-1.5 text-lg font-mono font-bold tracking-widest text-primary shadow hover:bg-muted"
                  >
                    {success.rewardCode}
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Saisis-le dans le formulaire de commande pour profiter de la remise.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={dismiss}
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Continuer
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  <Mail className="h-3 w-3" />
                  Offre de bienvenue
                </div>
                <h2
                  id="newsletter-popup-title"
                  className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl"
                >
                  {headline}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {sub}
                </p>
              </div>

              {config?.rewardCouponCode && (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  <BadgePercent className="h-3 w-3" />
                  Code <code className="font-mono">{config.rewardCouponCode}</code> en récompense
                </div>
              )}

              <div className="space-y-2">
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ton.email@exemple.com"
                  className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary to-fuchsia-600 px-4 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-transform hover:scale-[1.01] disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>
                      <Mail className="h-4 w-4" />
                      {cta}
                    </>
                  )}
                </button>
                {error && <p className="text-xs text-rose-600">{error}</p>}
              </div>

              <div className="border-t border-border/40 pt-3 text-[10px] leading-snug text-muted-foreground">
                Pas de spam · désabonnement libre · tu peux toujours fermer cette fenêtre.
                <br />
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-1 text-[10px] underline-offset-2 hover:underline"
                >
                  Non merci, je passe
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes nlPopBackdrop { from { opacity: 0 } to { opacity: 1 } }
        @keyframes nlPopCard { from { transform: translateY(20px) scale(0.98); opacity: 0 } to { transform: translateY(0) scale(1); opacity: 1 } }
        .newsletter-pop-backdrop { animation: nlPopBackdrop 0.25s ease-out; }
        .newsletter-pop-card { animation: nlPopCard 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
      `}</style>
    </div>
  );
}
