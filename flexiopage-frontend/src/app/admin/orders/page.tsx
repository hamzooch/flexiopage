'use client';

/**
 * Platform-wide orders stats. Owners don't need the full order list
 * here — sellers already get that on their own /dashboard/orders. This
 * page aggregates everything into a handful of KPIs and a top-stores
 * leaderboard so the owner can spot trends at a glance.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, type AdminOrder } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Loader2,
  ShoppingCart,
  DollarSign,
  CheckCircle2,
  Hourglass,
  XCircle,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function AdminOrdersStatsPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.orders().then((res) => {
      setOrders(res.data.orders);
      setTotal(res.data.total);
    }).finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    const pending = orders.filter((o) => o.paymentStatus === 'pending');
    const failed = orders.filter((o) => o.paymentStatus === 'failed');
    const refunded = orders.filter((o) => o.paymentStatus === 'refunded');
    const delivered = orders.filter((o) => o.fulfillmentStatus === 'fulfilled');

    // Pick the most common currency as the display currency. Mixing
    // currencies in one revenue number is wrong; we surface only the
    // dominant one and label everything else "+ autres".
    const byCurrency = new Map<string, number>();
    for (const o of paid) byCurrency.set(o.currency, (byCurrency.get(o.currency) || 0) + o.total);
    const sortedCur = Array.from(byCurrency.entries()).sort((a, b) => b[1] - a[1]);
    const mainCurrency = sortedCur[0]?.[0] || 'USD';
    const mainRevenue = sortedCur[0]?.[1] || 0;
    const otherCurrencies = sortedCur.slice(1);

    const avgOrderValue = paid.length ? Math.round(mainRevenue / paid.length) : 0;

    // Top 5 stores by paid-order count
    const byStore = new Map<string, { name: string; slug: string; count: number; revenue: number; currency: string }>();
    for (const o of paid) {
      const id = o.storeId?._id || 'unknown';
      const prev = byStore.get(id);
      if (prev) {
        prev.count += 1;
        if (prev.currency === o.currency) prev.revenue += o.total;
      } else {
        byStore.set(id, {
          name: o.storeId?.name || 'Boutique inconnue',
          slug: o.storeId?.slug || '',
          count: 1,
          revenue: o.total,
          currency: o.currency,
        });
      }
    }
    const topStores = Array.from(byStore.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total: orders.length,
      paid: paid.length,
      pending: pending.length,
      failed: failed.length,
      refunded: refunded.length,
      delivered: delivered.length,
      mainCurrency,
      mainRevenue,
      otherCurrencies,
      avgOrderValue,
      topStores,
      conversionRate: orders.length ? (paid.length / orders.length) * 100 : 0,
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Statistiques des commandes ({total})</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Vue d&apos;ensemble plateforme — pour le détail commande par commande, consulte le dashboard du vendeur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : orders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Aucune commande sur la plateforme pour l&apos;instant.
            </p>
          ) : (
            <div className="space-y-6">
              {/* KPI grid — dense ecommerce style */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4 xl:grid-cols-5">
                <Kpi label="Commandes totales" value={String(stats.total)} icon={ShoppingCart} tint="slate" />
                <Kpi label="Payées" value={String(stats.paid)} icon={CheckCircle2} tint="emerald" hint={`${stats.conversionRate.toFixed(1)}% conv.`} />
                <Kpi label="En attente" value={String(stats.pending)} icon={Hourglass} tint="amber" />
                <Kpi label="Livrées" value={String(stats.delivered)} icon={CheckCircle2} tint="emerald" />
                <Kpi
                  label={`Revenu (${stats.mainCurrency})`}
                  value={fmt(stats.mainRevenue, stats.mainCurrency)}
                  icon={DollarSign}
                  tint="emerald"
                  hint={stats.otherCurrencies.length ? `+ ${stats.otherCurrencies.length} autres` : undefined}
                />
                <Kpi
                  label="Panier moyen"
                  value={fmt(stats.avgOrderValue, stats.mainCurrency)}
                  icon={TrendingUp}
                  tint="violet"
                />
                <Kpi label="Échec paiement" value={String(stats.failed)} icon={XCircle} tint="rose" />
                <Kpi label="Remboursées" value={String(stats.refunded)} icon={RotateCcw} tint="amber" />
              </div>

              {/* Other-currency footnote when revenue is split across currencies */}
              {stats.otherCurrencies.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Revenu par devise :</span>{' '}
                  {fmt(stats.mainRevenue, stats.mainCurrency)}
                  {stats.otherCurrencies.map(([cur, amt]) => (
                    <span key={cur}> · {fmt(amt, cur)}</span>
                  ))}
                </div>
              )}

              {/* Top stores leaderboard */}
              {stats.topStores.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Top boutiques par commandes payées
                  </div>
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
                    {stats.topStores.map((s, i) => (
                      <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                          #{i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{s.name}</div>
                          {s.slug && <div className="truncate text-[11px] text-muted-foreground">/{s.slug}</div>}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-bold tabular-nums">{s.count}</div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">{fmt(s.revenue, s.currency)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label, value, icon: Icon, tint, hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
  hint?: string;
}) {
  const tintCls = {
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber:   'bg-amber-500/10 text-amber-600',
    rose:    'bg-rose-500/10 text-rose-600',
    violet:  'bg-violet-500/10 text-violet-600',
    slate:   'bg-slate-500/10 text-slate-600',
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-foreground/20">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
          {label}
        </span>
        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', tintCls[tint])}>
          <Icon className="h-3 w-3" />
        </span>
      </div>
      <div className="break-words text-xl font-bold leading-none tracking-tight tabular-nums sm:text-2xl">
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

