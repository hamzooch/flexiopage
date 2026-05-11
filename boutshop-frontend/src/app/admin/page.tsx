'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, type AdminOverview } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  Users, Store, Package, ShoppingCart, CheckCircle2, TrendingUp, Wallet, Sparkles,
  Loader2, MessageSquare, AlertTriangle, Plus, ArrowUpRight, Crown, ShieldAlert,
  ShieldCheck, Eye, Activity, Trophy, BadgeCheck,
} from 'lucide-react';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
function shortDate(d?: string) { return d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : ''; }
function shortDateTime(d?: string) { return d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }

const ROLE_BADGE: Record<string, { label: string; tone: string; Icon: typeof Crown }> = {
  owner:      { label: 'Owner',       tone: 'from-violet-600 to-fuchsia-600', Icon: Crown },
  superadmin: { label: 'Super admin', tone: 'from-rose-600 to-orange-600',   Icon: ShieldAlert },
  admin:      { label: 'Admin',       tone: 'from-rose-600 to-orange-600',   Icon: ShieldCheck },
  supervisor: { label: 'Superviseur', tone: 'from-indigo-600 to-blue-600',   Icon: Eye },
};

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);
  const role = (user?.role as string) || 'admin';
  const meta = ROLE_BADGE[role] || ROLE_BADGE.admin;
  const RoleIcon = meta.Icon;
  const canCreate = role === 'owner' || role === 'superadmin';

  useEffect(() => {
    adminApi.overview()
      .then((res) => setData(res.data.overview))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-destructive">Échec du chargement.</p>;

  const stats = [
    { label: 'Vendeurs',             value: data.users,             icon: Users,         tone: 'indigo',  href: '/admin/users' },
    { label: 'Boutiques',            value: data.stores,            icon: Store,         tone: 'fuchsia', href: '/admin/stores' },
    { label: 'Produits',             value: data.products,          icon: Package,       tone: 'amber',   href: '/admin/stores' },
    { label: 'Commandes',            value: data.orders.total,      icon: ShoppingCart,  tone: 'emerald', href: '/admin/orders' },
    { label: 'Commandes payées',     value: data.orders.paid,       icon: CheckCircle2,  tone: 'emerald', href: '/admin/orders' },
    { label: 'Livraisons confirmées',value: data.orders.delivered,  icon: TrendingUp,    tone: 'rose',    href: '/admin/orders' },
  ] as const;

  const toneClasses: Record<string, { grad: string; bg: string; fg: string }> = {
    indigo:  { grad: 'from-indigo-500/15 to-violet-500/10', bg: 'bg-indigo-500/15', fg: 'text-indigo-700' },
    fuchsia: { grad: 'from-fuchsia-500/15 to-pink-500/10',  bg: 'bg-fuchsia-500/15', fg: 'text-fuchsia-700' },
    amber:   { grad: 'from-amber-500/15 to-orange-500/10',  bg: 'bg-amber-500/15', fg: 'text-amber-700' },
    emerald: { grad: 'from-emerald-500/15 to-teal-500/10',  bg: 'bg-emerald-500/15', fg: 'text-emerald-700' },
    rose:    { grad: 'from-rose-500/15 to-pink-500/10',     bg: 'bg-rose-500/15', fg: 'text-rose-700' },
  };

  return (
    <div className="space-y-8">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/20 via-amber-500/10 to-transparent blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${meta.tone} px-3 py-1 text-xs font-bold text-white shadow-lg`}>
              <RoleIcon className="h-3 w-3" /> {meta.label}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Bonjour {user?.name?.split(' ')[0] || 'Admin'} 👋
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Vue temps réel sur tous les vendeurs, boutiques, commandes et flux financiers de la plateforme.
            </p>
          </div>
          {canCreate && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/users"
                className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Créer un compte
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── KPIs ───────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const t = toneClasses[s.tone];
          return (
            <Link
              key={s.label}
              href={s.href}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${t.grad} blur-3xl`} aria-hidden />
              <div className="relative flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className="mt-2 text-3xl font-bold tracking-tight">{s.value.toLocaleString()}</div>
                </div>
                <div className={`grid h-11 w-11 place-items-center rounded-xl ${t.bg} ${t.fg} transition-transform group-hover:scale-110`}>
                  <s.icon className="h-[18px] w-[18px]" />
                </div>
              </div>
              <div className="relative mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                Voir le détail <ArrowUpRight className="h-3 w-3" />
              </div>
            </Link>
          );
        })}
      </section>

      {/* ── Activity chart + Complaints ────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Activité 30 jours</CardTitle>
                <CardDescription>Commandes par jour (payées en rose).</CardDescription>
              </div>
              <ChartLegend />
            </div>
          </CardHeader>
          <CardContent>
            <OrdersChart data={data.ordersByDay30d} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Réclamations</CardTitle>
            <CardDescription>À traiter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ComplaintTile
              tone={data.complaints.urgent > 0 ? 'rose' : 'amber'}
              icon={data.complaints.urgent > 0 ? AlertTriangle : MessageSquare}
              count={data.complaints.urgent}
              label="Urgentes"
            />
            <ComplaintTile
              tone="indigo"
              icon={MessageSquare}
              count={data.complaints.open}
              label="Ouvertes ou en cours"
            />
            <Link
              href="/admin/complaints"
              className="block w-full rounded-xl bg-foreground py-2.5 text-center text-xs font-semibold text-background transition hover:opacity-90"
            >
              Voir toutes les réclamations
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── GMV / Wallets / Commission ─────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> GMV 30 j.</CardTitle>
            <CardDescription>Valeur des commandes par devise.</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(data.gmv30d).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune commande sur 30 jours.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(data.gmv30d).map(([cur, amount]) => (
                  <li key={cur} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
                    <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{cur}</span>
                    <span className="text-lg font-bold tracking-tight">{fmt(amount, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Wallets</CardTitle>
            <CardDescription>Soldes vendeurs par devise.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.walletsByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun wallet.</p>
            ) : (
              <ul className="space-y-2">
                {data.walletsByCurrency.map((w) => (
                  <li key={w._id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono uppercase tracking-wider">{w._id}</span>
                      <span>{w.count} vendeur{w.count > 1 ? 's' : ''}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-emerald-500/10 p-2">
                        <div className="text-[10px] font-bold uppercase text-emerald-700">Principal</div>
                        <div className="font-bold tracking-tight">{fmt(w.totalBalance, w._id)}</div>
                      </div>
                      <div className="rounded-lg bg-fuchsia-500/10 p-2">
                        <div className="text-[10px] font-bold uppercase text-fuchsia-700">IA</div>
                        <div className="font-bold tracking-tight">{fmt(w.totalAi, w._id)}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-rose-500" /> Commission</CardTitle>
            <CardDescription>Total prélevé à ce jour.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.commissionByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune commission.</p>
            ) : (
              <ul className="space-y-2">
                {data.commissionByCurrency.map((c) => (
                  <li key={c._id} className="rounded-lg border border-border/60 bg-gradient-to-br from-rose-500/5 to-amber-500/5 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {c._id} · {c.count} prélèvement{c.count > 1 ? 's' : ''}
                    </div>
                    <div className="mt-1 text-2xl font-bold tracking-tight text-rose-700">{fmt(c.total, c._id)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent activity ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Dernières commandes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune commande.</p>
            ) : data.recentOrders.map((o) => (
              <Link key={o._id} href="/admin/orders" className="block rounded-lg border border-border/60 p-2.5 transition hover:bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">#{o.orderNumber || o._id.slice(-6)}</span>
                  <span className="text-sm font-bold tracking-tight">{fmt(o.total, o.currency)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{o.storeId?.name || '—'}</span>
                  <span className="shrink-0">{shortDateTime(o.createdAt)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <StatusPill tone={o.paymentStatus === 'paid' ? 'emerald' : 'amber'} label={o.paymentStatus} />
                  <StatusPill tone={o.fulfillmentStatus === 'fulfilled' ? 'emerald' : 'indigo'} label={o.fulfillmentStatus} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Nouveaux vendeurs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun nouveau vendeur.</p>
            ) : data.recentUsers.map((u) => {
              const initials = (u.name || u.email).split(/[\s@]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
              return (
                <Link key={u._id} href={`/admin/users/${u._id}`} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5 transition hover:bg-muted/30">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[10px] font-semibold text-white shadow-md">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{u.name || '—'}</span>
                      {u.emailVerified && <BadgeCheck className="h-3 w-3 shrink-0 text-emerald-600" />}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{u.email}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{shortDate(u.createdAt)}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Top boutiques 30 j.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topStores30d.length === 0 ? (
              <p className="text-sm text-muted-foreground">Pas encore de classement.</p>
            ) : data.topStores30d.map((s, i) => {
              const medal = ['🥇', '🥈', '🥉', '4.', '5.'][i];
              return (
                <Link key={s._id} href={`/store/${s.slug}`} target="_blank" className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5 transition hover:bg-muted/30">
                  <span className="text-lg">{medal}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{s.name || '(boutique supprimée)'}</div>
                    <div className="text-[11px] text-muted-foreground">{s.orders} commande{s.orders > 1 ? 's' : ''} payée{s.orders > 1 ? 's' : ''}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold tracking-tight">{fmt(s.gmv, s.currency || 'XOF')}</div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ORDERS CHART — minimal inline SVG bar chart, no dependency
// ─────────────────────────────────────────────────────────────────────
function OrdersChart({ data }: { data: AdminOverview['ordersByDay30d'] }) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.orders)), [data]);
  const barWidth = 100 / data.length;
  return (
    <div className="space-y-2">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-32 w-full">
        {data.map((d, i) => {
          const h = (d.orders / max) * 36;
          return (
            <g key={d.date}>
              <rect
                x={i * barWidth + 0.4}
                y={40 - h}
                width={barWidth - 0.8}
                height={h}
                rx={0.6}
                className="fill-indigo-500/30"
              />
              {d.revenue > 0 && (
                <rect
                  x={i * barWidth + 0.4}
                  y={40 - h}
                  width={barWidth - 0.8}
                  height={Math.max(0.5, (d.revenue > 0 ? Math.min(h, 36) : 0))}
                  rx={0.6}
                  className="fill-rose-500/70"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{shortDate(data[0]?.date)}</span>
        <span>{shortDate(data[Math.floor(data.length / 2)]?.date)}</span>
        <span>{shortDate(data[data.length - 1]?.date)}</span>
      </div>
    </div>
  );
}
function ChartLegend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-indigo-500/30" /> Total</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-rose-500/70" /> Payées</span>
    </div>
  );
}

function ComplaintTile({
  tone, icon: Icon, count, label,
}: {
  tone: 'rose' | 'amber' | 'indigo';
  icon: typeof MessageSquare;
  count: number;
  label: string;
}) {
  const tones = {
    rose:   { bg: 'bg-rose-500/10',    fg: 'text-rose-700',    ring: 'ring-rose-500/20' },
    amber:  { bg: 'bg-amber-500/10',   fg: 'text-amber-700',   ring: 'ring-amber-500/20' },
    indigo: { bg: 'bg-indigo-500/10',  fg: 'text-indigo-700',  ring: 'ring-indigo-500/20' },
  }[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl ${tones.bg} p-3 ring-1 ${tones.ring}`}>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-background ${tones.fg}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-bold tracking-tight">{count}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: 'emerald' | 'amber' | 'indigo'; label?: string }) {
  if (!label) return null;
  const cls = {
    emerald: 'bg-emerald-500/10 text-emerald-700',
    amber:   'bg-amber-500/10 text-amber-700',
    indigo:  'bg-indigo-500/10 text-indigo-700',
  }[tone];
  return <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>{label}</span>;
}
