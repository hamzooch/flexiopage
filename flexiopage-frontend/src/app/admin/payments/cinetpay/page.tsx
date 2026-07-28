'use client';

/**
 * CinetPay dashboard — business overview + event journal.
 *
 * Two tabs:
 *   1. Vue d'ensemble : balance real-time (SDK), KPI mois-en-cours, business
 *      maths (commission, à verser, déjà versé), breakdown par méthode Wave/OM/…,
 *      10 dernières transactions.
 *   2. Journal des événements : timeline complète des initiate/webhook/verify
 *      avec filters + auto-refresh — surtout utile pour debug (422, sig invalid…).
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
  Wallet, TrendingUp, ExternalLink, Banknote, Percent,
} from 'lucide-react';

type Overview = Awaited<ReturnType<typeof adminApi.getCinetpayOverview>>['data'];
type CinetpayLog = Awaited<ReturnType<typeof adminApi.listCinetpayLogs>>['data']['logs'][number];

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmt(amount: number, currency = 'XOF'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch { return `${Math.round(amount)} ${currency}`; }
}

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

const METHOD_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  WAVE:         { label: 'Wave',         color: 'from-cyan-500 to-blue-600',     emoji: '🌊' },
  OM:           { label: 'Orange Money', color: 'from-orange-500 to-orange-700', emoji: '🟠' },
  ORANGE:       { label: 'Orange Money', color: 'from-orange-500 to-orange-700', emoji: '🟠' },
  MTN:          { label: 'MTN MoMo',     color: 'from-yellow-400 to-amber-600',  emoji: '🟡' },
  MOOV:         { label: 'Moov Money',   color: 'from-sky-500 to-indigo-600',    emoji: '🔵' },
  CARD:         { label: 'Carte',        color: 'from-slate-700 to-slate-900',   emoji: '💳' },
  VISA:         { label: 'Visa',         color: 'from-slate-700 to-slate-900',   emoji: '💳' },
  UNKNOWN:      { label: 'Non identifié', color: 'from-gray-400 to-gray-600',    emoji: '❓' },
};

/* ─── Main page ──────────────────────────────────────────────────────── */

type Tab = 'overview' | 'logs';

export default function AdminCinetpayPage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="space-y-6">
      <PageHeader tab={tab} />

      <div className="flex gap-1 rounded-lg border border-border/60 bg-card p-1">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={TrendingUp}>
          Vue d&apos;ensemble
        </TabButton>
        <TabButton active={tab === 'logs'} onClick={() => setTab('logs')} icon={ShieldCheck}>
          Journal des événements
        </TabButton>
      </div>

      {tab === 'overview' ? <OverviewTab /> : <LogsTab />}
    </div>
  );
}

function PageHeader({ tab }: { tab: Tab }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="mb-2">
          <Link href="/admin/payments" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour aux paiements
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">CinetPay</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === 'overview'
            ? 'Solde, revenu du mois, commission, versements aux vendeurs.'
            : 'Chaque appel initiate / webhook / verify. Utile pour tracer une erreur.'}
        </p>
      </div>
      <Link
        href="/admin/payouts"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
      >
        <Banknote className="h-3.5 w-3.5" />
        Gérer les versements
        <ExternalLink className="h-3 w-3 opacity-60" />
      </Link>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors sm:flex-none sm:px-4 sm:text-sm',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/* ─── Overview tab ───────────────────────────────────────────────────── */

