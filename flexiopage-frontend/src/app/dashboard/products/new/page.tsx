'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { Plus, Trash2, ImagePlus, Loader2, Star, ArrowUp, ArrowDown, Sparkles, Upload, X, Download, Video, Key, Crown, Wrench, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiDescriptionButton } from '@/components/dashboard/ai-description-button';
import { ProductDescriptionEditor } from '@/components/dashboard/product-description-editor';
import { ImportProductPanel } from '@/components/dashboard/import-product-panel';

type DigitalKind = 'download' | 'course' | 'license' | 'membership' | 'service';

interface DigitalAsset {
  id: string;
  name: string;
  url: string;
  kind: 'file' | 'video' | 'image' | 'audio' | 'link';
  mimeType?: string;
  size?: number;
  order: number;
}

const DIGITAL_KINDS: { id: DigitalKind; label: string; desc: string; icon: typeof Download }[] = [
  { id: 'download',   label: 'Téléchargement',   desc: 'Un ou plusieurs fichiers à télécharger (PDF, ZIP, audio).', icon: Download },
  { id: 'course',     label: 'Cours en ligne',   desc: 'Vidéos groupées en modules. Accès via un portail.',         icon: Video },
  { id: 'license',    label: 'Clé de licence',   desc: 'Génère une clé unique par achat (logiciel, plug-in).',      icon: Key },
  { id: 'membership', label: 'Abonnement',       desc: 'Accès récurrent à un espace membre.',                       icon: Crown },
  { id: 'service',    label: 'Prestation',       desc: 'Consultation, coaching — livraison manuelle.',              icon: Wrench },
];

