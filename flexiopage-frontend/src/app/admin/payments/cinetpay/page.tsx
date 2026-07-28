'use client';

/**
 * CinetPay event journal — one line per initiate/webhook/verify attempt.
 * Meant to debug production issues (422 INVALID_CREDENTIALS, missing
 * webhooks, signature failures) without SSH-ing into the VPS.
 *
 * Auto-refresh (5s) is opt-in so browsing old logs isn't disrupted by
 * new arrivals scrolling in.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Loader2, RefreshCw, ArrowLeft, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Clock, Webhook, Play, ShieldCheck, ShieldAlert,
} from 'lucide-react';

type CinetpayLog = Awaited<ReturnType<typeof adminApi.listCinetpayLogs>>['data']['logs'][number];

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

function fmtRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const s = Math.round((now - then) / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.round(h / 24);
  return `il y a ${d}j`;
}

function fmtAmount(n?: number, currency?: string): string {
  if (!n) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'XOF',
      maximumFractionDigits: 0,
    }).format(n);
  } catch { return `${n} ${currency || ''}`; }
}

const EVENT_META: Record<CinetpayLog['event'], { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  initiate: { label: 'Initiate',  icon: Play,    color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
  webhook:  { label: 'Webhook',   icon: Webhook, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40' },
  verify:   { label: 'Verify',    icon: ShieldCheck, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40' },
};

const STATUS_META: Record<CinetpayLog['status'], { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  paid:    { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900' },
  pending: { icon: Clock,        color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900' },
  failed:  { icon: AlertCircle,  color: 'text-red-600 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900' },
};

export default function AdminCinetpayLogsPage() {
  const [logs, setLogs] = useState<CinetpayLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterEvent, setFilterEvent] = useState<'all' | CinetpayLog['event']>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | CinetpayLog['status']>('all');

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const { data } = await adminApi.listCinetpayLogs({ limit: 200 });
      setLogs(data.logs);
    } finally {
      if (showSpinner) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(false), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const filtered = logs.filter((l) => {
    if (filterEvent !== 'all' && l.event !== filterEvent) return false;
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    return true;
  });

  const stats = {
    total: logs.length,
    initiate: logs.filter((l) => l.event === 'initiate').length,
    webhook: logs.filter((l) => l.event === 'webhook').length,
    verify: logs.filter((l) => l.event === 'verify').length,
    failed: logs.filter((l) => l.status === 'failed').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2">
            <Link href="/admin/payments" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour aux paiements
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">CinetPay — Journal des événements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaque initiate / webhook / verify avec CinetPay. Utile pour tracer une erreur 422, un webhook manquant, une signature invalide.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh 5s
            {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
          </label>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Rafraîchir
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} color="bg-slate-500" />
        <StatCard label="Initiate" value={stats.initiate} color="bg-blue-500" />
        <StatCard label="Webhook" value={stats.webhook} color="bg-purple-500" />
        <StatCard label="Verify" value={stats.verify} color="bg-cyan-500" />
        <StatCard label="Échecs" value={stats.failed} color="bg-red-500" alert={stats.failed > 0} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
        <span className="text-xs font-semibold text-muted-foreground">Filtres :</span>
        <select
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value as 'all' | CinetpayLog['event'])}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">Tous les événements</option>
          <option value="initiate">Initiate</option>
          <option value="webhook">Webhook</option>
          <option value="verify">Verify</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'all' | CinetpayLog['status'])}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">Tous les statuts</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} / {logs.length} entrée{logs.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            Chronologique décroissant. Clique sur une ligne pour voir le payload complet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center gap-2 py-12 text-center">
              <ShieldAlert className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Aucun événement CinetPay {logs.length > 0 ? 'avec ces filtres' : 'pour l’instant'}.
              </p>
              <p className="text-xs text-muted-foreground">
                Un événement apparaît dès qu&apos;une commande passe par CinetPay (init, webhook reçu, ou vérif manuelle).
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((log) => {
                const isOpen = expandedId === log.id;
                const eventMeta = EVENT_META[log.event];
                const statusMeta = STATUS_META[log.status];
                const EventIcon = eventMeta.icon;
                const StatusIcon = statusMeta.icon;
                return (
                  <div key={log.id} className={cn('overflow-hidden rounded-lg border transition-colors', statusMeta.color)}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : log.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 opacity-60" /> : <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />}

                      <span className={cn('inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', eventMeta.color)}>
                        <EventIcon className="h-3 w-3" />
                        {eventMeta.label}
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs font-semibold">
                        <StatusIcon className="h-3.5 w-3.5" />
                        {log.status}
                      </span>

                      {log.event === 'webhook' && log.signatureValid === false && (
                        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          sig invalid
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        {log.orderNumber && (
                          <div className="truncate text-xs font-medium">
                            Commande {log.orderNumber}
                            {log.orderTotal !== undefined && (
                              <span className="ml-2 text-muted-foreground">· {fmtAmount(log.orderTotal, log.orderCurrency)}</span>
                            )}
                            {log.orderEmail && (
                              <span className="ml-2 text-muted-foreground">· {log.orderEmail}</span>
                            )}
                          </div>
                        )}
                        {log.note && (
                          <div className="truncate text-[11px] text-muted-foreground">{log.note}</div>
                        )}
                        {log.reference && (
                          <div className="truncate text-[10px] text-muted-foreground/70 font-mono">ref: {log.reference}</div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end text-[10px] text-muted-foreground">
                        <span>{fmtRelative(log.createdAt)}</span>
                        <span className="opacity-60">{fmtDate(log.createdAt)}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-current/10 bg-card/60 p-4">
                        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
                          <div>
                            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Contexte
                            </h4>
                            <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-xs">
                              <dt className="text-muted-foreground">Event</dt><dd>{log.event}</dd>
                              <dt className="text-muted-foreground">Status</dt><dd>{log.status}</dd>
                              {log.reference && (<><dt className="text-muted-foreground">Reference</dt><dd className="font-mono text-[10px]">{log.reference}</dd></>)}
                              {log.orderId && (<><dt className="text-muted-foreground">Order ID</dt><dd className="font-mono text-[10px]">{log.orderId}</dd></>)}
                              {log.orderNumber && (<><dt className="text-muted-foreground">Order#</dt><dd>{log.orderNumber}</dd></>)}
                              {log.orderPaymentStatus && (<><dt className="text-muted-foreground">Order state</dt><dd>{log.orderPaymentStatus}</dd></>)}
                              {log.signatureValid !== undefined && (<><dt className="text-muted-foreground">HMAC</dt><dd>{log.signatureValid ? 'valid ✓' : 'invalid ✗'}</dd></>)}
                              <dt className="text-muted-foreground">Créé le</dt><dd>{fmtDate(log.createdAt)}</dd>
                            </dl>
                          </div>
                          <div>
                            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Payload brut
                            </h4>
                            <pre className="max-h-72 overflow-auto rounded border border-border/60 bg-background/60 p-2 text-[10px]">
                              {JSON.stringify(log.rawPayload || {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {log.note && (
                          <div className="mt-3">
                            <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Note
                            </h4>
                            <div className="rounded border border-border/60 bg-background/60 p-2 text-xs">{log.note}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-border/60 bg-card p-3', alert && 'border-red-500/50 bg-red-50/30 dark:bg-red-950/20')}>
      <div className="flex items-center gap-2">
        <div className={cn('h-2 w-2 rounded-full', color)} />
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className={cn('mt-1 text-2xl font-bold', alert && 'text-red-600')}>{value}</div>
    </div>
  );
}
