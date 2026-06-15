'use client';

/**
 * Profil — vue de compte du vendeur. C'est le hub central où le seller :
 *   • voit/édite ses infos (nom, email, mot de passe, pays & devise)
 *   • gère TOUTES ses boutiques (liste, sélection active, création)
 *
 * La création vit ici (CreateStoreWizard) parce qu'on a centralisé toutes
 * les actions liées au compte dans /profile — l'ex-page /dashboard/stores
 * redirige maintenant ici.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';
import { useWalletStore } from '@/stores/wallet-store';
import { useStoreStore } from '@/stores/store-store';
import { usersApi, storesApi } from '@/lib/api';
import { CreateStoreWizard } from '@/components/dashboard/create-store-wizard';
import {
  User as UserIcon,
  Mail,
  Calendar,
  KeyRound,
  Loader2,
  Check,
  Wallet,
  Sparkles,
  Store as StoreIcon,
  ArrowRight,
  Eye,
  EyeOff,
  AlertTriangle,
  Globe,
  Lock,
  Package,
  Cloud,
  Settings as SettingsIcon,
  ExternalLink,
  CheckCircle2,
  Copy,
  Check as CheckIcon,
} from 'lucide-react';
import { COUNTRIES, COUNTRY_GROUPS, currencyForCountry } from '@/data/countries';
import { cn, publicStoreUrl } from '@/lib/utils';

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

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
  description?: string;
  customDomain?: string;
  customDomainVerified?: boolean;
}

function fmtCur(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authUser = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const wallet = useWalletStore((s) => s.wallet);
  const refreshWallet = useWalletStore((s) => s.refresh);
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);

  const [user, setUser] = useState<UserDoc | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [avatarEditing, setAvatarEditing] = useState(false);
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');
  const [stores, setStores] = useState<StoreDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoStartCreate, setAutoStartCreate] = useState(false);
  // Tab nav — splits a once-overwhelming wall of sections into focused
  // contexts: Compte / Sécurité / Préférences / Boutiques. State only,
  // no URL hash, so a refresh keeps the user where they were doing work.
  const [tab, setTab] = useState<'account' | 'security' | 'preferences' | 'stores'>('account');

  // Profile save
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [savingRegion, setSavingRegion] = useState(false);
  const [regionMsg, setRegionMsg] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);

  // Email change — direct change guarded by the account password.
  const [emailEditing, setEmailEditing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);

  // Avatar upload (real file → Cloudinary via backend)
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  // Password change
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwShow, setPwShow] = useState(false);

  function loadStores() {
    return storesApi
      .list()
      .then((res) => {
        const list = (res.data as { stores: StoreDoc[] }).stores || [];
        setStores(list);
        return list;
      });
  }

  useEffect(() => {
    Promise.all([usersApi.getProfile(), loadStores()])
      .then(([profileRes]) => {
        const u = (profileRes.data as { user: UserDoc }).user;
        setUser(u);
        setName(u.name || '');
        setAvatar(u.avatar || '');
        setCountry(u.country || '');
        setCurrency(u.currency || '');
      })
      .finally(() => setLoading(false));
    refreshWallet();
  }, [refreshWallet]);

  // Auto-open the right tab when arriving via ?create=1 (store wizard) or
  // ?tab=security|preferences|account|stores from a nav shortcut.
  useEffect(() => {
    if (searchParams.get('create') === '1') setTab('stores');
    const t = searchParams.get('tab');
    if (t === 'account' || t === 'security' || t === 'preferences' || t === 'stores') {
      setTab(t);
    }
  }, [searchParams]);

  // Honour ?create=1 — auto-open the wizard. Used by /select-store and the
  // Header's "Switch store" empty-state CTA.
  useEffect(() => {
    if (searchParams.get('create') === '1') setAutoStartCreate(true);
  }, [searchParams]);

  function handleStoreCreated(newId: string) {
    loadStores().then(() => router.push('/dashboard'));
    setCurrentStore(newId);
    setAutoStartCreate(false);
  }

  function pickStore(storeId: string) {
    setCurrentStore(storeId);
    router.push('/dashboard');
  }

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

  function handleCountryChange(code: string) {
    setCountry(code);
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
    const trimmedName = name.trim();
    const trimmedAvatar = avatar.trim();
    const nameChanged = trimmedName && trimmedName !== user?.name;
    const avatarChanged = trimmedAvatar !== (user?.avatar || '');
    if (!nameChanged && !avatarChanged) return;
    setSavingName(true);
    setNameSaved(false);
    try {
      const payload: { name?: string; avatar?: string } = {};
      if (nameChanged) payload.name = trimmedName;
      if (avatarChanged) payload.avatar = trimmedAvatar;
      await usersApi.updateProfile(payload);
      if (authUser && token) {
        setAuth({
          ...authUser,
          ...(nameChanged ? { name: trimmedName } : {}),
          ...(avatarChanged ? { avatar: trimmedAvatar } : {}),
        }, token);
      }
      setUser((u) => (u ? { ...u, ...(nameChanged ? { name: trimmedName } : {}), ...(avatarChanged ? { avatar: trimmedAvatar } : {}) } : u));
      setAvatarEditing(false);
      setNameSaved(true);
      window.setTimeout(() => setNameSaved(false), 2200);
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarFile(file: File) {
    setAvatarError('');
    if (!file.type.startsWith('image/')) {
      setAvatarError('Le fichier doit être une image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image trop volumineuse (max 5 Mo).');
      return;
    }
    setAvatarUploading(true);
    try {
      const res = await usersApi.uploadAvatar(file);
      const url = res.data.avatar;
      setAvatar(url);
      setUser((u) => (u ? { ...u, avatar: url } : u));
      if (authUser && token) setAuth({ ...authUser, avatar: url }, token);
      setAvatarEditing(false);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setAvatarError(e.response?.data?.error || 'Upload échoué.');
    } finally {
      setAvatarUploading(false);
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

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(''); setEmailSaved(false);
    const next = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setEmailError('Adresse email invalide.');
      return;
    }
    if (next === user?.email) {
      setEmailError('C’est déjà ton adresse actuelle.');
      return;
    }
    setEmailLoading(true);
    try {
      const res = await usersApi.changeEmail({ newEmail: next, currentPassword: emailPw });
      const updated = res.data.user;
      setUser((u) => (u ? { ...u, email: updated.email, emailVerified: updated.emailVerified } : u));
      if (authUser && token) setAuth({ ...authUser, email: updated.email }, token);
      setEmailSaved(true);
      setEmailEditing(false);
      setNewEmail(''); setEmailPw('');
      window.setTimeout(() => setEmailSaved(false), 3000);
    } catch (err) {
      const ex = err as { response?: { data?: { error?: string } } };
      setEmailError(ex.response?.data?.error || 'Erreur lors du changement d’email.');
    } finally {
      setEmailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeStore = stores.find((s) => s._id === currentStoreId);

  const TABS = [
    { id: 'account' as const,     label: 'Compte',       icon: UserIcon },
    { id: 'security' as const,    label: 'Sécurité',     icon: Lock },
    { id: 'preferences' as const, label: 'Préférences',  icon: Globe },
    { id: 'stores' as const,      label: 'Mes boutiques', icon: StoreIcon },
  ];

  return (
    <div className="space-y-6">
      {/* ────────────────────────── HERO ────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-gradient-to-tr from-fuchsia-500/10 to-transparent blur-3xl" aria-hidden />

        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          {/* Avatar — image when set, gradient initials fallback. */}
          <div className="relative shrink-0">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-3xl gradient-brand text-3xl font-bold text-white shadow-xl shadow-primary/30 ring-4 ring-background">
              {user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <button
              type="button"
              onClick={() => { setTab('account'); setAvatarEditing(true); }}
              className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-foreground shadow-md transition-transform hover:scale-105"
              aria-label="Changer la photo"
              title="Changer la photo"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-bold tracking-tight sm:text-4xl">
              {user?.name || 'Vendeur'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />{user?.email}
                {user?.emailVerified && (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Vérifié
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />Membre depuis {memberSince}
              </span>
            </div>

            {/* Inline stats — replaces the old standalone stat grid so the
                hero stays the single visual anchor of the page. */}
            <div className="mt-5 flex flex-wrap gap-2">
              <HeroStat
                icon={<StoreIcon className="h-3.5 w-3.5" />}
                label="Boutiques"
                value={String(stores.length)}
                tone="indigo"
                onClick={() => setTab('stores')}
              />
              <HeroStat
                icon={<Wallet className="h-3.5 w-3.5" />}
                label="Solde"
                value={wallet ? fmtCur(wallet.balance, wallet.currency) : '—'}
                tone="emerald"
                href="/dashboard/wallet"
              />
              <HeroStat
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Solde IA"
                value={wallet ? fmtCur(wallet.aiBalance, wallet.currency) : '—'}
                tone="fuchsia"
                href="/dashboard/wallet?bucket=ai"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────── TABS ────────────────────────── */}
      <nav className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/80 p-1 backdrop-blur">
        {TABS.map((t) => {
          const TabIcon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all',
                active
                  ? 'gradient-brand text-white shadow-md shadow-primary/20'
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              )}
              aria-pressed={active}
            >
              <TabIcon className="h-4 w-4" />
              {t.label}
              {t.id === 'stores' && stores.length > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-white/25 text-white' : 'bg-muted text-foreground/70'
                )}>
                  {stores.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === 'stores' && (
      <section id="stores" className="scroll-mt-20 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Mes boutiques</h2>
            <p className="text-sm text-muted-foreground">
              Crée, sélectionne et change de boutique active depuis ton profil.
            </p>
          </div>
        </div>

        {/* Wizard (auto-opens with ?create=1). Soft-blocks at the per-account
            store-creation cap; backend enforces the same limit as a hard guard. */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          {(() => {
            const MAX_STORES = 4;
            const reached = stores.length >= MAX_STORES;
            return reached ? (
              <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900">
                    Limite atteinte — {stores.length}/{MAX_STORES} boutiques
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/80">
                    Chaque compte peut créer jusqu&apos;à {MAX_STORES} boutiques. Supprime
                    une boutique existante ou contacte le support pour augmenter ta limite.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <CreateStoreWizard
                  onCreated={handleStoreCreated}
                  triggerLabel={stores.length === 0 ? 'Créer ma première boutique' : 'Créer une boutique'}
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {stores.length}/{MAX_STORES} boutiques utilisées
                </p>
                {autoStartCreate && stores.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Astuce : tu peux lancer le wizard en cliquant sur le bouton ci-dessus.
                  </p>
                )}
              </>
            );
          })()}
        </div>

        {/* Store list — each one as its own card, with explicit "Active" badge */}
        {stores.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center">
            <StoreIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Aucune boutique pour le moment.</p>
            <p className="text-xs text-muted-foreground">
              Utilise le bouton ci-dessus pour créer ta première vitrine.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {stores.map((store) => {
              const isActive = store._id === currentStoreId;
              const isDigital = store.storeType === 'digital';
              const TypeIcon = isDigital ? Cloud : Package;
              return (
                <div
                  key={store._id}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all duration-300',
                    isActive
                      ? 'border-primary ring-2 ring-primary/20 shadow-md'
                      : 'border-border/60 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg'
                  )}
                >
                  <div
                    className={cn(
                      'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25',
                      isDigital ? 'from-fuchsia-500 to-pink-500' : 'from-indigo-500 to-violet-500'
                    )}
                    aria-hidden
                  />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md',
                          isDigital
                            ? 'from-fuchsia-500 to-pink-600 shadow-fuchsia-500/30'
                            : 'from-indigo-500 to-violet-600 shadow-indigo-500/30'
                        )}
                      >
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold tracking-tight">{store.name}</h3>
                        <p className="truncate text-xs text-muted-foreground">/{store.slug}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          store.isPublished
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-amber-500/10 text-amber-700'
                        )}
                      >
                        {store.isPublished ? 'Live' : 'Brouillon'}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Store ID — copy-to-clipboard for external integrations
                      like MogaDelivery, where the partner needs to map their
                      account to this exact ObjectId. */}
                  <div className="relative mt-4">
                    <StoreIdBadge storeId={store._id} />
                  </div>

                  <div className="relative mt-3 flex flex-wrap gap-2">
                    {!isActive && (
                      <Button
                        size="sm"
                        onClick={() => pickStore(store._id)}
                        className="h-9 gap-1.5 rounded-lg gradient-brand text-white"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Utiliser
                      </Button>
                    )}
                    <Link href={`/dashboard/stores/${store._id}`}>
                      <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
                        <SettingsIcon className="h-3.5 w-3.5" />
                        Réglages
                      </Button>
                    </Link>
                    <Link href={publicStoreUrl(store)} target="_blank" rel="noopener">
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-9 gap-1.5 rounded-lg',
                          !store.isPublished && 'border-amber-500/40 text-amber-700 hover:bg-amber-500/10'
                        )}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Voir
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeStore && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-foreground/80">
            Boutique active : <strong>{activeStore.name}</strong> · le tableau de bord est scopé à cette boutique.
          </div>
        )}
      </section>
      )}

      {/* Pays & devise du solde */}
      {tab === 'preferences' && (
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
      )}

      {tab === 'account' && (
      <div className="grid gap-6 lg:grid-cols-1">
        {/* Profile info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" /> Informations
            </CardTitle>
            <CardDescription>Mise à jour de ton nom affiché et de ton adresse email.</CardDescription>
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

              {/* Avatar — direct upload (→ Cloudinary via backend) plus a
                  manual URL fallback for sellers who already host their image. */}
              <div>
                <Label>Photo de profil</Label>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAvatarFile(f);
                    e.target.value = '';
                  }}
                />
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="gap-1.5"
                  >
                    {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SettingsIcon className="h-3.5 w-3.5" />}
                    {avatarUploading ? 'Envoi…' : 'Téléverser une image'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setAvatarEditing((v) => !v)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {avatarEditing ? 'Masquer URL' : 'ou coller une URL'}
                  </button>
                </div>
                {avatarEditing && (
                  <Input
                    id="avatar"
                    type="url"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="https://… (lien d'une image)"
                    className="mt-2"
                  />
                )}
                {avatarError && (
                  <p className="mt-1 text-[11px] text-destructive">{avatarError}</p>
                )}
                {!avatar && !avatarError && !avatarEditing && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Pas de photo — les initiales seront affichées.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={savingName || !name.trim() || (name === user?.name && avatar === (user?.avatar || ''))}
                >
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
                </Button>
                {nameSaved && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Enregistré
                  </span>
                )}
              </div>
            </form>

            {/* Email — read-only by default; the seller confirms with their
                password to change it (direct change, no verification mail). */}
            <div className="mt-4 border-t border-border/60 pt-4">
              <Label htmlFor="email">Email</Label>
              {!emailEditing ? (
                <>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      id="email"
                      value={user?.email || ''}
                      disabled
                      className="min-w-0 flex-1 cursor-not-allowed bg-muted/40"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => {
                        setEmailEditing(true);
                        setNewEmail(user?.email || '');
                        setEmailError('');
                      }}
                    >
                      Modifier
                    </Button>
                  </div>
                  {emailSaved && (
                    <span className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-600">
                      <Check className="h-3.5 w-3.5" /> Email mis à jour
                    </span>
                  )}
                </>
              ) : (
                <form onSubmit={handleChangeEmail} className="mt-1 space-y-3">
                  <Input
                    id="email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nouvelle@adresse.com"
                    autoComplete="email"
                    required
                  />
                  <div>
                    <Label htmlFor="email-pw" className="text-xs text-muted-foreground">
                      Confirme avec ton mot de passe actuel
                    </Label>
                    <Input
                      id="email-pw"
                      type="password"
                      value={emailPw}
                      onChange={(e) => setEmailPw(e.target.value)}
                      autoComplete="current-password"
                      className="mt-1"
                      required
                    />
                  </div>
                  {emailError && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {emailError}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={emailLoading}>
                      {emailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Changer l’email'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEmailEditing(false);
                        setNewEmail(''); setEmailPw(''); setEmailError('');
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {tab === 'security' && (
      <div className="grid gap-6 lg:grid-cols-1">
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
      )}
    </div>
  );
}

/** Compact stat pill rendered inline in the hero — counts/balance chips
 * that double as navigation shortcuts. Action can be a tab switch
 * (onClick) or an external link (href). */
function HeroStat({
  icon, label, value, tone, href, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'indigo' | 'emerald' | 'fuchsia';
  href?: string;
  onClick?: () => void;
}) {
  const tones = {
    indigo:  'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/15',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15',
    fuchsia: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 hover:bg-fuchsia-500/15',
  };
  const body = (
    <span className="inline-flex items-center gap-2">
      {icon}
      <span className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </span>
  );
  const classes = cn(
    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors',
    tones[tone]
  );
  if (href) return <Link href={href} className={classes}>{body}</Link>;
  return (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  );
}

/** Read-only Store ID pill with a copy-to-clipboard button. Used when the
 * seller needs to paste this id into a third-party integration (e.g.
 * MogaDelivery's admin to bind their account to this exact FlexioPage store). */
function StoreIdBadge({ storeId }: { storeId: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(storeId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (e.g. insecure context) — fall back to a
      // synchronous selection so the user can still copy manually.
      const el = document.createElement('textarea');
      el.value = storeId;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); setCopied(true); } catch {}
      document.body.removeChild(el);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copier l'identifiant boutique"
      className="group/copy flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/60"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Store ID
      </span>
      <code className="flex-1 truncate font-mono text-[11px] text-foreground/90">
        {storeId}
      </code>
      {copied ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
          <CheckIcon className="h-3 w-3" /> Copié
        </span>
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover/copy:text-foreground" />
      )}
    </button>
  );
}
