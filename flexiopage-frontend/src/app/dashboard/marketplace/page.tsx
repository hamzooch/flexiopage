'use client';

/**
 * Vendor marketplace — browse du catalogue plateforme + acquisition dans
 * une boutique. Aucun débit lors de l'ajout : le prix de gros est prélevé
 * UNE fois à la 1re vente client (voir seller-earnings.service).
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { marketplaceApi, storesApi, type MarketplaceProduct, type MarketplaceDigitalKind } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Loader2, Package, Search, ShoppingBag, RefreshCw, ArrowRight, Info,
} from 'lucide-react';

interface StoreLite {
  _id: string;
  name: string;
  slug: string;
  settings?: { currency?: string };
}

const KIND_LABELS: Record<MarketplaceDigitalKind, string> = {
  download: 'Téléchargement',
  course: 'Cours',
  license: 'Licence',
  membership: 'Membership',
  service: 'Service',
};

export default function MarketplaceBrowsePage() {
  const [items, setItems] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<MarketplaceDigitalKind | ''>('');
  const [selected, setSelected] = useState<MarketplaceProduct | null>(null);
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.q = search.trim();
      if (kind) params.digitalKind = kind;
      const { data } = await marketplaceApi.list(params);
      setItems(data.items);
    } catch (e) {
      setMessage({ tone: 'err', text: (e as Error).message || 'Erreur de chargement' });
    } finally {
      setLoading(false);
    }
  }, [search, kind]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    storesApi.list().then((res) => {
      const list = (res.data.stores as StoreLite[]) || [];
      setStores(list);
    }).catch(() => setStores([]));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShoppingBag className="h-6 w-6 text-orange-600" />
            Marketplace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisis un produit digital et ajoute-le à ta boutique en un clic.
            <span className="ml-1 font-medium text-foreground">
              Tu ne paies rien maintenant.
            </span>{' '}
            Le prix de gros ne sera prélevé qu'à ta première vente.
          </p>
        </div>
        <Link
          href="/dashboard/marketplace/acquired"
          className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:underline"
        >
          Mes produits acquis
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {message && (
        <div
          className={cn(
            'rounded-md border p-3 text-sm',
            message.tone === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
          )}
        >
          {message.text}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher un produit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as MarketplaceDigitalKind | '')}
        >
          <option value="">Tous types</option>
          {(Object.keys(KIND_LABELS) as MarketplaceDigitalKind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {/* Grille produits */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card className="py-16 text-center">
          <Package className="mx-auto mb-2 h-10 w-10 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Aucun produit disponible pour le moment.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((p) => (
            <Card
              key={p._id}
              className="overflow-hidden transition hover:border-orange-500/50 hover:shadow-md"
            >
              <div className="aspect-video w-full overflow-hidden bg-muted">
                {p.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverImage} alt={p.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-10 w-10 text-muted-foreground opacity-40" />
                  </div>
                )}
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-orange-700 dark:text-orange-300">
                    {KIND_LABELS[p.digitalKind]}
                  </span>
                  {p.category && (
                    <span className="text-xs text-muted-foreground">· {p.category}</span>
                  )}
                </div>
                <CardTitle className="mt-1 line-clamp-2 text-base">{p.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                )}
                <div className="flex items-end justify-between border-t pt-3">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Prix de gros</div>
                    <div className="text-lg font-semibold">
                      {p.wholesalePrice} <span className="text-xs">{p.currency}</span>
                    </div>
                    {p.suggestedRetailPrice && (
                      <div className="text-[11px] text-muted-foreground">
                        Retail suggéré : {p.suggestedRetailPrice} {p.currency}
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={() => setSelected(p)}>
                    Ajouter
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <AcquireDialog
          product={selected}
          stores={stores}
          onClose={() => setSelected(null)}
          onDone={(msg) => {
            setSelected(null);
            setMessage(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

interface AcquireDialogProps {
  product: MarketplaceProduct;
  stores: StoreLite[];
  onClose: () => void;
  onDone: (msg: { tone: 'ok' | 'err'; text: string }) => void;
}

function AcquireDialog({ product, stores, onClose, onDone }: AcquireDialogProps) {
  const [storeId, setStoreId] = useState<string>(stores[0]?._id || '');
  const [retailPrice, setRetailPrice] = useState<string>(
    product.suggestedRetailPrice ? String(product.suggestedRetailPrice) : '',
  );
  const [publishNow, setPublishNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!storeId) {
      setError('Sélectionne une boutique');
      return;
    }
    const rp = Number(retailPrice);
    if (!Number.isFinite(rp) || rp < 0) {
      setError('Prix de vente invalide');
      return;
    }
    setSaving(true);
    try {
      await marketplaceApi.acquire(storeId, {
        marketplaceProductId: product._id,
        retailPrice: rp,
        publishNow,
      });
      onDone({ tone: 'ok', text: `« ${product.title} » ajouté à ta boutique.` });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || (e as Error).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  const rp = Number(retailPrice);
  const margin = Number.isFinite(rp) && rp > 0 ? rp - product.wholesalePrice : 0;
  const commission = Number.isFinite(rp) ? rp * 0.15 : 0;
  const firstSaleNet = Number.isFinite(rp) ? rp - commission - product.wholesalePrice : 0;
  const nextSalesNet = Number.isFinite(rp) ? rp - commission : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title="Ajouter à ma boutique"
          description={product.title}
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="store">Boutique</Label>
            {stores.length === 0 ? (
              <p className="mt-1 text-sm text-rose-600">
                Tu n&apos;as pas encore de boutique. Crée-en une d&apos;abord.
              </p>
            ) : (
              <select
                id="store"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <Label htmlFor="retailPrice">Ton prix de vente ({product.currency})</Label>
            <Input
              id="retailPrice"
              type="number"
              min="0"
              step="0.01"
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value)}
              placeholder={String(product.suggestedRetailPrice ?? product.wholesalePrice * 2)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Tu pourras le modifier à tout moment depuis ta boutique.
            </p>
          </div>

          {/* Simulateur de marge */}
          {Number.isFinite(rp) && rp > 0 && (
            <div className="rounded-md border border-orange-500/20 bg-orange-50/40 p-3 dark:bg-orange-950/20">
              <div className="mb-2 flex items-center gap-1 text-xs font-medium text-orange-700 dark:text-orange-300">
                <Info className="h-3.5 w-3.5" /> Simulation
              </div>
              <div className="space-y-1 text-xs">
                <Row label="Ton prix de vente" value={`${rp.toFixed(2)} ${product.currency}`} />
                <Row label="Commission plateforme (15%)" value={`-${commission.toFixed(2)}`} tone="warn" />
                <Row
                  label="Prix de gros (1x seulement)"
                  value={`-${product.wholesalePrice.toFixed(2)}`}
                  tone="warn"
                />
                <div className="border-t pt-1">
                  <Row
                    label="Net sur la 1re vente"
                    value={`${firstSaleNet.toFixed(2)} ${product.currency}`}
                    tone={firstSaleNet >= 0 ? 'ok' : 'err'}
                    strong
                  />
                  <Row
                    label="Net sur les ventes suivantes"
                    value={`${nextSalesNet.toFixed(2)} ${product.currency}`}
                    tone="ok"
                    strong
                  />
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publishNow}
              onChange={(e) => setPublishNow(e.target.checked)}
            />
            Publier immédiatement dans la boutique
          </label>

          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={saving || stores.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ajouter à ma boutique
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'err';
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between',
        strong && 'font-semibold',
        tone === 'ok' && 'text-emerald-700 dark:text-emerald-300',
        tone === 'warn' && 'text-orange-700 dark:text-orange-300',
        tone === 'err' && 'text-rose-700 dark:text-rose-300',
      )}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
