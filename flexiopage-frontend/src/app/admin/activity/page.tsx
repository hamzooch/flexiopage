'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi, type AdminActivityEvent, type AdminActivityType } from '@/lib/api';
import {
  Loader2,
  UserPlus,
  ShoppingCart,
  CheckCircle2,
  Rocket,
  Truck,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const FILTERS: { value: AdminActivityType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'user.signup', label: 'Inscriptions' },
  { value: 'order.created', label: 'Commandes' },
  { value: 'order.paid', label: 'Paiements' },
  { value: 'store.published', label: 'Publications' },
  { value: 'delivery.dispatched', label: 'Dispatchs' },
  { value: 'delivery.dispatch_failed', label: 'Échecs dispatch' },
];

const TYPE_META: Record<AdminActivityType, { Icon: typeof UserPlus; tint: string }> = {
  'user.signup':              { Icon: UserPlus,     tint: 'bg-indigo-500/15 text-indigo-700' },
  'order.created':            { Icon: ShoppingCart, tint: 'bg-amber-500/15 text-amber-700' },
  'order.paid':               { Icon: CheckCircle2, tint: 'bg-emerald-500/15 text-emerald-700' },
  'store.published':          { Icon: Rocket,       tint: 'bg-fuchsia-500/15 text-fuchsia-700' },
  'delivery.dispatched':      { Icon: Truck,        tint: 'bg-sky-500/15 text-sky-700' },
  'delivery.dispatch_failed': { Icon: AlertTriangle,tint: 'bg-red-500/15 text-red-700' },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `il y a ${Math.floor(diff)}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminActivityPage() {
  const [items, setItems] = useState<AdminActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<AdminActivityType | 'all'>('all');

  useEffect(() => {
    setLoading(true);
    adminApi
      .activity({ limit: 50, type: filter === 'all' ? undefined : filter })
      .then((res) => {
        setItems(res.data.items);
        setCursor(res.data.nextCursor);
      })
      .finally(() => setLoading(false));
  }, [filter]);

  const loadMore = () => {
    if (!cursor) return;
    setLoadingMore(true);
    adminApi
      .activity({ limit: 50, cursor, type: filter === 'all' ? undefined : filter })
      .then((res) => {
        setItems((prev) => [...prev, ...res.data.items]);
        setCursor(res.data.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Journal d&apos;activité</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Tous les événements business de la plateforme, plus récents en premier (conservés 180 jours).
        </CardDescription>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                filter === f.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="px-3 sm:px-6">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Aucun événement {filter !== 'all' ? 'pour ce filtre' : 'pour l’instant'}.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((ev) => {
              const meta = TYPE_META[ev.type];
              const Icon = meta?.Icon ?? AlertTriangle;
              return (
                <li
                  key={ev._id}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:bg-muted/40"
                >
                  <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', meta?.tint ?? 'bg-muted text-muted-foreground')}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{ev.message}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{ev.type}</span>
                      <span>·</span>
                      <span>{timeAgo(ev.createdAt)}</span>
                      {ev.storeId && (
                        <>
                          <span>·</span>
                          <Link href={`/admin/stores/${ev.storeId._id}/analytics`} className="text-primary hover:underline">
                            {ev.storeId.name}
                          </Link>
                        </>
                      )}
                      {ev.userId && (
                        <>
                          <span>·</span>
                          <Link href={`/admin/users/${ev.userId._id}`} className="text-primary hover:underline">
                            {ev.userId.email}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
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
