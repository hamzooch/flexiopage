'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { adminApi, type AdminUser, type StaffRole } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  Search, Loader2, Crown, Mail, Store as StoreIcon, BadgeCheck, Ban, Clock, ChevronRight,
  Plus, X, ShieldCheck, ShieldAlert, Eye, AlertCircle, CheckCircle2,
} from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const currentUser = useAuthStore((s) => s.user);
  const myRole = (currentUser?.role || 'user') as StaffRole;
  const canCreate = myRole === 'owner' || myRole === 'superadmin';

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.users(search.trim() || undefined);
      setUsers(res.data.users);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Utilisateurs ({users.length})</CardTitle>
            <CardDescription>Clique sur une ligne pour voir le détail, gérer le rôle, suspendre, réinitialiser le mot de passe.</CardDescription>
          </div>
          {canCreate && (
            <Button onClick={() => setShowCreate((v) => !v)} className="gap-2">
              {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showCreate ? 'Annuler' : 'Créer un compte'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {canCreate && showCreate && (
          <CreateUserForm
            myRole={myRole}
            onCreated={() => { setShowCreate(false); load(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par email ou nom…"
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="outline">Filtrer</Button>
        </form>

        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Aucun utilisateur trouvé.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => {
              const initials = (u.name || u.email).split(/[\s@]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
              const isStaff = u.role !== 'user';
              return (
                <li key={u._id}>
                  <Link
                    href={`/admin/users/${u._id}`}
                    className="group flex flex-wrap items-center gap-4 rounded-lg p-3 hover:bg-muted/30"
                  >
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-md ${
                      u.suspended ? 'bg-rose-500/40 grayscale' :
                      isStaff ? 'bg-gradient-to-br from-rose-600 to-orange-600' : 'gradient-brand'
                    }`}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold">{u.name || '—'}</span>
                        <RoleBadge role={u.role} />
                        {u.emailVerified && <Pill icon={<BadgeCheck className="h-2.5 w-2.5" />} tone="emerald">Email vérifié</Pill>}
                        {u.suspended && <Pill icon={<Ban className="h-2.5 w-2.5" />} tone="amber">Suspendu</Pill>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{u.email}</span>
                        <span className="inline-flex items-center gap-1"><StoreIcon className="h-3 w-3" />{u.storeCount || 0} boutique(s)</span>
                        {u.lastLoginAt && (
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Dernière connexion {new Date(u.lastLoginAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CREATE-USER FORM (owner & superadmin only)
// ─────────────────────────────────────────────────────────────────────
function CreateUserForm({
  myRole,
  onCreated,
  onCancel,
}: {
  myRole: StaffRole;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('admin');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Owner can grant any role. Superadmin can grant everything except 'owner'.
  const availableRoles = useMemo<{ value: StaffRole; label: string; help: string }[]>(() => {
    const all: { value: StaffRole; label: string; help: string }[] = [
      { value: 'owner',      label: 'Owner',      help: 'Accès total, peut créer d\'autres owners' },
      { value: 'superadmin', label: 'Superadmin', help: 'Tout sauf créer un owner' },
      { value: 'admin',      label: 'Admin',      help: 'Opérations plateforme, ajuste wallets' },
      { value: 'supervisor', label: 'Superviseur',help: 'Lecture seule + modération réclamations' },
      { value: 'user',       label: 'Vendeur',    help: 'Compte vendeur standard' },
    ];
    return myRole === 'owner' ? all : all.filter((r) => r.value !== 'owner');
  }, [myRole]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminApi.createUser({ email, name, password, role });
      setSuccess(`Compte créé : ${res.data.user.email} (${res.data.user.role})`);
      setEmail(''); setName(''); setPassword('');
      setTimeout(onCreated, 600);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Échec de la création du compte.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-5 rounded-lg border border-border bg-muted/20 p-4"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Plus className="h-4 w-4 text-rose-600" />
        Nouveau compte
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="cu-email">Email</Label>
          <Input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="cu-name">Nom complet</Label>
          <Input id="cu-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="cu-password">Mot de passe (min. 8)</Label>
          <Input id="cu-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
        </div>
        <div>
          <Label htmlFor="cu-role">Rôle</Label>
          <select
            id="cu-role"
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {availableRoles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {availableRoles.find((r) => r.value === role)?.help}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {success}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Annuler</Button>
        <Button type="submit" disabled={submitting} className="gap-2">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Créer le compte
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ROLE BADGE
// ─────────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: AdminUser['role'] }) {
  if (role === 'owner')      return <Pill icon={<Crown className="h-2.5 w-2.5" />} tone="violet">Owner</Pill>;
  if (role === 'superadmin') return <Pill icon={<ShieldAlert className="h-2.5 w-2.5" />} tone="rose">Superadmin</Pill>;
  if (role === 'admin')      return <Pill icon={<ShieldCheck className="h-2.5 w-2.5" />} tone="rose">Admin</Pill>;
  if (role === 'supervisor') return <Pill icon={<Eye className="h-2.5 w-2.5" />} tone="indigo">Superviseur</Pill>;
  return null;
}

function Pill({
  icon,
  tone,
  children,
}: {
  icon?: React.ReactNode;
  tone: 'rose' | 'emerald' | 'amber' | 'indigo' | 'violet';
  children: React.ReactNode;
}) {
  const cls = {
    rose: 'bg-rose-500/10 text-rose-700',
    emerald: 'bg-emerald-500/10 text-emerald-700',
    amber: 'bg-amber-500/10 text-amber-700',
    indigo: 'bg-indigo-500/10 text-indigo-700',
    violet: 'bg-violet-500/10 text-violet-700',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {icon}{children}
    </span>
  );
}
