'use client';

/**
 * Mot de passe oublié — saisie de l'email pour recevoir un lien de reset.
 * Réponse toujours « email envoyé » (anti-énumération côté backend).
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2, Mail, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api';
import { BrandLogo } from '@/components/brand-logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await authApi.forgotPassword({ email: email.trim() });
      // Réponse toujours ok (le backend ne révèle pas si l'email existe).
      setSent(true);
    } catch {
      // Même en cas d'erreur réseau, on affiche l'état "envoyé" pour ne pas
      // laisser deviner l'existence d'un compte.
      setSent(true);
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
          {sent ? (
            <div className="flex flex-col items-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10">
                <MailCheck className="h-7 w-7 text-emerald-600" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight">Vérifie tes emails</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Si un compte existe pour <strong className="text-foreground">{email.trim()}</strong>, un lien de réinitialisation vient d&apos;être envoyé. Il expire dans 1 heure.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Pas reçu ? Vérifie tes spams, ou réessaie dans une minute.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-input bg-card text-sm font-medium transition-colors hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Mot de passe oublié ?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Entre ton email : on t&apos;envoie un lien pour choisir un nouveau mot de passe.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-foreground/90">Email</label>
                  <div className="group relative flex h-12 items-center rounded-xl border border-input bg-card transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                    <span className="grid h-12 w-11 shrink-0 place-items-center text-muted-foreground group-focus-within:text-primary">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@exemple.com"
                      className="h-full flex-1 bg-transparent pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={loading || !email.trim()} className="h-12 w-full gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>
                      Envoyer le lien
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                <Link href="/login" className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
                  <ArrowLeft className="h-3.5 w-3.5" /> Retour à la connexion
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
