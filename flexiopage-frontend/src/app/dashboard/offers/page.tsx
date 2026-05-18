'use client';

/**
 * Offres & bundles — per-product offer editor. Three offer types, all
 * stored on the product document:
 *   • Bundle (quantity tiers + visual design)
 *   • Upsell (suggested add-on with optional discount)
 *   • Cross-sell (related products on the page)
 *
 * Each product is one expandable card with the 3 sections inside.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  storesApi,
  type ProductBundle,
  type ProductBundleTier,
  type ProductBundleStyle,
  type RelatedOffer,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, mediaUrl } from '@/lib/utils';
import {
  Layers, Loader2, Plus, Trash2, Save, Check,
  ArrowUpRight, Sparkles, ChevronDown, Palette,
  LayoutGrid, List, Rows,
  Star,
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
  upsells?: RelatedOffer[];
  crossSells?: RelatedOffer[];
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
    <div className="space-y-6">
      <PageHeader
        icon={Layers}
        title="Offres & bundles"
        description="Bundle quantité, upsell et cross-sell — tout par produit. Le storefront applique immédiatement."
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

      {/* Help strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <HelpChip icon={<Layers className="h-4 w-4" />} title="Bundle" desc="Paliers de quantité, ex: 2 = −15%." tone="indigo" />
        <HelpChip icon={<ArrowUpRight className="h-4 w-4" />} title="Upsell" desc="Suggestion juste avant la commande." tone="fuchsia" />
        <HelpChip icon={<Sparkles className="h-4 w-4" />} title="Cross-sell" desc="Produits complémentaires en bas de page." tone="emerald" />
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
            <ProductOfferCard
              key={p._id}
              storeId={storeId || ''}
              product={p}
              currency={currency}
              allProducts={products}
              onSaved={loadProducts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HelpChip({
  icon, title, desc, tone,
}: { icon: React.ReactNode; title: string; desc: string; tone: 'indigo' | 'fuchsia' | 'emerald' }) {
  const toneMap = {
    indigo:  'border-indigo-500/20 from-indigo-500/5 text-indigo-700 bg-indigo-500/10',
    fuchsia: 'border-fuchsia-500/20 from-fuchsia-500/5 text-fuchsia-700 bg-fuchsia-500/10',
    emerald: 'border-emerald-500/20 from-emerald-500/5 text-emerald-700 bg-emerald-500/10',
  };
  const cls = toneMap[tone].split(/\s+/);
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border bg-gradient-to-br to-card p-3', cls[0], cls[1])}>
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', cls[3], cls[2])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-product offer card with 3 inner tabs
// ─────────────────────────────────────────────────────────────────────

type OfferTab = 'bundle' | 'upsell' | 'crossSell';

function emptyTier(): ProductBundleTier {
  return { quantity: 2, totalPrice: 0, label: '' };
}

function ProductOfferCard({
  storeId,
  product,
  currency,
  allProducts,
  onSaved,
}: {
  storeId: string;
  product: ProductLite;
  currency: string;
  allProducts: ProductLite[];
  onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<OfferTab>('bundle');
  const tierCount = (product.bundle?.tiers || []).filter((t) => t.quantity >= 2 && t.totalPrice > 0).length;
  const upsellCount = product.upsells?.length || 0;
  const crossCount = product.crossSells?.length || 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/30"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {product.images?.[0] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={mediaUrl(product.images[0]) || product.images[0]} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{product.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">{product.price} {currency}</span>
            {product.bundle?.enabled && tierCount > 0 && (
              <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 font-semibold text-indigo-700">
                Bundle · {tierCount}
              </span>
            )}
            {upsellCount > 0 && (
              <span className="rounded-md bg-fuchsia-500/10 px-1.5 py-0.5 font-semibold text-fuchsia-700">
                Upsell · {upsellCount}
              </span>
            )}
            {crossCount > 0 && (
              <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-700">
                Cross · {crossCount}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border/60">
          {/* Inner tabs */}
          <div className="flex gap-1 border-b border-border/60 bg-muted/20 px-3 pt-2">
            <InnerTab active={tab === 'bundle'}    onClick={() => setTab('bundle')}    icon={<Layers className="h-3.5 w-3.5" />} label="Bundle" count={tierCount} />
            <InnerTab active={tab === 'upsell'}    onClick={() => setTab('upsell')}    icon={<ArrowUpRight className="h-3.5 w-3.5" />} label="Upsell" count={upsellCount} />
            <InnerTab active={tab === 'crossSell'} onClick={() => setTab('crossSell')} icon={<Sparkles className="h-3.5 w-3.5" />} label="Cross-sell" count={crossCount} />
          </div>

          <div className="p-4">
            {tab === 'bundle' && (
              <BundleEditor
                storeId={storeId}
                product={product}
                currency={currency}
                onSaved={onSaved}
              />
            )}
            {tab === 'upsell' && (
              <RelatedOfferEditor
                kind="upsells"
                storeId={storeId}
                product={product}
                currency={currency}
                allProducts={allProducts}
                onSaved={onSaved}
              />
            )}
            {tab === 'crossSell' && (
              <RelatedOfferEditor
                kind="crossSells"
                storeId={storeId}
                product={product}
                currency={currency}
                allProducts={allProducts}
                onSaved={onSaved}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InnerTab({
  active, onClick, icon, label, count,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold', active ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bundle editor — tiers + style
// ─────────────────────────────────────────────────────────────────────

function BundleEditor({
  storeId, product, currency, onSaved,
}: {
  storeId: string;
  product: ProductLite;
  currency: string;
  onSaved: () => void | Promise<void>;
}) {
  const [enabled, setEnabled] = useState(!!product.bundle?.enabled);
  const [title, setTitle] = useState(product.bundle?.title || '');
  const [tiers, setTiers] = useState<ProductBundleTier[]>(
    product.bundle?.tiers?.length ? product.bundle.tiers : [emptyTier()]
  );
  const [style, setStyle] = useState<ProductBundleStyle>({
    layout: 'list',
    showSavings: true,
    ...product.bundle?.style,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

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
        bundle: {
          enabled,
          title: title.trim() || undefined,
          tiers: cleanTiers,
          style,
        },
      });
      product.bundle = { enabled, title: title.trim() || undefined, tiers: cleanTiers, style };
      setTiers(cleanTiers.length ? cleanTiers : [emptyTier()]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
      await onSaved();
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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ── LEFT — form ─────────────────────────────────────────── */}
      <div className="space-y-5">
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
            <Label htmlFor={`title-${product._id}`}>Titre du bloc</Label>
            <Input
              id={`title-${product._id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Offre spéciale — économise en achetant plus"
            />
          </div>

          <div className="space-y-4">
            {/* TIERS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Paliers de quantité</Label>
                <Button type="button" size="sm" variant="outline" onClick={addTier} className="h-8 gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Palier
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                1 pièce = {product.price} {currency} (base). Définis le prix TOTAL par quantité.
              </p>
              <div className="space-y-2">
                {tiers.map((t, i) => {
                  const unit = t.quantity > 0 ? Number(t.totalPrice) / t.quantity : 0;
                  const save =
                    t.quantity > 1 && product.price > 0
                      ? Math.round((1 - Number(t.totalPrice) / (product.price * t.quantity)) * 100)
                      : 0;
                  const isHighlighted = style.highlightQuantity === t.quantity;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'grid grid-cols-[1fr_1fr_1fr_auto_auto] items-end gap-2 rounded-lg border p-2.5',
                        isHighlighted ? 'border-amber-500/50 bg-amber-500/5' : 'border-border/60 bg-muted/20'
                      )}
                    >
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">Quantité</span>
                        <Input type="number" min={2} value={t.quantity}
                          onChange={(e) => updateTier(i, { quantity: parseInt(e.target.value, 10) || 0 })}
                          className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">Prix total ({currency})</span>
                        <Input type="number" min={0} step="0.01" value={t.totalPrice}
                          onChange={(e) => updateTier(i, { totalPrice: parseFloat(e.target.value) || 0 })}
                          className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">Badge</span>
                        <Input value={t.label || ''}
                          onChange={(e) => updateTier(i, { label: e.target.value })}
                          placeholder="−15%" className="h-9" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setStyle({ ...style, highlightQuantity: isHighlighted ? undefined : t.quantity })}
                        className={cn(
                          'grid h-9 w-9 place-items-center rounded-md transition-colors',
                          isHighlighted
                            ? 'bg-amber-500/20 text-amber-700'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                        title={isHighlighted ? 'Plus mis en avant' : 'Mettre en avant comme "le plus populaire"'}
                      >
                        <Star className={cn('h-4 w-4', isHighlighted && 'fill-current')} />
                      </button>
                      <button type="button" onClick={() => removeTier(i)}
                        className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <p className="col-span-5 text-[11px] text-muted-foreground">
                        {t.quantity > 0 && Number(t.totalPrice) > 0
                          ? `${unit.toFixed(2)} ${currency} / pièce${save > 0 ? ` · économie ${save}%` : ''}${isHighlighted ? ' · ⭐ Mis en avant' : ''}`
                          : 'Renseigne quantité + prix total.'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* STYLE EDITOR */}
            <div className="space-y-3 rounded-xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/5 to-card p-3">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-fuchsia-800">
                <Palette className="h-3.5 w-3.5" />
                Design du bloc
              </div>

              {/* Layout picker */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Disposition</Label>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { v: 'list',    icon: List,        label: 'Liste' },
                    { v: 'grid',    icon: LayoutGrid,  label: 'Grille' },
                    { v: 'compact', icon: Rows,        label: 'Compact' },
                  ] as const).map((opt) => {
                    const Active = opt.icon;
                    const isActive = (style.layout || 'list') === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setStyle({ ...style, layout: opt.v })}
                        className={cn(
                          'flex flex-col items-center gap-0.5 rounded-md border p-1.5 text-[10px] font-medium transition-all',
                          isActive
                            ? 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-800'
                            : 'border-border/60 text-muted-foreground hover:border-fuchsia-500/40'
                        )}
                      >
                        <Active className="h-3.5 w-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <ColorPickerRow
                label="Couleur d'accent"
                value={style.accentColor}
                onChange={(c) => setStyle({ ...style, accentColor: c })}
                placeholder="Thème"
              />
              <ColorPickerRow
                label="Couleur du badge"
                value={style.badgeColor}
                onChange={(c) => setStyle({ ...style, badgeColor: c })}
                placeholder="Accent"
              />

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={style.showSavings !== false}
                  onChange={(e) => setStyle({ ...style, showSavings: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-input"
                />
                Afficher l&apos;économie en %
              </label>
            </div>
          </div>
        </>
      )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer le bundle
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Enregistré
            </span>
          )}
        </div>
      </div>

      {/* ── RIGHT — live preview (sticky on desktop) ───────────── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <BundleLivePreview
          enabled={enabled}
          title={title}
          tiers={tiers}
          style={style}
          basePrice={product.price}
          productName={product.name}
          currency={currency}
        />
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Live preview — mirrors what the storefront cod-order-form will render
// ─────────────────────────────────────────────────────────────────────

function BundleLivePreview({
  enabled,
  title,
  tiers,
  style,
  basePrice,
  productName,
  currency,
}: {
  enabled: boolean;
  title: string;
  tiers: ProductBundleTier[];
  style: ProductBundleStyle;
  basePrice: number;
  productName: string;
  currency: string;
}) {
  // Same cleanup the save path uses, so the preview shows the actual final tiers.
  const cleanTiers = tiers
    .map((t) => ({
      quantity: Math.max(2, Math.floor(Number(t.quantity) || 0)),
      totalPrice: Math.max(0, Number(t.totalPrice) || 0),
      label: t.label?.trim() || undefined,
    }))
    .filter((t) => t.quantity >= 2 && t.totalPrice > 0)
    .sort((a, b) => a.quantity - b.quantity);

  // Always show "1 pièce" as the first row (base price) — mirrors storefront.
  const allOptions = [
    { quantity: 1, totalPrice: basePrice, label: undefined as string | undefined },
    ...cleanTiers,
  ];

  const accent = style.accentColor || '#7c3aed';
  const badge = style.badgeColor || accent;
  const showSavings = style.showSavings !== false;
  const highlight = style.highlightQuantity;
  const layout = style.layout || 'list';

  // Pre-select the highlighted tier (if any) so the seller sees how it'll
  // look when the buyer arrives, otherwise pick the largest tier as a
  // "good default" — matches storefront behaviour.
  const defaultSelected = highlight && cleanTiers.some((t) => t.quantity === highlight)
    ? highlight
    : (cleanTiers[cleanTiers.length - 1]?.quantity || 1);
  const [selected, setSelected] = useState<number>(defaultSelected);
  // Reset selection when the underlying tiers change (avoids a stale qty
  // pointing at a tier the seller just deleted).
  useEffect(() => { setSelected(defaultSelected); }, [defaultSelected]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Layers className="h-3 w-3" />
          Aperçu temps réel
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
          style={{ backgroundColor: enabled ? '#10b98118' : '#9ca3af18', color: enabled ? '#047857' : '#6b7280' }}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'bg-emerald-500' : 'bg-slate-400')} />
          {enabled ? 'Actif' : 'Désactivé'}
        </span>
      </div>

      {!enabled ? (
        <div className="grid place-items-center px-3 py-10 text-center">
          <Layers className="h-6 w-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs font-medium text-muted-foreground">Bundle désactivé</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
            Active-le à gauche pour voir l&apos;aperçu.
          </p>
        </div>
      ) : (
        <div className="space-y-3 p-3" style={{ ['--accent' as string]: accent }}>
          {/* Mini product header — gives the seller context */}
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
            <div className="h-7 w-7 shrink-0 rounded-md bg-muted" />
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold">{productName || 'Mon produit'}</div>
              <div className="text-[9px] text-muted-foreground">{basePrice.toFixed(2)} {currency} / pièce</div>
            </div>
          </div>

          <div className="text-[11px] font-bold leading-tight" style={{ color: '#0f172a' }}>
            {title || 'Offre spéciale — économise en achetant plus'}
          </div>

          {/* Render — list / grid / compact */}
          {cleanTiers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-6 text-center text-[10px] text-muted-foreground">
              Ajoute au moins un palier pour voir l&apos;aperçu.
            </div>
          ) : layout === 'list' ? (
            <div className="space-y-1.5">
              {allOptions.map((opt) => (
                <PreviewRow
                  key={opt.quantity}
                  opt={opt}
                  basePrice={basePrice}
                  currency={currency}
                  selected={selected === opt.quantity}
                  highlighted={highlight === opt.quantity}
                  accent={accent}
                  badge={badge}
                  showSavings={showSavings}
                  onSelect={() => setSelected(opt.quantity)}
                />
              ))}
            </div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-2 gap-1.5">
              {allOptions.map((opt) => (
                <PreviewTile
                  key={opt.quantity}
                  opt={opt}
                  basePrice={basePrice}
                  currency={currency}
                  selected={selected === opt.quantity}
                  highlighted={highlight === opt.quantity}
                  accent={accent}
                  badge={badge}
                  showSavings={showSavings}
                  onSelect={() => setSelected(opt.quantity)}
                />
              ))}
            </div>
          ) : (
            // compact — single row of tab-like buttons
            <div className="flex flex-wrap gap-1.5">
              {allOptions.map((opt) => (
                <PreviewChip
                  key={opt.quantity}
                  opt={opt}
                  basePrice={basePrice}
                  currency={currency}
                  selected={selected === opt.quantity}
                  highlighted={highlight === opt.quantity}
                  accent={accent}
                  badge={badge}
                  showSavings={showSavings}
                  onSelect={() => setSelected(opt.quantity)}
                />
              ))}
            </div>
          )}

          {/* Mock CTA — gives the seller a sense of the full flow */}
          {cleanTiers.length > 0 && (
            <div className="mt-3 border-t border-border/40 pt-3">
              {(() => {
                const sel = allOptions.find((o) => o.quantity === selected) || allOptions[0];
                return (
                  <button
                    type="button"
                    className="inline-flex h-10 w-full items-center justify-center rounded-full px-3 text-[11px] font-bold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    Commander · {sel.totalPrice.toFixed(2)} {currency}
                  </button>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PreviewProps {
  opt: { quantity: number; totalPrice: number; label?: string };
  basePrice: number;
  currency: string;
  selected: boolean;
  highlighted: boolean;
  accent: string;
  badge: string;
  showSavings: boolean;
  onSelect: () => void;
}

function savingsPct(opt: PreviewProps['opt'], basePrice: number): number {
  if (opt.quantity <= 1 || basePrice <= 0) return 0;
  return Math.round((1 - opt.totalPrice / (basePrice * opt.quantity)) * 100);
}

function PreviewRow({ opt, basePrice, currency, selected, highlighted, accent, badge, showSavings, onSelect }: PreviewProps) {
  const unit = opt.totalPrice / opt.quantity;
  const save = savingsPct(opt, basePrice);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] transition-all"
      style={{
        border: `${selected ? 2 : 1}px solid ${selected ? accent : highlighted ? '#f59e0b' : '#e5e7eb'}`,
        backgroundColor: selected ? `${accent}10` : highlighted ? '#fef3c715' : '#ffffff',
      }}
    >
      {highlighted && (
        <span className="absolute -top-1.5 left-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-950">
          ⭐ Populaire
        </span>
      )}
      <span
        className="grid h-4 w-4 shrink-0 place-items-center rounded-full"
        style={{ border: `1px solid ${selected ? accent : '#cbd5e1'}`, backgroundColor: selected ? accent : 'transparent' }}
      >
        {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1">
          <span className="font-semibold">
            {opt.quantity} {opt.quantity > 1 ? 'pièces' : 'pièce'}
          </span>
          {opt.label && (
            <span
              className="rounded-full px-1 py-px text-[8px] font-bold"
              style={{ backgroundColor: badge, color: '#fff' }}
            >
              {opt.label}
            </span>
          )}
          {!opt.label && showSavings && save > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-1 py-px text-[8px] font-bold text-emerald-700">
              −{save}%
            </span>
          )}
        </span>
        <span className="block text-[9px] text-muted-foreground">
          {unit.toFixed(2)} {currency} / pièce
        </span>
      </span>
      <span className="shrink-0 text-[11px] font-extrabold" style={{ color: accent }}>
        {opt.totalPrice.toFixed(2)} {currency}
      </span>
    </button>
  );
}

function PreviewTile({ opt, basePrice, currency, selected, highlighted, accent, badge, showSavings, onSelect }: PreviewProps) {
  const unit = opt.totalPrice / opt.quantity;
  const save = savingsPct(opt, basePrice);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative flex flex-col items-center gap-1 rounded-lg p-2 text-center transition-all"
      style={{
        border: `${selected ? 2 : 1}px solid ${selected ? accent : highlighted ? '#f59e0b' : '#e5e7eb'}`,
        backgroundColor: selected ? `${accent}10` : highlighted ? '#fef3c715' : '#ffffff',
      }}
    >
      {highlighted && (
        <span className="absolute -top-1.5 right-1.5 rounded-full bg-amber-400 px-1 py-px text-[7px] font-bold text-amber-950">
          ⭐
        </span>
      )}
      <span className="text-[10px] font-bold">
        {opt.quantity} {opt.quantity > 1 ? 'pcs' : 'pc'}
      </span>
      <span className="text-[12px] font-extrabold" style={{ color: accent }}>
        {opt.totalPrice.toFixed(2)}
      </span>
      <span className="text-[8px] text-muted-foreground">
        {unit.toFixed(2)} {currency}/pc
      </span>
      {opt.label ? (
        <span
          className="rounded-full px-1 py-px text-[8px] font-bold"
          style={{ backgroundColor: badge, color: '#fff' }}
        >
          {opt.label}
        </span>
      ) : showSavings && save > 0 ? (
        <span className="rounded-full bg-emerald-500/15 px-1 py-px text-[8px] font-bold text-emerald-700">
          −{save}%
        </span>
      ) : null}
    </button>
  );
}

function PreviewChip({ opt, basePrice, currency, selected, highlighted, accent, badge, showSavings, onSelect }: PreviewProps) {
  const save = savingsPct(opt, basePrice);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all"
      style={{
        border: `${selected ? 2 : 1}px solid ${selected ? accent : highlighted ? '#f59e0b' : '#e5e7eb'}`,
        backgroundColor: selected ? `${accent}15` : '#ffffff',
        color: selected ? accent : '#0f172a',
      }}
    >
      <span className="font-semibold">{opt.quantity}× = {opt.totalPrice.toFixed(0)} {currency}</span>
      {opt.label ? (
        <span
          className="rounded-full px-1 text-[8px] font-bold"
          style={{ backgroundColor: badge, color: '#fff' }}
        >
          {opt.label}
        </span>
      ) : showSavings && save > 0 ? (
        <span className="rounded-full bg-emerald-500/15 px-1 text-[8px] font-bold text-emerald-700">
          −{save}%
        </span>
      ) : null}
    </button>
  );
}

function ColorPickerRow({
  label, value, onChange, placeholder,
}: { label: string; value?: string; onChange: (v: string | undefined) => void; placeholder: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value || '#7c3aed'}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-border/60 bg-background p-0"
        />
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={placeholder}
          className="h-7 flex-1 text-[11px] font-mono"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          >
            reset
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Upsell / Cross-sell editor — pick from store products + optional discount
// ─────────────────────────────────────────────────────────────────────

function RelatedOfferEditor({
  kind,
  storeId,
  product,
  currency,
  allProducts,
  onSaved,
}: {
  kind: 'upsells' | 'crossSells';
  storeId: string;
  product: ProductLite;
  currency: string;
  allProducts: ProductLite[];
  onSaved: () => void | Promise<void>;
}) {
  const initial = (kind === 'upsells' ? product.upsells : product.crossSells) || [];
  const [items, setItems] = useState<RelatedOffer[]>(initial);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const candidates = allProducts.filter(
    (p) => p._id !== product._id && !items.some((it) => it.productId === p._id),
  );

  function addItem(p: ProductLite) {
    setItems((list) => [...list, { productId: p._id, order: list.length }]);
    setAdding(false);
  }
  function updateItem(i: number, patch: Partial<RelatedOffer>) {
    setItems((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeItem(i: number) {
    setItems((list) => list.filter((_, idx) => idx !== i));
  }
  function moveItem(i: number, dir: -1 | 1) {
    setItems((list) => {
      const next = list.slice();
      const swap = i + dir;
      if (swap < 0 || swap >= next.length) return list;
      [next[i], next[swap]] = [next[swap], next[i]];
      return next.map((it, idx) => ({ ...it, order: idx }));
    });
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await storesApi.updateProduct(storeId, product._id, { [kind]: items });
      if (kind === 'upsells') product.upsells = items;
      else product.crossSells = items;
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
      await onSaved();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : (err as Error)?.message;
      setError(msg || 'L’enregistrement a échoué.');
    } finally {
      setSaving(false);
    }
  }

  const ctaLabel = kind === 'upsells' ? "Suggestions d'upsell" : 'Produits complémentaires (cross-sell)';
  const ctaHelp = kind === 'upsells'
    ? 'Ces produits sont proposés sur la page produit comme « Ajoute aussi… ». Une remise optionnelle peut être appliquée au moment de la commande.'
    : 'Ces produits sont affichés en bas de page comme « Vous aimerez aussi » — pas de remise automatique, juste de la suggestion.';

  return (
    <div className="space-y-4">
      <div>
        <Label>{ctaLabel}</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{ctaHelp}</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Aucun produit ajouté.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => {
            const target = allProducts.find((p) => p._id === it.productId);
            const finalPrice = target && typeof it.discountPct === 'number'
              ? target.price * (1 - it.discountPct / 100)
              : target?.price;
            return (
              <div key={it.productId} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  {target?.images?.[0] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={mediaUrl(target.images[0]) || target.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{target?.name || '— Produit introuvable'}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {target?.price.toFixed(2)} {currency}
                    {typeof it.discountPct === 'number' && it.discountPct > 0 && finalPrice && (
                      <span className="ml-2 font-semibold text-emerald-700">
                        → {finalPrice.toFixed(2)} {currency} (−{it.discountPct}%)
                      </span>
                    )}
                  </div>
                </div>
                <Input
                  value={it.label || ''}
                  onChange={(e) => updateItem(i, { label: e.target.value })}
                  placeholder="Label (optionnel)"
                  className="h-8 w-36 text-xs"
                />
                {kind === 'upsells' && (
                  <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5">
                    <span className="text-[10px] text-muted-foreground">−</span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={it.discountPct ?? ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        updateItem(i, { discountPct: Number.isFinite(v) && v > 0 && v < 100 ? v : undefined });
                      }}
                      placeholder="0"
                      className="h-7 w-10 bg-transparent text-center text-xs outline-none"
                    />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                )}
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0}
                    className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                    title="Monter">↑</button>
                  <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}
                    className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                    title="Descendre">↓</button>
                  <button type="button" onClick={() => removeItem(i)}
                    className="grid h-7 w-7 place-items-center rounded text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add picker */}
      {adding ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">Tous les autres produits ont déjà été ajoutés.</p>
          ) : (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {candidates.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => addItem(p)}
                  className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-xs hover:bg-card"
                >
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
                    {p.images?.[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={mediaUrl(p.images[0]) || p.images[0]} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="text-[11px] text-muted-foreground">{p.price} {currency}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 text-right">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Ajouter un produit
        </Button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-3 border-t border-border/60 pt-3">
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
  );
}
