'use client';

/**
 * Multi-image picker for product galleries. The first image is the
 * "principale" (used as the thumbnail across the storefront); the rest
 * appear in the gallery strip on the product page.
 *
 * Files are chosen several at a time (file dialog + drag-and-drop) and
 * uploaded together. The media library can also add several images in one go.
 */

import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Star, Trash2, Upload, Loader2, Image as ImageIcon, X, Check } from 'lucide-react';
import { storesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn, mediaUrl } from '@/lib/utils';
import { imageSizes } from '@/lib/image-recommendations';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

function absolutize(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

interface MediaItem {
  _id?: string;
  url: string;
  filename?: string;
  mimeType?: string;
}

interface Props {
  storeId: string;
  /** Array of image URLs. First one = main image. */
  images: string[];
  onChange: (next: string[]) => void;
  /** Soft cap so the gallery stays scannable. */
  max?: number;
}

export function ProductImagesPicker({ storeId, images, onChange, max = 8 }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const remaining = Math.max(0, max - images.length);
  const sizeHint = imageSizes.productGallery || imageSizes.productMain;

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

  function appendUrls(urls: string[]) {
    const fresh = urls.filter((url) => url && !images.includes(url));
    if (fresh.length === 0) return;
    onChange([...images, ...fresh].slice(0, max));
  }

  async function uploadFiles(list: File[]) {
    if (!storeId || uploading) return;
    const imagesOnly = list.filter((f) => f.type.startsWith('image/'));
    const rejected = list.length - imagesOnly.length;
    if (remaining === 0) {
      setError(`Maximum ${max} images.`);
      return;
    }
    const batch = imagesOnly.slice(0, remaining);
    if (batch.length === 0) {
      setError('Choisis des images PNG, JPG, WebP ou GIF.');
      return;
    }
    setUploading(true);
    setError('');
    let done = 0;
    setProgress({ done: 0, total: batch.length });
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const res = await storesApi.uploadMedia(storeId, file);
          const url = (res.data as { media?: { url?: string } }).media?.url;
          done += 1;
          setProgress({ done, total: batch.length });
          return url || null;
        } catch {
          done += 1;
          setProgress({ done, total: batch.length });
          return null;
        }
      })
    );
    const ok = results.filter((u): u is string => !!u);
    if (ok.length) appendUrls(ok);
    const skipped = imagesOnly.length - batch.length;
    const failed = batch.length - ok.length;
    const notes: string[] = [];
    if (failed) notes.push(`${failed} image${failed > 1 ? 's' : ''} non envoyée${failed > 1 ? 's' : ''}.`);
    if (skipped) notes.push(`${skipped} ignorée${skipped > 1 ? 's' : ''} : maximum ${max}.`);
    if (rejected) notes.push(`${rejected} fichier${rejected > 1 ? 's' : ''} ignoré${rejected > 1 ? 's' : ''} (pas une image).`);
    if (notes.length) setError(notes.join(' '));
    setUploading(false);
    setProgress(null);
  }

  function openPicker() {
    if (remaining === 0 || uploading) return;
    fileRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length) void uploadFiles(files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void uploadFiles(files);
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onFileChange}
        disabled={uploading || remaining === 0}
      />

      {images.length === 0 ? (
        <button
          type="button"
          onClick={openPicker}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          disabled={uploading}
          className={cn(
            'flex w-full max-w-md flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-border/70 bg-muted/20 hover:border-primary/50 hover:text-primary',
            uploading && 'pointer-events-none opacity-70'
          )}
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          </span>
          <span className="text-sm font-medium">
            {uploading
              ? `Envoi ${progress?.done ?? 0}/${progress?.total ?? 0}…`
              : 'Ajouter plusieurs images'}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Clique ou glisse plusieurs fichiers. La première devient l&apos;image principale.
          </span>
        </button>
      ) : (
        <ul
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
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

          {remaining > 0 && (
            <li>
              <button
                type="button"
                onClick={openPicker}
                disabled={uploading}
                className={cn(
                  'flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary',
                  dragOver ? 'border-primary bg-primary/5 text-primary' : 'border-border/70 bg-muted/20'
                )}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {uploading ? `${progress?.done ?? 0}/${progress?.total ?? 0}` : 'Ajouter'}
              </button>
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={openPicker}
          disabled={uploading || remaining === 0}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? `Envoi ${progress?.done ?? 0}/${progress?.total ?? 0}…` : 'Téléverser plusieurs'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setGalleryOpen(true)}
          disabled={remaining === 0}
          className="gap-1.5"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Galerie
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Sélectionne plusieurs images d&apos;un coup. La 1<sup>re</sup> est affichée partout. Réorganise avec les flèches ou clique sur ⭐ pour la principale. Max {max} images.
        {sizeHint && (
          <> Recommandé : {sizeHint.width} × {sizeHint.height} px.</>
        )}
      </p>

      {error && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="shrink-0" aria-label="Fermer">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {galleryOpen && (
        <GalleryMultiModal
          storeId={storeId}
          already={images}
          remaining={remaining}
          onClose={() => setGalleryOpen(false)}
          onAdd={(urls) => {
            appendUrls(urls);
            setGalleryOpen(false);
          }}
        />
      )}
    </div>
  );
}

function GalleryMultiModal({
  storeId,
  already,
  remaining,
  onAdd,
  onClose,
}: {
  storeId: string;
  already: string[];
  remaining: number;
  onAdd: (urls: string[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    storesApi
      .listMedia(storeId)
      .then((res) => {
        if (!alive) return;
        const list = (res.data as { media?: MediaItem[] }).media || [];
        setItems(list.filter((m) => m.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(m.url)));
      })
      .catch(() => alive && setLoadError('Impossible de charger la galerie.'));
    return () => { alive = false; };
  }, [storeId]);

  function toggle(url: string) {
    if (already.includes(url)) return;
    setPicked((cur) => {
      if (cur.includes(url)) return cur.filter((u) => u !== url);
      if (cur.length >= remaining) return cur;
      return [...cur, url];
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold">Ajouter des images</h3>
            <p className="text-[11px] text-muted-foreground">
              {picked.length} sélectionnée{picked.length > 1 ? 's' : ''} · {remaining} place{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : items === null ? (
            <div className="grid h-40 place-items-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="grid h-40 place-items-center text-center text-sm text-muted-foreground">
              Galerie vide. Téléverse des images pour les retrouver ici.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {items.map((m) => {
                const selected = picked.includes(m.url);
                const used = already.includes(m.url);
                const locked = !selected && !used && picked.length >= remaining;
                return (
                  <button
                    type="button"
                    key={m._id || m.url}
                    onClick={() => toggle(m.url)}
                    disabled={used || locked}
                    className={cn(
                      'group relative aspect-square overflow-hidden rounded-lg border',
                      selected ? 'border-primary ring-2 ring-primary' : 'border-border/70',
                      (used || locked) && 'cursor-not-allowed opacity-40'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={absolutize(m.url)} alt={m.filename || ''} className="h-full w-full object-cover" />
                    {selected && (
                      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={picked.length === 0} onClick={() => onAdd(picked)}>
            Ajouter {picked.length > 0 ? `(${picked.length})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
