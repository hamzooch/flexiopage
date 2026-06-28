'use client';

/**
 * Admin · Limites de boutiques — gère les comptes autorisés à dépasser la
 * limite par défaut (`STORE_LIMIT_PER_USER`, 4). Un override `storeLimit` posé
 * sur un compte remplace ce défaut au moment de la création de boutique.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminApi, extractApiError, type AdminStoreLimitUser, type AdminUser } from '@/lib/api';
import { Loader2, RefreshCw, Search, Store, Plus, RotateCcw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', superadmin: 'Superadmin', admin: 'Admin', supervisor: 'Supervisor', user: 'Vendeur',
};

export default function AdminStoreLimitsPage() {
  const [defaultLimit, setDefaultLimit] = useState(4);
  const [rows, setRows] = useState<AdminStoreLimitUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});

  // Recherche pour ajouter un compte
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [addLimit, setAddLimit] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await adminApi.getStoreLimits();
      setDefaultLimit(res.data.defaultLimit);
      setRows(res.data.users);
      setError(null);
    } catch (e) {
      setError(extractApiError(e, 'Chargement impossible'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSearch = useCallback(async () => {
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await adminApi.users({ search: search.trim(), limit: 8 });
      setResults(res.data.users);
    } catch (e) {
      setError(extractApiError(e, 'Recherche impossible'));
    } finally {
      setSearching(false);
    }
  }, [search]);

  async function applyLimit(userId: string, value: number | null) {
    setBusyId(userId);
    setError(null);
    try {
      await adminApi.setUserStoreLimit(userId, value);
      await load();
      // nettoie l'état local de recherche/édition pour ce user
      setResults((r) => r.filter((u) => u._id !== userId));
      setAddLimit((m) => { const n = { ...m }; delete n[userId]; return n; });
      setEdit((m) => { const n = { ...m }; delete n[userId]; return n; });
    } catch (e) {
      setError(extractApiError(e, 'Action impossible'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const overrideIds = new Set(rows.map((r) => r._id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-rose-500/10 text-rose-700">
          <Store className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg">Limites de boutiques</h2>
          <p className="text-xs text-muted-foreground">
            Limite par défaut : <strong>{defaultLimit}</strong> boutiques/compte. Les comptes ci-dessous ont une limite personnalisée.
          </p>
        </div>
      </div>

      {error && <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {/* Ajouter un compte */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Autoriser un compte à dépasser la limite</CardTitle>
          <CardDescription className="text-xs">Cherche un vendeur par email ou nom, puis fixe sa limite.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="email ou nom du vendeur…"
            />
            <Button onClick={runSearch} disabled={searching || !search.trim()} className="gap-2">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Chercher
            </Button>
          </div>
          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((u) => (
                <div key={u._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{u.name} <span className="text-xs font-normal text-muted-foreground">· {ROLE_LABEL[u.role] || u.role}</span></div>
                    <div className="truncate text-xs text-muted-foreground">{u.email}{typeof u.storeCount === 'number' ? ` · ${u.storeCount} boutique(s)` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {overrideIds.has(u._id) && <span className="text-[11px] text-emerald-700">déjà personnalisé</span>}
                    <Input
                      type="number"
                      min={0}
                      value={addLimit[u._id] ?? String(defaultLimit + 1)}
                      onChange={(e) => setAddLimit((m) => ({ ...m, [u._id]: e.target.value }))}
                      className="h-8 w-20"
                    />
                    <Button
                      size="sm"
                      className="h-8 gap-1"
                      disabled={busyId === u._id}
                      onClick={() => applyLimit(u._id, Number(addLimit[u._id] ?? defaultLimit + 1))}
                    >
                      {busyId === u._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Appliquer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liste des overrides */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">{rows.length} compte(s) avec limite personnalisée</CardTitle>
              <CardDescription className="text-xs">Limite &gt; {defaultLimit} = peut ouvrir plus de boutiques.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Rafraîchir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun compte avec limite personnalisée — tous sont au défaut ({defaultLimit}).</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const editing = edit[r._id] !== undefined;
                const atLimit = r.currentStores >= (r.storeLimit ?? defaultLimit);
                return (
                  <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.name} <span className="text-xs font-normal text-muted-foreground">· {ROLE_LABEL[r.role] || r.role}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        <span className={cn(atLimit && 'text-amber-700')}>{r.currentStores}</span> / {r.storeLimit} boutiques utilisées
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {editing ? (
                        <>
                          <Input
                            type="number"
                            min={0}
                            value={edit[r._id]}
                            onChange={(e) => setEdit((m) => ({ ...m, [r._id]: e.target.value }))}
                            className="h-8 w-20"
                          />
                          <Button size="sm" className="h-8 gap-1" disabled={busyId === r._id} onClick={() => applyLimit(r._id, Number(edit[r._id]))}>
                            {busyId === r._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            OK
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEdit((m) => { const n = { ...m }; delete n[r._id]; return n; })}>Annuler</Button>
                        </>
                      ) : (
                        <>
                          <span className="rounded-full border bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">limite {r.storeLimit}</span>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setEdit((m) => ({ ...m, [r._id]: String(r.storeLimit ?? defaultLimit) }))}>Modifier</Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-muted-foreground"
                            disabled={busyId === r._id}
                            onClick={() => applyLimit(r._id, null)}
                            title="Réinitialiser au défaut"
                          >
                            {busyId === r._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Réinitialiser
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
