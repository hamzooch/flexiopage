'use client';

/**
 * Reset-password landing — atterrissage du clic sur le lien reçu par mail.
 * Lit `?token=…`, affiche un formulaire (nouveau mot de passe + confirmation),
 * appelle POST /auth/reset-password, gère les états (succès / expiré / invalide).
 *
 * Wrappé dans <Suspense> car useSearchParams() casse la génération statique.
 */

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, RefreshCw, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authApi, extractApiError } from '@/lib/api';
import { BrandLogo } from '@/components/brand-logo';

type Status = 'form' | 'success' | 'invalid' | 'expired';

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [status, setStatus] = useState<Status>(token ? 'form' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword: password });
      setStatus('success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { code?: string } } };
      const code = e.response?.data?.code;
      if (code === 'token_expired') setStatus('expired');
      else if (code === 'invalid_token') setStatus('invalid');
      else setError(extractApiError(err, 'Réinitialisation impossible.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <Link href="/" className="inline-flex" aria-label="FlexioPage — accueil">
          <BrandLogo variant="color" width={150} priority />
        </Link>

        <div className="mt-10 rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
          {status === 'form' && (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Nouveau mot de passe</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Choisis un nouveau mot de passe pour ton compte.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {error && (
                  <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-foreground/90">Nouveau mot de passe</label>
                  <div className="group relative flex h-12 items-center rounded-xl border border-input bg-card transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                    <span className="grid h-12 w-11 shrink-0 place-items-center text-muted-foreground group-focus-within:text-primary">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8 caractères minimum"
                      className="h-full flex-1 bg-transparent pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Cacher' : 'Afficher'}
                      className="mr-1.5 grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm" className="text-sm font-medium text-foreground/90">Confirme le mot de passe</label>
                  <div className="group relative flex h-12 items-center rounded-xl border border-input bg-card transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                    <span className="grid h-12 w-11 shrink-0 place-items-center text-muted-foreground group-focus-within:text-primary">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      id="confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="retape ton mot de passe"
                      className="h-full flex-1 bg-transparent pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={loading || !password || !confirm} className="h-12 w-full gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Réinitialiser mon mot de passe'}
                </Button>
              </form>
            </>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight">Mot de passe modifié !</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tu peux maintenant te connecter avec ton nouveau mot de passe.
              </p>
              <Button className="mt-6 w-full gap-2" onClick={() => router.replace('/login')}>
                Se connecter
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {status === 'expired' && (
            <div className="flex flex-col items-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10">
                <RefreshCw className="h-7 w-7 text-amber-600" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight">Lien expiré</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ce lien de réinitialisation a plus d&apos;une heure. Demande-en un nouveau.
              </p>
              <Button className="mt-6 w-full gap-2" onClick={() => router.replace('/forgot-password')}>
                Demander un nouveau lien
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {status === 'invalid' && (
            <div className="flex flex-col items-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10">
                <ShieldX className="h-7 w-7 text-rose-600" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight">Lien invalide</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {error || 'Ce lien n\'est pas reconnu — il a peut-être déjà été utilisé ou tronqué dans le mail.'}
              </p>
              <Button variant="outline" className="mt-6 w-full gap-2" onClick={() => router.replace('/forgot-password')}>
                Demander un nouveau lien
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Retour à la connexion</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
