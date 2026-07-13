'use client';

/**
 * Platform-wide payment tracking. Owners can:
 *   - Check gateway (Moneroo) configuration status
 *   - See stats (volume, success rate, avg amount)
 *   - Browse recent transactions and webhook deliveries
 *   - Manually verify a transaction with the gateway
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Loader2,
  CreditCard,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Webhook,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
} from 'lucide-react';

type PaymentConfig = Awaited<ReturnType<typeof adminApi.getPaymentConfig>>['data'];
type PaymentStats = Awaited<ReturnType<typeof adminApi.getPaymentStats>>['data'];
type PaymentTx = Awaited<ReturnType<typeof adminApi.listPaymentTransactions>>['data'][number];
type WebhookLog = Awaited<ReturnType<typeof adminApi.listPaymentWebhooks>>['data'][number];

function fmt(amount: number, currency = 'XOF'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminPaymentsPage() {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [transactions, setTransactions] = useState<PaymentTx[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'transactions' | 'webhooks'>('transactions');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, st, tx, wh] = await Promise.all([
        adminApi.getPaymentConfig(),
        adminApi.getPaymentStats({ days: 30 }),
        adminApi.listPaymentTransactions({ limit: 50 }),
        adminApi.listPaymentWebhooks({ limit: 50 }),
      ]);
      setConfig(cfg.data);
      setStats(st.data);
      setTransactions(tx.data);
      setWebhooks(wh.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleVerify = async (reference: string) => {
    setVerifying(reference);
    try {
      const res = await adminApi.verifyPaymentTransaction(reference);
      alert(`Statut vérifié: ${res.data.status}\nRéférence: ${res.data.reference || reference}`);
      await load();
    } catch (err) {
      alert(`Erreur: ${(err as Error).message}`);
    } finally {
      setVerifying(null);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (!config?.webhookUrl) return;
    navigator.clipboard.writeText(config.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const successRatePct = useMemo(
    () => stats ? Math.round(stats.successRate * 100) : 0,
    [stats],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Paiements</h1>
          <p className="text-xs text-muted-foreground">
            Suivi des transactions et webhooks {config?.gateway ? `(${config.gateway})` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-2"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration passerelle</CardTitle>
          <CardDescription className="text-xs">Statut de la clé API et URL webhook</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || !config ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                {config.apiKeyConfigured ? (
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    Clé API {config.apiKeyConfigured ? 'configurée' : 'manquante'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {config.testMode ? 'Mode sandbox / test' : 'Mode production'}
                  </div>
                </div>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  config.apiKeyConfigured
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-rose-500/10 text-rose-600',
                )}>
                  {config.apiKeyConfigured ? 'OK' : 'À configurer'}
                </span>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  URL Webhook (à saisir dans le dashboard {config.gateway})
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
                  <code className="flex-1 truncate text-xs">{config.webhookUrl}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={handleCopyWebhookUrl}
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copié' : 'Copier'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statistiques (30 derniers jours)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !stats ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Transactions" value={String(stats.totalTransactions)} icon={CreditCard} tint="slate" />
              <Kpi label="Volume" value={fmt(stats.totalVolume)} icon={TrendingUp} tint="emerald" />
              <Kpi label="Taux de succès" value={`${successRatePct}%`} icon={CheckCircle2} tint={successRatePct >= 80 ? 'emerald' : successRatePct >= 50 ? 'amber' : 'rose'} />
              <Kpi label="Panier moyen" value={fmt(stats.avgAmount)} icon={TrendingUp} tint="violet" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
        <button
          onClick={() => setTab('transactions')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'transactions' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Transactions ({transactions.length})
        </button>
        <button
          onClick={() => setTab('webhooks')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'webhooks' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Webhooks ({webhooks.length})
        </button>
      </div>

      {/* Transactions tab */}
      {tab === 'transactions' && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="grid place-items-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Aucune transaction pour l&apos;instant.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="border-b border-border/60 bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Référence</th>
                      <th className="px-3 py-2 text-left">Order</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                      <th className="px-3 py-2 text-left">Statut</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-3 py-2 font-mono text-[11px]">
                          {tx.reference?.slice(0, 20) || '—'}{tx.reference && tx.reference.length > 20 ? '…' : ''}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                          {tx.orderId?.slice(-8) || '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(tx.amount, tx.currency)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={tx.status} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {fmtDate(tx.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {tx.reference && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 gap-1 px-2 text-[11px]"
                              onClick={() => handleVerify(tx.reference)}
                              disabled={verifying === tx.reference}
                            >
                              {verifying === tx.reference ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              Vérifier
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Webhooks tab */}
      {tab === 'webhooks' && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="grid place-items-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : webhooks.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Aucun webhook reçu pour l&apos;instant.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {webhooks.map((wh) => {
                  const payload = wh.payload as Record<string, unknown>;
                  const orderId = ((payload?.metadata as Record<string, unknown>)?.order_id as string) || '';
                  const amount = Number(payload?.amount) || 0;
                  const currency = String(payload?.currency || 'XOF');
                  return (
                    <li key={wh.id} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{wh.event}</span>
                              <StatusBadge status={wh.status} />
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {fmtDate(wh.createdAt)}
                            </div>
                            {orderId && (
                              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                                Order: {orderId}
                              </div>
                            )}
                            {wh.error && (
                              <div className="mt-1 rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-600">
                                {wh.error}
                              </div>
                            )}
                          </div>
                        </div>
                        {amount > 0 && (
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold tabular-nums">
                              {fmt(amount, currency)}
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
    paid:    { cls: 'bg-emerald-500/10 text-emerald-600',   label: 'Payé',       Icon: CheckCircle2 },
    success: { cls: 'bg-emerald-500/10 text-emerald-600',   label: 'Succès',     Icon: CheckCircle2 },
    pending: { cls: 'bg-amber-500/10 text-amber-600',       label: 'En attente', Icon: Loader2 },
    failed:  { cls: 'bg-rose-500/10 text-rose-600',         label: 'Échec',      Icon: XCircle },
  };
  const conf = map[status] || { cls: 'bg-slate-500/10 text-slate-600', label: status, Icon: CreditCard };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', conf.cls)}>
      <conf.Icon className="h-2.5 w-2.5" />
      {conf.label}
    </span>
  );
}

function Kpi({
  label, value, icon: Icon, tint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
}) {
  const tintCls = {
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber:   'bg-amber-500/10 text-amber-600',
    rose:    'bg-rose-500/10 text-rose-600',
    violet:  'bg-violet-500/10 text-violet-600',
    slate:   'bg-slate-500/10 text-slate-600',
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', tintCls[tint])}>
          <Icon className="h-3 w-3" />
        </span>
      </div>
      <div className="break-words text-xl font-bold leading-none tracking-tight tabular-nums sm:text-2xl">
        {value}
      </div>
    </div>
  );
}
