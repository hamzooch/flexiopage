'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { adminApi, type AdminStore } from '@/lib/api';
import { cn, storeAbsoluteUrl } from '@/lib/utils';
import { Loader2, Cloud, Package, ExternalLink, Search, X, Download } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BotLimitDialog } from '@/components/admin/bot-limit-dialog';

type TypeFilter = 'all' | 'physical' | 'digital';
type StatusFilter = 'all' | 'live' | 'draft';

export default function AdminStoresPage() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    adminApi.stores().then((res) => {
      setStores(res.data.stores);
      setTotal(res.data.total);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = stores;
    if (typeFilter !== 'all') {
      list = list.filter((s) => (s.storeType || 'physical') === typeFilter);
    }
    if (statusFilter !== 'all') {
      const wantLive = statusFilter === 'live';
      list = list.filter((s) => !!s.isPublished === wantLive);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.ownerId?.email?.toLowerCase() || '').includes(q) ||
        (s.ownerId?.name?.toLowerCase() || '').includes(q)
      );
    }
    return list;
  }, [stores, typeFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const physical = stores.filter((s) => (s.storeType || 'physical') === 'physical').length;
    const digital = stores.filter((s) => s.storeType === 'digital').length;
    const live = stores.filter((s) => s.isPublished).length;
    const draft = stores.length - live;
    return { physical, digital, live, draft };
  }, [stores]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Boutiques ({total})</CardTitle>
            <CardDescription>Toutes les boutiques de la plateforme, plus récentes en premier.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => adminApi.downloadExport('stores')}
            className="gap-2"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-col gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, slug, vendeur, email…"
              className="h-9 rounded-lg pl-9 text-xs sm:text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Effacer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Type chips */}
          <div className="flex flex-wrap gap-1.5">
            <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
              Tous types ({stores.length})
            </Chip>
            <Chip active={typeFilter === 'physical'} onClick={() => setTypeFilter('physical')} tint="indigo">
              <Package className="h-3 w-3" /> Physique ({stats.physical})
            </Chip>
            <Chip active={typeFilter === 'digital'} onClick={() => setTypeFilter('digital')} tint="fuchsia">
              <Cloud className="h-3 w-3" /> Digital ({stats.digital})
            </Chip>
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap gap-1.5">
            <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              Tous statuts
            </Chip>
            <Chip active={statusFilter === 'live'} onClick={() => setStatusFilter('live')} tint="emerald">
              Live ({stats.live})
            </Chip>
            <Chip active={statusFilter === 'draft'} onClick={() => setStatusFilter('draft')} tint="amber">
              Draft ({stats.draft})
            </Chip>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Aucune boutique ne correspond aux filtres.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Boutique</th>
                  <th className="py-2 text-left font-medium">Vendeur</th>
                  <th className="py-2 text-left font-medium">Type</th>
                  <th className="py-2 text-left font-medium">Pays / devise</th>
                  <th className="py-2 text-left font-medium">Statut</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const isDigital = s.storeType === 'digital';
                  return (
                    <tr key={s._id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-md ${
                            isDigital ? 'from-fuchsia-500 to-pink-600' : 'from-indigo-500 to-violet-600'
                          }`}>
                            {isDigital ? <Cloud className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{s.name}</div>
                            <div className="truncate text-xs text-muted-foreground">/{s.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-xs">
                        <div className="font-medium">{s.ownerId?.name || '—'}</div>
                        <div className="text-muted-foreground">{s.ownerId?.email || '—'}</div>
                      </td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isDigital ? 'bg-fuchsia-500/10 text-fuchsia-700' : 'bg-indigo-500/10 text-indigo-700'
                        }`}>
                          {isDigital ? 'Digital' : 'Physical'}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {s.settings?.country || '—'} · {s.settings?.currency || '—'}
                      </td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          s.isPublished
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-amber-500/10 text-amber-700'
                        }`}>
                          {s.isPublished ? 'Live' : 'Draft'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <BotLimitDialog storeId={s._id} storeName={s.name} />
                          <Link
                            href={storeAbsoluteUrl(s.slug)}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Voir <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Chip({
  children,
  active,
  onClick,
  tint,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tint?: 'indigo' | 'fuchsia' | 'emerald' | 'amber';
}) {
  const tintCls = {
    indigo:  'border-indigo-500 bg-indigo-500 text-white',
    fuchsia: 'border-fuchsia-500 bg-fuchsia-500 text-white',
    emerald: 'border-emerald-500 bg-emerald-500 text-white',
    amber:   'border-amber-500 bg-amber-500 text-white',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? tint ? tintCls[tint] : 'border-primary bg-primary text-primary-foreground'
          : 'border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
