'use client';

/**
 * Dashboard — Collections list.
 *
 * Vue liste au niveau dashboard (comme /dashboard/products). Scoped au store
 * courant via `useScopedStoreId`. Le CRUD détaillé vit toujours dans
 * /dashboard/stores/{storeId}/collections/{collectionId} (éditeur existant) —
 * cette page ne fait qu'orchestrer la liste, la création rapide et la
 * suppression.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layers, Plus, Loader2, Search, Trash2, Pencil, Sparkles, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/dashboard/page-header';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { mediaUrl } from '@/lib/utils';
import type { Collection } from '@/types/collection';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
}

export default function DashboardCollectionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const confirm = useConfirm();
  const storeIdParam = searchParams.get('storeId');
  const { storeId: selectedStoreId, setStoreId: setSelectedStoreId } = useScopedStoreId(storeIdParam);

  const [stores, setStores] = useState<StoreType[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  // Load stores once — mirror `dashboard/products/page.tsx` behavior.
  useEffect(() => {
    storesApi
      .list()
      .then((res) => {
        const list = (res.data as { stores: StoreType[] }).stores;
        setStores(list);
        if (!selectedStoreId && list.length) setSelectedStoreId(list[0]._id);
      })
      .catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    if (!selectedStoreId) {
      setCollections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    storesApi
      .listCollections(selectedStoreId)
      .then((res) => setCollections(res.data.collections || []))
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, [selectedStoreId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.slug || '').toLowerCase().includes(q),
    );
  }, [collections, search]);

  async function handleCreate() {
    if (!selectedStoreId || creating) return;
    setCreating(true);
    try {
      const res = await storesApi.createCollection(selectedStoreId, {
        name: 'Nouvelle collection',
        type: 'manual',
        productIds: [],
        isPublished: false,
      });
      const created = res.data.collection;
      // Rebondit directement dans l'éditeur existant — pas de duplication d'UI.
      router.push(`/dashboard/stores/${selectedStoreId}/collections/${created._id}`);
    } catch {
      setCreating(false);
    }
  }

  async function handleDelete(c: Collection) {
    if (!selectedStoreId) return;
    const ok = await confirm({
      title: `Supprimer « ${c.name} » ?`,
      description:
        'La collection est supprimée. Les produits qu’elle contient ne sont PAS supprimés — ils restent dans ton catalogue.',
      confirmLabel: 'Supprimer',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await storesApi.deleteCollection(selectedStoreId, c._id);
      setCollections((prev) => prev.filter((x) => x._id !== c._id));
    } catch {
      // silencieux — le toast global de l'API gère l'erreur
    }
  }

  const currentStore = stores.find((s) => s._id === selectedStoreId);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Layers}
        title="Collections"
        description="Regroupe tes produits par thème (manuellement ou par règles auto). Utilisées sur le storefront et pour cibler les campagnes."
        actions={
          stores.length > 1 ? (
            <select
              className="h-9 rounded-md border border-border/60 bg-card px-2.5 text-xs"
              value={selectedStoreId || ''}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              aria-label="Choisir une boutique"
            >
              {stores.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          ) : currentStore ? (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-xs font-medium">
              {currentStore.name}
            </div>
          ) : null
        }
      />

      {/* Toolbar — recherche + création */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une collection…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button
          onClick={handleCreate}
          disabled={!selectedStoreId || creating}
          className="h-9 gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Nouvelle collection
        </Button>
      </div>

      {/* Liste / états */}
      {loading ? (
        <div className="grid place-items-center rounded-2xl border border-border/60 bg-card py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !selectedStoreId ? (
        <EmptyBlock
          icon={Layers}
          title="Choisis une boutique"
          hint="Sélectionne une boutique en haut pour voir ses collections."
        />
      ) : filtered.length === 0 ? (
        <EmptyBlock
          icon={Layers}
          title={search ? 'Aucun résultat' : 'Aucune collection'}
          hint={
            search
              ? 'Aucune collection ne correspond à ta recherche.'
              : 'Regroupe tes produits par thème pour les mettre en avant sur ta boutique.'
          }
          cta={
            !search && selectedStoreId ? (
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Créer ma première collection
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CollectionCard
              key={c._id}
              collection={c}
              storeId={selectedStoreId}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CollectionCard({
  collection: c,
  storeId,
  onDelete,
}: {
  collection: Collection;
  storeId: string;
  onDelete: () => void;
}) {
  const productCount = c.productIds?.length ?? 0;
  const isAuto = c.type === 'auto';
  const href = `/dashboard/stores/${storeId}/collections/${c._id}`;
  return (
    <li className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
      <Link href={href} className="block">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-amber-50 via-orange-100/60 to-orange-200/40">
          {c.image && mediaUrl(c.image) ? (
            <Image
              src={mediaUrl(c.image) as string}
              alt={c.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Layers className="h-8 w-8 text-orange-300" />
            </div>
          )}
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
            {isAuto ? (
              <>
                <Sparkles className="h-3 w-3 text-fuchsia-600" />
                Auto
              </>
            ) : (
              <>
                <Hand className="h-3 w-3 text-sky-600" />
                Manuelle
              </>
            )}
          </div>
          {!c.isPublished && (
            <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              Brouillon
            </div>
          )}
        </div>
        <div className="space-y-1 p-3.5">
          <div className="truncate text-sm font-semibold">{c.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {productCount} produit{productCount > 1 ? 's' : ''}
            {c.slug ? <> · <span className="font-mono">/{c.slug}</span></> : null}
          </div>
        </div>
      </Link>
      {/* Actions — sortent au hover pour rester discrètes */}
      <div className="absolute bottom-3.5 right-3.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Link
          href={href}
          className="grid h-7 w-7 place-items-center rounded-md border border-border/60 bg-background/95 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          aria-label="Modifier"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
          className="grid h-7 w-7 place-items-center rounded-md border border-border/60 bg-background/95 text-muted-foreground backdrop-blur transition-colors hover:border-rose-300 hover:text-rose-600"
          aria-label="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function EmptyBlock({
  icon: Icon,
  title,
  hint,
  cta,
}: {
  icon: typeof Layers;
  title: string;
  hint: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border/60 bg-card px-4 py-16 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-orange-500/10 text-orange-600">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>
      {cta ? <div className="mt-4">{cta}</div> : null}
    </div>
  );
}
