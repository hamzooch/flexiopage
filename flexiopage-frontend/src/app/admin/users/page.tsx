'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { adminApi, extractApiError, type AdminUser, type StaffRole } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  Search, Loader2, Crown, Mail, Phone, Store as StoreIcon, BadgeCheck, Ban, Clock, ChevronRight,
  Plus, X, ShieldCheck, ShieldAlert, Eye, AlertCircle, CheckCircle2, Download, Power, BadgeCheck as BadgeCheckIcon,
} from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const currentUser = useAuthStore((s) => s.user);
  const myRole = (currentUser?.role || 'user') as StaffRole;
  const canCreate = myRole === 'owner' || myRole === 'superadmin';
  const canWrite = ['owner', 'superadmin', 'admin'].includes(myRole);

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectAllVisible = () =>
    setSelected((s) => {
      const next = new Set(s);
      const allSelected = users.every((u) => next.has(u._id));
      if (allSelected) users.forEach((u) => next.delete(u._id));
      else users.forEach((u) => next.add(u._id));
      return next;
    });

  async function runBulk(action: 'suspend' | 'unsuspend' | 'verify_email') {
    if (!selected.size) return;
    let reason = '';
    if (action === 'suspend') {
      reason = window.prompt('Raison de la suspension (optionnel) :') || '';
    } else if (!window.confirm(`Confirmer "${action}" sur ${selected.size} compte(s) ?`)) {
      return;
    }
    setBulkBusy(true);
    setBulkFeedback(null);
    try {
      const res = await adminApi.bulkUsers({
        userIds: Array.from(selected),
        action,
        reason: reason.trim() || undefined,
      });
      setBulkFeedback({
        kind: 'success',
        text:
          `${res.data.updated} compte(s) mis à jour` +
          (res.data.skipped.length ? ` · ${res.data.skipped.length} ignoré(s)` : ''),
      });
      setSelected(new Set());
      await load();
    } catch (err) {
      setBulkFeedback({ kind: 'error', text: extractApiError(err, 'Échec du bulk.') });
    } finally {
      setBulkBusy(false);
    }
  }

  async function downloadCsv() {
    setExporting(true);
    try {
      await adminApi.downloadExport('users');
    } finally {
      setExporting(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const res = await adminApi.users({
        search: search.trim() || undefined,
        limit: pageSize,
        skip,
      });
      setUsers(res.data.users);
      setTotal(res.data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, pageSize]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">Utilisateurs ({total})</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Clique sur une ligne pour voir le détail.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={downloadCsv} disabled={exporting} variant="outline" size="sm" className="gap-2">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              CSV
            </Button>
            {canCreate && (
              <Button onClick={() => setShowCreate((v) => !v)} className="gap-2 px-3 sm:px-4">
                {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                <span className="hidden sm:inline">{showCreate ? 'Annuler' : 'Créer un compte'}</span>
                <span className="sm:hidden">{showCreate ? 'Annuler' : 'Créer'}</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {canCreate && showCreate && (
          <CreateUserForm
            myRole={myRole}
            onCreated={() => { setShowCreate(false); load(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        <form onSubmit={(e) => { e.preventDefault(); if (page !== 1) setPage(1); else load(); }} className="mb-5 flex gap-2">
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

        {canWrite && selected.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs">
            <span className="font-semibold">{selected.size} sélectionné(s)</span>
            <span className="text-muted-foreground">·</span>
            <Button size="sm" variant="outline" onClick={() => runBulk('verify_email')} disabled={bulkBusy} className="h-7 gap-1.5 text-xs">
              <BadgeCheckIcon className="h-3 w-3" /> Vérifier email
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulk('suspend')} disabled={bulkBusy} className="h-7 gap-1.5 text-xs">
              <Ban className="h-3 w-3" /> Suspendre
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulk('unsuspend')} disabled={bulkBusy} className="h-7 gap-1.5 text-xs">
              <Power className="h-3 w-3" /> Réactiver
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkBusy} className="h-7 text-xs">
              Annuler
            </Button>
            {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </div>
        )}
        {bulkFeedback && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
              bulkFeedback.kind === 'success' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'
            }`}
          >
            {bulkFeedback.kind === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {bulkFeedback.text}
          </div>
        )}

        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Aucun utilisateur trouvé.
          </p>
        ) : (
          <>
          {canWrite && (
            <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/40">
              <input
                type="checkbox"
                checked={users.length > 0 && users.every((u) => selected.has(u._id))}
                onChange={selectAllVisible}
                className="h-3.5 w-3.5 rounded border-border accent-rose-600"
              />
              Tout sélectionner sur cette page
            </label>
          )}
          <ul className="divide-y divide-border">
            {users.map((u) => {
              const initials = (u.name || u.email).split(/[\s@]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
              const isStaff = u.role !== 'user';
              const isSelected = selected.has(u._id);
              return (
                <li key={u._id} className={isSelected ? 'bg-rose-500/5' : ''}>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                  {canWrite && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(u._id)}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-2.5 h-4 w-4 shrink-0 rounded border-border accent-rose-600"
                      aria-label={`Sélectionner ${u.email}`}
                    />
                  )}
                  <Link
                    href={`/admin/users/${u._id}`}
                    className="group flex flex-1 items-center gap-2.5 rounded-lg p-2.5 hover:bg-muted/30 sm:gap-4 sm:p-3"
                  >
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-md sm:h-10 sm:w-10 ${
                      u.suspended ? 'bg-rose-500/40 grayscale' :
                      isStaff ? 'bg-gradient-to-br from-rose-600 to-orange-600' : 'gradient-brand'
                    }`}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:gap-1.5">
                        <span className="truncate text-xs font-semibold sm:text-sm">{u.name || u.email.split('@')[0]}</span>
                        <RoleBadge role={u.role} />
                        {u.emailVerified && (
                          <span className="hidden sm:inline">
                            <Pill icon={<BadgeCheck className="h-2.5 w-2.5" />} tone="emerald">Email vérifié</Pill>
                          </span>
                        )}
                        {u.suspended && <Pill icon={<Ban className="h-2.5 w-2.5" />} tone="amber">Suspendu</Pill>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground sm:gap-x-3 sm:text-xs">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{u.email}</span>
                        </span>
                        {u.whatsapp && (
                          <span className="inline-flex shrink-0 items-center gap-1">
                            <Phone className="h-3 w-3" />
                            <span className="tabular-nums">{u.whatsapp}</span>
                          </span>
                        )}
                        <span className="inline-flex shrink-0 items-center gap-1"><StoreIcon className="h-3 w-3" />{u.storeCount || 0}</span>
                        {u.lastLoginAt && (
                          <span className="hidden items-center gap-1 sm:inline-flex">
                            <Clock className="h-3 w-3" />Dernière conn. {new Date(u.lastLoginAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
                  </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination
            className="mt-4"
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            disabled={loading}
          />
          </>
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
