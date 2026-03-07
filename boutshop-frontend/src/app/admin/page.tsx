'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, type AdminOverview } from '@/lib/api';
import {
  Users,
  Store,
  Package,
  ShoppingCart,
  CheckCircle2,
  TrendingUp,
  Wallet,
  Sparkles,
  Loader2,
} from 'lucide-react';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

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
    { label: 'Vendeurs', value: data.users, icon: Users, tone: 'indigo' },
    { label: 'Boutiques', value: data.stores, icon: Store, tone: 'fuchsia' },
    { label: 'Produits', value: data.products, icon: Package, tone: 'amber' },
    { label: 'Commandes totales', value: data.orders.total, icon: ShoppingCart, tone: 'emerald' },
    { label: 'Commandes payées', value: data.orders.paid, icon: CheckCircle2, tone: 'emerald' },
    { label: 'Livraisons confirmées', value: data.orders.delivered, icon: TrendingUp, tone: 'rose' },
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
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/20 via-amber-500/10 to-transparent blur-3xl" aria-hidden />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-700">
            BoutShop Platform
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Tableau de bord administrateur</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Vue temps réel sur tous les vendeurs, boutiques, commandes et flux financiers de la plateforme.
          </p>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const t = toneClasses[s.tone];
          return (
            <div key={s.label} className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl">
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
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* GMV par devise */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> GMV — 30 derniers jours</CardTitle>
            <CardDescription>Valeur totale des commandes (toutes devises confondues).</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(data.gmv30d).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune commande sur les 30 derniers jours.</p>
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

        {/* Wallets agrégés */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Wallets de la plateforme</CardTitle>
            <CardDescription>Soldes cumulés des vendeurs (principal + IA), par devise.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.walletsByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun wallet créé.</p>
            ) : (
              <ul className="space-y-2">
                {data.walletsByCurrency.map((w) => (
                  <li key={w._id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{w._id} · {w.count} vendeur(s)</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-emerald-500/10 p-2.5">
                        <div className="text-[10px] font-bold uppercase text-emerald-700">Principal</div>
                        <div className="font-bold tracking-tight">{fmt(w.totalBalance, w._id)}</div>
                      </div>
                      <div className="rounded-lg bg-fuchsia-500/10 p-2.5">
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
      </div>

      {/* Commission collected */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-rose-500" /> Commission collectée à ce jour</CardTitle>
          <CardDescription>Total des prélèvements de commission par devise (depuis la création).</CardDescription>
        </CardHeader>
        <CardContent>
          {data.commissionByCurrency.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune commission encore prélevée.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.commissionByCurrency.map((c) => (
                <li key={c._id} className="rounded-lg border border-border/60 bg-gradient-to-br from-rose-500/5 to-amber-500/5 p-3.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c._id} · {c.count} prélèvement(s)</div>
                  <div className="mt-1 text-2xl font-bold tracking-tight text-rose-700">{fmt(c.total, c._id)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
