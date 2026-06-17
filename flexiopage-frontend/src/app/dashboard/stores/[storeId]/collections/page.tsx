'use client';

/**
 * Collections index — flat list of all collections of the current store
 * with a "New collection" CTA. Each row links to the editor.
 *
 * Modeled after the existing /info-pages flow so the seller learns the
 * pattern once. No live preview here — too many cards would make it busy;
 * preview lives inside the per-collection editor.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Layers, Plus, Loader2, Eye, EyeOff, ExternalLink,
  Trash2, GripVertical, Tag, ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm, usePrompt } from '@/components/ui/confirm-dialog';
import { storesApi, extractApiError } from '@/lib/api';
import { cn, publicStoreUrl } from '@/lib/utils';
import type { Collection } from '@/types/collection';

interface StoreLite {
  _id: string;
  name: string;
  slug: string;
  customDomain?: string;
  customDomainVerified?: boolean;
}

export default function CollectionsListPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [store, setStore] = useState<StoreLite | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeRes, colRes] = await Promise.all([
        storesApi.get(storeId),
        storesApi.listCollections(storeId),
      ]);
      setStore((storeRes.data as { store: StoreLite }).store);
      setCollections((colRes.data as { collections: Collection[] }).collections || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  async function createCollection() {
    const name = await prompt({
      title: 'Nouvelle collection',
      description: 'Regroupe plusieurs produits sous un même thème — ils apparaîtront ensemble sur ta vitrine.',
      placeholder: 'Ex: Bestsellers, Cosmétiques, Été 2026…',
      confirmLabel: 'Créer',
      minLength: 2,
    });
    if (!name?.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await storesApi.createCollection(storeId, {
        name: name.trim(),
        type: 'manual',
        isPublished: true,
      });
      const created = (res.data as { collection: Collection }).collection;
      router.push(`/dashboard/stores/${storeId}/collections/${created._id}`);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Création échouée.'));
    } finally {
      setCreating(false);
    }
  }

  async function deleteCollection(c: Collection) {
    const ok = await confirm({
      title: `Supprimer la collection « ${c.name} » ?`,
      description: 'Les produits qu\'elle contient ne sont pas supprimés — seul le regroupement disparaît.',
      confirmLabel: 'Supprimer',
      tone: 'destructive',
    });
    if (!ok) return;
    await storesApi.deleteCollection(storeId, c._id);
    setCollections((arr) => arr.filter((row) => row._id !== c._id));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/stores/${storeId}`)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Collections</h1>
            <p className="text-sm text-muted-foreground">
              Regroupe tes produits par thème (« Bestsellers », « Soldes », « Mode homme »…)
              avec leur propre page publique <code className="rounded bg-muted px-1">/c/&lt;slug&gt;</code>.
            </p>
          </div>
        </div>
        <Button
          onClick={createCollection}
          disabled={creating}
          className="gap-1.5 gradient-brand text-white"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Nouvelle collection
        </Button>
      </header>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : collections.length === 0 ? (
        <EmptyState onCreate={createCollection} creating={creating} />
      ) : (
        <ul className="space-y-2">
          {collections.map((c) => (
            <li
              key={c._id}
              className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/30"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/10 to-fuchsia-500/10 text-primary">
                {c.type === 'auto' ? <Tag className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              </span>
              <Link
                href={`/dashboard/stores/${storeId}/collections/${c._id}`}
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{c.name}</h3>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      c.type === 'auto'
                        ? 'bg-amber-500/10 text-amber-700'
                        : 'bg-sky-500/10 text-sky-700'
                    )}
                  >
                    {c.type === 'auto' ? 'Auto · règles' : 'Manuelle'}
                  </span>
                  {c.isPublished ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <Eye className="h-3 w-3" /> Publiée
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      <EyeOff className="h-3 w-3" /> Brouillon
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <code>/c/{c.slug}</code>
                  {c.type === 'manual' && (
                    <span>· {c.productIds.length} produit{c.productIds.length > 1 ? 's' : ''}</span>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-1">
                {store && (
                  <Link
                    href={publicStoreUrl(store, `c/${c.slug}`)}
                    target="_blank"
                    rel="noopener"
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Voir la page publique"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => deleteCollection(c)}
                  className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                  title="Supprimer"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <GripVertical className="ml-1 h-4 w-4 text-muted-foreground/30" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
      <Layers className="mx-auto h-10 w-10 text-muted-foreground" />
      <p className="mt-3 text-base font-semibold">Aucune collection</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Crée ta première collection pour offrir une navigation plus claire à tes clients
        (ex: « Nouveautés », « Promo », « Mode homme »).
      </p>
      <Button onClick={onCreate} disabled={creating} className="mt-5 gap-1.5 gradient-brand text-white">
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Créer ma première collection
      </Button>
    </div>
  );
}
