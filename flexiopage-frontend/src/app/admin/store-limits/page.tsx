'use client';

/**
 * Admin · Limites — deux volets :
 *  1. Limites de boutiques : nombre de boutiques qu'un vendeur peut créer.
 *     Défaut global `STORE_LIMIT_PER_USER` (4) ; un override `storeLimit` posé
 *     sur un compte le remplace. La liste montre TOUS les vendeurs.
 *  2. Limites messages chatbot : plafond de messages/mois du bot par boutique
 *     (édité via BotLimitDialog). Illimité si vide/0 (metering opt-in).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  adminApi,
  extractApiError,
  type AdminStoreLimitUser,
  type AdminUser,
  type AdminBotLimitStore,
} from '@/lib/api';
import { BotLimitDialog } from '@/components/admin/bot-limit-dialog';
import { Loader2, RefreshCw, Search, Store, RotateCcw, Check, Pencil, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', superadmin: 'Superadmin', admin: 'Admin', supervisor: 'Supervisor', user: 'Vendeur',
};

type VendorRow = {
  _id: string;
  name: string;
  email: string;
  role: string;
  currentStores: number;
  limit: number;
  isCustom: boolean;
};

export default function AdminStoreLimitsPage() {
  const [defaultLimit, setDefaultLimit] = useState(4);
  const [overrides, setOverrides] = useState<AdminStoreLimitUser[]>([]);
  const [vendors, setVendors] = useState<AdminUser[]>([]);
  const [botStores, setBotStores] = useState<AdminBotLimitStore[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});

  const [search, setSearch] = useState('');
  const [botSearch, setBotSearch] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [limits, users, bots] = await Promise.all([
        adminApi.getStoreLimits(),
        adminApi.users({ limit: 500 }),
        adminApi.listBotLimits(),
      ]);
      setDefaultLimit(limits.data.defaultLimit);
      setOverrides(limits.data.users);
      setVendors(users.data.users.filter((u) => u.role === 'user'));
      setBotStores(bots.data.items);
      setError(null);
    } catch (e) {
      setError(extractApiError(e, 'Chargement impossible'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function applyLimit(userId: string, value: number | null) {
    setBusyId(userId);
    setError(null);
    try {
      await adminApi.setUserStoreLimit(userId, value);
      await load();
      setEdit((m) => { const n = { ...m }; delete n[userId]; return n; });
    } catch (e) {
      setError(extractApiError(e, 'Action impossible'));
    } finally {
      setBusyId(null);
    }
  }

  // Fusionne overrides (storeLimit + currentStores) et liste des vendeurs.
  const vendorRows = useMemo<VendorRow[]>(() => {
    const ovById = new Map(overrides.map((o) => [o._id, o]));
    const rows = vendors.map((u) => {
      const ov = ovById.get(u._id);
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        currentStores: ov?.currentStores ?? u.storeCount ?? 0,
        limit: ov?.storeLimit ?? defaultLimit,
        isCustom: !!ov && ov.storeLimit != null,
      };
    });
    // Ajoute les overrides sur des comptes non-vendeurs (owner/admin) pour ne rien cacher.
    for (const o of overrides) {
      if (!rows.some((r) => r._id === o._id)) {
        rows.push({
          _id: o._id, name: o.name, email: o.email, role: o.role,
          currentStores: o.currentStores, limit: o.storeLimit ?? defaultLimit, isCustom: o.storeLimit != null,
        });
      }
    }
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      : rows;
    // Personnalisés d'abord, puis par nom.
    return filtered.sort((a, b) =>
      a.isCustom === b.isCustom ? a.name.localeCompare(b.name) : a.isCustom ? -1 : 1,
    );
  }, [vendors, overrides, defaultLimit, search]);

  const botRows = useMemo(() => {
    const q = botSearch.trim().toLowerCase();
    if (!q) return botStores;
    return botStores.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.owner?.email || '').toLowerCase().includes(q),
    );
  }, [botStores, botSearch]);

  const customCount = vendorRows.filter((r) => r.isCustom).length;

  if (loading) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-rose-500/10 text-rose-700">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold sm:text-lg">Limites</h2>
            <p className="text-xs text-muted-foreground">
              Boutiques par vendeur (défaut <strong>{defaultLimit}</strong>) et messages du chatbot par boutique.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Rafraîchir
        </Button>
      </div>

      {error && <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {/* ── Limites de boutiques : tous les vendeurs ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Limites de boutiques par vendeur</CardTitle>
              <CardDescription className="text-xs">
                {vendorRows.length} vendeur(s) · {customCount} avec limite personnalisée. Défaut : {defaultLimit} boutiques.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Chercher un vendeur…"
                className="h-9 pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {vendorRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun vendeur trouvé.</p>
          ) : (
            <div className="space-y-2">
              {vendorRows.map((r) => {
                const editing = edit[r._id] !== undefined;
                const atLimit = r.currentStores >= r.limit;
                return (
                  <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.name} <span className="text-xs font-normal text-muted-foreground">· {ROLE_LABEL[r.role] || r.role}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        <span className={cn(atLimit && 'text-amber-700')}>{r.currentStores}</span> / {r.limit} boutiques utilisées
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
                          <span className={cn(
                            'rounded-full border px-2.5 py-1 text-xs font-semibold',
                            r.isCustom ? 'bg-emerald-500/10 text-emerald-700' : 'text-muted-foreground',
                          )}>
                            limite {r.limit}{r.isCustom ? ' · perso' : ' · défaut'}
                          </span>
                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setEdit((m) => ({ ...m, [r._id]: String(r.limit) }))}>
                            <Pencil className="h-3.5 w-3.5" />
                            Modifier
                          </Button>
                          {r.isCustom && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 text-muted-foreground"
                              disabled={busyId === r._id}
                              onClick={() => applyLimit(r._id, null)}
                              title="Réinitialiser au défaut"
                            >
                              {busyId === r._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                              Défaut
                            </Button>
                          )}
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

      {/* ── Limites messages chatbot ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <MessageSquare className="h-4 w-4 text-indigo-600" />
                Limites messages chatbot
              </CardTitle>
              <CardDescription className="text-xs">
                {botStores.length} boutique(s) avec un bot. « ∞ » = illimité (le bot n’est jamais coupé).
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={botSearch}
                onChange={(e) => setBotSearch(e.target.value)}
                placeholder="Chercher une boutique…"
                className="h-9 pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {botRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {botStores.length === 0 ? 'Aucune boutique avec un chatbot connecté.' : 'Aucune boutique trouvée.'}
            </p>
          ) : (
            <div className="space-y-2">
              {botRows.map((s) => (
                <div key={s._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.owner?.name || '—'}{s.owner?.email ? ` · ${s.owner.email}` : ''}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {s.bots.map((b) => (
                        <span key={b.channel} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                          <span className="capitalize">{b.channel}</span> · limite {b.messages_limit ?? '∞'} · plafond {b.messages_limit_max ?? '∞'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <BotLimitDialog storeId={s._id} storeName={s.name} onSaved={load} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
