'use client';

/**
 * Admin user detail — full management of a single seller account.
 *
 * Sections:
 *   • Profil           — name, role, email-verified toggle
 *   • Sécurité         — reset password, suspend/unsuspend
 *   • Activité         — stats (stores, orders, wallet) + last login
 *   • Boutiques        — list with quick links to storefronts
 *   • Zone dangereuse  — delete account (cascades stores/orders/wallet)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { adminApi, type AdminUserDetail } from '@/lib/api';
import { storeAbsoluteUrl } from '@/lib/utils';
import {
  ArrowLeft,
  KeyRound,
  Ban,
  ShieldCheck,
  Trash2,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Mail,
  Calendar,
  MapPin,
  ExternalLink,
  Crown,
  BadgeCheck,
  MailCheck,
  Wallet,
  Sparkles,
  Store as StoreIcon,
  ShoppingCart,
  Package as PackageIcon,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Solde IA = compteur de tokens (depuis juin 2026). */
function fmtTokens(amount: number): string {
  const n = Math.round(amount);
  return `${n.toLocaleString()} token${Math.abs(n) === 1 ? '' : 's'}`;
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const me = useAuthStore((s) => s.user);
  const isSelf = me?._id === userId;
  const confirm = useConfirm();

  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Reset password state
  const [resetting, setResetting] = useState(false);
  const [tempPwd, setTempPwd] = useState('');
  const [tempCopied, setTempCopied] = useState(false);
  const [resetError, setResetError] = useState('');

  // Suspend state
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.userDetail(userId);
      setData(res.data);
      setName(res.data.user.name || '');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  async function saveProfile() {
    if (!data) return;
    setSavingProfile(true);
    setProfileMsg('');
    try {
      await adminApi.patchUser(userId, { name: name.trim() });
      setProfileMsg('Enregistré.');
      await load();
      window.setTimeout(() => setProfileMsg(''), 1800);
    } finally {
      setSavingProfile(false);
    }
  }

  async function toggleRole() {
    if (!data) return;
    const next = data.user.role === 'admin' ? 'user' : 'admin';
    const ok = await confirm({
      title: `Passer en ${next === 'admin' ? 'admin' : 'utilisateur'} ?`,
      description: `${data.user.email} aura ${next === 'admin' ? 'tous les droits admin' : 'les droits utilisateur standard'}.`,
      confirmLabel: 'Changer le rôle',
      tone: next === 'admin' ? 'warning' : 'default',
    });
    if (!ok) return;
    await adminApi.patchUser(userId, { role: next });
    await load();
  }

  async function toggleEmailVerified() {
    if (!data) return;
    const verifying = !data.user.emailVerified;
    const ok = await confirm({
      title: verifying
        ? 'Marquer l\'email comme vérifié ?'
        : 'Annuler la vérification de l\'email ?',
      description: verifying
        ? `Bypass manuel utile si Resend a raté ou si le seller t'a contacté en support. ${data.user.email} sera traité comme ayant confirmé son adresse.`
        : `${data.user.email} repassera en "non vérifié" et reverra la bannière de confirmation. Utiliser uniquement en cas d'erreur de saisie.`,
      confirmLabel: verifying ? 'Marquer comme vérifié' : 'Repasser en non vérifié',
      tone: verifying ? 'success' : 'warning',
    });
    if (!ok) return;
    await adminApi.patchUser(userId, { emailVerified: verifying });
    await load();
  }

  async function handleAdminResendVerification() {
    if (!data) return;
    const ok = await confirm({
      title: 'Renvoyer le mail de vérification ?',
      description: `Un nouveau lien de confirmation sera envoyé à ${data.user.email} (valide 24 h). Throttle 1/min côté backend.`,
      confirmLabel: 'Envoyer',
    });
    if (!ok) return;
    try {
      await adminApi.adminResendVerification(userId);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setResetError(e.response?.data?.error || 'Renvoi échoué.');
    }
  }

  async function handleResetPassword() {
    const ok = await confirm({
      title: 'Réinitialiser le mot de passe ?',
      description: 'Un nouveau mot de passe temporaire sera généré. L\'utilisateur devra le changer à la prochaine connexion.',
      confirmLabel: 'Générer',
      tone: 'warning',
    });
    if (!ok) return;
    setResetting(true);
    setResetError('');
    setTempPwd('');
    try {
      const res = await adminApi.resetUserPassword(userId);
      setTempPwd(res.data.temporaryPassword);
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setResetError(e.response?.data?.error || 'Erreur');
    } finally {
      setResetting(false);
    }
  }

  async function copyPassword() {
    if (!tempPwd) return;
    try {
      await navigator.clipboard.writeText(tempPwd);
      setTempCopied(true);
      window.setTimeout(() => setTempCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function handleSuspend() {
    if (!data) return;
    if (!data.user.suspended) {
      if (!suspendReason.trim()) {
        const ok = await confirm({
          title: 'Suspendre sans raison ?',
          description: 'Mieux vaut documenter la raison pour le suivi. Continuer quand même ?',
          confirmLabel: 'Suspendre',
          tone: 'destructive',
        });
        if (!ok) return;
      }
      setSuspending(true);
      try {
        await adminApi.patchUser(userId, { suspended: true, suspendedReason: suspendReason.trim() || undefined });
        setSuspendReason('');
        await load();
      } finally {
        setSuspending(false);
      }
    } else {
      const ok = await confirm({
        title: 'Réactiver le compte ?',
        description: `${data.user.email} pourra à nouveau se connecter et utiliser la plateforme.`,
        confirmLabel: 'Réactiver',
        tone: 'success',
      });
      if (!ok) return;
      setSuspending(true);
      try {
        await adminApi.patchUser(userId, { suspended: false });
        await load();
      } finally {
        setSuspending(false);
      }
    }
  }

  async function handleDelete() {
    if (!data) return;
    if (deleteConfirm !== data.user.email) {
      setDeleteError('Saisis l\'email exact pour confirmer.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await adminApi.deleteUser(userId);
      router.replace('/admin/users');
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setDeleteError(e.response?.data?.error || 'Suppression échouée');
      setDeleting(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const u = data.user;
  const isAdmin = u.role === 'admin';
  const initials = (u.name || u.email).split(/[\s@]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour à la liste
        </Link>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/20 via-amber-500/10 to-transparent blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className={`grid h-24 w-24 shrink-0 place-items-center rounded-3xl text-3xl font-bold text-white shadow-2xl ${
            u.suspended ? 'bg-rose-500/40' :
            isAdmin ? 'bg-gradient-to-br from-rose-600 via-orange-600 to-amber-500 shadow-rose-500/30' : 'gradient-brand shadow-primary/30'
          }`}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && <Pill icon={<Crown className="h-2.5 w-2.5" />} tone="rose">Admin</Pill>}
              {u.emailVerified ? <Pill icon={<BadgeCheck className="h-2.5 w-2.5" />} tone="emerald">Email vérifié</Pill> : <Pill tone="amber">Email non vérifié</Pill>}
              {u.suspended && <Pill icon={<Ban className="h-2.5 w-2.5" />} tone="rose">Suspendu</Pill>}
              {isSelf && <Pill tone="indigo">Toi</Pill>}
            </div>
            <h1 className="mt-2 truncate text-3xl font-bold tracking-tight sm:text-4xl">{u.name || '—'}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{u.email}</span>
              {u.createdAt && <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Inscrit {new Date(u.createdAt).toLocaleDateString()}</span>}
              {u.lastLoginAt && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Dernière connexion {new Date(u.lastLoginAt).toLocaleString()}</span>}
              {u.lastLoginIp && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />IP {u.lastLoginIp}</span>}
            </div>
            {u.suspended && u.suspendedReason && (
              <p className="mt-3 inline-flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs text-rose-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><strong>Raison :</strong> {u.suspendedReason}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Boutiques" icon={<StoreIcon className="h-4 w-4" />} value={data.stats.stores} tone="indigo" />
        <Stat label="Produits" icon={<PackageIcon className="h-4 w-4" />} value={data.stats.products} tone="amber" />
        <Stat label="Commandes" icon={<ShoppingCart className="h-4 w-4" />} value={data.stats.orders} tone="emerald" sub={`${data.stats.paidOrders} payées · ${data.stats.deliveredOrders} livrées`} />
        <Stat
          label="Wallet"
          icon={<Wallet className="h-4 w-4" />}
          value={data.wallet ? fmt(data.wallet.balance, data.wallet.currency) : '—'}
          tone="rose"
          sub={data.wallet ? `IA : ${fmtTokens(data.wallet.aiBalance)}` : 'Pas encore créé'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profil */}
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
            <CardDescription>Mise à jour du nom, du rôle et de la vérification email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-xs">Nom complet</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveProfile} disabled={savingProfile || name === u.name} size="sm">
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
              </Button>
              {profileMsg && <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><Check className="h-3.5 w-3.5" /> {profileMsg}</span>}
            </div>
            <div className="space-y-2 border-t border-border/60 pt-4">
              <ToggleRow
                label={`Rôle : ${isAdmin ? 'Administrateur' : 'Vendeur'}`}
                sublabel={isAdmin ? 'Accès au /admin' : 'Pas d\'accès admin'}
                checked={isAdmin}
                onChange={toggleRole}
                disabled={isSelf}
                disabledReason={isSelf ? 'Tu ne peux pas modifier ton propre rôle.' : undefined}
              />
              <ToggleRow
                label={`Email vérifié : ${u.emailVerified ? 'Oui' : 'Non'}`}
                sublabel={u.emailVerified ? 'L\'utilisateur a confirmé son email' : 'Non confirmé — utiliser pour valider manuellement'}
                checked={!!u.emailVerified}
                onChange={toggleEmailVerified}
              />
              {!u.emailVerified && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="text-xs font-semibold text-amber-900">Email non vérifié — actions support</div>
                  <p className="mt-0.5 text-[11px] text-amber-900/80">
                    Si le seller dit ne pas avoir reçu le mail (Resend a raté, spam vidé…), tu peux soit lui renvoyer un nouveau lien, soit le marquer manuellement comme vérifié avec le toggle ci-dessus.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAdminResendVerification}
                    className="mt-2 h-8 gap-1.5 border-amber-500/50 text-amber-900 hover:bg-amber-500/10"
                  >
                    <MailCheck className="h-3.5 w-3.5" />
                    Renvoyer le mail de vérification
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sécurité */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Sécurité</CardTitle>
            <CardDescription>Réinitialiser le mot de passe et gérer la suspension.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Reset password */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="text-sm font-semibold">Réinitialiser le mot de passe</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Génère un mot de passe temporaire que tu transmets à l&apos;utilisateur.
                Il ne sera affiché qu&apos;une seule fois.
              </p>
              {u.passwordResetAt && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Dernier reset : {new Date(u.passwordResetAt).toLocaleString()}
                </p>
              )}
              {tempPwd ? (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="text-xs font-semibold text-emerald-700">Nouveau mot de passe — copie-le maintenant</div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-sm">{tempPwd}</code>
                    <Button type="button" size="sm" variant="outline" onClick={copyPassword} className="gap-1.5">
                      {tempCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {tempCopied ? 'Copié' : 'Copier'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={handleResetPassword} disabled={resetting} size="sm" variant="outline" className="mt-3 gap-1.5">
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  Générer un nouveau mot de passe
                </Button>
              )}
              {resetError && <p className="mt-2 text-xs text-destructive">{resetError}</p>}
            </div>

            {/* Suspend */}
            <div className={`rounded-xl border p-4 ${u.suspended ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60 bg-muted/20'}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{u.suspended ? 'Compte suspendu' : 'Suspendre le compte'}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {u.suspended ? 'L\'utilisateur ne peut plus se connecter.' : 'Bloque la connexion. Réversible à tout moment.'}
                  </p>
                </div>
                <Button
                  onClick={handleSuspend}
                  disabled={suspending || isSelf}
                  size="sm"
                  variant={u.suspended ? 'default' : 'outline'}
                  className="gap-1.5"
                >
                  {suspending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                    u.suspended ? <ShieldCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                  {u.suspended ? 'Réactiver' : 'Suspendre'}
                </Button>
              </div>
              {!u.suspended && (
                <Input
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Raison (optionnel) — ex: fraude, demandée par le vendeur, …"
                  className="mt-3 text-sm"
                />
              )}
              {isSelf && <p className="mt-2 text-[11px] text-muted-foreground">Tu ne peux pas te suspendre toi-même.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Boutiques */}
      <Card>
        <CardHeader>
          <CardTitle>Boutiques de l&apos;utilisateur</CardTitle>
          <CardDescription>Toutes les boutiques détenues par {u.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.stores.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Aucune boutique pour cet utilisateur.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.stores.map((s) => (
                <li key={s._id} className="flex items-center gap-3 py-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-md ${
                    s.storeType === 'digital' ? 'from-fuchsia-500 to-pink-600' : 'from-indigo-500 to-violet-600'
                  }`}>
                    <StoreIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">/{s.slug} · {s.settings?.country || '—'} · {s.settings?.currency || '—'}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    s.isPublished ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
                  }`}>
                    {s.isPublished ? 'Live' : 'Draft'}
                  </span>
                  <Link href={storeAbsoluteUrl(s.slug)} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Voir <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" /> Zone dangereuse
          </CardTitle>
          <CardDescription>Suppression définitive du compte. Toutes les boutiques, produits, commandes et le wallet sont effacés.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isSelf ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
              Tu ne peux pas supprimer ton propre compte ici. Demande à un autre admin si nécessaire.
            </p>
          ) : (
            <>
              <Label className="text-xs">Pour confirmer, saisis l&apos;email de l&apos;utilisateur ci-dessous :</Label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={u.email}
                className="font-mono text-sm"
              />
              {deleteError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {deleteError}
                </div>
              )}
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || deleteConfirm !== u.email}
                className="gap-1.5"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Supprimer définitivement
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Pill({
  icon,
  tone,
  children,
}: {
  icon?: React.ReactNode;
  tone: 'rose' | 'emerald' | 'amber' | 'indigo';
  children: React.ReactNode;
}) {
  const cls = {
    rose: 'bg-rose-500/10 text-rose-700',
    emerald: 'bg-emerald-500/10 text-emerald-700',
    amber: 'bg-amber-500/10 text-amber-700',
    indigo: 'bg-indigo-500/10 text-indigo-700',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {icon}{children}
    </span>
  );
}

function Stat({
  label,
  icon,
  value,
  sub,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  value: number | string;
  sub?: string;
  tone: 'indigo' | 'fuchsia' | 'amber' | 'emerald' | 'rose';
}) {
  const t: Record<typeof tone, { bg: string; fg: string; grad: string }> = {
    indigo:  { bg: 'bg-indigo-500/15', fg: 'text-indigo-700', grad: 'from-indigo-500/15 to-violet-500/10' },
    fuchsia: { bg: 'bg-fuchsia-500/15', fg: 'text-fuchsia-700', grad: 'from-fuchsia-500/15 to-pink-500/10' },
    amber:   { bg: 'bg-amber-500/15', fg: 'text-amber-700', grad: 'from-amber-500/15 to-orange-500/10' },
    emerald: { bg: 'bg-emerald-500/15', fg: 'text-emerald-700', grad: 'from-emerald-500/15 to-teal-500/10' },
    rose:    { bg: 'bg-rose-500/15', fg: 'text-rose-700', grad: 'from-rose-500/15 to-pink-500/10' },
  };
  const c = t[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5">
      <div className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${c.grad} blur-3xl`} aria-hidden />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
          {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${c.bg} ${c.fg}`}>{icon}</div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  sublabel,
  checked,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>}
        {disabled && disabledReason && <div className="mt-0.5 text-[11px] text-muted-foreground">{disabledReason}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
