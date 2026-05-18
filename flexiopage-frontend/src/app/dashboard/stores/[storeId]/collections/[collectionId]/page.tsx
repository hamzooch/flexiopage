'use client';

/**
 * Collection editor — name, slug, image, description, publish + the
 * collection's content:
 *   - manual : multi-select product picker from the store's catalog
 *   - auto   : rule builder (any of tags + min/max price)
 *
 * Sticky right panel shows the live count of matching products and a
 * compact preview of the public collection page (banner + 4 first cards).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { FieldToggle } from '@/components/dashboard/store-editor';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import { storesApi, extractApiError } from '@/lib/api';
import { cn, mediaUrl } from '@/lib/utils';
import {
  Layers, Search, Check, Plus, X, Tag, ListChecks, Eye,
} from 'lucide-react';
import type { Collection, ProductLite } from '@/types/collection';

interface StoreLite {
  _id: string;
  name: string;
  slug: string;
  settings?: { currency?: string };
}

export default function CollectionEditorPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const collectionId = params.collectionId as string;

  const [store, setStore] = useState<StoreLite | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [allProducts, setAllProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // Search filter inside the manual product picker.
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeRes, colRes, prodRes] = await Promise.all([
        storesApi.get(storeId),
        storesApi.getCollection(storeId, collectionId),
        storesApi.listProducts(storeId),
      ]);
      setStore((storeRes.data as { store: StoreLite }).store);
      setCollection((colRes.data as { collection: Collection }).collection);
      setAllProducts((prodRes.data as { products: ProductLite[] }).products || []);
    } finally {
      setLoading(false);
    }
  }, [storeId, collectionId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    if (!collection) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const res = await storesApi.updateCollection(storeId, collectionId, {
        name: collection.name,
        description: collection.description,
        image: collection.image,
        type: collection.type,
        productIds: collection.productIds,
        rules: collection.rules,
        isPublished: collection.isPublished,
        seoTitle: collection.seoTitle,
        seoDescription: collection.seoDescription,
      });
      const updated = (res.data as { collection: Collection }).collection;
      setCollection(updated);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2200);
    } catch (err: unknown) {
      console.error('[collection/save] failed', err);
      setErrorMessage(extractApiError(err, 'Sauvegarde échouée.'));
      setStatus('error');
    }
  }

  if (loading || !store || !collection) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const update = <K extends keyof Collection>(key: K, value: Collection[K]) =>
    setCollection((c) => (c ? { ...c, [key]: value } : c));

  // Resolve which products are currently in the collection — manual reads from
  // productIds[], auto re-runs the rule filter client-side so the seller sees
  // matches update as they tweak. Real prod fetch happens server-side later.
  const matchingProducts = useMemo(() => resolveProducts(collection, allProducts), [collection, allProducts]);

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title={collection.name || 'Collection'}
      description={`Collection ${collection.type === 'auto' ? 'automatique' : 'manuelle'} — ${matchingProducts.length} produit${matchingProducts.length > 1 ? 's' : ''} matching.`}
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
      rightSlot={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push(`/dashboard/stores/${storeId}/collections`)}
        >
          Toutes les collections
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {/* Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Informations
              </CardTitle>
              <CardDescription>
                Le nom apparaît dans la navbar et en tête de la page collection. Le slug compose l&apos;URL publique.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="col-name">Nom *</Label>
                  <Input
                    id="col-name"
                    value={collection.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="Bestsellers"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="col-slug">URL publique</Label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-sm">
                    <span className="text-muted-foreground">/c/</span>
                    <span className="truncate">{collection.slug}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Auto-généré depuis le nom à la création.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="col-desc">Description (optionnel)</Label>
                <textarea
                  id="col-desc"
                  value={collection.description || ''}
                  onChange={(e) => update('description', e.target.value)}
                  rows={3}
                  placeholder="Texte d'intro affiché sous le titre de la collection."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="max-w-md">
                <MediaPicker
                  storeId={storeId}
                  value={collection.image}
                  onChange={(url) => update('image', url || '')}
                  label="Bannière de la collection (optionnel)"
                  shape="wide"
                  helper="1920×600 recommandé."
                />
              </div>
              <FieldToggle
                label="Collection publiée"
                sublabel="Visible sur la vitrine — décoche pour la garder en brouillon."
                checked={collection.isPublished}
                onChange={(v) => update('isPublished', v)}
              />
            </CardContent>
          </Card>

          {/* Type switcher */}
          <Card>
            <CardHeader>
              <CardTitle>Comment remplir la collection ?</CardTitle>
              <CardDescription>
                Choix manuel = tu sélectionnes les produits un par un. Automatique = règles sur tags + prix.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { v: 'manual', label: 'Manuelle', icon: ListChecks, hint: 'Tu choisis exactement les produits affichés.' },
                  { v: 'auto',   label: 'Automatique', icon: Tag,     hint: 'Auto-remplie par règle (tags, fourchette de prix).' },
                ] as const).map((opt) => {
                  const Icon = opt.icon;
                  const active = collection.type === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => update('type', opt.v)}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                        active
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/10'
                          : 'border-border/60 hover:border-primary/40'
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                          active
                            ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          {opt.label}
                          {active && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{opt.hint}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Manual: product picker */}
          {collection.type === 'manual' && (
            <Card>
              <CardHeader>
                <CardTitle>Produits dans la collection</CardTitle>
                <CardDescription>
                  Coche les produits à inclure. L&apos;ordre d&apos;affichage suit l&apos;ordre de
                  sélection (premier coché = premier affiché).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filtrer par nom…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-10 pl-9"
                  />
                </div>
                <ManualProductPicker
                  products={allProducts}
                  selectedIds={collection.productIds}
                  onChange={(ids) => update('productIds', ids)}
                  search={search}
                  currency={store.settings?.currency || 'TND'}
                />
              </CardContent>
            </Card>
          )}

          {/* Auto: rule builder */}
          {collection.type === 'auto' && (
            <Card>
              <CardHeader>
                <CardTitle>Règles de filtrage</CardTitle>
                <CardDescription>
                  Tout produit qui matche TOUTES les règles actives sera inclus automatiquement.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AutoRulesEditor
                  rules={collection.rules || {}}
                  onChange={(rules) => update('rules', rules)}
                  currency={store.settings?.currency || 'TND'}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: live preview */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <CollectionLivePreview
            collection={collection}
            products={matchingProducts}
            storeName={store.name}
            currency={store.settings?.currency || 'TND'}
          />
        </aside>
      </div>
    </StoreSubPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Manual product picker — toggleable cards, preserves seller order
// ─────────────────────────────────────────────────────────────────────

function ManualProductPicker({
  products, selectedIds, onChange, search, currency,
}: {
  products: ProductLite[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  search: string;
  currency: string;
}) {
  const term = search.trim().toLowerCase();
  const selected = new Set(selectedIds);
  const filtered = term
    ? products.filter((p) => p.name.toLowerCase().includes(term))
    : products;

  function toggle(id: string) {
    if (selected.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Aucun produit dans le catalogue. <a className="text-primary hover:underline" href="../../products">Crée d&apos;abord un produit</a>.
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Aucun produit ne matche « {search} ».
      </div>
    );
  }

  return (
    <ul className="grid max-h-[500px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
      {filtered.map((p) => {
        const isOn = selected.has(p._id);
        const img = p.images?.[0];
        const index = selectedIds.indexOf(p._id);
        return (
          <li key={p._id}>
            <button
              type="button"
              onClick={() => toggle(p._id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-all',
                isOn
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border/60 hover:border-primary/40'
              )}
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                {img ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={mediaUrl(img)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">·</div>
                )}
                {isOn && (
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow">
                    {index + 1}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.price?.toFixed(2)} {currency}
                  {p.isPublished === false && (
                    <span className="ml-1.5 rounded bg-amber-500/15 px-1 text-[9px] font-semibold text-amber-700">
                      Brouillon
                    </span>
                  )}
                </div>
              </div>
              {isOn ? (
                <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded-md border border-dashed border-border/80 text-muted-foreground">
                  <Plus className="h-3 w-3" />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Auto-collection rule builder — anyTags (chip input) + min/max price
// ─────────────────────────────────────────────────────────────────────

function AutoRulesEditor({
  rules, onChange, currency,
}: {
  rules: NonNullable<Collection['rules']>;
  onChange: (r: NonNullable<Collection['rules']>) => void;
  currency: string;
}) {
  const tags = rules.anyTags || [];
  const [newTag, setNewTag] = useState('');

  function addTag() {
    const v = newTag.trim().toLowerCase();
    if (!v) return;
    if (tags.includes(v)) { setNewTag(''); return; }
    onChange({ ...rules, anyTags: [...tags, v] });
    setNewTag('');
  }
  function removeTag(t: string) {
    onChange({ ...rules, anyTags: tags.filter((x) => x !== t) });
  }

  return (
    <div className="space-y-5">
      {/* Tags chip input */}
      <div className="space-y-1.5">
        <Label>Inclure les produits avec l&apos;un de ces tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="grid h-4 w-4 place-items-center rounded-full text-primary/70 hover:bg-primary/15 hover:text-primary"
                aria-label="Retirer"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <div className="inline-flex items-center gap-1.5">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="Ajouter un tag…"
              className="h-8 w-40 text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={addTag} className="h-8 gap-1">
              <Plus className="h-3 w-3" />
              Ajouter
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Les tags sont ajoutés sur la page de chaque produit. Match « au moins un » (OR).
        </p>
      </div>

      {/* Price range */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="min-price">Prix minimum ({currency})</Label>
          <Input
            id="min-price"
            type="number"
            min={0}
            step="0.01"
            value={rules.minPrice ?? ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onChange({ ...rules, minPrice: Number.isFinite(v) && v >= 0 ? v : undefined });
            }}
            placeholder="aucun"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max-price">Prix maximum ({currency})</Label>
          <Input
            id="max-price"
            type="number"
            min={0}
            step="0.01"
            value={rules.maxPrice ?? ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onChange({ ...rules, maxPrice: Number.isFinite(v) && v >= 0 ? v : undefined });
            }}
            placeholder="aucun"
            className="h-10"
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Live preview — mock of the public collection page
// ─────────────────────────────────────────────────────────────────────

function CollectionLivePreview({
  collection, products, storeName, currency,
}: {
  collection: Collection;
  products: ProductLite[];
  storeName: string;
  currency: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Eye className="h-3 w-3" />
          Aperçu temps réel
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
          {products.length} produit{products.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="bg-muted/20 p-3">
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          <div className="flex items-center gap-1 border-b border-border/40 bg-muted/30 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
            <span className="ml-2 truncate text-[9px] text-muted-foreground">
              /{storeName.toLowerCase().replace(/\s+/g, '')}/c/{collection.slug || 'slug'}
            </span>
          </div>

          {/* Banner */}
          <div
            className="relative px-3 py-4"
            style={
              collection.image
                ? { background: `linear-gradient(135deg, rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(${mediaUrl(collection.image)}) center/cover` }
                : { background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(236,72,153,0.08))' }
            }
          >
            <h2
              className={cn(
                'text-[14px] font-extrabold',
                collection.image ? 'text-white' : 'text-foreground'
              )}
            >
              {collection.name || 'Nom de la collection'}
            </h2>
            {collection.description && (
              <p
                className={cn(
                  'mt-1 line-clamp-2 text-[10px] leading-snug',
                  collection.image ? 'text-white/90' : 'text-muted-foreground'
                )}
              >
                {collection.description}
              </p>
            )}
          </div>

          {/* Products grid */}
          <div className="bg-muted/30 p-2">
            {products.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-[10px] text-muted-foreground">
                Aucun produit ne correspond — ajuste la sélection ou les règles.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {products.slice(0, 4).map((p, i) => (
                  <div key={p._id || i} className="overflow-hidden rounded border border-border/60 bg-card">
                    <div
                      className="aspect-square"
                      style={
                        p.images?.[0]
                          ? { background: `url(${mediaUrl(p.images[0])}) center/cover` }
                          : { background: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(236,72,153,0.08))' }
                      }
                    />
                    <div className="space-y-0.5 p-1.5">
                      <div className="truncate text-[9px] font-semibold">{p.name}</div>
                      <div className="text-[8px] font-extrabold text-primary">
                        {p.price?.toFixed(2)} {currency}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {products.length > 4 && (
              <div className="mt-1.5 text-center text-[9px] text-muted-foreground">
                + {products.length - 4} de plus
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-[9px] text-muted-foreground">
          Aperçu mock — la vraie page utilise le thème de ta boutique.
        </p>
      </div>
    </div>
  );
}

/** Mirror of the backend resolver — used to compute the live count without
 *  re-fetching for every keystroke in the rule editor. */
function resolveProducts(collection: Collection, all: ProductLite[]): ProductLite[] {
  if (collection.type === 'manual') {
    const order = new Map(collection.productIds.map((id, i) => [id, i]));
    const idSet = new Set(collection.productIds);
    return all
      .filter((p) => idSet.has(p._id))
      .sort((a, b) => (order.get(a._id) ?? 0) - (order.get(b._id) ?? 0));
  }
  // Auto
  const rules = collection.rules || {};
  return all.filter((p) => {
    if (rules.publishedOnly !== false && p.isPublished === false) return false;
    if (rules.anyTags && rules.anyTags.length > 0) {
      const productTags = (p.tags || []).map((t) => t.toLowerCase());
      if (!rules.anyTags.some((t) => productTags.includes(t.toLowerCase()))) return false;
    }
    if (typeof rules.minPrice === 'number' && p.price < rules.minPrice) return false;
    if (typeof rules.maxPrice === 'number' && p.price > rules.maxPrice) return false;
    return true;
  });
}
