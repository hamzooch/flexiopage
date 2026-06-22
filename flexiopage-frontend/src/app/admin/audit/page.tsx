'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminApi, type AdminAuditLog } from '@/lib/api';
import { Loader2, ShieldCheck, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTION_LABELS: Record<string, string> = {
  'user.create': 'Création compte',
  'user.update': 'Modif compte',
  'user.delete': 'Suppression',
  'user.role_change': 'Changement rôle',
  'user.suspend': 'Suspension',
  'user.unsuspend': 'Réactivation',
  'user.reset_password': 'Reset password',
  'user.resend_verification': 'Renvoi vérif',
  'user.bulk_update': 'Bulk users',
  'wallet.adjust': 'Ajustement wallet',
  'wallet.credit': 'Top-up wallet',
  'store.commission_override': 'Commission store',
  'complaint.update': 'Modif réclamation',
  'complaint.assign': 'Assignation ticket',
  'settings.ai_pricing': 'Tarifs AI',
  'settings.auth': 'Réglages auth',
};

const ACTION_TINTS: Record<string, string> = {
  'user.delete': 'bg-rose-500/15 text-rose-700',
  'user.suspend': 'bg-amber-500/15 text-amber-700',
  'user.role_change': 'bg-violet-500/15 text-violet-700',
  'user.create': 'bg-emerald-500/15 text-emerald-700',
  'wallet.adjust': 'bg-sky-500/15 text-sky-700',
  'wallet.credit': 'bg-emerald-500/15 text-emerald-700',
  'store.commission_override': 'bg-violet-500/15 text-violet-700',
  'complaint.assign': 'bg-indigo-500/15 text-indigo-700',
  'settings.ai_pricing': 'bg-orange-500/15 text-orange-700',
  'settings.auth': 'bg-orange-500/15 text-orange-700',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `il y a ${Math.floor(diff)}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminAuditPage() {
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterActorEmail, setFilterActorEmail] = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.audit({
        limit: 50,
        action: filterAction || undefined,
      });
      const filtered = filterActorEmail
        ? res.data.items.filter((i) => i.actorEmail.toLowerCase().includes(filterActorEmail.toLowerCase()))
        : res.data.items;
      setItems(filtered);
      setCursor(res.data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [filterAction]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await adminApi.audit({
        limit: 50,
        cursor,
        action: filterAction || undefined,
      });
      setItems((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base sm:text-lg">Journal d&apos;audit</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Toutes les actions sensibles effectuées par les admins (conservé 365 jours).
            </CardDescription>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Action</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Toutes les actions</option>
              {Object.entries(ACTION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Filtrer par admin</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filterActorEmail}
                onChange={(e) => setFilterActorEmail(e.target.value)}
                placeholder="email admin…"
                className="pl-10"
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
            </div>
          </div>
          <Button variant="outline" onClick={load}>Filtrer</Button>
        </div>
      </CardHeader>

      <CardContent className="px-3 sm:px-6">
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Aucune action {filterAction || filterActorEmail ? 'pour ce filtre' : ''}.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((row) => <AuditRow key={row._id} row={row} />)}
          </ul>
        )}
        {cursor && !loading && (
          <div className="mt-4 grid place-items-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Charger plus
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditRow({ row }: { row: AdminAuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const tint = ACTION_TINTS[row.action] || 'bg-muted text-muted-foreground';
  const hasMeta = row.metadata && Object.keys(row.metadata).length > 0;
  return (
    <li className="rounded-xl border border-border/60 bg-card transition-colors hover:bg-muted/40">
      <button
        type="button"
        onClick={() => hasMeta && setExpanded((v) => !v)}
        className={cn('flex w-full items-start gap-3 p-3 text-left', !hasMeta && 'cursor-default')}
      >
        <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', tint)}>
          {ACTION_LABELS[row.action] || row.action}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{row.summary}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{row.actorEmail}</span>
            <span>· {row.actorRole}</span>
            <span>· {timeAgo(row.createdAt)}</span>
            {row.ip && <span>· {row.ip}</span>}
          </div>
        </div>
        {hasMeta && (
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        )}
      </button>
      {expanded && hasMeta && (
        <pre className="max-h-72 overflow-auto border-t border-border/60 bg-muted/30 px-3 py-2 text-[10px] leading-snug">
          {JSON.stringify(row.metadata, null, 2)}
        </pre>
      )}
    </li>
  );
}
