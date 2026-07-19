'use client';

/**
 * Widget "À rappeler aujourd'hui" pour la home dashboard.
 *
 * Combine deux buckets côté backend :
 *   - Callbacks : commandes dont l'agent a promis de rappeler, avec deadline
 *     ≤ fin de journée. Les overdue sont affichées en rouge en tête.
 *   - No answers : commandes appelées dans les 24h sans réponse — à retenter
 *     avant abandon (souvent le 2e appel décroche).
 *
 * Chaque ligne est cliquable et amène au détail commande. En vide → carte
 * qui félicite l'agent d'être à jour, plutôt qu'un "aucune donnée" morose.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { storesApi } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import {
  Phone, PhoneMissed, Clock, AlertTriangle, CheckCircle2, Loader2, ArrowRight,
} from 'lucide-react';

type Data = Awaited<ReturnType<typeof storesApi.listOrdersTodo>>['data'];

interface Props {
  storeId: string;
}

function fmtDeadline(iso?: string, now?: Date): { text: string; overdue: boolean } {
  if (!iso) return { text: '—', overdue: false };
  const d = new Date(iso);
  const n = now || new Date();
  const diffMin = Math.round((d.getTime() - n.getTime()) / 60000);
  if (diffMin < 0) {
    const overdue = Math.abs(diffMin);
    if (overdue < 60) return { text: `en retard de ${overdue} min`, overdue: true };
    if (overdue < 1440) return { text: `en retard de ${Math.round(overdue / 60)}h`, overdue: true };
    return { text: `en retard de ${Math.round(overdue / 1440)}j`, overdue: true };
  }
  if (diffMin < 60) return { text: `dans ${diffMin} min`, overdue: false };
  if (diffMin < 1440) return { text: `dans ${Math.round(diffMin / 60)}h`, overdue: false };
  return { text: new Date(iso).toLocaleDateString('fr-FR'), overdue: false };
}

function fmtRelative(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffMin < 1440) return `il y a ${Math.round(diffMin / 60)}h`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

export function TodoCallbacksWidget({ storeId }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setLoading(true);
    storesApi.listOrdersTodo(storeId)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storeId]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm sm:text-base">À rappeler aujourd&apos;hui</CardTitle>
        </CardHeader>
        <CardContent className="grid h-32 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const now = new Date(data.now);
  const empty = data.callbacks.length === 0 && data.noAnswers.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Phone className="h-4 w-4 text-primary" />
              À rappeler aujourd&apos;hui
            </CardTitle>
            <CardDescription className="text-[11px]">
              Callbacks du jour + no-answer des 24h. Attaque ta journée par ici.
            </CardDescription>
          </div>
          {!empty && (
            <div className="flex flex-wrap items-center gap-1.5">
              {data.counts.callbacksOverdue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {data.counts.callbacksOverdue} en retard
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                <Clock className="h-2.5 w-2.5" />
                {data.counts.callbacksToday} callbacks
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                <PhoneMissed className="h-2.5 w-2.5" />
                {data.counts.noAnswers24h} no answer
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {empty ? (
          <div className="grid place-items-center py-8 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="mt-2 text-sm font-medium">Rien à rappeler 🎉</p>
            <p className="text-[11px] text-muted-foreground">Toutes tes commandes en attente sont à jour.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {data.callbacks.map((o) => {
              const deadline = fmtDeadline(o.callbackAt, now);
              return (
                <li key={o._id}>
                  <Link
                    href={`/dashboard/orders/${o._id}?storeId=${storeId}`}
                    className="flex items-center gap-2.5 py-2.5 transition-colors hover:bg-muted/30"
                  >
                    <div
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                        deadline.overdue ? 'bg-rose-500/10 text-rose-600' : 'bg-primary/10 text-primary',
                      )}
                    >
                      <Phone className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-medium">
                          {o.customerName || 'Anonyme'}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">{o.orderNumber}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className={cn('inline-flex items-center gap-1 font-medium', deadline.overdue ? 'text-rose-600' : 'text-foreground/80')}>
                          <Clock className="h-2.5 w-2.5" />
                          {deadline.text}
                        </span>
                        {o.customerPhone && <span>{o.customerPhone}</span>}
                        <span className="tabular-nums font-medium text-foreground/80">
                          {formatCurrency(o.total, o.currency)}
                        </span>
                      </div>
                      {o.confirmationNote && (
                        <p className="mt-0.5 line-clamp-1 text-[10px] italic text-muted-foreground">
                          « {o.confirmationNote} »
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
            {data.noAnswers.slice(0, 10 - data.callbacks.length).map((o) => (
              <li key={o._id}>
                <Link
                  href={`/dashboard/orders/${o._id}?storeId=${storeId}`}
                  className="flex items-center gap-2.5 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600">
                    <PhoneMissed className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">
                        {o.customerName || 'Anonyme'}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{o.orderNumber}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <PhoneMissed className="h-2.5 w-2.5" />
                        {fmtRelative(o.updatedAt)}
                      </span>
                      {o.customerPhone && <span>{o.customerPhone}</span>}
                      <span className="tabular-nums font-medium text-foreground/80">
                        {formatCurrency(o.total, o.currency)}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {!empty && (data.callbacks.length + data.noAnswers.length) > 10 && (
          <div className="mt-3 border-t border-border/40 pt-3">
            <Link href={`/dashboard/orders?storeId=${storeId}&confirmation=callback`}>
              <Button variant="ghost" size="sm" className="w-full text-xs">
                Voir tout ({data.callbacks.length + data.noAnswers.length})
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
