'use client';

/**
 * Sélecteur de collections pour un produit. Affiche les collections
 * MANUELLES de la boutique sous forme de cases à cocher. Les collections
 * AUTO (règles tags/prix) ne sont pas listées : leur appartenance est
 * recalculée à la lecture à partir des règles, pas par sélection.
 *
 * - Si aucune collection manuelle n'existe : on affiche un message discret
 *   + un lien vers la page de création (« Aucune collection. Crée-en une → »).
 *   La carte n'est donc pas montrée comme bug, c'est juste un état vide.
 * - L'état `selected` est piloté par le parent (la page produit) qui fera
 *   le `storesApi.setProductCollections(...)` après la sauvegarde du
 *   produit (il faut un productId, donc impossible avant le POST initial
 *   pour /products/new).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Layers, Plus, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Collection } from '@/types/collection';

interface Props {
  storeId: string;
  /** IDs sélectionnés (état piloté par le parent). */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Optionnel — titre de la carte si on veut le changer. */
  title?: string;
  /** Affiche les collections AUTO en mode lecture seule (badge "auto").
   *  Désactivé par défaut : on les masque, leur appartenance est calculée
   *  par règles donc le vendeur ne peut pas la forcer ici. */
  showAuto?: boolean;
}

export function CollectionsPicker({
  storeId,
  selected,
  onChange,
  title = 'Collections',
  showAuto = false,
}: Props) {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setLoading(true);
    storesApi
      .listCollections(storeId)
      .then((res) => {
        if (cancelled) return;
        setCollections(res.data.collections || []);
      })
      .catch(() => {
        if (cancelled) return;
        setCollections([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const manualCollections = (collections || []).filter((c) => c.type === 'manual');
  const autoCollections = (collections || []).filter((c) => c.type === 'auto');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>
          Range ce produit dans une ou plusieurs collections manuelles. Les
          collections « auto » (règles tags/prix) gèrent leur contenu seules.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : manualCollections.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm">
            <p className="text-muted-foreground">
              Aucune collection manuelle dans cette boutique.
            </p>
            <Link
              href={`/dashboard/stores/${storeId}/collections`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              target="_blank"
              rel="noopener"
            >
              <Plus className="h-3 w-3" />
              Créer une collection
            </Link>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {manualCollections.map((col) => {
              const isOn = selected.includes(col._id);
              return (
                <button
                  key={col._id}
                  type="button"
                  onClick={() => toggle(col._id)}
                  aria-pressed={isOn}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                    isOn
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border/60 hover:border-primary/30 hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                      isOn ? 'border-primary bg-primary text-white' : 'border-border',
                    )}
                  >
                    {isOn && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{col.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {col.productIds.length} produit{col.productIds.length === 1 ? '' : 's'}
                      {!col.isPublished && ' · brouillon'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {showAuto && autoCollections.length > 0 && (
          <div className="mt-4 border-t border-border/60 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Collections automatiques (lecture seule)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {autoCollections.map((col) => (
                <span
                  key={col._id}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                  title="Appartenance définie par les règles de la collection"
                >
                  {col.name} · auto
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
