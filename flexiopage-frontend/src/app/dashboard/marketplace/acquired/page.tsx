'use client';

/**
 * Vendor acquired marketplace products — vue par boutique du vendeur avec
 * le statut de la dette wholesale (active = pas encore payé / settled =
 * wholesale prélevé à la 1re vente).
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { marketplaceApi, storesApi, type VendorAcquisition } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Loader2, Package, RefreshCw, CheckCircle2, Clock, RotateCcw, ArrowLeft } from 'lucide-react';

interface StoreLite {
  _id: string;
  name: string;
  slug: string;
}

const STATUS_META = {
  active: {
    label: 'En attente',
    hint: 'Prix de gros sera prélevé à la 1re vente',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    Icon: Clock,
  },
  settled: {
    label: 'Réglé',
    hint: 'Prix de gros déjà payé — plus aucun débit à venir',
    cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
  refunded: {
    label: 'Remboursé',
    hint: 'Vente remboursée — la prochaine vente re-déclenchera le débit',
    cls: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    Icon: RotateCcw,
  },
} as const;

export default function VendorAcquiredPage() {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState<string>('');
  const [items, setItems] = useState<VendorAcquisition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    storesApi.list().then((res) => {
      const list = (res.data.stores as StoreLite[]) || [];
      setStores(list);
      if (list[0]) setStoreId(list[0]._id);
    }).catch(() => setStores([]));
  }, []);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const { data } = await marketplaceApi.listAcquisitions(storeId);
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const active = items.filter((a) => a.status === 'active').length;
  const settled = items.filter((a) => a.status === 'settled').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard/marketplace" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Marketplace
            </Link>
            <span>/</span>
            <span>Mes produits acquis</span>
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Package className="h-6 w-6 text-orange-600" />
            Mes produits acquis
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suit le statut du prix de gros pour chaque produit marketplace ajouté à ta boutique.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {/* Sélecteur boutique + compteurs */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Boutique :</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              {stores.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Total : </span>
              <strong>{items.length}</strong>
            </div>
            <div className="text-amber-700 dark:text-amber-300">
              En attente : <strong>{active}</strong>
            </div>
            <div className="text-emerald-700 dark:text-emerald-300">
              Réglés : <strong>{settled}</strong>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card className="py-16 text-center">
          <Package className="mx-auto mb-2 h-10 w-10 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            Aucun produit marketplace acquis pour cette boutique.
          </p>
          <div className="mt-4">
            <Link href="/dashboard/marketplace">
              <Button size="sm">Parcourir le marketplace</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((acq) => {
            const meta = STATUS_META[acq.status];
            const Icon = meta.Icon;
            const mp = typeof acq.marketplaceProductId === 'object' ? acq.marketplaceProductId : null;
            const title = mp?.title || 'Produit';
            const cover = mp?.coverImage;
            const editHref = `/dashboard/products/${acq.vendorProductId}`;
            return (
              <Card key={acq._id}>
                <CardHeader>
                  <div className="flex items-center gap-4">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{title}</CardTitle>
                      <CardDescription className="mt-0.5 flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                            meta.cls,
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <span className="text-xs">{meta.hint}</span>
                      </CardDescription>
                    </div>
                    <Link href={editHref}>
                      <Button variant="outline" size="sm">Modifier</Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:grid-cols-4">
                    <Metric label="Ton prix" value={`${acq.retailPrice} ${acq.currency}`} />
                    <Metric label="Prix de gros" value={`${acq.wholesaleOwed} ${acq.currency}`} />
                    <Metric
                      label="Marge brute"
                      value={`${(acq.retailPrice - acq.wholesaleOwed).toFixed(2)} ${acq.currency}`}
                      tone={acq.retailPrice - acq.wholesaleOwed > 0 ? 'ok' : 'err'}
                    />
                    <Metric
                      label={acq.status === 'settled' ? 'Réglé le' : 'Ajouté le'}
                      value={fmt(acq.settledAt || acq.createdAt)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'err';
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          'font-semibold',
          tone === 'ok' && 'text-emerald-700 dark:text-emerald-300',
          tone === 'err' && 'text-rose-700 dark:text-rose-300',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function fmt(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  } catch {
    return iso;
  }
}
