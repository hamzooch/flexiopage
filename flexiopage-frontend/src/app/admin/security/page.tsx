'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  adminApi,
  type AdminSecurityEvent,
  type AdminSecuritySummaryRow,
  type SecurityEventType,
} from '@/lib/api';
import { Loader2, Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<SecurityEventType, string> = {
  cert_flood: 'Flood cert-ask (émission cert détournée)',
  rate_limit_hit: 'Rate-limit atteint (429)',
  auth_bruteforce: 'Bruteforce authentification',
  webhook_forged: 'Webhook paiement forgé',
  suspicious_signup: 'Signups suspects',
};

const TYPE_TINTS: Record<SecurityEventType, string> = {
  cert_flood: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  rate_limit_hit: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  auth_bruteforce: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  webhook_forged: 'bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30',
  suspicious_signup: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `il y a ${Math.floor(diff)}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminSecurityPage() {
  const [items, setItems] = useState<AdminSecurityEvent[]>([]);
  const [summary, setSummary] = useState<AdminSecuritySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<SecurityEventType | ''>('');
  const [ipFilter, setIpFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.securityEvents({
        type: typeFilter || undefined,
        sourceIp: ipFilter.trim() || undefined,
        limit: 100,
      });
      setItems(res.data.items);
      setSummary(res.data.summary);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, ipFilter]);

  useEffect(() => {
    void load();
    // Auto-refresh every 30s so the operator sees new bursts without refreshing.
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const totalHits = summary.reduce((acc, s) => acc + s.hits, 0);
  const totalIps = summary.reduce((acc, s) => acc + s.distinctIps, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Shield className="h-6 w-6" /> Sécurité
          </h1>
          <p className="text-sm text-muted-foreground">
            Événements suspects agrégés en direct — cert-ask, rate-limit, bruteforce auth, webhooks forgés.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Rafraîchir
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Événements agrégés (30 j)</CardDescription>
            <CardTitle className="text-3xl">{totalHits.toLocaleString('fr-FR')}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>IPs distinctes</CardDescription>
            <CardTitle className="text-3xl">{totalIps.toLocaleString('fr-FR')}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Types déclenchés</CardDescription>
            <CardTitle className="text-3xl">{summary.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Summary per type */}
      {summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par type</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {summary.map((s) => (
              <button
                key={s.type}
                onClick={() => setTypeFilter(typeFilter === s.type ? '' : s.type)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  TYPE_TINTS[s.type],
                  typeFilter === s.type && 'ring-2 ring-offset-1',
                )}
              >
                {TYPE_LABELS[s.type]} — {s.hits.toLocaleString('fr-FR')} hits · {s.distinctIps} IP{s.distinctIps > 1 ? 's' : ''}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Filtre IP source</label>
            <Input
              placeholder="ex: 172.18.0.5"
              value={ipFilter}
              onChange={(e) => setIpFilter(e.target.value)}
            />
          </div>
          {typeFilter && (
            <Button variant="ghost" size="sm" onClick={() => setTypeFilter('')}>
              Effacer le filtre type ({TYPE_LABELS[typeFilter]})
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Événements ({items.length})</CardTitle>
          <CardDescription>Groupés par (type + IP source). Chaque ligne représente une campagne d'attaque.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Aucun événement de sécurité — tout va bien. ✨
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2">Type</th>
                    <th className="p-2">IP source</th>
                    <th className="p-2 text-right">Hits</th>
                    <th className="p-2">Cible</th>
                    <th className="p-2">Vu la 1ère fois</th>
                    <th className="p-2">Dernière fois</th>
                    <th className="p-2">Alerte envoyée</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ev) => (
                    <tr key={ev._id} className="border-b hover:bg-muted/50">
                      <td className="p-2">
                        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', TYPE_TINTS[ev.type])}>
                          {TYPE_LABELS[ev.type]}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-xs">{ev.sourceIp}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">{ev.hits.toLocaleString('fr-FR')}</td>
                      <td className="p-2 max-w-xs truncate font-mono text-xs" title={ev.target}>
                        {ev.target || '—'}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{timeAgo(ev.firstSeen)}</td>
                      <td className="p-2 text-xs text-muted-foreground">{timeAgo(ev.lastSeen)}</td>
                      <td className="p-2 text-xs">
                        {ev.notifiedAt ? (
                          <span className="text-emerald-700">✓ {timeAgo(ev.notifiedAt)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
    </div>
  );
}