function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getCinetpayOverview();
      setData(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return null;

  const currency = data.balance?.currency || 'XOF';
  const monthLabel = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Métriques pour <span className="font-semibold text-foreground">{monthLabel}</span></p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Rafraîchir
        </Button>
      </div>

      {/* Balance card — real-time from SDK */}
      <Card className="overflow-hidden bg-gradient-to-br from-fuchsia-500/10 via-transparent to-indigo-500/10 border-fuchsia-500/20">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white">
            <Wallet className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Solde CinetPay disponible</div>
            {data.balance ? (
              <div className="text-3xl font-bold tracking-tight">{fmt(data.balance.available, data.balance.currency)}</div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground italic">
                Solde indisponible — appel SDK échoué (compte non-configuré, réseau, ou host sandbox)
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4 KPIs this month */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenu du mois"
          value={fmt(data.thisMonth.revenue, currency)}
          icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          label="Transactions payées"
          value={String(data.thisMonth.txCount)}
          icon={CheckCircle2}
          hint={`${data.thisMonth.totalAttempts} tentatives totales`}
          accent="blue"
        />
        <KpiCard
          label="Taux de succès"
          value={`${(data.thisMonth.successRate * 100).toFixed(1)}%`}
          icon={Percent}
          hint={`${data.thisMonth.breakdown.abandoned} abandons, ${data.thisMonth.breakdown.failed} échecs`}
          accent={data.thisMonth.successRate > 0.7 ? 'emerald' : 'amber'}
        />
        <KpiCard
          label="Ticket moyen"
          value={fmt(data.thisMonth.avgAmount, currency)}
          icon={Banknote}
          accent="slate"
        />
      </div>

      {/* Business — commission split */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission &amp; versements</CardTitle>
          <CardDescription className="text-xs">
            Commission FlexioPage = {(data.business.commissionRate * 100).toFixed(1)}% capée à {fmt(data.business.commissionCap, currency)}.
            Modifiable via <code className="rounded bg-muted px-1 py-0.5 text-[10px]">COMMISSION_RATE</code> dans .env.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <BusinessCard
            label="Commission collectée"
            value={fmt(data.business.commissionTotal, currency)}
            hint={`${(data.business.commissionRate * 100).toFixed(1)}% du revenu`}
            color="text-fuchsia-600"
            bg="bg-fuchsia-50 dark:bg-fuchsia-950/30"
          />
          <BusinessCard
            label="À reverser aux vendeurs"
            value={fmt(data.business.toSellers, currency)}
            hint="revenu − commission"
            color="text-indigo-600"
            bg="bg-indigo-50 dark:bg-indigo-950/30"
          />
          <BusinessCard
            label="Déjà versé"
            value={fmt(data.business.alreadyPaidOut, currency)}
            hint="payouts marqués payés"
            color="text-emerald-600"
            bg="bg-emerald-50 dark:bg-emerald-950/30"
          />
          <BusinessCard
            label="Reste à verser"
            value={fmt(data.business.remainingToPayOut, currency)}
            hint="ce que tu dois aux vendeurs"
            color={data.business.remainingToPayOut > 0 ? 'text-amber-600' : 'text-muted-foreground'}
            bg="bg-amber-50 dark:bg-amber-950/30"
            highlight={data.business.remainingToPayOut > 0}
          />
        </CardContent>
      </Card>

      {/* Method breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Répartition par méthode de paiement</CardTitle>
          <CardDescription className="text-xs">Quelle passerelle mobile money tes acheteurs utilisent le plus.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.methodBreakdown.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              Aucune transaction ce mois — la répartition s&apos;affiche dès la première commande.
            </p>
          ) : (
            <div className="space-y-3">
              {data.methodBreakdown.map((m) => {
                const meta = METHOD_LABELS[m.method] || METHOD_LABELS.UNKNOWN;
                const pct = m.share * 100;
                return (
                  <div key={m.method} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br text-sm text-white', meta.color)}>
                        {meta.emoji}
                      </div>
                      <span className="text-sm font-medium">{meta.label}</span>
                      <span className="ml-auto text-xs font-semibold">{pct.toFixed(0)}%</span>
                      <span className="text-xs text-muted-foreground">{m.count} tx</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full bg-gradient-to-r', meta.color)}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">10 dernières transactions</CardTitle>
          <CardDescription className="text-xs">Uniquement les paiements confirmés (paid).</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentTransactions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
              Aucune transaction payée pour l&apos;instant.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Date</th>
                    <th className="px-2 py-2 font-semibold">Commande</th>
                    <th className="px-2 py-2 font-semibold">Boutique</th>
                    <th className="px-2 py-2 font-semibold">Acheteur</th>
                    <th className="px-2 py-2 text-right font-semibold">Montant</th>
                    <th className="px-2 py-2 font-semibold">Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTransactions.map((t) => (
                    <tr key={t.id} className="border-t border-border/40">
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{fmtDate(t.createdAt)}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{t.orderNumber}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs">
                        {t.storeSlug ? (
                          <Link href={`/store/${t.storeSlug}`} target="_blank" className="text-primary hover:underline">
                            {t.storeName || t.storeSlug}
                          </Link>
                        ) : (t.storeName || '—')}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{t.email}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                        {fmt(t.total, t.currency)}
                      </td>
                      <td className="max-w-[160px] truncate px-2 py-2 font-mono text-[10px] text-muted-foreground">
                        {t.reference || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, hint, accent }: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>; hint?: string;
  accent: 'emerald' | 'blue' | 'amber' | 'slate';
}) {
  const accentClasses = {
    emerald: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40',
    blue: 'text-blue-600 bg-blue-100 dark:bg-blue-950/40',
    amber: 'text-amber-600 bg-amber-100 dark:bg-amber-950/40',
    slate: 'text-slate-700 bg-slate-100 dark:bg-slate-800/60',
  }[accent];
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', accentClasses)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-xl font-bold">{value}</div>
          {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function BusinessCard({ label, value, hint, color, bg, highlight }: {
  label: string; value: string; hint: string; color: string; bg: string; highlight?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border border-border/60 p-4', bg, highlight && 'ring-2 ring-amber-500/40')}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold', color)}>{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

/* ─── Logs tab (existing journal) ────────────────────────────────────── */

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

function LogsTab() {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total" value={stats.total} color="bg-slate-500" />
          <StatCard label="Initiate" value={stats.initiate} color="bg-blue-500" />
          <StatCard label="Webhook" value={stats.webhook} color="bg-purple-500" />
          <StatCard label="Verify" value={stats.verify} color="bg-cyan-500" />
          <StatCard label="Échecs" value={stats.failed} color="bg-red-500" alert={stats.failed > 0} />
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <input type="checkbox" className="h-3.5 w-3.5" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh 5s
            {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
          </label>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Rafraîchir
          </Button>
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>Chronologique décroissant. Clique sur une ligne pour voir le payload complet.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center gap-2 py-12 text-center">
              <ShieldAlert className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aucun événement CinetPay {logs.length > 0 ? 'avec ces filtres' : 'pour l’instant'}.</p>
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
                        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">sig invalid</span>
                      )}
                      <div className="min-w-0 flex-1">
                        {log.orderNumber && (
                          <div className="truncate text-xs font-medium">
                            Commande {log.orderNumber}
                            {log.orderTotal !== undefined && (<span className="ml-2 text-muted-foreground">· {fmt(log.orderTotal, log.orderCurrency || 'XOF')}</span>)}
                            {log.orderEmail && (<span className="ml-2 text-muted-foreground">· {log.orderEmail}</span>)}
                          </div>
                        )}
                        {log.note && (<div className="truncate text-[11px] text-muted-foreground">{log.note}</div>)}
                        {log.reference && (<div className="truncate text-[10px] text-muted-foreground/70 font-mono">ref: {log.reference}</div>)}
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
                            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contexte</h4>
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
                            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payload brut</h4>
                            <pre className="max-h-72 overflow-auto rounded border border-border/60 bg-background/60 p-2 text-[10px]">
                              {JSON.stringify(log.rawPayload || {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {log.note && (
                          <div className="mt-3">
                            <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Note</h4>
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
