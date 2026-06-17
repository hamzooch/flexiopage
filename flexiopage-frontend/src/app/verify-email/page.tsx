'use client';

/**
 * Verify-email landing page — atterrissage du clic sur le lien Resend.
 *
 * Lit `?token=…` dans l'URL, appelle POST /auth/verify-email, affiche
 * un état clair (loading / succès / déjà vérifié / expiré / invalide)
 * puis propose une action de suite (aller au dashboard, se reconnecter,
 * renvoyer un mail).
 *
 * Wrappé dans <Suspense> parce que useSearchParams() casse la génération
 * statique sinon — même contrainte que /login.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, MailX, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authApi, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { BrandLogo } from '@/components/brand-logo';

type Status = 'loading' | 'success' | 'already' | 'invalid' | 'expired';

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  // Garde-fou React strict mode — le double mount en dev rejouait le call,
  // ce qui faisait passer un token valide en "déjà utilisé" au 2e tour.
  const calledRef = useRef(false);
  const updateUser = useAuthStore((s) => s.updateUser);

  useEffect(() => {
    if (calledRef.current) return;
    if (!token) {
      setStatus('invalid');
      setError('Lien incomplet — aucun token fourni.');
      return;
    }
    calledRef.current = true;
    authApi
      .verifyEmail({ token })
      .then((res) => {
        const data = res.data as { ok: true; alreadyVerified: boolean };
        setStatus(data.alreadyVerified ? 'already' : 'success');
        // Si le seller est connecté, on met à jour son store local pour
        // que la bannière "non vérifié" disparaisse instantanément quand
        // il rouvre le dashboard dans un autre onglet.
        updateUser({ emailVerified: true });
      })
      .catch((err: unknown) => {
        const e = err as { response?: { data?: { code?: string } } };
        const code = e.response?.data?.code;
        if (code === 'token_expired') setStatus('expired');
        else setStatus('invalid');
        setError(extractApiError(err, 'Vérification impossible.'));
      });
  }, [token, updateUser]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <Link href="/" className="inline-flex" aria-label="FlexioPage — accueil">
          <BrandLogo variant="color" width={150} priority />
        </Link>

        <div className="mt-12 rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
          {status === 'loading' && (
            <div className="flex flex-col items-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight">Vérification en cours…</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                On confirme ton adresse, ça prend une seconde.
              </p>
            </div>
          )}

          {(status === 'success' || status === 'already') && (
            <div className="flex flex-col items-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight">
                {status === 'already' ? 'Email déjà vérifié' : 'Email confirmé !'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {status === 'already'
                  ? 'Ton compte est déjà actif — tu peux te connecter ou continuer ta navigation.'
                  : 'Ton compte est maintenant activé. Bienvenue chez FlexioPage 🎉'}
              </p>
              <Button
                className="mt-6 w-full gap-2"
                onClick={() => router.replace('/select-store')}
              >
                Continuer
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
                Ce lien de vérification a plus de 24 heures. Reconnecte-toi et utilise le bouton « Renvoyer l&apos;email » dans le dashboard.
              </p>
              <Button
                className="mt-6 w-full gap-2"
                onClick={() => router.replace('/login')}
              >
                Aller à la connexion
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {status === 'invalid' && (
            <div className="flex flex-col items-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10">
                <MailX className="h-7 w-7 text-rose-600" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight">Lien invalide</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {error || 'Ce lien n\'est pas reconnu — il a peut-être déjà été utilisé ou tronqué dans le mail.'}
              </p>
              <Button
                variant="outline"
                className="mt-6 w-full gap-2"
                onClick={() => router.replace('/login')}
              >
                Retour à la connexion
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Besoin d&apos;aide ? <Link href="/contact" className="font-medium text-primary hover:underline">Écris-nous</Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
