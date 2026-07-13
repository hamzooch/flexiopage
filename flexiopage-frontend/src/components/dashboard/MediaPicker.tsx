'use client';

/**
 * Reusable image picker for the dashboard — upload a new file OR pick from
 * the store's media library. Replaces raw URL inputs everywhere we ask the
 * seller for an image (logo, hero, slider, testimonial avatar...).
 */

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storesApi, extractApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ImageSizeRecommendation } from '@/lib/image-recommendations';

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
  createdAt?: string;
}

interface Props {
  storeId: string;
  value?: string;
  onChange: (url: string | undefined) => void;
  label?: string;
  /** 'square' | 'wide' | 'round' — controls the preview aspect/shape. */
  shape?: 'square' | 'wide' | 'round';
  /** Optional helper text shown under the picker. */
  helper?: string;
  /** Disable upload (gallery-only). Defaults to false. */
  uploadDisabled?: boolean;
  /** Optional image size recommendations to display at the bottom. */
  imageSizeRecommendation?: ImageSizeRecommendation;
}

export function MediaPicker({
  storeId,
  value,
  onChange,
  label,
  shape = 'wide',
  helper,
  uploadDisabled = false,
  imageSizeRecommendation,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = absolutize(value);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setUploadError(`Format non supporté (${file.type || 'inconnu'}). Choisis une image PNG, JPG, WebP ou GIF.`);
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const res = await storesApi.uploadMedia(storeId, file);
      const data = res.data as { media?: { url?: string } };
      if (data.media?.url) {
        onChange(data.media.url);
      } else {
        setUploadError("Le serveur n'a pas renvoyé d'URL d'image.");
      }
    } catch (err) {
      setUploadError(extractApiError(err, "Échec du téléversement."));
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }

  const aspect =
    shape === 'wide' ? 'aspect-[16/9]' : shape === 'round' ? 'aspect-square rounded-full' : 'aspect-square';

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}

      <div
        className={cn(
          'relative overflow-hidden border border-dashed border-border/70 bg-muted/30',
          aspect,
          shape !== 'round' && 'rounded-xl'
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageIcon className="h-7 w-7" />
          </div>
        )}
        {previewUrl && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Retirer l'image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!uploadDisabled && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onFileChange}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Envoi…' : 'Téléverser'}
            </Button>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setGalleryOpen(true)}
          className="gap-1.5"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Galerie
        </Button>
        {previewUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(undefined)}
            className="gap-1.5 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Retirer
          </Button>
        )}
      </div>

      {(helper || imageSizeRecommendation) && (
        <div className="space-y-1">
          {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
          {imageSizeRecommendation && (
            <p className="text-[11px] text-muted-foreground/80">
              📐 Recommandé : {imageSizeRecommendation.width} × {imageSizeRecommendation.height} px, Max{' '}
              {imageSizeRecommendation.maxFileSizeKb} KB
              {imageSizeRecommendation.formats && imageSizeRecommendation.formats.length > 0 && (
                <>, Format{imageSizeRecommendation.formats.length > 1 ? 's' : ''} : {imageSizeRecommendation.formats.join(', ')}</>
              )}
            </p>
          )}
        </div>
      )}

      {uploadError && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError('')}
            className="shrink-0 text-rose-500 hover:text-rose-700"
            aria-label="Fermer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {galleryOpen && (
        <GalleryModal
          storeId={storeId}
          onClose={() => setGalleryOpen(false)}
          onPick={(url) => {
            onChange(url);
            setGalleryOpen(false);
          }}
        />
      )}
    </div>
  );
}

function GalleryModal({
  storeId,
  onPick,
  onClose,
}: {
  storeId: string;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    storesApi
      .listMedia(storeId)
      .then((res) => {
        if (!alive) return;
        const list = (res.data as { media?: MediaItem[] }).media || [];
        setItems(list.filter((m) => m.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(m.url)));
      })
      .catch(() => alive && setError('Impossible de charger la galerie.'));
    return () => {
      alive = false;
    };
  }, [storeId]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <h3 className="text-sm font-semibold">Choisir une image de la galerie</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : items === null ? (
            <div className="grid h-40 place-items-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="grid h-40 place-items-center text-center text-sm text-muted-foreground">
              Galerie vide. Téléverse une image pour la voir ici.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {items.map((m) => {
                const u = absolutize(m.url);
                return (
                  <button
                    type="button"
                    key={m._id || m.url}
                    onClick={() => onPick(m.url)}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 hover:ring-2 hover:ring-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={m.filename || ''} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
