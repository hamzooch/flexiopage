'use client';

/**
 * Profil — vue de compte du vendeur :
 *   • Hero avec avatar gradient (initiales) + nom/email + "Membre depuis"
 *   • Édition du nom (email lecture seule pour l'instant)
 *   • Changement de mot de passe (POST /api/users/change-password)
 *   • Stats compte (boutiques, soldes)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';
import { useWalletStore } from '@/stores/wallet-store';
import { usersApi, storesApi } from '@/lib/api';
import {
  User as UserIcon,
  Mail,
  Calendar,
  KeyRound,
  Loader2,
  Check,
  Wallet,
  Sparkles,
  Store,
  ArrowRight,
  Eye,
  EyeOff,
  AlertTriangle,
  Globe,
  Lock,
} from 'lucide-react';
import { COUNTRIES, COUNTRY_GROUPS, currencyForCountry } from '@/data/countries';

interface UserDoc {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  emailVerified?: boolean;
  createdAt?: string;
  country?: string;
  currency?: string;
}

function fmtCur(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function ProfilePage() {
  const authUser = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const wallet = useWalletStore((s) => s.wallet);
  const refreshWallet = useWalletStore((s) => s.refresh);

  const [user, setUser] = useState<UserDoc | null>(null);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');
  const [storeCount, setStoreCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Profile save
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [savingRegion, setSavingRegion] = useState(false);
  const [regionMsg, setRegionMsg] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);

  // Password change
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwShow, setPwShow] = useState(false);

  useEffect(() => {
    Promise.all([
      usersApi.getProfile(),
      storesApi.list(),
    ])
      .then(([profileRes, storesRes]) => {
        const u = (profileRes.data as { user: UserDoc }).user;
        setUser(u);
        setName(u.name || '');
        setCountry(u.country || '');
        setCurrency(u.currency || '');
        setStoreCount(((storesRes.data as { stores: unknown[] }).stores || []).length);
      })
      .finally(() => setLoading(false));
    refreshWallet();
  }, [refreshWallet]);

  const initials = (user?.name || user?.email || 'U')
    .split(/[\s@]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '—';

  // ── Country / currency ─────────────────────────────────────────────
  function handleCountryChange(code: string) {
    setCountry(code);
    // Auto-fill the currency from the country, but the user can still edit it.
    const auto = currencyForCountry(code);
    if (auto) setCurrency(auto);
  }

  async function handleSaveRegion(e: React.FormEvent) {
    e.preventDefault();
    setSavingRegion(true);
    setRegionMsg(null);
    try {
      const res = await usersApi.updateProfile({
        country: country || '',
        currency: currency || '',
      });
      const data = res.data as { user: UserDoc; walletCurrencyUpdated?: boolean; walletCurrencyPinned?: boolean };
      setUser(data.user);
      if (data.walletCurrencyPinned) {
        setRegionMsg({
          type: 'warn',
          text: 'Pays enregistré. Le solde reste dans sa devise actuelle car il contient déjà des transactions.',
        });
      } else if (data.walletCurrencyUpdated) {
        setRegionMsg({ type: 'success', text: 'Pays et devise du solde mis à jour.' });
        refreshWallet();
      } else {
        setRegionMsg({ type: 'success', text: 'Pays enregistré.' });
        refreshWallet();
      }
      window.setTimeout(() => setRegionMsg(null), 4000);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setRegionMsg({ type: 'error', text: e.response?.data?.error || 'Erreur lors de l’enregistrement.' });
    } finally {
      setSavingRegion(false);
    }
  }

  const walletHasActivity = !!wallet && (
    (wallet.transactions?.length || 0) > 0 ||
    wallet.balance > 0 ||
    wallet.aiBalance > 0
  );

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === user?.name) return;
    setSavingName(true);
    setNameSaved(false);
    try {
      await usersApi.updateProfile({ name: name.trim() });
      if (authUser && token) setAuth({ ...authUser, name: name.trim() }, token);
      setUser((u) => (u ? { ...u, name: name.trim() } : u));
      setNameSaved(true);
      window.setTimeout(() => setNameSaved(false), 2200);
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwSuccess(false);
    if (pwNew.length < 8) {
      setPwError('Le nouveau mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('La confirmation ne correspond pas.');
      return;
    }
    setPwLoading(true);
    try {
      await usersApi.changePassword({ currentPassword: pwCurrent, newPassword: pwNew });
      setPwSuccess(true);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      window.setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setPwError(e.response?.data?.error || 'Erreur lors du changement de mot de passe.');
    } finally {
      setPwLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full gradient-brand opacity-10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />

        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl gradient-brand text-3xl font-bold text-white shadow-2xl shadow-primary/30">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
              <span className="grid h-1.5 w-1.5 place-items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Compte actif
            </div>
            <h1 className="mt-2 truncate text-3xl font-bold tracking-tight sm:text-4xl">
              {user?.name || 'Vendeur'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{user?.email}</span>
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Membre depuis {memberSince}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Store className="h-5 w-5" />}
          tone="indigo"
          label="Boutiques"
          value={String(storeCount)}
          href="/dashboard/stores"
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          tone="emerald"
          label="Solde principal"
          value={wallet ? fmtCur(wallet.balance, wallet.currency) : '—'}
          href="/dashboard/wallet"
        />
        <StatCard
          icon={<Sparkles className="h-5 w-5" />}
          tone="fuchsia"
          label="Solde IA"
          value={wallet ? fmtCur(wallet.aiBalance, wallet.currency) : '—'}
          href="/dashboard/wallet?bucket=ai"
        />
      </section>

      {/* Pays & devise du solde */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> Pays & devise
          </CardTitle>
          <CardDescription>
            Ton pays détermine la devise par défaut de ton solde principal et de ton solde IA.
            {walletHasActivity && (
              <span className="mt-1 inline-flex items-center gap-1.5 text-amber-700">
                <Lock className="h-3.5 w-3.5" />
                La devise du solde est verrouillée — des transactions existent déjà.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveRegion} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="country">Pays</Label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Choisis ton pays —</option>
                  {COUNTRY_GROUPS.map((g) => {
                    const list = COUNTRIES.filter((c) => c.group === g.id);
                    if (list.length === 0) return null;
                    return (
                      <optgroup key={g.id} label={g.label}>
                        {list.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label} ({c.currency})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choisir un pays sélectionne automatiquement sa devise locale.
                </p>
              </div>

              <div>
                <Label htmlFor="currency">Devise du solde</Label>
                <Input
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="Ex: EUR · TND · DZD · USD"
                  maxLength={3}
                  className="mt-1 font-mono uppercase"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Code ISO 3 lettres. Modifie ici si tu veux une devise différente du pays.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              {wallet ? (
                <>
                  Solde principal actuel : <strong className="text-foreground">{fmtCur(wallet.balance, wallet.currency)}</strong> · Solde IA :
                  {' '}<strong className="text-foreground">{fmtCur(wallet.aiBalance, wallet.currency)}</strong>
                  {wallet.currency !== currency && currency && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700">
                      → passera à <span className="font-mono">{currency}</span> si le solde est encore vide
                    </span>
                  )}
                </>
              ) : (
                'Aucun solde initialisé pour l’instant.'
              )}
            </div>

            {regionMsg && (
              <div
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  regionMsg.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700'
                    : regionMsg.type === 'warn'
                      ? 'border-amber-500/30 bg-amber-500/5 text-amber-800'
                      : 'border-destructive/30 bg-destructive/5 text-destructive'
                }`}
              >
                {regionMsg.type === 'success' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                {regionMsg.text}
              </div>
            )}

            <Button type="submit" disabled={savingRegion} className="gap-2">
              {savingRegion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" /> Informations
            </CardTitle>
            <CardDescription>Mise à jour de ton nom affiché. L&apos;email est en lecture seule.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveName} className="space-y-4">
              <div>
                <Label htmlFor="name">Nom complet</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ton nom"
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="mt-1 cursor-not-allowed bg-muted/40"
                />
                <p className="mt-1 text-xs text-muted-foreground">Pour changer d&apos;email, contacte le support.</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={savingName || !name.trim() || name === user?.name}>
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
                </Button>
                {nameSaved && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Enregistré
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Mot de passe
            </CardTitle>
            <CardDescription>Au moins 8 caractères. On ne le voit jamais — il est haché côté serveur.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <Label htmlFor="pw-current">Mot de passe actuel</Label>
                <div className="relative mt-1">
                  <Input
                    id="pw-current"
                    type={pwShow ? 'text' : 'password'}
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setPwShow((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center text-muted-foreground hover:text-foreground"
                    aria-label={pwShow ? 'Masquer' : 'Afficher'}
                  >
                    {pwShow ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="pw-new">Nouveau mot de passe</Label>
                <Input
                  id="pw-new"
                  type={pwShow ? 'text' : 'password'}
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <Label htmlFor="pw-confirm">Confirmer</Label>
                <Input
                  id="pw-confirm"
                  type={pwShow ? 'text' : 'password'}
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1"
                  required
                />
              </div>

              {pwError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {pwError}
                </div>
              )}
              {pwSuccess && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  Mot de passe mis à jour.
                </div>
              )}

              <Button type="submit" disabled={pwLoading} className="w-full sm:w-auto">
                {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mettre à jour le mot de passe'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  tone: 'indigo' | 'emerald' | 'fuchsia';
  label: string;
  value: string;
  href: string;
}) {
  const toneStyles = {
    indigo: 'from-indigo-500/15 to-violet-500/10 text-indigo-700 bg-indigo-500/15',
    emerald: 'from-emerald-500/15 to-teal-500/10 text-emerald-700 bg-emerald-500/15',
    fuchsia: 'from-fuchsia-500/15 to-pink-500/10 text-fuchsia-700 bg-fuchsia-500/15',
  };
  const [grad, , textColor, bgColor] = toneStyles[tone].split(/\s+/);
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
    >
      <div className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${grad} blur-3xl`} aria-hidden />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${bgColor} ${textColor} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
          {icon}
        </div>
      </div>
      <div className="relative mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
        Voir
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
