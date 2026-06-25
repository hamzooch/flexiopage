'use client';

/**
 * Admin · Livraison & Webhooks — tableau de bord MogaDelivery transverse.
 *
 *  - Vue d'ensemble : toutes les boutiques avec config delivery, leur verdict
 *    (OK / warn / KO) et les stats de dispatch des 7 derniers jours. Les
 *    boutiques en panne remontent en premier.
 *  - Logs : journal des échanges webhook (sortants + entrants), filtrable.
 *  - Outil 401 : empreinte SHA-256 des secrets pour comparer avec MD sans
 *    exposer la clé + relance de dispatch.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  adminApi,
  extractApiError,
  type AdminDeliveryOverviewRow,
  type AdminWebhookLog,
  type AdminDeliveryFingerprint,
} from '@/lib/api';
import {
  Truck,
  Loader2,
  RefreshCw,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Fingerprint,
  ExternalLink,
  Search,
  ChevronRight,
  Power,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'logs' | 'tools';

const VERDICT_STYLES: Record<string, { cls: string; label: string }> = {
  ok: { cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', label: 'OK' },
  warn: { cls: 'bg-amber-500/10 text-amber-700 border-amber-500/20', label: 'Attention' },
  ko: { cls: 'bg-rose-500/10 text-rose-700 border-rose-500/20', label: 'Problème' },
  off: { cls: 'bg-muted text-muted-foreground border-border', label: 'Déconnecté' },
};

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', className)}>
      {children}
    </span>
  );
}

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminDeliveryPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedStore, setSelectedStore] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-rose-500/10 text-rose-700">
          <Truck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold sm:text-lg">Livraison &amp; Webhooks</h2>
          <p className="text-xs text-muted-foreground">
            Diagnostic MogaDelivery transverse — config des boutiques, journal des webhooks, résolution des 401.
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
        {([
          ['overview', "Vue d'ensemble"],
          ['logs', 'Logs webhooks'],
          ['tools', 'Outil 401'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 font-medium transition-colors',
              tab === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          onInspect={(store) => {
            setSelectedStore(store);
            setTab('tools');
          }}
          onLogs={(store) => {
            setSelectedStore(store);
            setTab('logs');
          }}
        />
      )}
      {tab === 'logs' && <LogsTab store={selectedStore} onClearStore={() => setSelectedStore(null)} />}
      {tab === 'tools' && <ToolsTab store={selectedStore} onPickStore={setSelectedStore} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Vue d'ensemble
// ─────────────────────────────────────────────────────────────────────
function OverviewTab({
  onInspect,
  onLogs,
}: {
  onInspect: (s: { id: string; name: string }) => void;
  onLogs: (s: { id: string; name: string }) => void;
}) {
  const [rows, setRows] = useState<AdminDeliveryOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await adminApi.getDeliveryOverview();
      setRows(res.data.stores);
      setError(null);
    } catch (e) {
      setError(extractApiError(e, 'Chargement impossible'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const toggleConnection = useCallback(async (storeId: string, connect: boolean) => {
    setBusyId(storeId);
    try {
      await adminApi.patchStoreDeliveryConfig(storeId, { enabled: connect });
      await load();
    } catch (e) {
      setError(extractApiError(e, 'Action impossible'));
    } finally {
      setBusyId(null);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const problems = rows.filter((r) => r.kind !== 'ok').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">{rows.length} boutique(s) avec config delivery</CardTitle>
            <CardDescription className="text-xs">
              {problems > 0 ? `${problems} en problème (triées en tête)` : 'Toutes les configs sont valides'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Rafraîchir
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{error}</p>}
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune boutique avec config MogaDelivery.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const v = VERDICT_STYLES[r.kind];
              return (
                <div key={r.storeId} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Pill className={v.cls}>
                          {r.kind === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : r.kind === 'warn' ? <AlertTriangle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {v.label}
                        </Pill>
                        <span className="truncate font-medium">{r.name}</span>
                        {r.country && <span className="text-xs text-muted-foreground">{r.country}</span>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>source: <strong>{r.source}</strong></span>
                        <span>markets: {r.marketsCount}</span>
                        <span>legacy: {r.legacyEnabled ? (r.legacyHasSecret ? 'secret ✓' : 'sans secret') : 'off'}</span>
                        {r.dispatch7d && (
                          <span className={cn(r.dispatch7d.errors > 0 && 'text-rose-700')}>
                            dispatch 7j: {r.dispatch7d.total} ({r.dispatch7d.errors} échec{r.dispatch7d.errors > 1 ? 's' : ''})
                          </span>
                        )}
                      </div>
                      {r.dispatch7d?.lastStatus === 'error' && r.dispatch7d.lastError && (
                        <p className="mt-1 truncate text-[11px] text-rose-700" title={r.dispatch7d.lastError}>
                          dernier échec ({timeAgo(r.dispatch7d.lastAt)}): {r.dispatch7d.lastError}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {r.source !== 'none' && (
                        <Button
                          variant={r.connected ? 'outline' : 'default'}
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={busyId === r.storeId}
                          onClick={() => toggleConnection(r.storeId, !r.connected)}
                          title={r.connected ? 'Suspend les dispatchs — secret conservé, réactivable' : 'Réactive les dispatchs (instantané, sans 401)'}
                        >
                          {busyId === r.storeId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                          {r.connected ? 'Déconnecter' : 'Reconnecter'}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onInspect({ id: r.storeId, name: r.name })}>
                        <Fingerprint className="h-3 w-3" /> Empreinte
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onLogs({ id: r.storeId, name: r.name })}>
                        <Search className="h-3 w-3" /> Logs
                      </Button>
                      <Link
                        href={`/admin/stores/${r.storeId}/analytics`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
                      >
                        Config <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Logs
// ─────────────────────────────────────────────────────────────────────
function LogsTab({ store, onClearStore }: { store: { id: string; name: string } | null; onClearStore: () => void }) {
  const [items, setItems] = useState<AdminWebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<'' | 'outbound' | 'inbound'>('');
  const [status, setStatus] = useState<'' | 'success' | 'error'>('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (append = false, cur?: string) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await adminApi.getWebhookLogs({
        storeId: store?.id,
        direction: direction || undefined,
        status: status || undefined,
        cursor: append ? cur : undefined,
        limit: 50,
      });
      setItems((prev) => (append ? [...prev, ...res.data.items] : res.data.items));
      setCursor(res.data.nextCursor);
      setError(null);
    } catch (e) {
      setError(extractApiError(e, 'Chargement impossible'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [store?.id, direction, status]);

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Journal des webhooks</CardTitle>
            <CardDescription className="text-xs">
              {store ? <>Filtré sur <strong>{store.name}</strong> · <button onClick={onClearStore} className="underline">tout voir</button></> : 'Toutes boutiques · rétention 30 j'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className="rounded-md border bg-background px-2 py-1">
              <option value="">Sens : tous</option>
              <option value="outbound">Sortant (FP→MD)</option>
              <option value="inbound">Entrant (MD→FP)</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-md border bg-background px-2 py-1">
              <option value="">Statut : tous</option>
              <option value="success">Succès</option>
              <option value="error">Erreur</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{error}</p>}
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucun log pour ces filtres.</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((log) => {
              const isErr = log.status === 'error';
              const isOpen = expanded === log._id;
              return (
                <div key={log._id} className={cn('rounded-lg border', isErr && 'border-rose-500/30 bg-rose-500/[0.03]')}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : log._id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                  >
                    <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', isOpen && 'rotate-90')} />
                    <Pill className={log.direction === 'outbound' ? 'bg-sky-500/10 text-sky-700 border-sky-500/20' : 'bg-violet-500/10 text-violet-700 border-violet-500/20'}>
                      {log.direction === 'outbound' ? <ArrowUpFromLine className="h-3 w-3" /> : <ArrowDownToLine className="h-3 w-3" />}
                      {log.direction === 'outbound' ? 'sortant' : 'entrant'}
                    </Pill>
                    {isErr ? <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                    {typeof log.httpStatus === 'number' && (
                      <span className={cn('font-mono', log.httpStatus >= 400 ? 'text-rose-700' : 'text-muted-foreground')}>{log.httpStatus}</span>
                    )}
                    <span className="truncate font-medium">{log.storeName || log.storeId || '—'}</span>
                    {log.orderNumber && <span className="text-muted-foreground">{log.orderNumber}</span>}
                    {log.event && <span className="hidden text-muted-foreground sm:inline">{log.event}</span>}
                    <span className="ml-auto shrink-0 text-muted-foreground">{timeAgo(log.createdAt)}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 border-t px-3 py-2 text-[11px]">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                        {log.storeIdSent && <div><span className="text-muted-foreground">store_id envoyé</span><br /><span className="font-mono break-all">{log.storeIdSent}</span></div>}
                        {log.secretSource && <div><span className="text-muted-foreground">source secret</span><br />{log.secretSource}</div>}
                        {typeof log.signatureValid === 'boolean' && <div><span className="text-muted-foreground">signature</span><br />{log.signatureValid ? 'valide ✓' : 'invalide ✗'}</div>}
                      </div>
                      {log.error && <p className="rounded bg-rose-500/10 px-2 py-1 text-rose-700">{log.error}</p>}
                      {log.requestBody && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">Requête envoyée</summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/60 p-2 text-[10px]">{log.requestBody}</pre>
                        </details>
                      )}
                      {log.responseBody && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">{log.direction === 'outbound' ? 'Réponse MD' : 'Payload reçu'}</summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/60 p-2 text-[10px]">{log.responseBody}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {cursor && (
              <div className="pt-2 text-center">
                <Button variant="outline" size="sm" onClick={() => load(true, cursor)} disabled={loadingMore} className="gap-2">
                  {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Charger plus
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Outil 401 — empreinte des secrets
// ─────────────────────────────────────────────────────────────────────
function ToolsTab({
  store,
  onPickStore,
}: {
  store: { id: string; name: string } | null;
  onPickStore: (s: { id: string; name: string }) => void;
}) {
  const [storeId, setStoreId] = useState(store?.id || '');
  const [data, setData] = useState<AdminDeliveryFingerprint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getStoreDeliveryFingerprint(id.trim());
      setData(res.data);
      onPickStore({ id: id.trim(), name: res.data.store.name });
    } catch (e) {
      setData(null);
      setError(extractApiError(e, 'Boutique introuvable'));
    } finally {
      setLoading(false);
    }
  }, [onPickStore]);

  useEffect(() => {
    if (store?.id) load(store.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Empreinte des secrets HMAC</CardTitle>
          <CardDescription className="text-xs">
            Calcule le SHA-256 de la <strong>vraie clé HMAC</strong> (octets décodés si secret 64-hex). Envoie cette empreinte à MD —
            si la leur diffère, le secret est désynchronisé ; sinon le 401 vient d&apos;ailleurs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              placeholder="Store ID (ObjectId Mongo)"
              className="font-mono text-xs"
              onKeyDown={(e) => e.key === 'Enter' && load(storeId)}
            />
            <Button onClick={() => load(storeId)} disabled={loading || !storeId.trim()} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
              Calculer
            </Button>
          </div>
          {error && <p className="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{error}</p>}

          {data && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">{data.store.name} · {data.algo}</p>
              {data.sources.length === 0 ? (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                  Aucun secret trouvé pour cette boutique (ni market, ni legacy, ni env).
                </p>
              ) : (
                data.sources.map((s, i) => (
                  <div key={i} className="rounded-lg border p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill className="bg-muted text-foreground border-border">{s.source}{s.country ? ` · ${s.country}` : ''}</Pill>
                      <span className="text-muted-foreground">{s.preview}</span>
                      {!s.isHex64 && <Pill className="bg-amber-500/10 text-amber-700 border-amber-500/20">non 64-hex</Pill>}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 break-all rounded bg-muted/60 px-2 py-1 text-[10px]">{s.fingerprint}</code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(s.fingerprint);
                          setCopied(s.fingerprint);
                          setTimeout(() => setCopied(null), 1500);
                        }}
                      >
                        {copied === s.fingerprint ? 'Copié ✓' : 'Copier'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
