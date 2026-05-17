'use client';

/**
 * Offres — the seller manages product offers here:
 *   • Bundle (live)      — quantity tiers per product ("buy 2 for X").
 *   • Upsell (soon)      — an offer shown after add-to-cart.
 *   • Cross-sell (soon)  — related products suggested on the product page.
 *
 * The bundle editor saves straight onto the product (product.bundle) so the
 * storefront product page + COD form pick it up immediately.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { storesApi, type ProductBundle, type ProductBundleTier } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Layers, Loader2, Plus, Trash2, Save, Check, ArrowUpRight, Sparkles, ChevronDown,
} from 'lucide-react';

interface StoreLite {
  _id: string;
  name: string;
  settings?: { currency?: string };
}
interface ProductLite {
  _id: string;
  name: string;
  price: number;
  images?: string[];
  bundle?: ProductBundle;
}

export default function OffersPage() {
  const searchParams = useSearchParams();
  const { storeId, setStoreId: setStoreIdScoped } = useScopedStoreId(searchParams.get('storeId'));
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);

  const setStoreId = (id: string) => setStoreIdScoped(id || null);

  useEffect(() => {
    storesApi.list()
      .then((res) => {
        const list = (res.data as { stores: StoreLite[] }).stores;
        setStores(list);
        if (!storeId && list.length > 0) setStoreId(list[0]._id);
      })
      .catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const loadProducts = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await storesApi.listProducts(storeId);
      setProducts((res.data as { products: ProductLite[] }).products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  const currency = stores.find((s) => s._id === storeId)?.settings?.currency || 'TND';

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Layers}
        title="Offres & bundles"
        description="Paliers de quantité — « 2 pièces = prix réduit ». Le prix s'ajuste sur la page produit."
        actions={stores.length > 1 ? (
          <select
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            value={storeId || ''}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        ) : undefined}
      />

      {/* Bundle — live */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg gradient-brand text-white shadow-md">
            <Layers className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Bundle — paliers de quantité</h2>
            <p className="text-xs text-muted-foreground">Active un bundle par produit et définis ses paliers.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid h-40 place-items-center rounded-2xl border border-border/60 bg-card">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center text-sm text-muted-foreground">
            Aucun produit dans cette boutique. Crée un produit d&apos;abord.
          </div>
        ) : (
          <div className="space-y-2.5">
            {products.map((p) => (
              <ProductBundleCard key={p._id} storeId={storeId || ''} product={p} currency={currency} />
            ))}
          </div>
        )}
      </section>

      {/* Upsell + Cross-sell — coming soon */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ComingSoon
          icon={<ArrowUpRight className="h-4 w-4" />}
          title="Upsell"
          description="Propose une meilleure offre juste après l'ajout au panier (ex: « ajoute 1 pièce, −20% »)."
        />
        <ComingSoon
          icon={<Sparkles className="h-4 w-4" />}
          title="Cross-sell"
          description="Suggère des produits complémentaires sur la page produit et au checkout."
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-product bundle editor
// ─────────────────────────────────────────────────────────────────────
function emptyTier(): ProductBundleTier {
  return { quantity: 2, totalPrice: 0, label: '' };
}

function ProductBundleCard({
  storeId,
  product,
  currency,
}: {
  storeId: string;
  product: ProductLite;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(!!product.bundle?.enabled);
  const [title, setTitle] = useState(product.bundle?.title || '');
  const [tiers, setTiers] = useState<ProductBundleTier[]>(
    product.bundle?.tiers?.length ? product.bundle.tiers : [emptyTier()]
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const tierCount = (product.bundle?.tiers || []).filter((t) => t.quantity >= 2 && t.totalPrice > 0).length;

  function updateTier(i: number, patch: Partial<ProductBundleTier>) {
    setTiers((list) => list.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addTier() {
    const maxQty = tiers.reduce((m, t) => Math.max(m, t.quantity), 1);
    setTiers((list) => [...list, { quantity: maxQty + 1, totalPrice: 0, label: '' }]);
  }
  function removeTier(i: number) {
    setTiers((list) => list.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setError('');
    const cleanTiers = tiers
      .map((t) => ({
        quantity: Math.max(2, Math.floor(Number(t.quantity) || 0)),
        totalPrice: Math.max(0, Number(t.totalPrice) || 0),
        label: t.label?.trim() || undefined,
      }))
      .filter((t) => t.quantity >= 2 && t.totalPrice > 0)
      .sort((a, b) => a.quantity - b.quantity);

    if (enabled && cleanTiers.length === 0) {
      setError('Ajoute au moins un palier valide (quantité ≥ 2 et prix > 0).');
      return;
    }
    setSaving(true);
    try {
      await storesApi.updateProduct(storeId, product._id, {
        bundle: { enabled, title: title.trim() || undefined, tiers: cleanTiers },
      });
      product.bundle = { enabled, title: title.trim() || undefined, tiers: cleanTiers };
      setTiers(cleanTiers.length ? cleanTiers : [emptyTier()]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : (err as Error)?.message;
      setError(msg || 'L’enregistrement a échoué.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      {/* Row header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/30"
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
          {product.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{product.name}</div>
          <div className="text-xs text-muted-foreground">
            {product.price} {currency} ·{' '}
            {product.bundle?.enabled && tierCount > 0 ? (
              <span className="font-medium text-emerald-600">
                Bundle actif — {tierCount} palier{tierCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span>Aucun bundle</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Editor */}
      {open && (
        <div className="space-y-4 border-t border-border/60 p-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm font-medium">Activer le bundle pour ce produit</span>
          </label>

          {enabled && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`title-${product._id}`}>Titre du bloc (optionnel)</Label>
                <Input
                  id={`title-${product._id}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Offre spéciale — économise en achetant plus"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Paliers de quantité</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addTier} className="h-8 gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Palier
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  1 pièce = {product.price} {currency} (prix de base). Définis le prix TOTAL pour chaque quantité.
                </p>
                <div className="space-y-2">
                  {tiers.map((t, i) => {
                    const unit = t.quantity > 0 ? Number(t.totalPrice) / t.quantity : 0;
                    const save =
                      t.quantity > 1 && product.price > 0
                        ? Math.round((1 - Number(t.totalPrice) / (product.price * t.quantity)) * 100)
                        : 0;
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5"
                      >
                        <div className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Quantité</span>
                          <Input
                            type="number"
                            min={2}
                            value={t.quantity}
                            onChange={(e) => updateTier(i, { quantity: parseInt(e.target.value, 10) || 0 })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Prix total ({currency})</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={t.totalPrice}
                            onChange={(e) => updateTier(i, { totalPrice: parseFloat(e.target.value) || 0 })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Badge (optionnel)</span>
                          <Input
                            value={t.label || ''}
                            onChange={(e) => updateTier(i, { label: e.target.value })}
                            placeholder="−15%"
                            className="h-9"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTier(i)}
                          className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                          aria-label="Supprimer le palier"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <p className="col-span-4 text-[11px] text-muted-foreground">
                          {t.quantity > 0 && Number(t.totalPrice) > 0
                            ? `${unit.toFixed(2)} ${currency} / pièce${save > 0 ? ` · le client économise ${save}%` : ''}`
                            : 'Renseigne quantité + prix total.'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Enregistré
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          Bientôt
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
