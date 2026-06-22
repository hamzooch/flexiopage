'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi, type AdminHealth } from '@/lib/api';
import {
  Loader2,
  HeartPulse,
  Database,
  Cpu,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Plug,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const INTEGRATION_LABELS: Record<string, string> = {
  stripe: 'Stripe (paiements)',
  resend: 'Resend (emails)',
  anthropic: 'Anthropic (Claude AI)',
  cloudinary: 'Cloudinary (images)',
  s3: 'AWS S3 (stockage)',
  mogadelivery: 'MogaDelivery (livraison)',
  wasender: 'Wasender (WhatsApp)',
  googleSheets: 'Google Sheets',
};

function uptimeStr(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return `${h}h${remM ? ` ${remM}min` : ''}`;
  const d = Math.floor(h / 24);
  return `${d}j ${h % 24}h`;
}

export default function AdminHealthPage() {
  const [data, setData] = useState<AdminHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await adminApi.health();
      setData(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return null;

  const hasAlert = data.alerts.failedPayments24h > 0 || data.alerts.urgentComplaints > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-rose-500/10 text-rose-700">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold sm:text-lg">Santé plateforme</h2>
            <p className="text-xs text-muted-foreground">
              Snapshot rafraîchi toutes les 30 s · dernier check {new Date(data.timestamp).toLocaleTimeString('fr-FR')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Rafraîchir
        </Button>
      </div>

      {hasAlert && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-rose-700">Attention</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-rose-700/80">
                {data.alerts.failedPayments24h > 0 && (
                  <li>{data.alerts.failedPayments24h} paiement(s) en échec sur les dernières 24h.</li>
                )}
                {data.alerts.urgentComplaints > 0 && (
                  <li>{data.alerts.urgentComplaints} réclamation(s) urgente(s) en attente.</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Base de données"
          value={data.db.ok ? `${data.db.latencyMs}ms` : 'KO'}
          ok={data.db.ok}
          Icon={Database}
          hint={data.db.ok ? 'Ping OK' : 'Connexion DB rompue'}
        />
        <KpiCard
          label="Tickets ouverts"
          value={String(data.alerts.openTickets)}
          ok={data.alerts.openTickets < 10}
          Icon={Activity}
          hint={`dont ${data.alerts.urgentComplaints} urgent(s)`}
        />
        <KpiCard
          label="Commandes 24h"
          value={String(data.counters.newOrders24h)}
          ok={true}
          Icon={Activity}
          hint={`${data.alerts.failedPayments24h} échec(s) paiement`}
        />
        <KpiCard
          label="Uptime serveur"
          value={uptimeStr(data.runtime.uptimeSeconds)}
          ok={true}
          Icon={Cpu}
          hint={`Node ${data.runtime.nodeVersion} · ${data.runtime.platform}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Plug className="h-4 w-4 text-muted-foreground" /> Intégrations
            </CardTitle>
            <CardDescription className="text-xs">
              Vérifie que les clés API sont bien définies côté serveur.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {Object.entries(data.integrations).map(([key, ok]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-md border border-border/60 bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">{INTEGRATION_LABELS[key] || key}</span>
                {ok ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> OK
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                    <XCircle className="h-3.5 w-3.5" /> Absente
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Cpu className="h-4 w-4 text-muted-foreground" /> Runtime &amp; volume
            </CardTitle>
            <CardDescription className="text-xs">
              Mémoire, CPU et compteurs plateforme.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <MetricRow label="RAM (RSS)" value={`${data.runtime.memoryMB.rss} MB`} />
            <MetricRow label="Heap utilisé" value={`${data.runtime.memoryMB.heapUsed} / ${data.runtime.memoryMB.heapTotal} MB`} />
            <MetricRow label="Load avg (1/5/15min)" value={data.runtime.loadAvg.map((n) => n.toFixed(2)).join(' · ')} />
            <MetricRow label="CPU cores" value={String(data.runtime.cpus)} />
            <div className="mt-2 border-t border-border/60 pt-2" />
            <MetricRow label="Utilisateurs" value={data.counters.users.toLocaleString()} />
            <MetricRow label="Boutiques" value={data.counters.stores.toLocaleString()} />
            <MetricRow label="Produits" value={data.counters.products.toLocaleString()} />
            <MetricRow label="Commandes (total)" value={data.counters.orders.toLocaleString()} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  ok,
  Icon,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  Icon: typeof HeartPulse;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-2xl font-bold', !ok && 'text-rose-700')}>{value}</p>
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700')}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-medium">{value}</span>
    </div>
  );
}
