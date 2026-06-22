'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { adminApi, type AdminComplaint, type ComplaintStatus } from '@/lib/api';
import { Search, Loader2, MessageSquare, ChevronRight, AlertCircle, Clock, Check, X as XIcon, Download, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Ouverte',
  in_progress: 'En cours',
  resolved: 'Résolue',
  closed: 'Fermée',
};

export default function AdminComplaintsPage() {
  const me = useAuthStore((s) => s.user);
  const [complaints, setComplaints] = useState<AdminComplaint[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | ComplaintStatus>('all');
  const [search, setSearch] = useState('');
  const [showMine, setShowMine] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listComplaints({
        status: filter === 'all' ? undefined : filter,
        search: search.trim() || undefined,
      });
      setComplaints(res.data.complaints);
      setCounts(res.data.counts);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  const totalOpen = (counts.open || 0) + (counts.in_progress || 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Réclamations ({complaints.length})</CardTitle>
            <CardDescription>
              {totalOpen > 0
                ? `${totalOpen} ticket(s) à traiter (ouverts ou en cours).`
                : 'Aucun ticket à traiter pour l\'instant.'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={showMine ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowMine((v) => !v)}
              className="gap-1.5"
              title="Afficher uniquement les tickets qui me sont assignés"
            >
              <UserIcon className="h-3.5 w-3.5" />
              Ma queue
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => adminApi.downloadExport('complaints')}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un sujet…"
                  className="w-48 pl-10 sm:w-64"
                />
              </div>
              <Button type="submit" variant="outline" size="sm">Filtrer</Button>
            </form>
          </div>
        </div>

        {/* Status tabs */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((s) => {
            const active = filter === s;
            const label = s === 'all' ? 'Tout' : STATUS_LABELS[s];
            const count = s === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[s] || 0);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/20' : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-rose-500/20' : 'bg-card'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (() => {
          const visible = showMine && me?._id
            ? complaints.filter((c) => c.assignedTo?._id === me._id)
            : complaints;
          if (visible.length === 0) {
            return (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                {showMine ? 'Aucun ticket assigné à toi pour ce filtre.' : 'Aucune réclamation pour ce filtre.'}
              </p>
            );
          }
          return (
          <ul className="divide-y divide-border">
            {visible.map((c) => (
              <li key={c._id}>
                <Link
                  href={`/admin/complaints/${c._id}`}
                  className="group flex items-start gap-4 py-3 hover:bg-muted/30"
                >
                  <StatusIcon status={c.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{c.subject}</span>
                      <PriorityPill priority={c.priority} />
                      <CategoryPill category={c.category} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{c.userId?.name || c.userId?.email || '—'}</span>
                      <span>· {c.messages?.length || 0} message(s)</span>
                      <span>· Mis à jour {new Date(c.updatedAt).toLocaleString()}</span>
                      {c.assignedTo && (
                        <span>· Assignée à <strong>{c.assignedTo.name}</strong></span>
                      )}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(c.status)}`}>
                    {STATUS_LABELS[c.status]}
                  </span>
                  <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
          );
        })()}
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: ComplaintStatus }) {
  const m = {
    open: { Icon: AlertCircle, cls: 'bg-rose-500/10 text-rose-600' },
    in_progress: { Icon: Clock, cls: 'bg-amber-500/10 text-amber-600' },
    resolved: { Icon: Check, cls: 'bg-emerald-500/10 text-emerald-600' },
    closed: { Icon: XIcon, cls: 'bg-muted text-muted-foreground' },
  }[status];
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${m.cls}`}>
      <m.Icon className="h-4 w-4" />
    </span>
  );
}

function statusColor(s: ComplaintStatus): string {
  return {
    open: 'bg-rose-500/10 text-rose-700',
    in_progress: 'bg-amber-500/10 text-amber-700',
    resolved: 'bg-emerald-500/10 text-emerald-700',
    closed: 'bg-muted text-muted-foreground',
  }[s];
}

function PriorityPill({ priority }: { priority: AdminComplaint['priority'] }) {
  if (priority === 'normal') return null;
  const cls = {
    low: 'bg-slate-500/10 text-slate-600',
    high: 'bg-amber-500/10 text-amber-700',
    urgent: 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/30',
  }[priority];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {priority === 'urgent' ? 'Urgent' : priority === 'high' ? 'Haut' : 'Bas'}
    </span>
  );
}

function CategoryPill({ category }: { category: AdminComplaint['category'] }) {
  const labels: Record<AdminComplaint['category'], string> = {
    order: 'Commande',
    payment: 'Paiement',
    wallet: 'Wallet',
    account: 'Compte',
    delivery: 'Livraison',
    other: 'Autre',
  };
  return (
    <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
      {labels[category] || category}
    </span>
  );
}
