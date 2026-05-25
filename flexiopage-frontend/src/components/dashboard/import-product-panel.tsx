'use client';

/**
 * Import d'un produit depuis un lien AliExpress / Alibaba / Amazon.
 *
 * Le vendeur colle l'URL → « Récupérer » extrait titre/prix/description/images
 * (sans rien créer) → aperçu ÉDITABLE (le vendeur ajuste, retire des photos) →
 * « Ajouter le produit » crée le produit (les images externes sont rapatriées
 * côté serveur). L'extraction est imparfaite : l'aperçu éditable rattrape les
 * champs manquants.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, extractApiError } from '@/lib/api';
import { ProductDescriptionEditor } from '@/components/dashboard/product-description-editor';
import { Loader2, Link2, X, Check } from 'lucide-react';

interface Preview {
  source: 'aliexpress' | 'alibaba' | 'amazon';
  sourceUrl: string;
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  images: string[];
}

interface Props {
  storeId: string;
}

const SOURCE_LABEL: Record<Preview['source'], string> = {
  aliexpress: 'AliExpress',
  alibaba: 'Alibaba',
  amazon: 'Amazon',
};

export function ImportProductPanel({ storeId }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Aperçu éditable
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);

  async function handleFetch() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setFetching(true);
    setError('');
    setPreview(null);
    try {
      const res = await storesApi.importProductPreview(storeId, trimmed);
      const p = res.data.preview;
      setPreview(p);
      setName(p.title || '');
      setPrice(p.price != null ? String(p.price) : '');
      setDescription(p.description || '');
      setImages(p.images || []);
    } catch (err) {
      setError(extractApiError(err, "Échec de la récupération du produit."));
    } finally {
      setFetching(false);
    }
  }

  function removeImage(u: string) {
    setImages((prev) => prev.filter((x) => x !== u));
  }

  async function handleCreate() {
    setError('');
    if (!name.trim()) {
      setError('Le nom du produit est requis.');
      return;
    }
    const priceNum = parseFloat(price);
    if (!isFinite(priceNum) || priceNum < 0) {
      setError('Indique un prix valide.');
      return;
    }
    setCreating(true);
    try {
      await storesApi.importCreateProduct(storeId, {
        name: name.trim(),
        price: priceNum,
        description,
        images,
        isPublished: false,
      });
      router.push(`/dashboard/products?storeId=${storeId}`);
    } catch (err) {
      setError(extractApiError(err, "La création du produit a échoué."));
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Importer depuis un lien</CardTitle>
          <CardDescription>
            Colle un lien produit AliExpress, Alibaba ou Amazon. On récupère le titre,
            le prix, la description et les photos — que tu pourras ajuster avant d&apos;ajouter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                placeholder="https://www.aliexpress.com/item/..."
                className="pl-9"
                disabled={fetching}
              />
            </div>
            <Button type="button" onClick={handleFetch} disabled={fetching || !url.trim()} className="gap-2">
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {fetching ? 'Récupération…' : 'Récupérer'}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Astuce : si une page n&apos;est pas lisible (souvent AliExpress), complète simplement
            les champs manquants dans l&apos;aperçu.
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Aperçu
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {SOURCE_LABEL[preview.source]}
              </span>
            </CardTitle>
            <CardDescription>Vérifie et ajuste avant d&apos;ajouter à ta boutique.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="import-name">Nom du produit *</Label>
              <Input id="import-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-price">
                Prix de vente *{preview.currency ? ` (source : ${preview.currency})` : ''}
              </Label>
              <Input
                id="import-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Fixe ton propre prix de vente — la valeur importée n&apos;est qu&apos;une indication.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <ProductDescriptionEditor storeId={storeId} value={description} onChange={setDescription} />
            </div>

            <div className="space-y-1.5">
              <Label>Photos ({images.length})</Label>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune photo récupérée. Tu pourras en ajouter après la création.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {images.map((u) => (
                    <div key={u} className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(u)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Retirer la photo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Les photos seront copiées dans ta boutique (pas de lien externe).
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button type="button" onClick={handleCreate} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {creating ? 'Ajout…' : 'Ajouter le produit'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
