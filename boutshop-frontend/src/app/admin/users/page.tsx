'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { adminApi, type AdminUser } from '@/lib/api';
import {
  Search, Loader2, Crown, Mail, Store as StoreIcon, BadgeCheck, Ban, Clock, ChevronRight,
} from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
        <CardTitle>Vendeurs ({users.length})</CardTitle>
        <CardDescription>Clique sur une ligne pour voir le détail, gérer le rôle, suspendre, réinitialiser le mot de passe.</CardDescription>
      </CardHeader>
      <CardContent>
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
              const isAdmin = u.role === 'admin';
              return (
                <li key={u._id}>
                  <Link
                    href={`/admin/users/${u._id}`}
                    className="group flex flex-wrap items-center gap-4 rounded-lg p-3 hover:bg-muted/30"
                  >
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-md ${
                      u.suspended ? 'bg-rose-500/40 grayscale' :
                      isAdmin ? 'bg-gradient-to-br from-rose-600 to-orange-600' : 'gradient-brand'
                    }`}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold">{u.name || '—'}</span>
                        {isAdmin && <Pill icon={<Crown className="h-2.5 w-2.5" />} tone="rose">Admin</Pill>}
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {icon}{children}
    </span>
  );
}
