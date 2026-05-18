'use client';

/**
 * Coupon editor — all the fields not captured in the quick-create modal:
 * description, scope (all/products/collections), min purchase, max uses,
 * activation window, active toggle. Sticky right pane shows a sample
 * "applied to order" preview so the seller validates the math.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FieldToggle } from '@/components/dashboard/store-editor';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import { storesApi, extractApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  BadgePercent, Eye, Tag, Layers, Check, Plus, X, Globe,
} from 'lucide-react';
import type { Coupon, CouponScope } from '@/types/coupon';
import type { Collection } from '@/types/collection';
import type { ProductLite } from '@/types/collection';

interface StoreLite {
  _id: string;
  name: string;
  slug: string;
  settings?: { currency?: string };
}

export default function CouponEditorPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const couponId = params.couponId as string;

  const [store, setStore] = useState<StoreLite | null>(null);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeRes, couponRes, colRes, prodRes] = await Promise.all([
        storesApi.get(storeId),
        storesApi.getCoupon(storeId, couponId),
        storesApi.listCollections(storeId),
        storesApi.listProducts(storeId),
      ]);
      setStore((storeRes.data as { store: StoreLite }).store);
      setCoupon((couponRes.data as { coupon: Coupon }).coupon);
      setCollections((colRes.data as { collections: Collection[] }).collections || []);
      setProducts((prodRes.data as { products: ProductLite[] }).products || []);
    } finally {
      setLoading(false);
    }
  }, [storeId, couponId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    if (!coupon) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const res = await storesApi.updateCoupon(storeId, couponId, {
        description: coupon.description,
        type: coupon.type,
        value: coupon.value,
        minPurchase: coupon.minPurchase,
        maxUses: coupon.maxUses,
        startsAt: coupon.startsAt,
        expiresAt: coupon.expiresAt,
        isActive: coupon.isActive,
        appliesTo: coupon.appliesTo,
        productIds: coupon.productIds,
        collectionIds: coupon.collectionIds,
      });
      setCoupon((res.data as { coupon: Coupon }).coupon);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2200);
    } catch (err: unknown) {
      setErrorMessage(extractApiError(err, 'Sauvegarde échouée.'));
      setStatus('error');
    }
  }

  if (loading || !store || !coupon) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const update = <K extends keyof Coupon>(key: K, value: Coupon[K]) =>
    setCoupon((c) => (c ? { ...c, [key]: value } : c));

  const currency = store.settings?.currency || 'USD';

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title={coupon.code}
      description={`${coupon.usedCount} utilisation${coupon.usedCount > 1 ? 's' : ''}${
        coupon.maxUses ? ` / ${coupon.maxUses}` : ''
      }`}
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
      rightSlot={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push(`/dashboard/stores/${storeId}/coupons`)}
        >
          Tous les codes
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Discount */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BadgePercent className="h-4 w-4 text-primary" />
                Remise
              </CardTitle>
              <CardDescription>
                Le code, le type et la valeur de la remise. Code modifiable uniquement à la création.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-sm font-bold uppercase">
                    {coupon.code}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="value">Valeur *</Label>
                  <div className="relative">
                    <Input
                      id="value"
                      type="number"
                      min={0}
                      max={coupon.type === 'percent' ? 100 : undefined}
                      step="0.01"
                      value={coupon.value}
                      onChange={(e) => update('value', parseFloat(e.target.value) || 0)}
                      className="pr-12"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      {coupon.type === 'percent' ? '%' : currency}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { v: 'percent', label: 'Pourcentage', hint: 'Ex: 10 % de remise' },
                  { v: 'fixed',   label: 'Montant fixe', hint: `Ex: 5 ${currency} de remise` },
                ] as const).map((opt) => {
                  const active = coupon.type === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => update('type', opt.v)}
                      className={cn(
                        'rounded-lg border p-3 text-left text-sm transition-all',
                        active
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/10'
                          : 'border-border/60 hover:border-primary/40'
                      )}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        {opt.label}
                        {active && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="desc">Description interne (optionnel)</Label>
                <Input
                  id="desc"
                  value={coupon.description || ''}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Ex: campagne Instagram avril"
                />
                <p className="text-[11px] text-muted-foreground">
                  Visible uniquement dans le dashboard — utile pour distinguer plusieurs campagnes.
                </p>
              </div>

              <FieldToggle
                label="Code actif"
                sublabel="Désactive pour mettre le code en pause sans le supprimer."
                checked={coupon.isActive}
                onChange={(v) => update('isActive', v)}
              />
            </CardContent>
          </Card>

          {/* Conditions */}
          <Card>
            <CardHeader>
              <CardTitle>Conditions d&apos;utilisation</CardTitle>
              <CardDescription>
                Tu peux limiter le code à un panier minimum, un nombre d&apos;utilisations ou une fenêtre de dates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="min">Panier minimum ({currency})</Label>
                  <Input
                    id="min"
                    type="number"
                    min={0}
                    step="0.01"
                    value={coupon.minPurchase ?? ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      update('minPurchase', Number.isFinite(v) && v >= 0 ? v : undefined);
                    }}
                    placeholder="aucun"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="max">Nombre max d&apos;utilisations</Label>
                  <Input
                    id="max"
                    type="number"
                    min={1}
                    step="1"
                    value={coupon.maxUses ?? ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      update('maxUses', Number.isFinite(v) && v > 0 ? v : undefined);
                    }}
                    placeholder="illimité"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Déjà utilisé <strong>{coupon.usedCount}</strong> fois.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="start">Actif à partir du</Label>
                  <Input
                    id="start"
                    type="datetime-local"
                    value={coupon.startsAt ? new Date(coupon.startsAt).toISOString().slice(0, 16) : ''}
                    onChange={(e) => update('startsAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exp">Expire le</Label>
                  <Input
                    id="exp"
                    type="datetime-local"
                    value={coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : ''}
                    onChange={(e) => update('expiresAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scope */}
          <Card>
            <CardHeader>
              <CardTitle>Périmètre du code</CardTitle>
              <CardDescription>
                Restreins le code à certains produits ou à une collection. Par défaut il s&apos;applique à toute la boutique.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  { v: 'all',         label: 'Toute la boutique', icon: Globe,   hint: 'Tous les produits' },
                  { v: 'products',    label: 'Produits choisis',   icon: Tag,     hint: 'Liste de produits cible' },
                  { v: 'collections', label: 'Collections',        icon: Layers,  hint: 'Produits d\'une collection' },
                ] as const).map((opt) => {
                  const Icon = opt.icon;
                  const active = coupon.appliesTo === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => update('appliesTo', opt.v as CouponScope)}
                      className={cn(
                        'flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all',
                        active
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/10'
                          : 'border-border/60 hover:border-primary/40'
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-8 w-8 shrink-0 place-items-center rounded-md',
                          active
                            ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{opt.label}</div>
                        <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {coupon.appliesTo === 'products' && (
                <ScopePicker
                  label="Produits éligibles"
                  options={products.map((p) => ({ id: p._id, label: p.name }))}
                  selected={coupon.productIds || []}
                  onChange={(ids) => update('productIds', ids)}
                  emptyMessage="Aucun produit dans le catalogue."
                />
              )}

              {coupon.appliesTo === 'collections' && (
                <ScopePicker
                  label="Collections éligibles"
                  options={collections.map((c) => ({ id: c._id, label: c.name }))}
                  selected={coupon.collectionIds || []}
                  onChange={(ids) => update('collectionIds', ids)}
                  emptyMessage="Aucune collection — crée-la d'abord depuis le menu Collections."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right — preview */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <CouponPreview coupon={coupon} currency={currency} />
        </aside>
      </div>
    </StoreSubPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Generic multi-pick of products / collections — chip list when the
// scope is restricted.
// ─────────────────────────────────────────────────────────────────────

function ScopePicker({
  label, options, selected, onChange, emptyMessage,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyMessage: string;
}) {
  const selectedSet = new Set(selected);
  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const on = selectedSet.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== opt.id) : [...selected, opt.id])}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                on
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40'
              )}
            >
              {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {opt.label}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Tout désélectionner
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sticky preview — shows the discount applied to a sample order so the
// seller validates the math before publishing.
// ─────────────────────────────────────────────────────────────────────

function CouponPreview({ coupon, currency }: { coupon: Coupon; currency: string }) {
  // Pick a sample subtotal that triggers the min-purchase rule if any.
  const sampleSubtotal = useMemo(() => {
    if (typeof coupon.minPurchase === 'number' && coupon.minPurchase > 0) {
      return Math.max(coupon.minPurchase, 50);
    }
    return 50;
  }, [coupon.minPurchase]);
  const discount =
    coupon.type === 'percent'
      ? Math.round(sampleSubtotal * (coupon.value / 100) * 100) / 100
      : Math.min(coupon.value, sampleSubtotal);
  const total = Math.max(0, sampleSubtotal - discount);
  const fmt = (n: number) => `${n.toFixed(2)} ${currency}`;

  const expired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
  const exhausted = typeof coupon.maxUses === 'number' && coupon.usedCount >= coupon.maxUses;
  const live = coupon.isActive && !expired && !exhausted;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Eye className="h-3 w-3" />
          Aperçu sur une commande
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
            live ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-emerald-500' : 'bg-amber-500')} />
          {live ? 'Actif' : 'Inactif'}
        </span>
      </div>

      <div className="space-y-3 p-4 text-[11px]">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <span>Sous-total</span>
            <span className="font-semibold">{fmt(sampleSubtotal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-emerald-700">
            <span>Code <code className="rounded bg-emerald-500/15 px-1 font-mono text-[10px]">{coupon.code}</code></span>
            <span className="font-semibold">−{fmt(discount)}</span>
          </div>
          <div className="mt-1 border-t border-border/60 pt-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold">À payer</span>
              <span className="text-base font-extrabold text-primary">{fmt(total)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/20 p-3 text-[10px] text-muted-foreground">
          <ul className="space-y-1">
            <li>• Type : {coupon.type === 'percent' ? `−${coupon.value}% sur le sous-total` : `−${coupon.value} ${currency} fixe`}</li>
            {coupon.minPurchase ? <li>• Minimum : {coupon.minPurchase} {currency}</li> : null}
            {coupon.maxUses ? <li>• Limite : {coupon.usedCount}/{coupon.maxUses}</li> : null}
            {coupon.expiresAt ? <li>• Expire : {new Date(coupon.expiresAt).toLocaleString('fr-FR')}</li> : null}
            <li>• Périmètre : {coupon.appliesTo === 'all' ? 'toute la boutique' : coupon.appliesTo === 'products' ? `${coupon.productIds?.length || 0} produits` : `${coupon.collectionIds?.length || 0} collections`}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
