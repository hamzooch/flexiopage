'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Crown,
  Eye,
  Loader2,
  MessageSquare,
  Package,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { KpiCard } from '@/components/charts/KpiCard';
import { RangeSwitcher } from '@/components/charts/RangeSwitcher';
import { RevenueAreaChart } from '@/components/charts/RevenueAreaChart';
import { SignupsBarChart } from '@/components/charts/SignupsBarChart';
import { CommissionAreaChart } from '@/components/charts/CommissionAreaChart';
import { PaymentDonutChart } from '@/components/charts/PaymentDonutChart';
import { GeoBreakdownList } from '@/components/charts/GeoBreakdownList';
import type { AdminOverviewRich } from '@/types/admin-analytics';
import type { RangeKey } from '@/types/analytics';

const ROLE_BADGE: Record<string, { label: string; tone: string; Icon: typeof Crown }> = {
  owner:      { label: 'Owner',       tone: 'from-violet-600 to-fuchsia-600', Icon: Crown },
  superadmin: { label: 'Super admin', tone: 'from-rose-600 to-orange-600',   Icon: ShieldAlert },
  admin:      { label: 'Admin',       tone: 'from-rose-600 to-orange-600',   Icon: ShieldCheck },
  supervisor: { label: 'Superviseur', tone: 'from-indigo-600 to-blue-600',   Icon: Eye },
};

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function AdminOverviewPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [data, setData] = useState<AdminOverviewRich | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const user = useAuthStore((s) => s.user);
  const role = (user?.role as string) || 'admin';
  const meta = ROLE_BADGE[role] || ROLE_BADGE.admin;
  const RoleIcon = meta.Icon;

  useEffect(() => {
    setLoading(true);
    adminApi.overviewRich(range)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [range]);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await adminApi.overviewRich(range);
      setData(res.data);
    } catch {
      // ignore — UI already shows the previous payload
    } finally {
      setRefreshing(false);
    }
  }

  // Primary currency to display monetary KPIs in. Picks the currency with the
  // largest commission (best proxy for platform's "main" currency).
  const primaryCurrency = useMemo(() => {
    if (!data) return 'USD';
    const ranked = [...data.commissionByCurrency].sort((a, b) => b.total - a.total);
    return ranked[0]?._id || 'USD';
  }, [data]);

  const monthly = range === '12m';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 sm:rounded-3xl sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/20 via-amber-500/10 to-transparent blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${meta.tone} px-3 py-1 text-[11px] font-bold text-white shadow-lg sm:text-xs`}>
              <RoleIcon className="h-3 w-3" /> {meta.label}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:mt-3 sm:text-3xl lg:text-4xl">
              Vue plateforme
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs text-muted-foreground sm:mt-2 sm:text-sm">
              Bonjour {user?.name?.split(' ')[0] || 'Admin'} — vue temps réel sur la croissance, les revenus et la santé de la marketplace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RangeSwitcher value={range} onChange={setRange} />
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-card px-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50 sm:px-3"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
          </div>
        </div>
      </section>

      {loading && !data ? (
        <LoadingSkeleton />
      ) : !data ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Échec du chargement.</CardContent></Card>
      ) : (
        <>
          {/* KPI grid — totals. 2 cols mobile, 4 cols desktop. */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <KpiCard
              label="Vendeurs"
              value={data.totals.users.toLocaleString()}
              icon={Users}
              accent="violet"
              hint="comptes actifs"
            />
            <KpiCard
              label="Boutiques"
              value={data.totals.stores.toLocaleString()}
              icon={Store}
              accent="pink"
              hint="toutes confondues"
            />
            <KpiCard
              label="Produits"
              value={data.totals.products.toLocaleString()}
              icon={Package}
              accent="amber"
            />
            <KpiCard
              label="Commandes totales"
              value={data.totals.orders.total.toLocaleString()}
              icon={ShoppingCart}
              accent="sky"
            />
            <KpiCard
              label="Payées"
              value={data.totals.orders.paid.toLocaleString()}
              icon={CheckCircle2}
              accent="emerald"
              hint={`${((data.totals.orders.paid / Math.max(data.totals.orders.total, 1)) * 100).toFixed(1)}% du total`}
            />
            <KpiCard
              label="Livrées"
              value={data.totals.orders.delivered.toLocaleString()}
              icon={TrendingUp}
              accent="emerald"
            />
            <KpiCard
              label="Échecs paiement"
              value={data.totals.orders.failed.toLocaleString()}
              icon={XCircle}
              accent="amber"
              hint={`${((data.totals.orders.failed / Math.max(data.totals.orders.total, 1)) * 100).toFixed(1)}% du total`}
            />
            <KpiCard
              label="Réclamations urgentes"
              value={data.totals.complaints.urgent.toLocaleString()}
              icon={AlertTriangle}
              accent="amber"
              hint={`${data.totals.complaints.open} ouvertes`}
            />
          </div>

          {/* Revenue chart full width */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base"><Activity className="h-4 w-4 shrink-0" /> GMV &amp; commandes</CardTitle>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">
                  {monthly ? 'Mensuel' : 'Quotidien'} · {primaryCurrency} ·{' '}
                  {new Date(data.window.from).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} →{' '}
                  {new Date(data.window.to).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-pink-500" /> Revenu
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Commandes payées
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <RevenueAreaChart data={data.timeseries.revenue} currency={primaryCurrency} monthly={monthly} />
            </CardContent>
          </Card>

          {/* Signups + Commission side by side */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base"><Users className="h-4 w-4 shrink-0" /> Nouveaux vendeurs</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Inscriptions sur la période</p>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <SignupsBarChart data={data.timeseries.signups} monthly={monthly} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base"><Sparkles className="h-4 w-4 shrink-0" /> Commission encaissée</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Marge plateforme · {primaryCurrency}</p>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <CommissionAreaChart data={data.timeseries.commission} currency={primaryCurrency} monthly={monthly} />
              </CardContent>
            </Card>
          </div>

          {/* Top stores + payment mix */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base"><Store className="h-4 w-4 shrink-0" /> Top boutiques</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Cliquer pour voir le détail</p>
              </CardHeader>
              <CardContent>
                {data.topStores.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Aucune vente sur la période.</p>
                ) : (
                  <TopStoresGrid stores={data.topStores} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Méthodes de paiement</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Sur la période</p>
              </CardHeader>
              <CardContent>
                <PaymentDonutChart data={data.paymentMix.map(p => ({ provider: p._id, orders: p.orders, revenue: p.revenue }))} currency={primaryCurrency} />
              </CardContent>
            </Card>
          </div>

          {/* Geo + Alerts */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top pays acheteurs</CardTitle>
                <p className="text-xs text-muted-foreground">Top 12 par revenu</p>
              </CardHeader>
              <CardContent>
                <GeoBreakdownList data={data.geo} currency={primaryCurrency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Alertes
                </CardTitle>
                <p className="text-xs text-muted-foreground">Paiements échoués + réclamations</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <AlertTile
                  tone={data.totals.complaints.urgent > 0 ? 'rose' : 'amber'}
                  icon={data.totals.complaints.urgent > 0 ? AlertTriangle : MessageSquare}
                  count={data.totals.complaints.urgent}
                  label="Réclamations urgentes"
                  href="/admin/complaints"
                />
                <AlertTile
                  tone="indigo"
                  icon={MessageSquare}
                  count={data.totals.complaints.open}
                  label="Réclamations ouvertes / en cours"
                  href="/admin/complaints"
                />

                {data.alerts.failedPayments.length > 0 ? (
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Derniers paiements échoués
                    </div>
                    <ul className="divide-y divide-border/50">
                      {data.alerts.failedPayments.map((o) => {
                        const storeName = typeof o.storeId === 'object' ? o.storeId?.name : undefined;
                        return (
                          <li key={o._id} className="flex items-center gap-2 py-2 sm:gap-3">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-600">
                              <XCircle className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                <span className="font-mono text-[11px] font-semibold sm:text-xs">#{o.orderNumber}</span>
                                {storeName && <span className="truncate text-[10px] text-muted-foreground sm:text-[11px]">· {storeName}</span>}
                              </div>
                              <div className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
                                {o.email} · {timeAgo(o.createdAt)}
                              </div>
                            </div>
                            <div className="shrink-0 text-right text-[11px] font-semibold tabular-nums sm:text-xs">{fmt(o.total, o.currency)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">Aucun paiement échoué récent ✓</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Wallets / Commission totals */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base"><Wallet className="h-4 w-4 shrink-0" /> Wallets vendeurs</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Soldes cumulés par devise</p>
              </CardHeader>
              <CardContent>
                {data.walletsByCurrency.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun wallet actif.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.walletsByCurrency.map((w) => (
                      <li key={w._id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:text-xs">{w._id}</span>
                          <span className="text-[10px] text-muted-foreground sm:text-[11px]">{w.count} compte{w.count > 1 ? 's' : ''}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
                          <span className="break-all text-base font-bold sm:text-lg">{fmt(w.totalBalance, w._id)}</span>
                          {w.totalAi > 0 && (
                            <span className="text-[10px] text-muted-foreground sm:text-[11px]">+ {fmt(w.totalAi, w._id)} IA</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base"><TrendingUp className="h-4 w-4 shrink-0" /> Commission totale</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Depuis le début</p>
              </CardHeader>
              <CardContent>
                {data.commissionByCurrency.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune commission encaissée.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.commissionByCurrency.map((c) => (
                      <li key={c._id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-700 sm:text-xs">{c._id}</span>
                          <span className="text-[10px] text-emerald-700 sm:text-[11px]">{c.count} prélèv.</span>
                        </div>
                        <div className="mt-1.5 break-all text-base font-bold text-emerald-900 sm:text-lg">{fmt(c.total, c._id)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent activity */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Commandes récentes</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">8 dernières · toutes boutiques</p>
              </CardHeader>
              <CardContent>
                {data.recentOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune commande.</p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {data.recentOrders.map((o) => {
                      const storeName = typeof o.storeId === 'object' ? o.storeId?.name : undefined;
                      const storeSlug = typeof o.storeId === 'object' ? o.storeId?.slug : undefined;
                      const payClass = o.paymentStatus === 'paid' ? 'bg-emerald-500/10 text-emerald-700'
                        : o.paymentStatus === 'failed' ? 'bg-rose-500/10 text-rose-700'
                        : 'bg-amber-500/10 text-amber-700';
                      return (
                        <li key={o._id} className="flex items-center gap-2 py-2.5 sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:gap-2">
                              <span className="font-mono text-[11px] font-semibold sm:text-xs">#{o.orderNumber}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${payClass}`}>
                                {o.paymentStatus}
                              </span>
                              {storeName && (
                                <Link href={storeSlug ? `/store/${storeSlug}` : '#'} target="_blank" className="truncate text-[10px] text-muted-foreground hover:text-foreground sm:text-[11px]">
                                  · {storeName}
                                </Link>
                              )}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
                              {o.customerName || o.email} · {timeAgo(o.createdAt)}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs font-bold tabular-nums sm:text-sm">{fmt(o.total, o.currency)}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Nouveaux vendeurs</CardTitle>
                <p className="text-[11px] text-muted-foreground sm:text-xs">8 inscriptions les plus récentes</p>
              </CardHeader>
              <CardContent>
                {data.recentUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune inscription récente.</p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {data.recentUsers.map((u) => (
                      <li key={u._id} className="flex items-center gap-2 py-2.5 sm:gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-pink-500/10 text-violet-700 text-sm font-bold">
                          {(u.name || u.email)[0].toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold sm:text-sm">{u.name || u.email}</div>
                          <div className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
                            {u.email} · {timeAgo(u.createdAt)}
                          </div>
                        </div>
                        <Link href={`/admin/users/${u._id}`} className="shrink-0 text-[11px] font-semibold text-violet-700 hover:underline sm:text-xs">
                          Détail
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function TopStoresGrid({
  stores,
}: {
  stores: AdminOverviewRich['topStores'];
}) {
  const max = Math.max(...stores.map((s) => s.gmv), 1);
  return (
    <ul className="space-y-2">
      {stores.map((s, i) => {
        const w = (s.gmv / max) * 100;
        const cur = s.currency || 'USD';
        return (
          <li key={s._id}>
            <Link
              href={`/admin/stores/${s._id}/analytics`}
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-border/60 bg-card/60 p-2.5 transition-all hover:border-primary/40 hover:shadow-sm sm:gap-3 sm:p-3"
            >
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-transparent"
                style={{ width: `${w}%` }}
              />
              <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground sm:h-7 sm:w-7 sm:text-[11px]">
                {i + 1}
              </span>
              {s.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo} alt="" className="relative h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-border/60 sm:h-9 sm:w-9" />
              ) : (
                <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-rose-500/15 to-amber-500/10 text-rose-700 sm:h-9 sm:w-9">
                  <Store className="h-4 w-4" />
                </span>
              )}
              <div className="relative min-w-0 flex-1">
                <div className="truncate text-xs font-semibold sm:text-sm">{s.name || '(boutique supprimée)'}</div>
                <div className="text-[10px] text-muted-foreground sm:text-[11px]">
                  {s.orders} commande{s.orders > 1 ? 's' : ''}
                </div>
              </div>
              <div className="relative shrink-0 text-right">
                <div className="text-xs font-bold tabular-nums sm:text-sm">{fmt(s.gmv, cur)}</div>
              </div>
              <ArrowRight className="relative hidden h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AlertTile({
  tone, icon: Icon, count, label, href,
}: {
  tone: 'rose' | 'amber' | 'indigo'; icon: typeof MessageSquare; count: number; label: string; href: string;
}) {
  const cls =
    tone === 'rose' ? 'border-rose-500/30 bg-rose-500/5 text-rose-700' :
    tone === 'amber' ? 'border-amber-500/30 bg-amber-500/5 text-amber-700' :
    'border-indigo-500/30 bg-indigo-500/5 text-indigo-700';
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors hover:bg-card sm:gap-3 sm:p-3 ${cls}`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80 sm:text-xs">{label}</div>
        <div className="text-xl font-bold tracking-tight sm:text-2xl">{count}</div>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[110px] animate-pulse rounded-2xl border border-border/60 bg-card" />
        ))}
      </div>
      <div className="h-[380px] animate-pulse rounded-xl border border-border/60 bg-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-[280px] animate-pulse rounded-xl border border-border/60 bg-card" />
        <div className="h-[280px] animate-pulse rounded-xl border border-border/60 bg-card" />
      </div>
    </div>
  );
}
