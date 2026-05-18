'use client';

/**
 * Multi-image picker for product galleries. The first image is the
 * "principale" (used as the thumbnail across the storefront); the rest
 * appear in the gallery strip on the product page.
 *
 * Reuses MediaPicker for the actual upload/library interaction so the
 * experience is consistent with the rest of the dashboard.
 */

import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Star, Trash2 } from 'lucide-react';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { Button } from '@/components/ui/button';
import { cn, mediaUrl } from '@/lib/utils';

interface Props {
  storeId: string;
  /** Array of image URLs. First one = main image. */
  images: string[];
  onChange: (next: string[]) => void;
  /** Soft cap so the gallery stays scannable. */
  max?: number;
}

export function ProductImagesPicker({ storeId, images, onChange, max = 8 }: Props) {
  const [addingIndex, setAddingIndex] = useState<number | null>(null);

  function update(i: number, url: string | undefined) {
    if (!url) {
      // Empty URL = remove from gallery.
      onChange(images.filter((_, idx) => idx !== i));
      return;
    }
    if (i === images.length) {
      // Slot is the trailing "add" slot — append.
      onChange([...images, url]);
      setAddingIndex(null);
      return;
    }
    const next = images.slice();
    next[i] = url;
    onChange(next);
  }

  function remove(i: number) {
    onChange(images.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = images.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  function makeMain(i: number) {
    if (i === 0) return;
    const next = images.slice();
    const [picked] = next.splice(i, 1);
    next.unshift(picked);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {images.length === 0 ? (
        <div className="max-w-md">
          <MediaPicker
            storeId={storeId}
            value=""
            onChange={(url) => url && onChange([url])}
            label="Image principale"
            shape="square"
            helper="Téléverse la 1re image. Tu pourras en ajouter d'autres pour la galerie."
          />
        </div>
      ) : (
        <>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {images.map((url, i) => (
              <li
                key={url + i}
                className={cn(
                  'group relative overflow-hidden rounded-xl border bg-muted/30 transition-all',
                  i === 0 ? 'border-primary ring-2 ring-primary/20' : 'border-border/60'
                )}
              >
                <div className="relative aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(url) || url}
                    alt={`Image ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {i === 0 && (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground shadow">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      Principale
                    </span>
                  )}
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {i + 1}/{images.length}
                  </span>
                </div>
                {/* Action row — visible on hover (mouse) and always on touch */}
                <div className="flex items-center justify-between gap-0.5 bg-card/95 px-1.5 py-1 backdrop-blur">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label="Déplacer à gauche"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={i === images.length - 1}
                      onClick={() => move(i, 1)}
                      className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label="Déplacer à droite"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                    {i !== 0 && (
                      <button
                        type="button"
                        onClick={() => makeMain(i)}
                        className="grid h-6 w-6 place-items-center rounded text-amber-600 hover:bg-amber-500/10"
                        aria-label="Marquer comme principale"
                        title="Marquer comme principale"
                      >
                        <Star className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="grid h-6 w-6 place-items-center rounded text-destructive hover:bg-destructive/10"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}

            {/* "Add another" tile — shown inline only when below max. The
                actual upload happens in the modal MediaPicker rendered below. */}
            {images.length < max && (
              <li>
                <button
                  type="button"
                  onClick={() => setAddingIndex(images.length)}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter
                </button>
              </li>
            )}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            La 1<sup>re</sup> image est affichée partout. Réorganise avec les flèches ou clique sur ⭐ pour promouvoir une image en principale. Max {max} images.
          </p>
        </>
      )}

      {/* Lightweight modal — a single MediaPicker constrained, with a close button.
          Used both for adding the very first image (handled by the no-images branch above)
          and for adding subsequent images via the "+" tile. */}
      {addingIndex !== null && images.length > 0 && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setAddingIndex(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Ajouter une image</h3>
              <Button variant="ghost" size="sm" onClick={() => setAddingIndex(null)}>
                Fermer
              </Button>
            </div>
            <MediaPicker
              storeId={storeId}
              value=""
              onChange={(url) => {
                if (url) update(addingIndex, url);
              }}
              shape="square"
              label=""
              helper="Téléverse depuis ton ordinateur ou choisis dans la galerie."
            />
          </div>
        </div>
      )}
    </div>
  );
}
