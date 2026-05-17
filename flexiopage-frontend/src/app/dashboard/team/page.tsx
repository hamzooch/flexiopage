'use client';

/**
 * Team page — a seller invites staff (managers, confirmation agents) who get
 * their own login and operate inside the seller's account with a scoped
 * dashboard. Team members themselves can't open this page.
 */

import { useCallback, useEffect, useState } from 'react';
import { teamApi, type TeamMember, type TeamRole } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  UsersRound,
  UserPlus,
  Loader2,
  Trash2,
  ShieldCheck,
  PhoneCall,
  Ban,
  RotateCcw,
  Mail,
} from 'lucide-react';

const ROLE_META: Record<TeamRole, { label: string; description: string; icon: React.ComponentType<{ className?: string }>; accent: string }> = {
  manager: {
    label: 'Gestionnaire',
    description: 'Accès large : boutiques, produits, commandes, clients.',
    icon: ShieldCheck,
    accent: 'from-violet-500 to-indigo-600',
  },
  confirmation_agent: {
    label: 'Agent de confirmation',
    description: 'Confirme les commandes COD — voit et met à jour les commandes.',
    icon: PhoneCall,
    accent: 'from-emerald-500 to-teal-600',
  },
};

const ROLE_OPTIONS: TeamRole[] = ['manager', 'confirmation_agent'];

export default function TeamPage() {
  const user = useAuthStore((s) => s.user);
  const isTeamMember = !!user?.teamRole;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await teamApi.list();
      setMembers(res.data.members || []);
      setError('');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : (err as Error)?.message;
      setError(msg || 'Impossible de charger l’équipe.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isTeamMember) void refresh();
    else setLoading(false);
  }, [refresh, isTeamMember]);

  if (isTeamMember) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center">
        <UsersRound className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Seul le propriétaire du compte peut gérer l’équipe.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        icon={UsersRound}
        title="Ton équipe"
        description="Invite des gestionnaires et agents de confirmation — chacun a un tableau de bord adapté."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Members list */}
        <section className="space-y-3">
          {loading ? (
            <div className="grid h-48 place-items-center rounded-2xl border border-border/60 bg-card">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              {error}
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center">
              <UserPlus className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Aucun membre pour l’instant. Invite ta première recrue avec le formulaire à droite.
              </p>
            </div>
          ) : (
            members.map((m) => (
              <MemberCard key={m._id} member={m} onChanged={refresh} />
            ))
          )}
        </section>

        {/* Invite form */}
        <InviteForm onInvited={refresh} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Member card
// ─────────────────────────────────────────────────────────────────────
function MemberCard({ member, onChanged }: { member: TeamMember; onChanged: () => Promise<void> }) {
  const meta = ROLE_META[member.teamRole];
  const Icon = meta.icon;
  const [busy, setBusy] = useState(false);

  async function setRole(teamRole: TeamRole) {
    if (teamRole === member.teamRole) return;
    setBusy(true);
    try {
      await teamApi.update(member._id, { teamRole });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function toggleSuspended() {
    setBusy(true);
    try {
      await teamApi.update(member._id, { suspended: !member.suspended });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(`Retirer ${member.name} de l’équipe ? Son accès sera supprimé.`)) return;
    setBusy(true);
    try {
      await teamApi.remove(member._id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-4 transition-colors',
        member.suspended ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/60'
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-md', meta.accent)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight">{member.name}</h3>
            {member.suspended && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                Suspendu
              </span>
            )}
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" /> {member.email}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.description}</p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* Role switch */}
        <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => setRole(r)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                member.teamRole === r
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {ROLE_META[r].label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={toggleSuspended}
            className="h-8 gap-1.5"
          >
            {member.suspended ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            {member.suspended ? 'Réactiver' : 'Suspendre'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={remove}
            className="h-8 gap-1.5 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Retirer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Invite form
// ─────────────────────────────────────────────────────────────────────
function InviteForm({ onInvited }: { onInvited: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamRole, setTeamRole] = useState<TeamRole>('confirmation_agent');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError('Nom, email et un mot de passe d’au moins 8 caractères sont requis.');
      return;
    }
    setSaving(true);
    try {
      await teamApi.create({ name: name.trim(), email: email.trim(), password, teamRole });
      setName('');
      setEmail('');
      setPassword('');
      setDone(true);
      setTimeout(() => setDone(false), 2500);
      await onInvited();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : (err as Error)?.message;
      setError(msg || 'L’invitation a échoué.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="h-fit space-y-4 rounded-2xl border border-border/60 bg-card p-5"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl gradient-brand text-white shadow-md">
          <UserPlus className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Inviter un membre</h2>
          <p className="text-[11px] text-muted-foreground">Il se connecte avec ces identifiants.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tm-name">Nom complet</Label>
        <Input id="tm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Sami Ben Ali" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tm-email">Email</Label>
        <Input id="tm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sami@exemple.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tm-password">Mot de passe</Label>
        <Input
          id="tm-password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 caractères"
          autoComplete="new-password"
        />
        <p className="text-[11px] text-muted-foreground">Communique-le au membre — il pourra le changer ensuite.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Rôle</Label>
        <div className="grid gap-2">
          {ROLE_OPTIONS.map((r) => {
            const meta = ROLE_META[r];
            const Icon = meta.icon;
            const active = teamRole === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setTeamRole(r)}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
                  active ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'
                )}
              >
                <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white', meta.accent)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{meta.label}</div>
                  <p className="text-[11px] text-muted-foreground">{meta.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {done && <p className="text-xs font-medium text-emerald-600">✓ Membre invité.</p>}

      <Button type="submit" disabled={saving} className="w-full gap-1.5 gradient-brand text-white">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Inviter le membre
      </Button>
    </form>
  );
}
