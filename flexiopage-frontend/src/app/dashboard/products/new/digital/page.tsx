'use client';

/**
 * Digital-product creation form — Chariow-style.
 *
 * Differences from the generic /products/new form:
 *   - The "kind" picker is the centerpiece (5 visual cards, not a hidden select)
 *   - Per-kind dedicated sections (course modules nested, license template
 *     helper, membership / service hints, drag-drop file uploads for downloads)
 *   - No stock / SKU / shipping / weight clutter
 *   - Access settings (lifetime vs N days, download limit) are first-class
 *   - One-time price (digital products don't track inventory)
 *
 * Submits the same payload shape as the legacy form — backend untouched.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AiDescriptionButton } from '@/components/dashboard/ai-description-button';
import {
  Download,
  Video,
  Key,
  Crown,
  Wrench,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
  Loader2,
  ImagePlus,
  X,
  FileText,
  PlayCircle,
  Image as ImageIcon,
  Music,
  LinkIcon,
  Sparkles,
  Clock,
  Infinity as InfinityIcon,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────
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

interface CourseModule {
  id: string;
  title: string;
  lessonIds: string[];
  order: number;
}

const DIGITAL_KINDS: {
  id: DigitalKind;
  label: string;
  desc: string;
  icon: typeof Download;
  accent: string;
  examples: string;
}[] = [
  {
    id: 'download',
    label: 'Téléchargement',
    desc: 'Un ou plusieurs fichiers à télécharger après l\'achat.',
    icon: Download,
    accent: 'from-indigo-500 to-violet-600',
    examples: 'Ebook PDF · Pack de templates · Presets Lightroom · Beat audio',
  },
  {
    id: 'course',
    label: 'Cours en ligne',
    desc: 'Vidéos groupées en modules, accès via un portail client.',
    icon: Video,
    accent: 'from-emerald-500 to-teal-600',
    examples: 'Masterclass · Bootcamp · Formation pas-à-pas',
  },
  {
    id: 'license',
    label: 'Clé de licence',
    desc: 'Génère une clé unique par achat (software, plug-in).',
    icon: Key,
    accent: 'from-amber-500 to-orange-600',
    examples: 'Logiciel · Plug-in · Activation API',
  },
  {
    id: 'membership',
    label: 'Abonnement',
    desc: 'Accès récurrent à un espace membre privé.',
    icon: Crown,
    accent: 'from-fuchsia-500 to-pink-600',
    examples: 'Communauté privée · Bibliothèque exclusive · Newsletter premium',
  },
  {
    id: 'service',
    label: 'Prestation',
    desc: 'Coaching, consulting — livraison manuelle.',
    icon: Wrench,
    accent: 'from-rose-500 to-red-600',
    examples: 'Coaching 1-1 · Audit · Consultation · Workshop',
  },
];

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferAssetKind(mime?: string, name?: string): DigitalAsset['kind'] {
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('image/')) return 'image';
  if (name && /\.(mp4|mov|webm|mkv)$/i.test(name)) return 'video';
  if (name && /\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'audio';
  if (name && /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name)) return 'image';
  return 'file';
}

function bytesHuman(b?: number): string {
  if (!b || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function iconForAsset(kind: DigitalAsset['kind']) {
  switch (kind) {
    case 'video': return PlayCircle;
    case 'audio': return Music;
    case 'image': return ImageIcon;
    case 'link':  return LinkIcon;
    default:      return FileText;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────
export default function NewDigitalProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get('storeId');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const assetsInputRef = useRef<HTMLInputElement>(null);

  // Store defaults so the AI description picker pre-selects the right language.
  const [storeSettings, setStoreSettings] = useState<{ language?: string; country?: string; currency?: string }>({});
  useEffect(() => {
    if (!storeId) return;
    storesApi.get(storeId).then((res) => {
      const s = (res.data as { store?: { settings?: { language?: string; country?: string; currency?: string } } }).store;
      if (s?.settings) setStoreSettings(s.settings);
    }).catch(() => { /* non-blocking */ });
  }, [storeId]);

  // ── Form state ──────────────────────────────────────────────────────
  const [kind, setKind] = useState<DigitalKind>('download');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');

  const [coverImage, setCoverImage] = useState<string>('');
  const [coverUploading, setCoverUploading] = useState(false);

  const [assets, setAssets] = useState<DigitalAsset[]>([]);
  const [assetsUploading, setAssetsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // External link asset (for "download" → external file host)
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');

  // Course modules
  const [modules, setModules] = useState<CourseModule[]>([]);

  // License
  const [licenseTemplate, setLicenseTemplate] = useState('BOUT-{productSlug}-{random}');

  // Membership / service / common access settings
  const [accessType, setAccessType] = useState<'lifetime' | 'limited'>('lifetime');
  const [accessDays, setAccessDays] = useState('30');
  const [downloadLimit, setDownloadLimit] = useState('0');

  // SEO
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  // Publish
  const [isPublished, setIsPublished] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId) setError('No store selected — open this page from /dashboard/products');
  }, [storeId]);

  // ── Cover upload ────────────────────────────────────────────────────
  async function handleCoverFile(file: File) {
    if (!storeId) return;
    setCoverUploading(true);
    try {
      const res = await storesApi.uploadMedia(storeId, file);
      const data = res.data as { media?: { url?: string } };
      const base = typeof process.env.NEXT_PUBLIC_API_URL === 'string' ? process.env.NEXT_PUBLIC_API_URL : '';
      if (data.media?.url) {
        setCoverImage(data.media.url.startsWith('http') ? data.media.url : base + data.media.url);
      }
    } catch {
      setError('Échec téléversement de la couverture.');
    } finally {
      setCoverUploading(false);
    }
  }

  // ── Asset upload (multi-file drag-drop) ─────────────────────────────
  async function uploadAssets(files: FileList | File[]) {
    if (!storeId) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setAssetsUploading(true);
    setError('');
    const base = typeof process.env.NEXT_PUBLIC_API_URL === 'string' ? process.env.NEXT_PUBLIC_API_URL : '';
    const results = await Promise.all(
      list.map(async (file) => {
        try {
          const res = await storesApi.uploadMedia(storeId, file);
          const data = res.data as { media?: { url?: string; mimeType?: string; size?: number } };
          if (data.media?.url) {
            const url = data.media.url.startsWith('http') ? data.media.url : base + data.media.url;
            return {
              id: genId('a'),
              name: file.name,
              url,
              kind: inferAssetKind(file.type, file.name),
              mimeType: file.type || data.media.mimeType,
              size: file.size || data.media.size,
              order: 0,
            } as DigitalAsset;
          }
          return null;
        } catch {
          return null;
        }
      })
    );
    const ok = results.filter((a): a is DigitalAsset => !!a);
    if (ok.length > 0) {
      setAssets((prev) => [...prev, ...ok.map((a, i) => ({ ...a, order: prev.length + i }))]);
    }
    if (ok.length < list.length) {
      setError(`${list.length - ok.length} fichier(s) non téléversé(s).`);
    }
    setAssetsUploading(false);
  }

  function addExternalLink() {
    const u = linkUrl.trim();
    const n = linkName.trim();
    if (!u || !n) return;
    setAssets((prev) => [
      ...prev,
      { id: genId('a'), name: n, url: u, kind: 'link', order: prev.length },
    ]);
    setLinkUrl('');
    setLinkName('');
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id).map((a, i) => ({ ...a, order: i })));
    // Also remove from any course module
    setModules((prev) => prev.map((m) => ({ ...m, lessonIds: m.lessonIds.filter((lid) => lid !== id) })));
  }

  function moveAsset(id: string, dir: -1 | 1) {
    setAssets((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((a, i) => ({ ...a, order: i }));
    });
  }

  // ── Course modules ──────────────────────────────────────────────────
  function addModule() {
    setModules((prev) => [
      ...prev,
      { id: genId('m'), title: `Module ${prev.length + 1}`, lessonIds: [], order: prev.length },
    ]);
  }
  function updateModule(id: string, patch: Partial<CourseModule>) {
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function removeModule(id: string) {
    setModules((prev) => prev.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i })));
  }
  function addLessonToModule(moduleId: string, lessonId: string) {
    setModules((prev) => prev.map((m) => {
      if (m.id !== moduleId) return m;
      if (m.lessonIds.includes(lessonId)) return m;
      return { ...m, lessonIds: [...m.lessonIds, lessonId] };
    }));
  }
  function removeLessonFromModule(moduleId: string, lessonId: string) {
    setModules((prev) => prev.map((m) =>
      m.id === moduleId ? { ...m, lessonIds: m.lessonIds.filter((id) => id !== lessonId) } : m
    ));
  }
  const lessonsNotInAnyModule = assets.filter(
    (a) => !modules.some((m) => m.lessonIds.includes(a.id))
  );

  // ── Submit ──────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    if (!name.trim()) { setError('Le nom du produit est requis.'); return; }
    const priceNum = parseFloat(price);
    if (!priceNum || priceNum < 0) { setError('Indique un prix de vente.'); return; }

    // Per-kind requirement check
    if ((kind === 'download' || kind === 'course' || kind === 'membership') && assets.length === 0) {
      setError(
        kind === 'download' ? 'Ajoute au moins un fichier à télécharger.'
        : kind === 'course' ? 'Ajoute au moins une leçon (vidéo, ressource).'
        : 'Ajoute au moins un fichier ou lien d\'accès au contenu membre.'
      );
      return;
    }
    if (kind === 'license' && !licenseTemplate.trim()) {
      setError('Définis le template de clé de licence.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await storesApi.createProduct(storeId, {
        name: name.trim(),
        description: description.trim() || undefined,
        type: 'digital',
        price: priceNum,
        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
        images: coverImage ? [coverImage] : undefined,
        digitalKind: kind,
        digitalAssets: assets.length > 0
          ? assets.map((a) => ({
              id: a.id,
              name: a.name,
              url: a.url,
              kind: a.kind,
              mimeType: a.mimeType,
              size: a.size,
              order: a.order,
            }))
          : undefined,
        courseModules: kind === 'course' && modules.length > 0
          ? modules.map((m, i) => ({
              id: m.id,
              title: m.title,
              lessonIds: m.lessonIds,
              order: i,
            }))
          : undefined,
        licenseKeyTemplate: kind === 'license' ? licenseTemplate.trim() : undefined,
        accessType,
        accessDays: accessType === 'limited' ? parseInt(accessDays, 10) || 30 : undefined,
        downloadLimit: parseInt(downloadLimit, 10) || 0,
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        isPublished,
      });
      router.push(`/dashboard/products?storeId=${storeId}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || 'Échec de la création du produit.');
    } finally {
      setSaving(false);
    }
  }

  if (!storeId) {
    return (
      <div className="space-y-6">
        <p className="text-destructive">{error || 'Aucune boutique sélectionnée.'}</p>
        <Link href="/dashboard/products">
          <Button variant="outline">Retour aux produits</Button>
        </Link>
      </div>
    );
  }

  const activeKind = DIGITAL_KINDS.find((k) => k.id === kind)!;
  const KindIcon = activeKind.icon;

  return (
    <div className="mx-auto max-w-4xl space-y-5 sm:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="shrink-0 px-2 sm:px-3">
            ← <span className="hidden sm:inline ml-1">Retour</span>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-3xl">Produit digital</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">Téléchargement, cours, licence, abonnement ou prestation.</p>
          </div>
        </div>
        <div className={cn('hidden sm:flex h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-lg bg-gradient-to-br', activeKind.accent)}>
          <KindIcon className="h-6 w-6" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* ── Kind picker ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Type de produit digital</CardTitle>
            <CardDescription>Choisis ce que tu vends. Tu peux changer plus tard.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
              {DIGITAL_KINDS.map((k) => {
                const Icon = k.icon;
                const active = k.id === kind;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    className={cn(
                      'group relative overflow-hidden rounded-2xl border-2 bg-card p-4 text-left transition-all',
                      active ? 'border-primary ring-4 ring-primary/15 shadow-lg' : 'border-border/60 hover:border-primary/40 hover:-translate-y-0.5'
                    )}
                  >
                    <div className={cn(
                      'pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity',
                      k.accent,
                      active ? 'opacity-30' : 'group-hover:opacity-20'
                    )} aria-hidden />
                    <div className={cn(
                      'relative grid h-10 w-10 place-items-center rounded-xl text-white shadow-md bg-gradient-to-br transition-transform group-hover:scale-110',
                      k.accent
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="relative mt-3 text-sm font-semibold tracking-tight">{k.label}</h3>
                    <p className="relative mt-1 text-xs text-muted-foreground line-clamp-2">{k.desc}</p>
                    <p className="relative mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 line-clamp-1">{k.examples}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Basic info ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Informations principales</CardTitle>
            <CardDescription>Ce que tes clients vont voir sur la fiche produit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nom du produit *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder={kind === 'course' ? 'Ex: Bootcamp Notion · 30 jours' : kind === 'license' ? 'Ex: License Plug-in Pro' : 'Ex: Le Guide Complet — 80 pages'}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="description">Description</Label>
                {storeId && (
                  <AiDescriptionButton
                    storeId={storeId}
                    productName={name}
                    category={kind === 'course' ? 'cours en ligne' : kind === 'license' ? 'licence logicielle' : kind === 'membership' ? 'abonnement / membership' : 'téléchargement digital'}
                    price={parseFloat(price) || undefined}
                    currency={storeSettings.currency}
                    defaultLanguage={storeSettings.language}
                    defaultCountry={storeSettings.country}
                    onResult={(text) => setDescription(text)}
                  />
                )}
              </div>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Explique ce que le client va obtenir. Vise 3-5 phrases. Sois concret : ce qu'il apprend, ce qu'il télécharge, ce qu'il pourra faire."
              />
              <p className="text-[11px] text-muted-foreground">
                Tu peux faire écrire l&apos;IA puis ajuster, ou tout taper à la main.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Cover image ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Image de couverture</CardTitle>
            <CardDescription>Vignette affichée sur la boutique. Ratio 1:1 recommandé (au moins 1000×1000).</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && handleCoverFile(e.target.files[0])}
            />
            {coverImage ? (
              <div className="relative inline-block group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage} alt="" className="h-40 w-40 rounded-2xl object-cover ring-1 ring-border" />
                <button
                  type="button"
                  onClick={() => setCoverImage('')}
                  className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Supprimer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                className="grid h-40 w-40 place-items-center rounded-2xl border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                {coverUploading
                  ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                  : <div className="text-center"><ImagePlus className="mx-auto h-7 w-7 text-muted-foreground" /><span className="mt-2 block text-xs text-muted-foreground">Ajouter</span></div>}
              </button>
            )}
          </CardContent>
        </Card>

        {/* ── Pricing ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Prix</CardTitle>
            <CardDescription>{kind === 'membership' ? 'Prix d\'accès à l\'espace membre (paiement unique pour la durée choisie ci-dessous).' : 'Paiement unique. Pas de stock à gérer.'}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="price">Prix de vente *</Label>
              <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="49" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compareAtPrice">Prix barré (optionnel)</Label>
              <Input id="compareAtPrice" type="number" step="0.01" min="0" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="99" />
              <p className="text-[11px] text-muted-foreground">Pour afficher une réduction visible sur la fiche.</p>
            </div>
          </CardContent>
        </Card>

        {/* ── Per-kind content section ─────────────────────────────── */}
        {(kind === 'download' || kind === 'membership') && (
          <DownloadAssetsCard
            kind={kind}
            assets={assets}
            uploading={assetsUploading}
            inputRef={assetsInputRef}
            dragOver={dragOver}
            setDragOver={setDragOver}
            linkUrl={linkUrl}
            linkName={linkName}
            setLinkUrl={setLinkUrl}
            setLinkName={setLinkName}
            onAddLink={addExternalLink}
            onUpload={uploadAssets}
            onRemove={removeAsset}
            onMove={moveAsset}
          />
        )}

        {kind === 'course' && (
          <CourseStructureCard
            assets={assets}
            uploading={assetsUploading}
            inputRef={assetsInputRef}
            onUpload={uploadAssets}
            modules={modules}
            unassignedLessons={lessonsNotInAnyModule}
            onAddModule={addModule}
            onUpdateModule={updateModule}
            onRemoveModule={removeModule}
            onAddLessonTo={addLessonToModule}
            onRemoveLessonFrom={removeLessonFromModule}
            onRemoveAsset={removeAsset}
          />
        )}

        {kind === 'license' && (
          <LicenseCard
            template={licenseTemplate}
            onChange={setLicenseTemplate}
          />
        )}

        {kind === 'service' && (
          <ServiceCard
            description={description}
          />
        )}

        {/* ── Access settings ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Accès & livraison</CardTitle>
            <CardDescription>Pendant combien de temps le client peut accéder au contenu, et combien de fois il peut télécharger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setAccessType('lifetime')}
                className={cn(
                  'rounded-xl border-2 p-4 text-left transition-all',
                  accessType === 'lifetime' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border/60 hover:border-primary/40'
                )}
              >
                <div className="flex items-center gap-2"><InfinityIcon className="h-4 w-4 text-emerald-600" /><span className="font-semibold">Accès à vie</span></div>
                <p className="mt-1 text-xs text-muted-foreground">Le client garde l'accès indéfiniment.</p>
              </button>
              <button
                type="button"
                onClick={() => setAccessType('limited')}
                className={cn(
                  'rounded-xl border-2 p-4 text-left transition-all',
                  accessType === 'limited' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border/60 hover:border-primary/40'
                )}
              >
                <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-600" /><span className="font-semibold">Accès limité</span></div>
                <p className="mt-1 text-xs text-muted-foreground">L'accès expire après un nombre de jours.</p>
              </button>
            </div>

            {accessType === 'limited' && (
              <div className="space-y-1.5">
                <Label htmlFor="accessDays">Durée d'accès (jours)</Label>
                <Input
                  id="accessDays"
                  type="number"
                  min="1"
                  value={accessDays}
                  onChange={(e) => setAccessDays(e.target.value)}
                  className="max-w-xs"
                />
                <p className="text-[11px] text-muted-foreground">À partir du jour de l'achat.</p>
              </div>
            )}

            {kind !== 'service' && kind !== 'license' && (
              <div className="space-y-1.5">
                <Label htmlFor="downloadLimit">Limite de téléchargements par fichier (0 = illimité)</Label>
                <Input
                  id="downloadLimit"
                  type="number"
                  min="0"
                  value={downloadLimit}
                  onChange={(e) => setDownloadLimit(e.target.value)}
                  className="max-w-xs"
                />
                <p className="text-[11px] text-muted-foreground">Anti-fuite. Recommandé : 3 ou 5 si tu veux limiter le partage.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── SEO ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>SEO (optionnel)</CardTitle>
            <CardDescription>Titre et description vus dans Google et lors du partage social.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="seoTitle">Titre SEO</Label>
              <Input id="seoTitle" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Auto : nom du produit" maxLength={70} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seoDescription">Description SEO</Label>
              <textarea
                id="seoDescription"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                rows={2}
                maxLength={160}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Phrase courte qui résume le produit (≤ 160 caractères)."
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Publish ──────────────────────────────────────────────── */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="publish" className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                id="publish"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  {isPublished ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  Publier maintenant
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isPublished ? 'Le produit sera visible sur ta boutique dès la création.' : 'Tu pourras publier plus tard depuis la liste des produits.'}
                </p>
              </div>
            </label>
            <div className="flex items-center gap-2">
              <Link href={`/dashboard/products?storeId=${storeId}`}>
                <Button type="button" variant="outline">Annuler</Button>
              </Link>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Créer le produit
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────
function DownloadAssetsCard(props: {
  kind: DigitalKind;
  assets: DigitalAsset[];
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  dragOver: boolean;
  setDragOver: (b: boolean) => void;
  linkUrl: string;
  linkName: string;
  setLinkUrl: (s: string) => void;
  setLinkName: (s: string) => void;
  onAddLink: () => void;
  onUpload: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const { kind, assets, uploading, inputRef, dragOver, setDragOver, linkUrl, linkName, setLinkUrl, setLinkName, onAddLink, onUpload, onRemove, onMove } = props;
  const title = kind === 'download' ? 'Fichiers à télécharger' : 'Contenu de l\'espace membre';
  const desc = kind === 'download'
    ? 'Glisse-dépose les fichiers que le client recevra (PDF, ZIP, audio, vidéo).'
    : 'Fichiers et liens accessibles aux membres.';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ''; }}
        />

        {/* Drop zone */}
        <label
          htmlFor={undefined}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files); }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors sm:p-8',
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
          )}
        >
          {uploading
            ? <><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Téléversement…</span></>
            : <>
                <Upload className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-medium">Dépose tes fichiers ici ou clique pour parcourir</span>
                <span className="text-xs text-muted-foreground">PDF, ZIP, MP3, MP4, etc. — pas de limite de taille</span>
              </>}
        </label>

        {/* External link */}
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><LinkIcon className="h-3.5 w-3.5" /> Ajouter un lien externe</h4>
          <p className="mb-3 text-[11px] text-muted-foreground">Pour des fichiers hébergés ailleurs (Drive, Dropbox, S3, Vimeo).</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nom (ex: Bonus PDF)" className="h-9" />
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="h-9 text-xs font-mono" />
            <Button type="button" size="sm" onClick={onAddLink} disabled={!linkUrl || !linkName}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Asset list */}
        {assets.length > 0 && (
          <ul className="space-y-2">
            {assets.map((a, i) => {
              const Icon = iconForAsset(a.kind);
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.kind === 'link' ? 'Lien externe' : bytesHuman(a.size) || '—'}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onMove(a.id, -1)} disabled={i === 0} aria-label="Monter"
                      className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => onMove(a.id, 1)} disabled={i === assets.length - 1} aria-label="Descendre"
                      className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => onRemove(a.id)} aria-label="Supprimer"
                      className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CourseStructureCard(props: {
  assets: DigitalAsset[];
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onUpload: (files: FileList | File[]) => void;
  modules: CourseModule[];
  unassignedLessons: DigitalAsset[];
  onAddModule: () => void;
  onUpdateModule: (id: string, patch: Partial<CourseModule>) => void;
  onRemoveModule: (id: string) => void;
  onAddLessonTo: (moduleId: string, lessonId: string) => void;
  onRemoveLessonFrom: (moduleId: string, lessonId: string) => void;
  onRemoveAsset: (id: string) => void;
}) {
  const { uploading, inputRef, onUpload, modules, unassignedLessons, onAddModule, onUpdateModule, onRemoveModule, onAddLessonTo, onRemoveLessonFrom, onRemoveAsset } = props;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Bibliothèque de leçons</CardTitle>
          <CardDescription>Uploade toutes tes vidéos et ressources. Tu les ranges en modules ensuite.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-5 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 sm:p-8"
          >
            {uploading
              ? <><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Téléversement…</span></>
              : <><Upload className="h-7 w-7 text-muted-foreground" /><span className="text-sm font-medium">Uploader des vidéos / ressources</span></>}
          </button>

          {unassignedLessons.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">À ranger dans un module ({unassignedLessons.length})</h4>
              <ul className="space-y-1.5">
                {unassignedLessons.map((a) => {
                  const Icon = iconForAsset(a.kind);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <Icon className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="truncate text-sm">{a.name}</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {modules.length > 0 && (
                          <select
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                            onChange={(e) => { if (e.target.value) onAddLessonTo(e.target.value, a.id); }}
                            value=""
                          >
                            <option value="">→ Module…</option>
                            {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                          </select>
                        )}
                        <button type="button" onClick={() => onRemoveAsset(a.id)} aria-label="Supprimer"
                          className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Modules du cours</CardTitle>
              <CardDescription>Organise tes leçons en chapitres. Le client voit cette structure dans son portail.</CardDescription>
            </div>
            <Button type="button" size="sm" onClick={onAddModule} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Module
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {modules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              Aucun module. Clique « Module » pour créer le premier.
            </div>
          ) : (
            <ul className="space-y-3">
              {modules.map((m, mi) => (
                <li key={m.id} className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module {mi + 1}</span>
                    <Input
                      value={m.title}
                      onChange={(e) => onUpdateModule(m.id, { title: e.target.value })}
                      className="h-8 flex-1"
                      placeholder="Titre du module"
                    />
                    <button type="button" onClick={() => onRemoveModule(m.id)} aria-label="Supprimer"
                      className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {m.lessonIds.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {m.lessonIds.map((lid, li) => {
                        const lesson = props.assets.find((a) => a.id === lid);
                        if (!lesson) return null;
                        const Icon = iconForAsset(lesson.kind);
                        return (
                          <li key={lid} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="text-xs text-muted-foreground">{li + 1}.</span>
                              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{lesson.name}</span>
                            </span>
                            <button type="button" onClick={() => onRemoveLessonFrom(m.id, lid)} aria-label="Retirer du module"
                              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function LicenseCard({ template, onChange }: { template: string; onChange: (s: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Key className="h-4 w-4" /> Template de clé de licence</CardTitle>
        <CardDescription>Une clé unique est générée à chaque vente et envoyée par email au client.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={template}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
          placeholder="BOUT-{productSlug}-{random}"
        />
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
          <p className="font-semibold mb-1.5">Tokens disponibles :</p>
          <div className="grid gap-1 sm:grid-cols-3">
            <code className="rounded bg-card px-1.5 py-0.5">{'{random}'}</code>
            <span className="text-muted-foreground">→ 16 caractères base32</span>
            <code className="rounded bg-card px-1.5 py-0.5">{'{productSlug}'}</code>
            <span className="text-muted-foreground">→ slug du produit</span>
            <code className="rounded bg-card px-1.5 py-0.5">{'{orderNumber}'}</code>
            <span className="text-muted-foreground">→ numéro de commande</span>
          </div>
          <p className="mt-2 font-mono text-muted-foreground">Exemple : <span className="text-foreground">BOUT-NOTION-PRO-K3X9P2QM7L8N4ZY1-1042</span></p>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceCard({ description }: { description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Livraison de la prestation</CardTitle>
        <CardDescription>Les prestations sont livrées manuellement — pas de fichier auto.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm space-y-2">
          <p>📩 À l'achat, ton client recevra un email avec son numéro de commande et ton email de contact.</p>
          <p>📅 À toi de le recontacter dans les 24-48h pour planifier la prestation (coaching, audit, workshop…).</p>
          <p className="text-xs text-muted-foreground">
            Astuce : explique clairement dans la description ce que le client va recevoir (durée, format, prochaines étapes).
          </p>
          {description.trim().length < 100 && (
            <p className="text-xs text-amber-700 mt-2">⚠️ Ta description fait moins de 100 caractères. Pour une prestation, vise au moins 4-5 phrases concrètes.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