function genId(): string {
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferAssetKind(mime?: string, name?: string): DigitalAsset['kind'] {
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('image/')) return 'image';
  if (name && /\.(mp4|mov|webm|mkv)$/i.test(name)) return 'video';
  if (name && /\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'audio';
  return 'file';
}

export interface ProductVariantRow {
  name: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  options?: Record<string, string>;
}

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get('storeId');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Saisie manuelle (formulaire complet) vs import depuis un lien marketplace.
  const [mode, setMode] = useState<'manual' | 'import'>('manual');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'physical' | 'digital'>('physical');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [cost, setCost] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [stock, setStock] = useState('0');
  const [trackInventory, setTrackInventory] = useState(true);
  const [allowBackorder, setAllowBackorder] = useState(false);
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [images, setImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [variants, setVariants] = useState<ProductVariantRow[]>([]);
  const [digitalFileUrl, setDigitalFileUrl] = useState('');
  const [digitalFileName, setDigitalFileName] = useState('');
  // chariow-style digital fields
  const [digitalKind, setDigitalKind] = useState<DigitalKind>('download');
  const [digitalAssets, setDigitalAssets] = useState<DigitalAsset[]>([]);
  const [digitalUploading, setDigitalUploading] = useState(false);
  const [licenseKeyTemplate, setLicenseKeyTemplate] = useState('BOUT-{productSlug}-{random}');
  const [accessType, setAccessType] = useState<'lifetime' | 'limited'>('lifetime');
  const [accessDays, setAccessDays] = useState<string>('30');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const [storeSettings, setStoreSettings] = useState<{ language?: string; country?: string; currency?: string }>({});

  useEffect(() => {
    if (!storeId) { setError('No store selected'); return; }
    // If the store is digital, redirect to the dedicated digital form (better UX).
    storesApi.get(storeId).then((res) => {
      const s = (res.data as { store?: { storeType?: string; settings?: { language?: string; country?: string; currency?: string } } }).store;
      if (s?.storeType === 'digital') {
        router.replace(`/dashboard/products/new/digital?storeId=${storeId}`);
      }
      if (s?.settings) setStoreSettings(s.settings);
    }).catch(() => { /* non-blocking */ });
  }, [storeId, router]);

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      { name: '', sku: '', price: price || '0', compareAtPrice: '', stock: stock || '0' },
    ]);
  }

  function updateVariant(index: number, field: keyof ProductVariantRow, value: string) {
    setVariants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  function addImageByUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    setImages((prev) => [...prev, url]);
    setImageUrlInput('');
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function moveImage(index: number, dir: -1 | 1) {
    setImages((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /** Upload one or many image files in parallel; returns nothing — appends to state. */
  async function uploadFiles(files: FileList | File[]) {
    if (!storeId) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setUploading(true);
    setError('');
    setUploadProgress({ done: 0, total: list.length });

    const base = typeof process.env.NEXT_PUBLIC_API_URL === 'string' ? process.env.NEXT_PUBLIC_API_URL : '';
    let done = 0;

    const results = await Promise.all(
      list.map(async (file) => {
        try {
          const res = await storesApi.uploadMedia(storeId, file);
          const data = res.data as { media?: { url?: string } };
          done += 1;
          setUploadProgress({ done, total: list.length });
          if (data.media?.url) {
            return data.media.url.startsWith('http') ? data.media.url : base + data.media.url;
          }
          return null;
        } catch {
          done += 1;
          setUploadProgress({ done, total: list.length });
          return null;
        }
      })
    );

    const ok = results.filter((u): u is string => !!u);
    if (ok.length > 0) setImages((prev) => [...prev, ...ok]);
    if (ok.length < list.length) {
      setError(`${list.length - ok.length} image(s) n'ont pas pu être téléversées.`);
    }
    setUploading(false);
    setUploadProgress(null);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(e.target.files);
    }
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      uploadFiles(e.dataTransfer.files);
    }
  }

  // ── Digital asset helpers ─────────────────────────────────────────
  async function uploadDigitalFiles(files: FileList | File[]) {
    if (!storeId) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setDigitalUploading(true);
    setError('');
    const base = typeof process.env.NEXT_PUBLIC_API_URL === 'string' ? process.env.NEXT_PUBLIC_API_URL : '';
    const results = await Promise.all(
      list.map(async (file) => {
        try {
          const res = await storesApi.uploadMedia(storeId, file);
          const data = res.data as { media?: { url?: string; mimeType?: string; size?: number } };
          if (data.media?.url) {
            const url = data.media.url.startsWith('http') ? data.media.url : base + data.media.url;
            const asset: DigitalAsset = {
              id: genId(),
              name: file.name,
              url,
              kind: inferAssetKind(file.type, file.name),
              mimeType: file.type || data.media.mimeType,
              size: file.size || data.media.size,
              order: 0,
            };
            return asset;
          }
          return null;
        } catch {
          return null;
        }
      })
    );
    const ok = results.filter((a): a is DigitalAsset => !!a);
    if (ok.length > 0) {
      setDigitalAssets((prev) => [
        ...prev,
        ...ok.map((a, i) => ({ ...a, order: prev.length + i })),
      ]);
    }
    if (ok.length < list.length) {
      setError(`${list.length - ok.length} fichier(s) digital(aux) non téléversé(s).`);
    }
    setDigitalUploading(false);
  }

  function addDigitalAssetByUrl(url: string, name: string) {
    const u = url.trim();
    const n = name.trim();
    if (!u || !n) return;
    setDigitalAssets((prev) => [
      ...prev,
      { id: genId(), name: n, url: u, kind: 'link', order: prev.length },
    ]);
  }

  function removeDigitalAsset(id: string) {
    setDigitalAssets((prev) => prev.filter((a) => a.id !== id).map((a, i) => ({ ...a, order: i })));
  }

  function moveDigitalAsset(id: string, dir: -1 | 1) {
    setDigitalAssets((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((a, i) => ({ ...a, order: i }));
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    const priceNum = parseFloat(price) || 0;
    if (priceNum < 0) {
      setError('Price must be ≥ 0');
      return;
    }
    if (images.length === 0) {
      setError('Ajoute au moins une image du produit (utilisée pour la fiche produit et la génération AI de la landing page).');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    setError('');
    try {
      const variantPayload = variants.map((v) => ({
        name: v.name || 'Variant',
        sku: v.sku || undefined,
        price: parseFloat(v.price) || 0,
        compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice) : undefined,
        stock: parseInt(v.stock, 10) || 0,
      }));

      await storesApi.createProduct(storeId, {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        price: priceNum,
        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
        cost: cost ? parseFloat(cost) : undefined,
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        stock: parseInt(stock, 10) || 0,
        trackInventory,
        allowBackorder,
        weight: weight ? parseFloat(weight) : undefined,
        weightUnit: weightUnit || 'kg',
        variants: variantPayload.length > 0 ? variantPayload : undefined,
        images: images.length > 0 ? images : undefined,
        digitalFileUrl: type === 'digital' && digitalFileUrl ? digitalFileUrl.trim() : undefined,
        digitalFileName: type === 'digital' && digitalFileName ? digitalFileName.trim() : undefined,
        digitalKind: type === 'digital' ? digitalKind : undefined,
        digitalAssets:
          type === 'digital' && digitalAssets.length > 0
            ? digitalAssets.map((a) => ({
                id: a.id,
                name: a.name,
                url: a.url,
                kind: a.kind,
                mimeType: a.mimeType,
                size: a.size,
                order: a.order,
              }))
            : undefined,
        licenseKeyTemplate:
          type === 'digital' && digitalKind === 'license' && licenseKeyTemplate.trim()
            ? licenseKeyTemplate.trim()
            : undefined,
        accessType: type === 'digital' ? accessType : undefined,
        accessDays:
          type === 'digital' && accessType === 'limited' ? parseInt(accessDays, 10) || 30 : undefined,
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        isPublished,
      });
      router.push(`/dashboard/products?storeId=${storeId}`);
      router.refresh();
    } catch {
      setError('Failed to create product');
    } finally {
      setSaving(false);
    }
  }

  if (!storeId) {
    return (
      <div className="space-y-8">
        <p className="text-destructive">{error}</p>
        <Link href="/dashboard/products">
          <Button variant="outline">Back to products</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 sm:space-y-8">
      <div className="flex items-center gap-2 sm:gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/products')} className="shrink-0 px-2 sm:px-3">
          ← <span className="hidden sm:inline ml-1">Back</span>
        </Button>
        <h1 className="truncate text-xl font-bold sm:text-3xl">Nouveau produit</h1>
      </div>

      {/* Onglets : saisie manuelle vs import depuis un lien marketplace */}
      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            mode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Saisie manuelle
        </button>
        <button
          type="button"
          onClick={() => setMode('import')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            mode === 'import' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Importer depuis un lien
        </button>
      </div>

      {mode === 'import' && <ImportProductPanel storeId={storeId} />}

      {mode === 'manual' && (
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic information</CardTitle>
            <CardDescription>Nom, description et type de produit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nom du produit *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ex: Caftan Brodé Marrakech, T-shirt Bleu, Casque Bluetooth"
              />
              <p className="text-[11px] text-muted-foreground">Court et descriptif. C&apos;est ce que voient tes clients.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="description">Description du produit</Label>
                {storeId && (
                  <AiDescriptionButton
                    storeId={storeId}
                    productName={name}
                    price={parseFloat(price) || undefined}
                    currency={storeSettings.currency}
                    defaultLanguage={storeSettings.language}
                    defaultCountry={storeSettings.country}
                    onResult={(text) => setDescription(text)}
                  />
                )}
              </div>
              <ProductDescriptionEditor
                storeId={storeId}
                value={description}
                onChange={setDescription}
                placeholder="Ex: Caftan en soie brodée à la main, finitions dorées. Coupe ample, idéal pour les occasions."
              />
              <p className="text-[11px] text-muted-foreground">
                Tu peux laisser l&apos;IA écrire pour toi puis ajuster, ou tout taper à la main.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Type de produit *</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as 'physical' | 'digital')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="physical">Produit physique (livré par coursier)</option>
                <option value="digital">Produit digital (téléchargement instantané)</option>
              </select>
              <p className="text-[11px] text-muted-foreground">Physique = paiement à la livraison. Digital = paiement en ligne immédiat.</p>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Tarification</CardTitle>
            <CardDescription>Prix de vente, prix barré et coût d&apos;achat.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="price">Prix de vente *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  placeholder="Ex: 45000"
                />
                <p className="text-[11px] text-muted-foreground">Le prix que paye le client.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="compareAtPrice">Prix avant remise (optionnel)</Label>
                <Input
                  id="compareAtPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={compareAtPrice}
                  onChange={(e) => setCompareAtPrice(e.target.value)}
                  placeholder="Ex: 60000"
                />
                <p className="text-[11px] text-muted-foreground">Affiché barré pour montrer la promo.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cost">Coût d&apos;achat (optionnel)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="Ex: 22000"
                />
                <p className="text-[11px] text-muted-foreground">Pour calculer ta marge. Pas visible client.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SKU & Barcode */}
        <Card>
          <CardHeader>
            <CardTitle>Référence produit (SKU & code-barres)</CardTitle>
            <CardDescription>Identifiants utilisés pour le stock et MogaDelivery.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU (référence interne)</Label>
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: BS-CAFTAN-MAR-001"
              />
              <p className="text-[11px] text-muted-foreground">Ta référence interne. <strong>Doit être identique côté MogaDelivery</strong> pour que les commandes soient bien matchées.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barcode">Code-barres EAN / UPC (optionnel)</Label>
              <Input
                id="barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Ex: 1234567890123"
              />
              <p className="text-[11px] text-muted-foreground">13 chiffres — utile pour le scan en entrepôt.</p>
            </div>
          </CardContent>
        </Card>

        {/* Inventory (physical) */}
        {type === 'physical' && (
          <Card>
            <CardHeader>
              <CardTitle>Stock et logistique</CardTitle>
              <CardDescription>Quantité disponible, suivi et dimensions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="stock">Quantité en stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={stock}
                    placeholder="Ex: 24"
                    onChange={(e) => setStock(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Nombre d&apos;unités disponibles à la vente.</p>
                </div>
                <label htmlFor="trackInventory" className="flex items-start gap-2 pt-7 cursor-pointer">
                  <input
                    type="checkbox"
                    id="trackInventory"
                    checked={trackInventory}
                    onChange={(e) => setTrackInventory(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <span>
                    <span className="text-sm font-medium">Suivre le stock</span>
                    <span className="block text-[11px] text-muted-foreground">Décrémente automatiquement à chaque commande.</span>
                  </span>
                </label>
                <label htmlFor="allowBackorder" className="flex items-start gap-2 pt-7 cursor-pointer">
                  <input
                    type="checkbox"
                    id="allowBackorder"
                    checked={allowBackorder}
                    onChange={(e) => setAllowBackorder(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <span>
                    <span className="text-sm font-medium">Autoriser la précommande</span>
                    <span className="block text-[11px] text-muted-foreground">Ventes possibles même à 0 stock.</span>
                  </span>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="weight">Poids (optionnel)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.01"
                    min="0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="Ex: 0.6"
                  />
                  <p className="text-[11px] text-muted-foreground">Sert au calcul des frais de livraison.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weightUnit">Unité du poids</Label>
                  <select
                    id="weightUnit"
                    value={weightUnit}
                    onChange={(e) => setWeightUnit(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="lb">lb</option>
                    <option value="oz">oz</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Variants */}
        <Card>
          <CardHeader>
            <CardTitle>Variantes (taille, couleur, etc.)</CardTitle>
            <CardDescription>Optionnel. Chaque variante a son propre SKU, prix et stock.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {variants.map((v, index) => (
              <div
                key={index}
                className="grid grid-cols-2 gap-2.5 rounded-lg border bg-muted/30 p-3 sm:flex sm:flex-wrap sm:items-end sm:gap-3 sm:p-4"
              >
                <div className="col-span-2 space-y-1 sm:flex-1 sm:min-w-[140px]">
                  <Label className="text-xs">Nom de la variante</Label>
                  <Input
                    value={v.name}
                    onChange={(e) => updateVariant(index, 'name', e.target.value)}
                    placeholder="Ex: Taille S / Rouge"
                  />
                </div>
                <div className="space-y-1 sm:w-32">
                  <Label className="text-xs">SKU variante</Label>
                  <Input
                    value={v.sku}
                    onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                    placeholder="Ex: BS-CAFTAN-S"
                  />
                </div>
                <div className="space-y-1 sm:w-24">
                  <Label className="text-xs">Prix</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.price}
                    onChange={(e) => updateVariant(index, 'price', e.target.value)}
                    placeholder="Ex: 45000"
                  />
                </div>
                <div className="space-y-1 sm:w-24">
                  <Label className="text-xs">Prix barré</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.compareAtPrice}
                    onChange={(e) => updateVariant(index, 'compareAtPrice', e.target.value)}
                    placeholder="Ex: 60000"
                  />
                </div>
                {type === 'physical' && (
                  <div className="space-y-1 sm:w-20">
                    <Label className="text-xs">Stock</Label>
                    <Input
                      type="number"
                      min="0"
                      value={v.stock}
                      onChange={(e) => updateVariant(index, 'stock', e.target.value)}
                      placeholder="Ex: 8"
                    />
                  </div>
                )}
                <div className="col-span-2 flex justify-end sm:col-auto sm:w-auto">
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(index)} aria-label="Supprimer la variante" className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    <span className="sm:hidden">Supprimer</span>
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addVariant}>
              <Plus className="mr-2 h-4 w-4" /> Ajouter une variante
            </Button>
          </CardContent>
        </Card>

        {/* Images — required for both physical & digital */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Photos du produit
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                    Requis
                  </span>
                </CardTitle>
                <CardDescription className="mt-1">
                  Ajoute une ou plusieurs photos — pour le {type === 'digital' ? 'visuel digital' : 'produit physique'}, c'est la même chose.
                  La première image sera la couverture.
                </CardDescription>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-700">
                <Sparkles className="h-3 w-3" />
                Utilisé par l'AI pour la landing page
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drag-and-drop zone */}
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                'group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-all sm:px-6 sm:py-10',
                dragOver ? 'border-primary bg-primary/5' : 'border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40',
                uploading && 'pointer-events-none opacity-70'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-brand text-white shadow-md shadow-primary/25 transition-transform group-hover:scale-105">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              </div>
              <div className="text-sm font-medium">
                {uploading
                  ? `Téléversement ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? 0}…`
                  : 'Glisse-dépose ou clique pour ajouter'}
              </div>
              <div className="text-xs text-muted-foreground">
                PNG, JPG, WEBP — plusieurs fichiers à la fois
              </div>
            </label>

            {/* Thumbnails grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {images.map((url, index) => (
                  <div
                    key={url + index}
                    className={cn(
                      'group relative aspect-square overflow-hidden rounded-xl border bg-muted shadow-sm transition-all',
                      index === 0 ? 'border-primary ring-2 ring-primary/30' : 'border-border/60'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Image ${index + 1}`} className="h-full w-full object-cover" />

                    {/* Cover badge */}
                    {index === 0 && (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                        <Star className="h-3 w-3 fill-white" />
                        Couverture
                      </span>
                    )}

                    {/* Hover controls */}
                    <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/60 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveImage(index, -1)}
                          disabled={index === 0}
                          className="grid h-7 w-7 place-items-center rounded-md bg-white/90 text-foreground shadow disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImage(index, 1)}
                          disabled={index === images.length - 1}
                          className="grid h-7 w-7 place-items-center rounded-md bg-white/90 text-foreground shadow disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="grid h-7 w-7 place-items-center rounded-md bg-destructive text-destructive-foreground shadow"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Helper count */}
            {images.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {images.length} image{images.length > 1 ? 's' : ''} •{' '}
                <span className="text-foreground">survole une image pour la déplacer ou la supprimer</span>
              </p>
            )}

            {/* Add by URL — kept for power users */}
            <details className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                Ou colle une URL d'image
              </summary>
              <div className="mt-3 flex gap-2">
                <Input
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="https://…"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImageByUrl())}
                />
                <Button type="button" variant="outline" onClick={addImageByUrl}>
                  <ImagePlus className="mr-1 h-4 w-4" /> Ajouter
                </Button>
              </div>
            </details>
          </CardContent>
        </Card>

        {/* Digital product (chariow-style) */}
        {type === 'digital' && (
          <DigitalProductSection
            kind={digitalKind}
            setKind={setDigitalKind}
            assets={digitalAssets}
            uploading={digitalUploading}
            onUploadFiles={uploadDigitalFiles}
            onAddByUrl={addDigitalAssetByUrl}
            onRemove={removeDigitalAsset}
            onMove={moveDigitalAsset}
            licenseKeyTemplate={licenseKeyTemplate}
            setLicenseKeyTemplate={setLicenseKeyTemplate}
            accessType={accessType}
            setAccessType={setAccessType}
            accessDays={accessDays}
            setAccessDays={setAccessDays}
          />
        )}

        {/* SEO */}
        <Card>
          <CardHeader>
            <CardTitle>SEO</CardTitle>
            <CardDescription>Optional title and description for search engines.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seoTitle">SEO title</Label>
              <Input
                id="seoTitle"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder="Defaults to product name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seoDescription">SEO description</Label>
              <textarea
                id="seoDescription"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Short description for search results"
              />
            </div>
          </CardContent>
        </Card>

        {/* Publish */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublished"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="isPublished">Publish this product (visible in storefront)</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create product'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/products?storeId=${storeId}`)}
          >
            Cancel
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DigitalProductSection — chariow-style picker + assets manager
// ─────────────────────────────────────────────────────────────────────
interface DigitalProductSectionProps {
  kind: DigitalKind;
  setKind: (k: DigitalKind) => void;
  assets: DigitalAsset[];
  uploading: boolean;
  onUploadFiles: (files: FileList | File[]) => void;
  onAddByUrl: (url: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  licenseKeyTemplate: string;
  setLicenseKeyTemplate: (v: string) => void;
  accessType: 'lifetime' | 'limited';
  setAccessType: (v: 'lifetime' | 'limited') => void;
  accessDays: string;
  setAccessDays: (v: string) => void;
}

function DigitalProductSection(props: DigitalProductSectionProps) {
  const {
    kind, setKind, assets, uploading, onUploadFiles, onAddByUrl, onRemove, onMove,
    licenseKeyTemplate, setLicenseKeyTemplate, accessType, setAccessType, accessDays, setAccessDays,
  } = props;
  const [drag, setDrag] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlName, setUrlName] = useState('');

  const showAssetsBlock = kind === 'download' || kind === 'course' || kind === 'membership';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Produit digital
              <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-700">
                Chariow-style
              </span>
            </CardTitle>
            <CardDescription className="mt-1">
              Choisis le type de produit puis ajoute les livrables. Le client recevra un lien de téléchargement automatique.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Kind picker — 2 cols mobile (last item spans 2 if odd), 2 sm, 5 lg. */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
          {DIGITAL_KINDS.map((k) => {
            const Icon = k.icon;
            const active = kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  'group flex flex-col items-start gap-2 rounded-xl border-2 bg-card p-3.5 text-left transition-all',
                  active
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border/60 hover:border-primary/40'
                )}
              >
                <span
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-lg text-white shadow-sm',
                    active ? 'gradient-brand shadow-primary/25' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{k.label}</div>
                  <div className="text-[11px] leading-snug text-muted-foreground">{k.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Service kind: explanatory */}
        {kind === 'service' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800">
            <strong>Prestation manuelle</strong> — aucun fichier ne sera livré automatiquement. Tu contacteras toi-même le client après l&apos;achat. Une notification de commande sera envoyée à ton email.
          </div>
        )}

        {/* License template */}
        {kind === 'license' && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div>
              <Label htmlFor="lic-tpl" className="text-sm font-semibold">Modèle de clé de licence</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Une clé sera générée automatiquement à chaque achat. Tokens disponibles : <code className="rounded bg-background px-1 py-0.5 text-[11px]">{'{random}'}</code>, <code className="rounded bg-background px-1 py-0.5 text-[11px]">{'{productSlug}'}</code>, <code className="rounded bg-background px-1 py-0.5 text-[11px]">{'{orderNumber}'}</code>.
              </p>
            </div>
            <Input
              id="lic-tpl"
              value={licenseKeyTemplate}
              onChange={(e) => setLicenseKeyTemplate(e.target.value)}
              placeholder="BOUT-{productSlug}-{random}"
              className="font-mono text-sm"
            />
            <div className="rounded-lg border border-border/60 bg-card p-2 font-mono text-xs">
              Exemple : <span className="font-bold text-primary">{previewLicense(licenseKeyTemplate)}</span>
            </div>
          </div>
        )}

        {/* Membership / digital file collection */}
        {showAssetsBlock && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Livrables ({assets.length})</h3>
              <span className="text-xs text-muted-foreground">
                {kind === 'course' ? 'Vidéos & ressources' : kind === 'membership' ? 'Contenu membre' : 'Fichiers à télécharger'}
              </span>
            </div>

            {/* Drop zone */}
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files?.length) onUploadFiles(e.dataTransfer.files);
              }}
              className={cn(
                'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all',
                drag ? 'border-primary bg-primary/5' : 'border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40',
                uploading && 'pointer-events-none opacity-70'
              )}
            >
              <input
                type="file"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onUploadFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
              />
              <div className="grid h-11 w-11 place-items-center rounded-2xl gradient-brand text-white shadow-md shadow-primary/25 transition-transform group-hover:scale-105">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              </div>
              <div className="text-sm font-medium">
                {uploading ? 'Téléversement…' : 'Glisse-dépose ou clique pour ajouter des fichiers'}
              </div>
              <div className="text-xs text-muted-foreground">
                PDF, ZIP, MP4, MP3, EPUB — plusieurs fichiers à la fois
              </div>
            </label>

            {/* Assets list */}
            {assets.length > 0 && (
              <div className="space-y-2">
                {assets.map((a, i) => (
                  <div
                    key={a.id}
                    className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      {a.kind === 'video' ? <Video className="h-4 w-4" /> :
                       a.kind === 'audio' ? <Video className="h-4 w-4" /> :
                       a.kind === 'image' ? <ImagePlus className="h-4 w-4" /> :
                       a.kind === 'link'  ? <FileText className="h-4 w-4" /> :
                                            <FileText className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="uppercase">{a.kind}</span>
                        {a.size && <span>· {fmtBytes(a.size)}</span>}
                        {a.mimeType && <span>· {a.mimeType}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(a.id, -1)} disabled={i === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(a.id, 1)} disabled={i === assets.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemove(a.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add by URL */}
            <details className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                Ou ajoute un lien externe (Drive, YouTube, Vimeo…)
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_3fr_auto]">
                <Input value={urlName} onChange={(e) => setUrlName(e.target.value)} placeholder="Nom du lien" />
                <Input value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder="https://…" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onAddByUrl(urlValue, urlName);
                    setUrlValue('');
                    setUrlName('');
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Ajouter
                </Button>
              </div>
            </details>
          </div>
        )}

        {/* Access duration */}
        {kind !== 'service' && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div>
              <h3 className="text-sm font-semibold">Durée d&apos;accès</h3>
              <p className="text-xs text-muted-foreground">
                Combien de temps le client peut accéder à ses téléchargements après l&apos;achat.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="access-type"
                  checked={accessType === 'lifetime'}
                  onChange={() => setAccessType('lifetime')}
                  className="h-4 w-4"
                />
                À vie (recommandé)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="access-type"
                  checked={accessType === 'limited'}
                  onChange={() => setAccessType('limited')}
                  className="h-4 w-4"
                />
                Limitée
              </label>
              {accessType === 'limited' && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={accessDays}
                    onChange={(e) => setAccessDays(e.target.value)}
                    className="h-9 w-24"
                  />
                  <span className="text-sm text-muted-foreground">jours</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function previewLicense(template: string): string {
  return (template || 'BOUT-{random}')
    .replace(/\{random\}/g, 'A8K7-XR2T-9MEF-PLNQ')
    .replace(/\{productSlug\}/g, 'EXAMPLE')
    .replace(/\{orderNumber\}/g, 'ORD-1042');
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
