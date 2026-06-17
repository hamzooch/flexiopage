'use client';

/**
 * Bannière « Confirme ton email » — affichée en haut du dashboard quand
 * `user.emailVerified === false`. Cas typique : signup email/password
 * tout frais, avant que le seller ait cliqué sur le lien Resend.
 *
 * - Disparaît dès que `emailVerified` devient true (mise à jour optimiste
 *   via auth-store quand le seller vient de cliquer sur /verify-email
 *   dans un autre onglet, ou côté API au prochain /auth/me).
 * - Bouton « Renvoyer le mail » — appelle /auth/resend-verification.
 *   Throttle 1/min côté backend → on affiche le countdown si 429.
 * - Pas dismissible volontairement — un compte non vérifié ne peut pas
 *   être utilisé sereinement (mots de passe perdus, deliverability…).
 *   Tant que le seller n'a pas confirmé, la bannière reste.
 *
 * Cachée pour les comptes Google (déjà `emailVerified: true` côté backend
 * dès le signup OAuth — branche signInWithGoogle).
 */

import { useState } from 'react';
import { MailWarning, Loader2, CheckCircle2 } from 'lucide-react';
import { authApi, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

export function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user);
  const platform = useAuthStore((s) => s.platform);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Pas connecté ou déjà vérifié → on ne rend rien (le banner ne doit
  // jamais clignoter pendant l'hydratation, d'où le check explicite sur
  // `user` avant emailVerified).
  if (!user) return null;
  if (user.emailVerified !== false) return null;
  // Respect du kill-switch admin : si la plateforme a désactivé la
  // vérification email, on cache la bannière pour les comptes existants
  // qui n'ont pas encore confirmé. Note : `platform === null` (premier
  // paint avant /auth/me) → on assume « activé » par défaut pour ne pas
  // faire disparaître la bannière à tort.
  if (platform && !platform.emailVerificationEnabled) return null;

  async function handleResend() {
    setSending(true);
    setError('');
    try {
      await authApi.resendVerification();
      setSent(true);
      // Refait apparaître le bouton après 60s pour aligner avec le throttle backend.
      setCooldown(60);
      const interval = window.setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            window.clearInterval(interval);
            setSent(false);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      const e = err as { response?: { data?: { retryAfter?: number } } };
      const retryAfter = e.response?.data?.retryAfter;
      if (retryAfter) {
        setCooldown(retryAfter);
        const interval = window.setInterval(() => {
          setCooldown((c) => {
            if (c <= 1) {
              window.clearInterval(interval);
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      }
      setError(extractApiError(err, 'Envoi impossible — réessaie dans quelques secondes.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 px-4 py-3 text-sm sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 sm:mt-0" />
          <div className="min-w-0 leading-tight">
            <span className="font-medium text-amber-900">Confirme ton email </span>
            <span className="text-amber-900/80">
              — on t&apos;a envoyé un lien sur <span className="font-medium">{user.email}</span>. Clique dessus pour activer ton compte.
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sent ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Envoyé{cooldown > 0 ? ` · ${cooldown}s` : ''}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={sending || cooldown > 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-600/40 bg-amber-600/10 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-600/20 disabled:opacity-50"
            >
              {sending && <Loader2 className="h-3 w-3 animate-spin" />}
              {cooldown > 0 ? `Renvoyer (${cooldown}s)` : 'Renvoyer le mail'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="mx-auto mt-1 max-w-7xl text-xs text-rose-700">{error}</p>
      )}
    </div>
  );
}
