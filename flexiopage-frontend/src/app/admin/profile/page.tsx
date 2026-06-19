'use client';

/**
 * Profil staff — édition nom + changement de mot de passe + infos compte.
 * Réutilise usersApi.updateProfile + usersApi.changePassword.
 */

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';
import { usersApi } from '@/lib/api';
import {
  Mail, Calendar, KeyRound, Loader2, Check, AlertTriangle, Eye, EyeOff,
  Crown, ShieldAlert, ShieldCheck, Eye as EyeIcon, Clock,
  User as UserIcon, Lock, Settings as SettingsIcon,
} from 'lucide-react';
import { cn, mediaUrl } from '@/lib/utils';

interface UserDoc {
  _id: string;
  email: string;
  name: string;
  role?: string;
  avatar?: string;
  emailVerified?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

const ROLE_META: Record<string, { label: string; tone: string; Icon: typeof Crown }> = {
  owner:      { label: 'Owner',       tone: 'from-violet-600 to-fuchsia-600', Icon: Crown },
  superadmin: { label: 'Super admin', tone: 'from-rose-600 to-orange-600',    Icon: ShieldAlert },
  admin:      { label: 'Admin',       tone: 'from-rose-600 to-orange-600',    Icon: ShieldCheck },
  supervisor: { label: 'Superviseur', tone: 'from-indigo-600 to-blue-600',    Icon: EyeIcon },
};

export default function AdminProfilePage() {
  const authUser = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);

  const [user, setUser] = useState<UserDoc | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [avatarEditing, setAvatarEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'account' | 'security'>('account');

  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwShow, setPwShow] = useState(false);

  useEffect(() => {
    usersApi.getProfile()
      .then((res) => {
        const u = (res.data as { user: UserDoc }).user;
        setUser(u);
        setName(u.name || '');
        setAvatar(u.avatar || '');
      })
      .finally(() => setLoading(false));
  }, []);

  const role = user?.role || authUser?.role || 'admin';
  const meta = ROLE_META[role] || ROLE_META.admin;
  const RoleIcon = meta.Icon;

  const initials = (user?.name || user?.email || 'A')
    .split(/[\s@]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '—';

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

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const TABS = [
    { id: 'account' as const,  label: 'Compte',   icon: UserIcon },
    { id: 'security' as const, label: 'Sécurité', icon: Lock },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/20 via-amber-500/10 to-transparent blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <div className={`grid h-24 w-24 place-items-center overflow-hidden rounded-3xl bg-gradient-to-br ${meta.tone} text-3xl font-bold text-white shadow-2xl ring-4 ring-background`}>
              {user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(user.avatar)} alt="" className="h-full w-full object-cover" />
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
            <div className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${meta.tone} px-3 py-1 text-[11px] font-bold text-white shadow`}>
              <RoleIcon className="h-3 w-3" /> {meta.label}
            </div>
            <h1 className="mt-2 truncate text-3xl font-bold tracking-tight sm:text-4xl">
              {user?.name || 'Staff'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{user?.email}</span>
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Membre depuis {memberSince}</span>
              {user?.lastLoginAt && (
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Dernière connexion {new Date(user.lastLoginAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tab nav */}
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
                  ? `bg-gradient-to-r ${meta.tone} text-white shadow-md`
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              )}
              aria-pressed={active}
            >
              <TabIcon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === 'account' && (
      <div className="grid gap-6 lg:grid-cols-1">
        {/* Informations du compte */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du compte</CardTitle>
            <CardDescription>Modifie ton nom affiché.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveName} className="space-y-4">
              <div>
                <Label htmlFor="name">Nom complet</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
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
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email || ''} disabled />
                <p className="mt-1 text-[11px] text-muted-foreground">L&apos;email ne peut pas être modifié.</p>
              </div>
              <div className="flex items-center justify-end gap-3">
                {nameSaved && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Check className="h-3.5 w-3.5" /> Enregistré
                  </span>
                )}
                <Button
                  type="submit"
                  disabled={savingName || !name.trim() || (name.trim() === user?.name && avatar === (user?.avatar || ''))}
                >
                  {savingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      )}

      {tab === 'security' && (
      <div className="grid gap-6 lg:grid-cols-1">
        {/* Sécurité */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Sécurité</CardTitle>
            <CardDescription>Change ton mot de passe (8 caractères min.).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="relative">
                <Label htmlFor="pw-current">Mot de passe actuel</Label>
                <Input id="pw-current" type={pwShow ? 'text' : 'password'} value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required autoComplete="current-password" />
              </div>
              <div>
                <Label htmlFor="pw-new">Nouveau mot de passe</Label>
                <Input id="pw-new" type={pwShow ? 'text' : 'password'} value={pwNew} onChange={(e) => setPwNew(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              <div>
                <Label htmlFor="pw-confirm">Confirmation</Label>
                <Input id="pw-confirm" type={pwShow ? 'text' : 'password'} value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              <button
                type="button"
                onClick={() => setPwShow((s) => !s)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {pwShow ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {pwShow ? 'Masquer' : 'Afficher'} les mots de passe
              </button>

              {pwError && (
                <div className="flex items-start gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {pwError}
                </div>
              )}
              {pwSuccess && (
                <div className="flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Mot de passe mis à jour.
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={pwLoading}>
                  {pwLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Changer le mot de passe
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
