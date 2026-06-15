'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi, storesApi, type AdminActivityEvent, type AdminActivityType } from '@/lib/api';
import {
  Loader2,
  UserPlus,
  ShoppingCart,
  CheckCircle2,
  Rocket,
  Truck,
  AlertTriangle,
  ChevronDown,
  RotateCcw,
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
            {items.map((ev) => (
              <ActivityRow key={ev._id} ev={ev} />
            ))}
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

/**
 * Une ligne d'historique. Pour les événements delivery (`dispatched` /
 * `dispatch_failed`), on expose le payload exact envoyé au transporteur,
 * la réponse, et un bouton Renvoyer côté admin pour intervenir sans
 * passer par le tableau de bord du vendeur.
 */
function ActivityRow({ ev }: { ev: AdminActivityEvent }) {
  const meta = TYPE_META[ev.type];
  const Icon = meta?.Icon ?? AlertTriangle;
  const isDelivery = ev.type === 'delivery.dispatched' || ev.type === 'delivery.dispatch_failed';
  const isFailed = ev.type === 'delivery.dispatch_failed';
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const md = (ev.metadata || {}) as {
    provider?: string;
    externalId?: string;
    error?: string;
    itemsSent?: Array<{ name?: string; sku?: string; quantity?: number }>;
    requestBody?: Record<string, unknown>;
    responseBody?: Record<string, unknown>;
  };

  async function handleRetry() {
    if (!ev.storeId?._id || !ev.orderId) return;
    setRetrying(true);
    setRetryMessage(null);
    try {
      // En tant qu'admin on a accès au endpoint store-scoped (storeAccess
      // middleware whitelist admin). retry=true efface l'externalId côté
      // backend pour court-circuiter l'idempotence.
      const res = await storesApi.dispatchOrder(ev.storeId._id, ev.orderId, { retry: true });
      setRetryMessage(
        res.data.ok
          ? { kind: 'success', text: res.data.alreadyDispatched ? 'Déjà dispatché.' : 'Renvoyée ✓' }
          : { kind: 'error', text: 'Échec.' }
      );
    } catch (err) {
      const apiMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRetryMessage({ kind: 'error', text: apiMsg || (err instanceof Error ? err.message : 'Erreur') });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <li className="rounded-xl border border-border/60 bg-card transition-colors hover:bg-muted/40">
      <div className="flex items-start gap-3 p-3">
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
          {/* Aperçu des items côté delivery — repérer un mismatch d'un coup d'œil */}
          {isDelivery && md.itemsSent && md.itemsSent.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {md.itemsSent.map((it, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px]"
                  title={`SKU: ${it.sku || '—'}  Qté: ${it.quantity}`}
                >
                  <span className="font-medium">{it.name || '—'}</span>
                  <span className="text-muted-foreground">×{it.quantity}</span>
                  {!it.sku && (
                    <span className="text-amber-700" title="SKU vide — cause fréquente de mismatch côté provider">
                      ⚠ SKU vide
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Actions delivery */}
        {isDelivery && (
          <div className="flex shrink-0 items-center gap-1.5">
            {isFailed && ev.storeId?._id && ev.orderId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={retrying}
                className="h-8 gap-1.5 border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
              >
                {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Renvoyer
              </Button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              title={expanded ? 'Masquer le détail' : 'Voir le payload'}
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
          </div>
        )}
      </div>

      {/* Panneau dépliable — JSON exact envoyé / reçu */}
      {isDelivery && expanded && (
        <div className="space-y-3 border-t border-border/60 bg-muted/30 p-3">
          {retryMessage && (
            <p
              className={cn(
                'rounded-md px-2 py-1.5 text-[11px] font-medium',
                retryMessage.kind === 'success'
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-rose-500/10 text-rose-700'
              )}
            >
              {retryMessage.text}
            </p>
          )}
          {md.error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-700">
              <strong>Erreur transporteur :</strong> {md.error}
            </div>
          )}
          <JsonPanel title="Payload envoyé (request)" data={md.requestBody} />
          <JsonPanel title="Réponse reçue (response)" data={md.responseBody} />
          {md.externalId && (
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold">ID externe :</span>{' '}
              <code className="font-mono">{md.externalId}</code>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function JsonPanel({ title, data }: { title: string; data?: unknown }) {
  if (!data) return null;
  const formatted = (() => {
    try { return JSON.stringify(data, null, 2); } catch { return String(data); }
  })();
  return (
    <details className="overflow-hidden rounded-md border border-border/60 bg-background">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-foreground/80 marker:hidden">
        {title}
      </summary>
      <pre className="max-h-72 overflow-auto border-t border-border/60 bg-card px-3 py-2 text-[10px] leading-snug">
        {formatted}
      </pre>
    </details>
  );
}
