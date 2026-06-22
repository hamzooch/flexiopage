'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi, type AdminReportRow } from '@/lib/api';
import { BarChart3, Loader2, Download, TrendingUp, UserPlus, Store as StoreIcon } from 'lucide-react';

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

function fmtCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
  }
}

function joinCurrencyMap(map: Record<string, number>): string {
  const entries = Object.entries(map).filter(([, v]) => v > 0);
  if (!entries.length) return '—';
  return entries.map(([c, v]) => fmtCurrency(v, c)).join(' · ');
}

export default function AdminReportsPage() {
  const [months, setMonths] = useState(12);
  const [rows, setRows] = useState<AdminReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminApi
      .reports({ months })
      .then((res) => setRows(res.data.months))
      .finally(() => setLoading(false));
  }, [months]);

  const totals = useMemo(() => {
    const gmv: Record<string, number> = {};
    const commission: Record<string, number> = {};
    let signups = 0;
    let stores = 0;
    let orders = 0;
    for (const r of rows) {
      signups += r.signups;
      stores += r.newStores;
      orders += r.orders;
      for (const [c, v] of Object.entries(r.gmvByCurrency)) gmv[c] = (gmv[c] || 0) + v;
      for (const [c, v] of Object.entries(r.commissionByCurrency)) commission[c] = (commission[c] || 0) + v;
    }
    return { gmv, commission, signups, stores, orders };
  }, [rows]);

  function downloadCsv() {
    const headers = ['Mois', 'Signups', 'Nouvelles boutiques', 'Commandes payées', 'GMV', 'Commission'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        r.month,
        r.signups,
        r.newStores,
        r.orders,
        `"${joinCurrencyMap(r.gmvByCurrency)}"`,
        `"${joinCurrencyMap(r.commissionByCurrency)}"`,
      ].join(','));
    }
    const csv = '﻿' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${months}m-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-rose-500/10 text-rose-700">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold sm:text-lg">Reports plateforme</h2>
            <p className="text-xs text-muted-foreground">GMV, commission, signups par mois — devises agrégées par bucket.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={3}>3 derniers mois</option>
            <option value={6}>6 derniers mois</option>
            <option value={12}>12 derniers mois</option>
            <option value={24}>24 derniers mois</option>
          </select>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={loading || !rows.length} className="gap-2">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Signups" value={String(totals.signups)} Icon={UserPlus} />
        <SummaryCard label="Nouvelles boutiques" value={String(totals.stores)} Icon={StoreIcon} />
        <SummaryCard label="GMV total" value={joinCurrencyMap(totals.gmv)} Icon={TrendingUp} />
        <SummaryCard label="Commission collectée" value={joinCurrencyMap(totals.commission)} Icon={TrendingUp} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm sm:text-base">Détail mensuel</CardTitle>
          <CardDescription className="text-xs">
            Les montants multi-devises sont affichés séparément (XOF · USD · EUR…).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-3 py-2 text-left">Mois</th>
                    <th className="px-3 py-2 text-right">Signups</th>
                    <th className="px-3 py-2 text-right">Stores</th>
                    <th className="px-3 py-2 text-right">Cmd. payées</th>
                    <th className="px-3 py-2 text-right">GMV</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {[...rows].reverse().map((r) => (
                    <tr key={r.month} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{fmtMonth(r.month)}</td>
                      <td className="px-3 py-2 text-right">{r.signups}</td>
                      <td className="px-3 py-2 text-right">{r.newStores}</td>
                      <td className="px-3 py-2 text-right">{r.orders}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{joinCurrencyMap(r.gmvByCurrency)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{joinCurrencyMap(r.commissionByCurrency)}</td>
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

function SummaryCard({ label, value, Icon }: { label: string; value: string; Icon: typeof BarChart3 }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-lg font-bold">{value}</p>
          </div>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-700">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
