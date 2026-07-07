'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authApi, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { isStaff } from '@/lib/is-staff';
import { BrandLogo } from '@/components/brand-logo';
import { GoogleOAuthWrapper, isGoogleAuthAvailable } from '@/components/auth/google-oauth-wrapper';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';

// Only honor relative paths from ?next=… — never an absolute URL, which
// would let an attacker craft https://login?next=//evil.com to redirect
// the user off-site after login.
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

// Next.js 14 bails out of static generation for any page that calls
// useSearchParams() unless the call is inside a Suspense boundary. Wrapping
// the form in Suspense keeps /login statically prerenderable while letting
// the inner component read ?next= on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginFallback() {
  return <div className="min-h-screen bg-sidebar" />;
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const next = safeNext(searchParams.get('next'));

  // If the user lands on /login while already authenticated (e.g. they
  // refreshed /login after logging in elsewhere), bounce them straight to
  // their destination instead of showing the form.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const apply = () => {
      const { token, user } = useAuthStore.getState();
      if (token) router.replace(next || (isStaff(user) ? '/select-space' : '/select-store'));
    };
    if (useAuthStore.persist?.hasHydrated?.()) {
      apply();
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration?.(apply);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [next, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login({ email, password });
      const d = data as { user: { _id: string; email: string; name: string }; token: string };
      setAuth(d.user, d.token);
      // `replace` (au lieu de `push`) — sans ça, la page de login reste dans
      // l'historique et un tap sur la flèche retour du navigateur renvoie le
      // vendeur sur le formulaire de connexion juste après s'être authentifié.
      router.replace(next || (isStaff(d.user) ? '/select-space' : '/select-store'));
      router.refresh();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Connexion échouée'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
        {/* ── FORM PANEL ────────────────────────────────────────────── */}
        {/* `justify-start` au lieu de `justify-center` : avant, le formulaire
            était vertical-centered sur min-h-screen, ce qui laissait un gros
            vide en haut sur grand écran. On l'ancre maintenant en haut avec
            un padding confortable, lecture immédiate du logo + form. */}
        <div className="flex flex-col px-6 pb-10 pt-8 sm:px-10 sm:pt-10 lg:px-16 lg:pt-14">
          <div className="mx-auto w-full max-w-md animate-fade-in-up">
            <Link href="/" className="flex justify-center" aria-label="FlexioPage — accueil">
              {/* Blanc : le mot « page » du logo est noir → invisible sur le fond Midnight. */}
              <BrandLogo variant="color" width={150} priority className="brightness-0 invert" />
            </Link>

            <div className="mt-6 sm:mt-8">
              <h1 className="text-balance text-3xl font-bold tracking-tight text-sidebar-strong sm:text-4xl">
                Bon retour <span className="gradient-brand-text">👋</span>
              </h1>
              <p className="mt-2 text-sm text-sidebar-foreground sm:text-base">
                Connecte-toi pour gérer ta boutique et tes commandes.
              </p>
            </div>

            {/* Google sign-in — wraps both options so the seller has one obvious
                way in. The native button stays on top because it's frictionless. */}
            <GoogleOAuthWrapper>
              <div className="mt-8">
                <GoogleSignInButton
                  text="signin_with"
                  onSuccess={() => {
                    const u = useAuthStore.getState().user;
                    router.replace(next || (isStaff(u) ? '/select-space' : '/select-store'));
                    router.refresh();
                  }}
                />
              </div>
              <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground">
                <span className="h-px flex-1 bg-sidebar-border" />
                ou avec ton email
                <span className="h-px flex-1 bg-sidebar-border" />
              </div>
            </GoogleOAuthWrapper>

            <form onSubmit={handleSubmit} className={`space-y-5 ${isGoogleAuthAvailable() ? '' : 'mt-8'}`}>
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Field
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="tu@exemple.com"
                value={email}
                onChange={setEmail}
                icon={<Mail className="h-4 w-4" />}
              />

              <Field
                id="password"
                label="Mot de passe"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={setPassword}
                icon={<Lock className="h-4 w-4" />}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Cacher' : 'Afficher'}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                    className="grid h-8 w-8 place-items-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-muted hover:text-sidebar-strong"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <div className="-mt-2 text-right">
                <Link href="/forgot-password" className="text-sm font-medium text-sidebar-foreground underline-offset-4 hover:text-sidebar-strong hover:underline">
                  Mot de passe oublié ?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="group h-12 w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-base font-semibold shadow-xl shadow-orange-500/30 transition-all hover:scale-[1.01] hover:from-amber-600 hover:to-orange-700"
              >
                {loading ? 'Connexion…' : (
                  <>
                    Se connecter
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-sidebar-foreground">
                Pas encore de compte ?{' '}
                <Link href="/register" className="font-semibold text-sidebar-strong underline-offset-4 hover:underline">
                  Crée-en un
                </Link>
              </p>

              <p className="text-center text-xs text-sidebar-foreground">
                En continuant, tu acceptes nos{' '}
                <Link href="/terms-of-service" className="underline underline-offset-4 hover:text-sidebar-strong">
                  conditions d’utilisation
                </Link>{' '}
                et notre{' '}
                <Link href="/privacy-policy" className="underline underline-offset-4 hover:text-sidebar-strong">
                  politique de confidentialité
                </Link>
                .
              </p>
            </form>
          </div>
        </div>

        {/* ── BRAND PANEL ───────────────────────────────────────────── */}
        <BrandPanel />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Reusable field with leading icon and optional trailing slot.
// ──────────────────────────────────────────────────────────────────────
function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  icon,
  trailing,
  minLength,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-sidebar-strong/90">
        {label}
      </label>
      <div className="group relative flex h-12 items-center rounded-xl border border-sidebar-border bg-sidebar-muted/50 transition-all focus-within:border-primary/60 focus-within:bg-sidebar-muted focus-within:ring-4 focus-within:ring-primary/15">
        {icon && (
          <span className="grid h-12 w-11 shrink-0 place-items-center text-sidebar-foreground group-focus-within:text-primary">
            {icon}
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          className="h-full flex-1 bg-transparent pr-3 text-sm text-sidebar-strong outline-none placeholder:text-sidebar-foreground/50"
        />
        {trailing && <span className="pr-1.5">{trailing}</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Right-hand brand panel: gradient, F. icon, tagline, value-prop list.
// Hidden on mobile; only shown ≥ lg.
// ──────────────────────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-sidebar lg:block">
      {/* Fond « Midnight » : halo orange + grille fine + orbes flottants */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_18%,hsl(var(--primary)/0.22),transparent_55%)]" aria-hidden />
      <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,1)_1px,transparent_1px)] [background-size:38px_38px]" aria-hidden />
      <div className="absolute -bottom-24 -right-24 h-[420px] w-[420px] rounded-full bg-primary/20 blur-3xl animate-float" aria-hidden />
      <div className="absolute -top-24 -left-16 h-[340px] w-[340px] rounded-full bg-amber-500/15 blur-3xl animate-float-slow" aria-hidden />

      <div className="relative flex h-full flex-col justify-between p-12 text-white xl:p-16">
        <div className="flex items-center gap-2 text-sm font-medium text-sidebar-foreground">
          <span className="h-1.5 w-1.5 rounded-full gradient-brand animate-chrome-glow" />
          FlexioPage SaaS
        </div>

        <div className="space-y-8">
          {/* F. mark sur une tuile verre sombre */}
          <div className="grid h-24 w-24 place-items-center rounded-3xl bg-sidebar-muted/70 backdrop-blur-md ring-1 ring-white/10 shadow-2xl">
            <BrandLogo variant="icon" width={64} />
          </div>

          <div>
            <h2 className="text-balance text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">
              Crée ta boutique <span className="gradient-brand-text">en un clic.</span>
            </h2>
            <p className="mt-4 max-w-md text-balance text-base leading-relaxed text-sidebar-foreground xl:text-lg">
              Génère tes landing pages avec l&apos;IA, accepte le paiement à la livraison et
              dispatche tes commandes automatiquement.
            </p>
          </div>

          <ul className="space-y-3 text-sm">
            <Perk d={0} icon={<Sparkles className="h-4 w-4" />} text="Landing pages générées par IA" />
            <Perk d={100} icon={<Truck className="h-4 w-4" />} text="Livraison auto MogaDelivery" />
            <Perk d={200} icon={<ShieldCheck className="h-4 w-4" />} text="Paiement à la livraison sécurisé" />
          </ul>
        </div>

        <p className="text-xs text-sidebar-foreground/70">
          © {new Date().getFullYear()} FlexioPage — Tu paies seulement quand tu vends.
        </p>
      </div>
    </div>
  );
}

function Perk({ icon, text, d }: { icon: React.ReactNode; text: string; d: number }) {
  return (
    <li className="flex items-center gap-3 animate-chrome-item" style={{ animationDelay: `${d}ms` }}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-orange-300 ring-1 ring-primary/25">
        {icon}
      </span>
      <span className="text-sidebar-strong">{text}</span>
    </li>
  );
}
