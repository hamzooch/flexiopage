'use client';

/**
 * Admin — Suivi de la conso IA de la plateforme.
 *
 * Agrège deux sources côté backend :
 *   1. `BotUsage` (mensuel, par vendeur) : coût réel en USD pour le
 *      chatbot uniquement (messages Claude + tools).
 *   2. `Wallet.transactions` (kind='ai_generation') : couvre TOUTES les
 *      features IA facturées (bot, landing, description produit, images).
 *      Montant en tokens débités.
 *
 * Affiche : cartes totaux · top 20 consommateurs · répartition par feature ·
 * série temporelle par jour.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Loader2, Sparkles, TrendingUp, Zap, Users, DollarSign, MessageSquare, Package, Image as ImageIcon, FileText, HelpCircle,
} from 'lucide-react';

type RangePreset = '7d' | '30d' | '90d' | 'ytd';

function computeRange(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const d = new Date(now);
  switch (preset) {
    case '7d': d.setDate(d.getDate() - 7); break;
    case '30d': d.setDate(d.getDate() - 30); break;
    case '90d': d.setDate(d.getDate() - 90); break;
    case 'ytd': d.setMonth(0, 1); break;
  }
  return { from: d.toISOString().slice(0, 10), to };
}

const FEATURE_META: Record<string, { label: string; icon: typeof Sparkles; color: string }> = {
  chatbot:             { label: 'Chatbot',         icon: MessageSquare, color: 'from-emerald-500 to-teal-600' },
  landing:             { label: 'Landing pages',   icon: FileText,      color: 'from-fuchsia-500 to-pink-600' },
  product_description: { label: 'Descriptions',    icon: Package,       color: 'from-amber-500 to-orange-600' },
  images:              { label: 'Images IA',       icon: ImageIcon,     color: 'from-sky-500 to-blue-600' },
  other:               { label: 'Autre',           icon: HelpCircle,    color: 'from-slate-500 to-slate-600' },
};

function fmtInt(n: number): string { return Math.round(n).toLocaleString(); }
function fmtUsd(n: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

type Data = Awaited<ReturnType<typeof adminApi.getAiConsumption>>['data'];

export default function AdminAiConsumptionPage() {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = computeRange(preset);
      const res = await adminApi.getAiConsumption({ from, to });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  // Max de la timeseries pour le petit graphique bar-chart CSS-only.
  const maxTimeseries = useMemo(() => {
    if (!data?.timeseries?.length) return 0;
    return Math.max(...data.timeseries.map((t) => t.tokens));
  }, [data]);

  const totalFeatureTokens = useMemo(() => {
    if (!data?.byFeature?.length) return 0;
    return data.byFeature.reduce((s, f) => s + f.tokens, 0);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" />
            Consommation IA plateforme
          </h1>
          <p className="text-sm text-muted-foreground">
            Tokens débités et coût réel des générations IA (chatbot, landing pages, descriptions, images).
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-muted/40 p-0.5">
          {(['7d', '30d', '90d', 'ytd'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                preset === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p === '7d' ? '7 jours' : p === '30d' ? '30 jours' : p === '90d' ? '90 jours' : 'Depuis 1er jan.'}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Cartes totaux */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Zap className="h-4 w-4" />}
              tone="fuchsia"
              label="Tokens débités (wallets)"
              value={fmtInt(data.totals.wallet.tokensDebited)}
              hint={`${fmtInt(data.totals.wallet.generations)} générations`}
            />
            <StatCard
              icon={<DollarSign className="h-4 w-4" />}
              tone="emerald"
              label="Coût réel chatbot"
              value={fmtUsd(data.totals.bot.costUsd)}
              hint={`${fmtInt(data.totals.bot.tokensIn + data.totals.bot.tokensOut)} tokens Claude`}
            />
            <StatCard
              icon={<MessageSquare className="h-4 w-4" />}
              tone="sky"
              label="Messages bot"
              value={fmtInt(data.totals.bot.messages)}
              hint={`${fmtInt(data.totals.bot.conversations)} conversations · ${fmtInt(data.totals.bot.ordersCreated)} commandes`}
            />
            <StatCard
              icon={<Users className="h-4 w-4" />}
              tone="amber"
              label="Utilisateurs actifs"
              value={fmtInt(data.topUsers.length)}
              hint="Top 20 consommateurs listés ci-dessous"
            />
          </div>

          {/* Répartition par feature */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Répartition par feature</CardTitle>
              <CardDescription>Où les tokens sont-ils dépensés ?</CardDescription>
            </CardHeader>
            <CardContent>
              {data.byFeature.length === 0 ? (
                <div className="grid place-items-center py-8 text-sm text-muted-foreground">
                  Aucune génération IA sur la période.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.byFeature.map((f) => {
                    const meta = FEATURE_META[f.feature] || FEATURE_META.other;
                    const Icon = meta.icon;
                    const pct = totalFeatureTokens > 0 ? (f.tokens / totalFeatureTokens) * 100 : 0;
                    return (
                      <div key={f.feature}>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-2 font-medium">
                            <span className={cn('grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br text-white shadow-sm', meta.color)}>
                              <Icon className="h-3 w-3" />
                            </span>
                            {meta.label}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {fmtInt(f.tokens)} tokens · {fmtInt(f.count)} générations · {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full bg-gradient-to-r transition-all duration-300', meta.color)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Série temporelle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendance quotidienne</CardTitle>
              <CardDescription>Tokens débités par jour sur la période.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.timeseries.length === 0 ? (
                <div className="grid place-items-center py-8 text-sm text-muted-foreground">
                  Aucune donnée pour ce range.
                </div>
              ) : (
                <div className="flex items-end gap-0.5 overflow-x-auto pb-2" style={{ height: 120 }}>
                  {data.timeseries.map((t) => {
                    const h = maxTimeseries > 0 ? (t.tokens / maxTimeseries) * 100 : 0;
                    return (
                      <div
                        key={t.date}
                        className="group relative flex min-w-[8px] flex-1 items-end"
                        style={{ minWidth: 8, maxWidth: 24 }}
                        title={`${t.date} — ${fmtInt(t.tokens)} tokens (${fmtInt(t.count)} gén.)`}
                      >
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-fuchsia-500 to-pink-500 opacity-80 group-hover:opacity-100"
                          style={{ height: `${Math.max(2, h)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              {data.timeseries.length > 0 && (
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{fmtDate(data.timeseries[0].date)}</span>
                  <span>{fmtDate(data.timeseries[data.timeseries.length - 1].date)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top consommateurs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 20 consommateurs</CardTitle>
              <CardDescription>Utilisateurs qui débitent le plus de tokens IA sur la période.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.topUsers.length === 0 ? (
                <div className="grid place-items-center py-8 text-sm text-muted-foreground">
                  Aucun consommateur sur la période.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-semibold">#</th>
                        <th className="px-3 py-2 font-semibold">Utilisateur</th>
                        <th className="px-3 py-2 text-right font-semibold">Tokens</th>
                        <th className="px-3 py-2 text-right font-semibold">Générations</th>
                        <th className="px-3 py-2 font-semibold">Dernière</th>
                        <th className="w-16 px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data.topUsers.map((u, i) => (
                        <tr key={u.userId} className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2">
                            <div className="text-sm font-medium">{u.name || 'Sans nom'}</div>
                            <div className="text-[11px] text-muted-foreground">{u.email || '—'}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtInt(u.tokens)}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{fmtInt(u.count)}</td>
                          <td className="px-3 py-2 text-[11px] text-muted-foreground">{fmtDate(u.lastAt)}</td>
                          <td className="px-3 py-2 text-right">
                            <Link href={`/admin/users/${u.userId}`}>
                              <Button variant="ghost" size="sm" className="h-7 text-[11px]">Voir</Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground">
            <TrendingUp className="mr-1.5 inline h-3 w-3 text-primary" />
            Les tokens sont débités des wallets utilisateurs à chaque génération. Le coût réel chatbot
            (USD) est la somme facturée par Anthropic — les autres features sont facturées au vendeur
            en tokens selon le pricing plateforme (voir <Link href="/admin/pricing" className="text-primary hover:underline">Pricing</Link>).
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, tone, label, value, hint }: {
  icon: React.ReactNode;
  tone: 'fuchsia' | 'emerald' | 'sky' | 'amber';
  label: string;
  value: string;
  hint: string;
}) {
  const toneMap = {
    fuchsia: 'from-fuchsia-500 to-pink-600',
    emerald: 'from-emerald-500 to-teal-600',
    sky:     'from-sky-500 to-blue-600',
    amber:   'from-amber-500 to-orange-600',
  } as const;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', toneMap[tone])}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
