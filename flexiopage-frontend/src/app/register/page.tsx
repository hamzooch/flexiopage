'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, Truck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { BrandLogo } from '@/components/brand-logo';

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => scorePassword(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.register({ email, password, name });
      const d = data as { user: { _id: string; email: string; name: string }; token: string };
      setAuth(d.user, d.token);
      // Brand-new accounts have zero stores — /select-store nudges them to
      // /dashboard/profile?create=1 where the wizard lives.
      router.push('/select-store');
      router.refresh();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Inscription échouée';
      setError(msg || 'Inscription échouée');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
        {/* ── FORM PANEL ────────────────────────────────────────────── */}
        <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-md animate-fade-in-up">
            <Link href="/" className="inline-flex" aria-label="FlexioPage — accueil">
              <BrandLogo variant="color" width={150} priority />
            </Link>

            <div className="mt-10">
              <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Crée ton <span className="gradient-brand-text">compte</span>
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Démarre ta boutique en 60 secondes. Sans carte bancaire.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
                id="name"
                label="Nom"
                type="text"
                autoComplete="name"
                placeholder="Ton prénom + nom"
                value={name}
                onChange={setName}
                icon={<User className="h-4 w-4" />}
              />

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

              <div>
                <Field
                  id="password"
                  label="Mot de passe"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="6 caractères minimum"
                  minLength={6}
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
                      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
                {password.length > 0 && <StrengthMeter score={strength.score} label={strength.label} />}
              </div>

              <p className="text-xs text-muted-foreground">
                En continuant, tu acceptes les conditions d&apos;utilisation et la politique de
                confidentialité de FlexioPage.
              </p>

              <Button
                type="submit"
                disabled={loading}
                className="group h-12 w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-base font-semibold shadow-xl shadow-orange-500/30 transition-all hover:scale-[1.01] hover:from-amber-600 hover:to-orange-700"
              >
                {loading ? 'Création du compte…' : (
                  <>
                    Créer mon compte
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Déjà un compte ?{' '}
                <Link href="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">
                  Connecte-toi
                </Link>
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
// Password strength: 5-segment meter with a label.
// ──────────────────────────────────────────────────────────────────────
function scorePassword(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' };
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const label = ['Trop court', 'Faible', 'Correct', 'Bon', 'Fort', 'Excellent'][s] ?? '';
  return { score: s, label };
}

function StrengthMeter({ score, label }: { score: number; label: string }) {
  const tone =
    score <= 1 ? 'bg-destructive' :
    score === 2 ? 'bg-amber-400' :
    score === 3 ? 'bg-orange-500' :
    'bg-emerald-500';
  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? tone : 'bg-muted'}`}
          />
        ))}
      </div>
      <span className="w-20 text-right text-[11px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Reusable field — same as login page.
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
      <label htmlFor={id} className="text-sm font-medium text-foreground/90">
        {label}
      </label>
      <div className="group relative flex h-12 items-center rounded-xl border border-input bg-card transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        {icon && (
          <span className="grid h-12 w-11 shrink-0 place-items-center text-muted-foreground group-focus-within:text-primary">
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
          className="h-full flex-1 bg-transparent pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {trailing && <span className="pr-1.5">{trailing}</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Right-hand brand panel — same visual as the login page.
// ──────────────────────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:block">
      <div className="absolute inset-0 gradient-brand" aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_55%)]" aria-hidden />
      <div className="absolute -bottom-20 -right-20 h-[420px] w-[420px] rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="absolute -top-20 -left-10 h-[320px] w-[320px] rounded-full bg-white/15 blur-3xl" aria-hidden />

      <div className="relative flex h-full flex-col justify-between p-12 text-white xl:p-16">
        <div className="flex items-center gap-2 text-sm font-medium text-white/90">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          FlexioPage SaaS
        </div>

        <div className="space-y-8">
          <div className="grid h-24 w-24 place-items-center rounded-3xl bg-white/15 backdrop-blur-md ring-1 ring-white/30 shadow-2xl">
            <BrandLogo variant="icon" width={64} />
          </div>

          <div>
            <h2 className="text-balance text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">
              Lance ta boutique aujourd&apos;hui.
            </h2>
            <p className="mt-4 max-w-md text-balance text-base leading-relaxed text-white/85 xl:text-lg">
              Pas d&apos;abonnement, pas de carte bancaire. Tu paies une commission seulement
              sur les commandes effectivement livrées.
            </p>
          </div>

          <ul className="space-y-3 text-sm">
            <Perk icon={<Sparkles className="h-4 w-4" />} text="Landing pages générées par IA" />
            <Perk icon={<Truck className="h-4 w-4" />} text="Livraison auto MogaDelivery" />
            <Perk icon={<ShieldCheck className="h-4 w-4" />} text="Paiement à la livraison sécurisé" />
          </ul>
        </div>

        <p className="text-xs text-white/70">
          © {new Date().getFullYear()} FlexioPage — Tu paies seulement quand tu vends.
        </p>
      </div>
    </div>
  );
}

function Perk({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-white/30">
        {icon}
      </span>
      <span className="text-white/95">{text}</span>
    </li>
  );
}
