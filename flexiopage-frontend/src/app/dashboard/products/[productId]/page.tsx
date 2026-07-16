'use client';

/**
 * Pro product editor — 2-column layout (sectioned form left, sticky live
 * preview right). Mirrors the storefront product page so the seller sees
 * every change as they type. Sections are independent cards so the page
 * scans top-to-bottom like a guided checklist.
 *
 * Sections:
 *   1. Identité           — name + slug + description
 *   2. Médias             — multi-image gallery (drag-reorder)
 *   3. Prix & inventaire  — price, compareAt, stock, SKU/barcode
 *   4. Variantes          — Couleur/Taille
 *   5. Page produit       — toggles + per-product overrides (badges, timer, rating, accent)
 *   6. Tags               — auto-collection keywords
 *   7. Marge & profit     — ProfitCalculator
 *   8. SEO                — title + description for search engines
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Loader2, Save, ExternalLink, Eye, EyeOff,
  Image as ImageIcon, Package, Layers, Tag, TrendingUp, Search as SearchIcon,
  Settings as SettingsIcon, Plus, Trash2,
  Palette, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, extractApiError } from '@/lib/api';
import { cn, publicStoreUrl } from '@/lib/utils';
import { ProfitCalculator, EMPTY_PROFIT_INPUTS, type ProfitInputs } from '@/components/dashboard/ProfitCalculator';
import { TagsInput } from '@/components/dashboard/tags-input';
import { VariantsEditor, type ProductVariant } from '@/components/dashboard/variants-editor';
import { ProductImagesPicker } from '@/components/dashboard/product-images-picker';
import { ProductLivePreview } from '@/components/dashboard/product-live-preview';
import { ProductDescriptionEditor } from '@/components/dashboard/product-description-editor';
import { CollectionsPicker } from '@/components/dashboard/collections-picker';
import { TimerPresetPicker } from '@/components/dashboard/timer-presets';
import { FieldToggle } from '@/components/dashboard/store-editor';
import {
  FeaturesEditor, FaqEditor, SpecsEditor, ShippingInfoEditor,
  VideoEditor, ComparisonEditor, ConversionScoreBar, CodFormPanel,
  missingByTab,
  type ProductFeature, type ProductFaqItem, type ProductSpecItem, type ProductShippingInfo,
  type ProductVideo, type ProductComparison, type ScoreTab,
} from '@/components/dashboard/product-conversion-editors';
import type { CodFormSettings } from '@/components/dashboard/store-editor';
import { Sparkles, HelpCircle, ListChecks, Truck as TruckLine, Video as VideoIcon, Scale, ShoppingCart, RotateCcw } from 'lucide-react';
import { defaultBadgesForStoreType, type TrustBadge } from '@/lib/product-page-order';
import {
  TrustBadgeCard,
  TrustBadgesPreviewStrip,
} from '@/components/dashboard/trust-badge-card';

interface PageSettings {
  showGallery: boolean;
  showDescription: boolean;
  showTrustBadges: boolean;
  showRatingStrip?: boolean;
  codFormTitle: string;
  reassuranceText: string;
  accentColor?: string;
  timer?: { endsAt?: string; headline?: string; accentColor?: string };
  badges?: TrustBadge[];
  // ── Sections "conversion" (phase 1) ──
  features?: ProductFeature[];
  faq?: ProductFaqItem[];
  specs?: ProductSpecItem[];
  shippingInfo?: ProductShippingInfo;
  // ── Sections "conversion" (phase 2) ──
  video?: ProductVideo;
  comparison?: ProductComparison;
}

type EditTab = 'essentiel' | 'conversion' | 'seo';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = params.productId as string;
  const storeId = searchParams.get('storeId');

  // ── Form state ────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [type, setType] = useState<'physical' | 'digital'>('physical');
  const [stock, setStock] = useState('0');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  // Collections manuelles dans lesquelles ce produit est rangé. La valeur
  // initiale est posée au mount via getProductCollections — on garde une
  // copie séparée pour calculer si l'utilisateur a touché à la sélection.
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [initialCollections, setInitialCollections] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [pageSettings, setPageSettings] = useState<PageSettings>({
    showGallery: true,
    showDescription: true,
    showTrustBadges: true,
    showRatingStrip: false,
    codFormTitle: '',
    reassuranceText: '',
  });
  const [profit, setProfit] = useState<ProfitInputs>(EMPTY_PROFIT_INPUTS);

  // ── Store metadata (for currency, slug, COD submit label fallback) ─
  const [currency, setCurrency] = useState('USD');
  const [storeSlug, setStoreSlug] = useState('');
  const [storeCustomDomain, setStoreCustomDomain] = useState<string | undefined>(undefined);
  const [storeCustomDomainVerified, setStoreCustomDomainVerified] = useState(false);
  const [storeCodSubmit, setStoreCodSubmit] = useState('Commander');
  // Rating strip config — vit côté store (un seul réglage pour toute la
  // boutique), on récupère ici juste pour alimenter l'aperçu live.
  const [storeRatingStars, setStoreRatingStars] = useState<number | undefined>(undefined);
  const [storeRatingReviews, setStoreRatingReviews] = useState<number | undefined>(undefined);
  // COD form — store-wide config exposée inline pour édition simultanée.
  // Sauvegarde batchée avec le produit (un seul clic Enregistrer).
  // `storeSettings` garde une copie complète des settings du store pour qu'on
  // puisse merger codForm dedans au PATCH sans écraser currency/language/etc.
  const [codForm, setCodForm] = useState<CodFormSettings>({});
  const [codFormDirty, setCodFormDirty] = useState(false);
  const [storeSettings, setStoreSettings] = useState<Record<string, unknown>>({});
  // Boutique reliée à une logistique qui matche par SKU (MogaDelivery…) → SKU imposé.
  const [logisticsActive, setLogisticsActive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirm();
  // Navigation interne — 3 tabs pour clarifier l'éditeur et déstresser
  // le scroll. Le contenu des cards existantes est juste regroupé.
  const [tab, setTab] = useState<EditTab>('essentiel');
  // Dirty tracking : snapshot JSON de l'état au load/save. Le bouton sticky
  // n'apparaît que quand l'état diverge — `beforeunload` empêche la perte
  // de travail si le vendeur ferme l'onglet sans sauver.
  const pristineRef = useRef<string>('');

  // ── Load product + store ──────────────────────────────────────────
  useEffect(() => {
    if (!storeId || !productId) return;
    let alive = true;
    Promise.all([
      storesApi.getProduct(storeId, productId),
      storesApi.get(storeId),
      storesApi.getProductCollections(storeId, productId).catch(() => ({ data: { collectionIds: [] } })),
    ])
      .then(([prodRes, storeRes, colRes]) => {
        if (!alive) return;
        const p = (prodRes.data as { product: Record<string, unknown> }).product;
        setName((p.name as string) || '');
        setSlug((p.slug as string) || '');
        setDescription((p.description as string) || '');
        setPrice(String(p.price ?? ''));
        setCompareAtPrice(p.compareAtPrice ? String(p.compareAtPrice) : '');
        setType((p.type as 'physical' | 'digital') || 'physical');
        setStock(String(p.stock ?? '0'));
        setSku((p.sku as string) || '');
        setBarcode((p.barcode as string) || '');
        setIsPublished(!!p.isPublished);
        setTags(Array.isArray(p.tags) ? (p.tags as string[]) : []);
        setVariants(Array.isArray(p.variants) ? (p.variants as ProductVariant[]) : []);
        setImages(Array.isArray(p.images) ? (p.images as string[]) : []);
        setSeoTitle((p.seoTitle as string) || '');
        setSeoDescription((p.seoDescription as string) || '');
        const ps = (p.pageSettings as Record<string, unknown>) || {};
        setPageSettings({
          showGallery: ps.showGallery !== false,
          showDescription: ps.showDescription !== false,
          showTrustBadges: ps.showTrustBadges !== false,
          showRatingStrip: !!ps.showRatingStrip,
          codFormTitle: (ps.codFormTitle as string) || '',
          reassuranceText: (ps.reassuranceText as string) || '',
          accentColor: (ps.accentColor as string) || undefined,
          timer: (ps.timer as PageSettings['timer']) || undefined,
          badges: Array.isArray(ps.badges) ? (ps.badges as TrustBadge[]) : undefined,
          features: Array.isArray(ps.features) ? (ps.features as ProductFeature[]) : undefined,
          faq: Array.isArray(ps.faq) ? (ps.faq as ProductFaqItem[]) : undefined,
          specs: Array.isArray(ps.specs) ? (ps.specs as ProductSpecItem[]) : undefined,
          shippingInfo: (ps.shippingInfo as ProductShippingInfo) || undefined,
          video: (ps.video as ProductVideo) || undefined,
          comparison: (ps.comparison as ProductComparison) || undefined,
        });
        setProfit({
          price: Number(p.price) || 0,
          cost: Number(p.cost) || 0,
          shippingCost: Number(p.shippingCost) || 0,
          packagingCost: Number(p.packagingCost) || 0,
          marketingCost: Number(p.marketingCost) || 0,
          paymentFeePct: Number(p.paymentFeePct) || 0,
          paymentFeeFixed: Number(p.paymentFeeFixed) || 0,
        });

        const s = (storeRes.data as { store: {
          slug?: string;
          customDomain?: string;
          customDomainVerified?: boolean;
          markets?: Array<{ delivery?: { provider?: string; enabled?: boolean } }>;
          integrations?: { delivery?: { provider?: string; enabled?: boolean } };
          settings?: {
            currency?: string;
            codForm?: CodFormSettings;
            storefront?: { productPage?: { style?: { ratingStripStars?: number; ratingStripReviews?: number } } };
          };
        } }).store;
        // Logistique SKU-matchée active ? → on impose le SKU (voir backend
        // lib/logistics.ts). Même règle côté serveur ; ici c'est juste l'indice.
        const SKU_PROVIDERS = new Set(['mogadelivery', 'bestdelivery']);
        const logi =
          (s?.markets || []).some(
            (m) => m.delivery?.enabled !== false && !!m.delivery?.provider && SKU_PROVIDERS.has(m.delivery.provider),
          ) ||
          !!(s?.integrations?.delivery?.enabled && s.integrations.delivery.provider && SKU_PROVIDERS.has(s.integrations.delivery.provider));
        setLogisticsActive(logi);
        if (s?.settings?.currency) setCurrency(s.settings.currency);
        if (s?.slug) setStoreSlug(s.slug);
        setStoreCustomDomain(s?.customDomain || undefined);
        setStoreCustomDomainVerified(!!s?.customDomainVerified);
        if (s?.settings?.codForm?.submitLabel) setStoreCodSubmit(s.settings.codForm.submitLabel);
        if (s?.settings?.codForm) setCodForm(s.settings.codForm);
        if (s?.settings) setStoreSettings(s.settings as Record<string, unknown>);
        setCodFormDirty(false);
        const rs = s?.settings?.storefront?.productPage?.style;
        setStoreRatingStars(rs?.ratingStripStars);
        setStoreRatingReviews(rs?.ratingStripReviews);

        const ids = (colRes.data as { collectionIds?: string[] }).collectionIds || [];
        setSelectedCollections(ids);
        setInitialCollections(ids);
      })
      .catch(() => setError('Produit introuvable'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [storeId, productId]);

  // Keep the profit calculator's price in sync with the main price field.
  useEffect(() => {
    const n = parseFloat(price) || 0;
    setProfit((prev) => (prev.price === n ? prev : { ...prev, price: n }));
  }, [price]);

  async function handleSave() {
    if (!storeId) return;
    setStatus('saving');
    setError('');
    try {
      // Save batché : produit + (si dirty) store.settings.codForm en parallèle.
      // Le COD form est store-wide mais édité ici pour cohérence — on patch
      // le store uniquement si le vendeur a touché à un de ses knobs.
      const tasks: Promise<unknown>[] = [];
      tasks.push(storesApi.updateProduct(storeId, productId, {
        name: name.trim(),
        description: description.trim() || undefined,
        price: parseFloat(price) || 0,
        compareAtPrice: parseFloat(compareAtPrice) || undefined,
        type,
        stock: parseInt(stock, 10) || 0,
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        isPublished,
        tags,
        variants,
        images,
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        cost: profit.cost || undefined,
        shippingCost: profit.shippingCost || undefined,
        packagingCost: profit.packagingCost || undefined,
        marketingCost: profit.marketingCost || undefined,
        paymentFeePct: profit.paymentFeePct || undefined,
        paymentFeeFixed: profit.paymentFeeFixed || undefined,
        pageSettings: {
          showGallery: pageSettings.showGallery,
          showDescription: pageSettings.showDescription,
          showTrustBadges: pageSettings.showTrustBadges,
          showRatingStrip: pageSettings.showRatingStrip,
          codFormTitle: pageSettings.codFormTitle.trim() || undefined,
          reassuranceText: pageSettings.reassuranceText.trim() || undefined,
          accentColor: pageSettings.accentColor || undefined,
          timer: pageSettings.timer,
          badges: pageSettings.badges,
          features: pageSettings.features,
          faq: pageSettings.faq,
          specs: pageSettings.specs,
          shippingInfo: pageSettings.shippingInfo,
          video: pageSettings.video,
          comparison: pageSettings.comparison,
        },
      }));
      if (codFormDirty) {
        // Merger codForm dans les settings complets — le backend $set replace
        // tout l'objet `settings`, donc ne pas envoyer que { codForm } sinon
        // currency/language/storefront/etc. disparaissent.
        tasks.push(storesApi.update(storeId, { settings: { ...storeSettings, codForm } }));
      }
      // Si l'appartenance aux collections a changé, on synchronise. Sortable
      // comparison : tri puis join — la liste est petite (≤ qqs dizaines).
      const a = [...selectedCollections].sort().join('|');
      const b = [...initialCollections].sort().join('|');
      if (a !== b) {
        tasks.push(
          storesApi.setProductCollections(storeId, productId, selectedCollections).then(() => {
            setInitialCollections(selectedCollections);
          }),
        );
      }
      await Promise.all(tasks);
      setCodFormDirty(false);
      if (codForm.submitLabel) setStoreCodSubmit(codForm.submitLabel);
      // Reset pristine snapshot — on n'est plus "dirty" tant que rien ne change.
      pristineRef.current = snapshot;
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 2200);
    } catch (err) {
      // Remonte le message backend (ex. SKU obligatoire pour la logistique)
      // au lieu d'un générique — sinon le vendeur ne sait pas quoi corriger.
      setError(extractApiError(err, 'La sauvegarde a échoué. Réessaie.'));
      setStatus('error');
    }
  }

  async function handleDelete() {
    if (!storeId) return;
    const ok = await confirm({
      title: `Supprimer « ${name || 'ce produit'} » ?`,
      description: 'Cette action est irréversible. La page produit publique deviendra inaccessible immédiatement.',
      confirmLabel: 'Supprimer',
      tone: 'destructive',
    });
    if (!ok) return;
    setDeleting(true);
    setError('');
    try {
      await storesApi.deleteProduct(storeId, productId);
      router.push(`/dashboard/products?storeId=${storeId}`);
    } catch {
      setError('La suppression a échoué. Réessaie.');
      setDeleting(false);
    }
  }

  const hasDiscount = useMemo(
    () => !!compareAtPrice && parseFloat(compareAtPrice) > (parseFloat(price) || 0),
    [compareAtPrice, price]
  );

  // Sérialise un snapshot représentatif de l'état pour la détection dirty.
  // On exclut les états transitoires (loading, status) et on inclut tout ce
  // que `handleSave` envoie effectivement au backend.
  const snapshot = useMemo(() => JSON.stringify({
    name, slug, description, price, compareAtPrice, type, stock, sku, barcode,
    isPublished, tags, variants, images, seoTitle, seoDescription, pageSettings,
    profit, codForm: codFormDirty ? codForm : null,
  }), [
    name, slug, description, price, compareAtPrice, type, stock, sku, barcode,
    isPublished, tags, variants, images, seoTitle, seoDescription, pageSettings,
    profit, codForm, codFormDirty,
  ]);
  const dirty = !loading && pristineRef.current !== '' && snapshot !== pristineRef.current;

  // Seed du pristine snapshot après le premier chargement réussi. On le fait
  // dans un useEffect séparé pour que `snapshot` (memo) soit déjà calculé.
  useEffect(() => {
    if (loading) return;
    if (pristineRef.current === '') pristineRef.current = snapshot;
  }, [loading, snapshot]);

  // Garde-fou : prévient la perte de travail si on ferme l'onglet sans save.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (!storeId) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Paramètre <code>storeId</code> manquant.</p>
        <Link href="/dashboard/products"><Button variant="outline">Retour aux produits</Button></Link>
      </div>
    );
  }
  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error && !name) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Link href="/dashboard/products"><Button variant="outline">Retour</Button></Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }} className="space-y-6 pb-28">
      {/* ── Sticky top header — back, title, status, save ───────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/products?storeId=${storeId}`)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Produits
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              {name || 'Nouveau produit'}
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <code>/produit/{slug || '…'}</code>
              {isPublished ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <Eye className="h-2.5 w-2.5" /> Publié
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  <EyeOff className="h-2.5 w-2.5" /> Brouillon
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Publish toggle — duplicated from Section 1 so the seller can
              flip status without scrolling. The change is staged in form
              state; it persists on the next "Enregistrer" click. */}
          <button
            type="button"
            onClick={() => setIsPublished((v) => !v)}
            aria-pressed={isPublished}
            title={isPublished ? 'Cliquer pour mettre en brouillon' : 'Cliquer pour publier'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              isPublished
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15'
            )}
          >
            {isPublished ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                Publié
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Publier
              </>
            )}
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting || status === 'saving'}
            className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Supprimer
          </Button>
          {storeSlug && slug && (
            <Link
              href={publicStoreUrl({ slug: storeSlug, customDomain: storeCustomDomain, customDomainVerified: storeCustomDomainVerified }, `product/${slug}`)}
              target="_blank"
              rel="noopener"
            >
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Voir
              </Button>
            </Link>
          )}
          {status === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Enregistré
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs text-destructive">{error || 'Erreur'}</span>
          )}
          <Button type="submit" disabled={status === 'saving'} className="gap-1.5 gradient-brand text-white">
            {status === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Enregistrer
          </Button>
        </div>
      </header>

      {(() => {
        const scoreInputs = {
          images,
          description,
          features: pageSettings.features,
          specs: pageSettings.specs,
          faq: pageSettings.faq,
          shippingInfo: pageSettings.shippingInfo,
          video: pageSettings.video,
          comparison: pageSettings.comparison,
        };
        const missCount = missingByTab(scoreInputs);
        // Bascule l'onglet adéquat puis scroll vers la card. Le delay laisse
        // React render le nouveau tab avant de chercher le DOM target.
        const jumpToAnchor = (targetTab: ScoreTab, anchor: string) => {
          if (tab !== targetTab) setTab(targetTab as EditTab);
          window.setTimeout(() => {
            const el = document.getElementById(anchor);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              el.classList.add('ring-2', 'ring-primary/50');
              window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50'), 1800);
            }
          }, 80);
        };

        return (
          <>
            {/* ── Score conversion cliquable ─────────────────────── */}
            <ConversionScoreBar inputs={scoreInputs} onJump={jumpToAnchor} />

            {/* ── Tabs internes avec badges « N section vides » ──── */}
            <nav className="-mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/80 p-1 backdrop-blur">
              {([
                { id: 'essentiel',  label: 'Essentiel',     icon: Package,    hint: 'Nom, médias, prix, variantes',     miss: missCount.essentiel },
                { id: 'conversion', label: 'Page de vente', icon: Sparkles,   hint: 'Sections qui convertissent',        miss: missCount.conversion },
                { id: 'seo',        label: 'SEO & marge',   icon: SearchIcon, hint: 'Référencement + profit',             miss: 0 },
              ] as const).map((t) => {
                const TabIcon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'group inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all',
                      active
                        ? 'gradient-brand text-white shadow-md shadow-primary/20'
                        : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                    )}
                    aria-pressed={active}
                    title={t.hint}
                  >
                    <TabIcon className="h-4 w-4" />
                    {t.label}
                    {t.miss > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                          active ? 'bg-white/25 text-white' : 'bg-amber-500/15 text-amber-700'
                        )}
                        title={`${t.miss} section${t.miss > 1 ? 's' : ''} non remplie${t.miss > 1 ? 's' : ''}`}
                      >
                        {t.miss}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </>
        );
      })()}

      {/* ── Body — 2 columns ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {tab === 'essentiel' && (<>
          {/* ── 1. Identité ─────────────────────────────────── */}
          <Card id="section-description" className="scroll-mt-24 transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Identité
              </CardTitle>
              <CardDescription>Comment le produit s&apos;appelle et ce qu&apos;il vend.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nom *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ex: T-shirt Saharien — édition limitée"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description longue</Label>
                <ProductDescriptionEditor
                  storeId={storeId}
                  value={description}
                  onChange={setDescription}
                  placeholder="Présente les bénéfices, la composition, les détails. Sépare les paragraphes par une ligne vide pour de jolis blocs."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="type">Type de produit</Label>
                  <select
                    id="type"
                    value={type}
                    onChange={(e) => setType(e.target.value as 'physical' | 'digital')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="physical">Physique (livraison COD)</option>
                    <option value="digital">Digital (téléchargement / accès)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <button
                    type="button"
                    onClick={() => setIsPublished(!isPublished)}
                    className={cn(
                      'flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm font-medium transition-colors',
                      isPublished
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700'
                        : 'border-amber-500/30 bg-amber-500/5 text-amber-700'
                    )}
                  >
                    {isPublished ? (
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5" /> Publié
                        </span>
                        <span className="text-[10px] opacity-70">cliquer pour passer en brouillon</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          <EyeOff className="h-3.5 w-3.5" /> Brouillon
                        </span>
                        <span className="text-[10px] opacity-70">cliquer pour publier</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 2. Médias ───────────────────────────────────── */}
          <Card id="section-images" className="scroll-mt-24 transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                Médias
              </CardTitle>
              <CardDescription>
                Premier visuel = image principale (carte produit + thumbnail). Les suivantes s&apos;empilent dans la galerie.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProductImagesPicker storeId={storeId} images={images} onChange={setImages} />
            </CardContent>
          </Card>

          {/* ── 3. Prix & inventaire ────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Prix & inventaire
              </CardTitle>
              <CardDescription>
                Le prix barré (compareAt) déclenche l&apos;affichage d&apos;une remise calculée automatiquement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="price">Prix de vente *</Label>
                  <div className="relative">
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                      className="pr-12"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      {currency}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="compareAt">Prix barré (optionnel)</Label>
                  <div className="relative">
                    <Input
                      id="compareAt"
                      type="number"
                      step="0.01"
                      min="0"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      placeholder="ex: 79.90"
                      className="pr-12"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      {currency}
                    </span>
                  </div>
                  {hasDiscount && (
                    <p className="text-[11px] text-emerald-700">
                      ✓ Badge promo automatique : −{Math.round(((parseFloat(compareAtPrice) - parseFloat(price)) / parseFloat(compareAtPrice)) * 100)}%
                    </p>
                  )}
                </div>
              </div>
              {type === 'physical' && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="stock">Stock</Label>
                    <Input
                      id="stock"
                      type="number"
                      min="0"
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sku">
                      SKU (référence interne)
                      {logisticsActive && <span className="ml-1 text-destructive">*</span>}
                    </Label>
                    <Input
                      id="sku"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="TSHIRT-RED-M"
                      className="font-mono text-xs"
                    />
                    {logisticsActive && !sku.trim() && (
                      <p className="text-xs text-amber-600">
                        Votre boutique est reliée à une société de livraison qui identifie chaque article
                        par son SKU. Un SKU est obligatoire pour publier ce produit — sinon la commande
                        ne pourra pas être préparée ni livrée.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="barcode">Code-barres (EAN/UPC)</Label>
                    <Input
                      id="barcode"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="3760123456789"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 4. Variantes ───────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Variantes (couleur, taille, format…)
              </CardTitle>
              <CardDescription>
                Décline le produit. Le client choisit sa variante dans le formulaire de commande, chaque variante a son stock + prix.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VariantsEditor
                variants={variants}
                onChange={setVariants}
                currency={currency}
                basePrice={parseFloat(price) || undefined}
              />
            </CardContent>
          </Card>
          </>)}

          {tab === 'conversion' && (<>
          {/* ── 5. Page produit (toggles + overrides) ──────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-4 w-4 text-primary" />
                Page publique du produit
              </CardTitle>
              <CardDescription>
                Personnalise les sections de la fiche produit publique. Les réglages ci-dessous gagnent sur la config globale de la boutique.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Shortcut to the store-wide design — the visual identity (palette,
                  colors, button shape, animation) is shared by ALL product pages
                  of the store, so it lives in Sections > Page produit > Style
                  visuel rather than per-product. Linking here makes that obvious. */}
              <Link
                href={`/dashboard/stores/${storeId}/product-page#product-page-style`}
                className="flex items-center gap-3 rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 to-card p-3 transition-all hover:-translate-y-0.5 hover:border-fuchsia-500/50 hover:shadow-md"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-sm">
                  <Palette className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">Design du formulaire & des couleurs</div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Palette, couleurs (titre, prix, bouton, navbar), forme + animation du bouton Commander — réglés globalement pour <strong>tous</strong> les produits.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-fuchsia-600" />
              </Link>
              {/* Toggles row */}
              <div className="grid gap-2 sm:grid-cols-2">
                <FieldToggle
                  label="Galerie de miniatures"
                  sublabel="Mini-images cliquables sous la photo principale"
                  checked={pageSettings.showGallery}
                  onChange={(v) => setPageSettings((s) => ({ ...s, showGallery: v }))}
                />
                <FieldToggle
                  label="Section description"
                  sublabel="Texte long sous la fiche"
                  checked={pageSettings.showDescription}
                  onChange={(v) => setPageSettings((s) => ({ ...s, showDescription: v }))}
                />
                <FieldToggle
                  label="Badges de confiance"
                  sublabel="Livraison · garantie · paiement…"
                  checked={pageSettings.showTrustBadges}
                  onChange={(v) => setPageSettings((s) => ({ ...s, showTrustBadges: v }))}
                />
                <FieldToggle
                  label="Bande d'avis (5 étoiles)"
                  sublabel="Petite ligne ★★★★★ sous le titre"
                  checked={!!pageSettings.showRatingStrip}
                  onChange={(v) => setPageSettings((s) => ({ ...s, showRatingStrip: v }))}
                />
              </div>

              {/* COD overrides */}
              {type === 'physical' && (
                <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="codFormTitle">Titre du formulaire de commande</Label>
                    <Input
                      id="codFormTitle"
                      value={pageSettings.codFormTitle}
                      onChange={(e) => setPageSettings((s) => ({ ...s, codFormTitle: e.target.value }))}
                      placeholder="Ex: Commander — paiement à la livraison"
                    />
                    <p className="text-[11px] text-muted-foreground">Vide = config globale.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reassuranceText">Ligne de réassurance</Label>
                    <Input
                      id="reassuranceText"
                      value={pageSettings.reassuranceText}
                      onChange={(e) => setPageSettings((s) => ({ ...s, reassuranceText: e.target.value }))}
                      placeholder="Ex: Aucun prépaiement · livraison 48h"
                    />
                  </div>
                </div>
              )}

              {/* Accent color (per-product) */}
              <div className="border-t border-border/60 pt-4">
                <Label className="text-xs">Couleur d&apos;accent (optionnel)</Label>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Utilisée pour le prix, les badges et le timer. Vide = couleur primaire du thème.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pageSettings.accentColor || '#7c3aed'}
                    onChange={(e) => setPageSettings((s) => ({ ...s, accentColor: e.target.value }))}
                    className="h-9 w-11 cursor-pointer rounded-md border border-border/60 bg-background p-0"
                  />
                  <Input
                    value={pageSettings.accentColor || ''}
                    onChange={(e) => setPageSettings((s) => ({ ...s, accentColor: e.target.value || undefined }))}
                    placeholder="#7c3aed (vide = thème)"
                    className="h-9 max-w-[200px] font-mono text-xs"
                  />
                  {pageSettings.accentColor && (
                    <button
                      type="button"
                      onClick={() => setPageSettings((s) => ({ ...s, accentColor: undefined }))}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      × Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Timer override */}
              <div className="border-t border-border/60 pt-4">
                <Label className="text-xs">Compte à rebours (optionnel)</Label>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Affiche un timer urgent au-dessus du formulaire COD. Choisis un modèle puis affine les détails si besoin — ou pars sur du personnalisé.
                </p>

                {/* Preset templates — one click to seed endsAt + headline + color */}
                <TimerPresetPicker
                  value={pageSettings.timer}
                  onApply={(next) => setPageSettings((s) => ({
                    ...s,
                    timer: { ...(s.timer || {}), ...next },
                  }))}
                />

                {/* Per-field fine-tune (always editable, even after a preset) */}
                {pageSettings.timer?.endsAt && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fin du timer</Label>
                      <Input
                        type="datetime-local"
                        value={new Date(pageSettings.timer.endsAt).toISOString().slice(0, 16)}
                        onChange={(e) => setPageSettings((s) => ({
                          ...s,
                          timer: { ...(s.timer || {}), endsAt: e.target.value ? new Date(e.target.value).toISOString() : undefined },
                        }))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Texte</Label>
                      <Input
                        value={pageSettings.timer?.headline || ''}
                        onChange={(e) => setPageSettings((s) => ({ ...s, timer: { ...(s.timer || {}), headline: e.target.value } }))}
                        placeholder="Offre flash — finit dans"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Couleur</Label>
                      <input
                        type="color"
                        value={pageSettings.timer?.accentColor || '#ef4444'}
                        onChange={(e) => setPageSettings((s) => ({ ...s, timer: { ...(s.timer || {}), accentColor: e.target.value } }))}
                        className="h-9 w-12 cursor-pointer rounded-md border border-border/60 bg-background p-0"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Custom badges — override par produit. Utilise le même
                  composant que l'éditeur boutique pour rester cohérent
                  (icône OU image custom, réordonnable, aperçu en direct). */}
              <div className="border-t border-border/60 pt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs">Badges personnalisés (optionnel)</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Vide = badges globaux de la boutique. Définis ici pour overrider sur ce produit seulement.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(pageSettings.badges?.length ?? 0) > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setPageSettings((s) => ({
                          ...s,
                          badges: defaultBadgesForStoreType(type),
                        }))}
                        className="gap-1.5 text-muted-foreground"
                        title="Restaurer les 3 badges par défaut"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Réinitialiser
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPageSettings((s) => ({
                        ...s,
                        badges: [...(s.badges || []), { icon: 'truck', label: 'Nouveau badge' }],
                      }))}
                      className="gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Ajouter
                    </Button>
                  </div>
                </div>
                {pageSettings.badges && pageSettings.badges.length > 0 && (
                  <div className="space-y-3">
                    {pageSettings.badges.map((b, i) => (
                      <TrustBadgeCard
                        key={i}
                        badge={b}
                        index={i}
                        total={pageSettings.badges!.length}
                        storeId={storeId ?? undefined}
                        onChange={(patch) => setPageSettings((s) => {
                          const next = (s.badges || []).slice();
                          next[i] = { ...next[i], ...patch };
                          return { ...s, badges: next };
                        })}
                        onRemove={() => setPageSettings((s) => ({
                          ...s,
                          badges: (s.badges || []).filter((_, idx) => idx !== i),
                        }))}
                        onMove={(dir) => setPageSettings((s) => {
                          const list = (s.badges || []).slice();
                          const swap = i + dir;
                          if (swap < 0 || swap >= list.length) return s;
                          [list[i], list[swap]] = [list[swap], list[i]];
                          return { ...s, badges: list };
                        })}
                      />
                    ))}
                    <TrustBadgesPreviewStrip badges={pageSettings.badges} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── 5b. Points forts (USPs) ─────────────────────── */}
          <Card id="section-features" className="scroll-mt-24 transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Points forts
              </CardTitle>
              <CardDescription>
                Les bénéfices que le client scanne avant de lire. Affichés en haut de la fiche.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FeaturesEditor
                value={pageSettings.features}
                onChange={(features) => setPageSettings((s) => ({ ...s, features }))}
              />
            </CardContent>
          </Card>

          {/* ── 5c. Spécifications ──────────────────────────── */}
          <Card id="section-specs" className="scroll-mt-24 transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                Spécifications
              </CardTitle>
              <CardDescription>
                Table clé/valeur affichée sous la description. Matière, dimensions, garantie…
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SpecsEditor
                value={pageSettings.specs}
                onChange={(specs) => setPageSettings((s) => ({ ...s, specs }))}
              />
            </CardContent>
          </Card>

          {/* ── 5d. FAQ produit ─────────────────────────────── */}
          <Card id="section-faq" className="scroll-mt-24 transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                FAQ produit
              </CardTitle>
              <CardDescription>
                Lève les objections avant le formulaire de commande. Massivement efficace en COD.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FaqEditor
                value={pageSettings.faq}
                onChange={(faq) => setPageSettings((s) => ({ ...s, faq }))}
              />
            </CardContent>
          </Card>

          {/* ── 5e. Livraison & retours ─────────────────────── */}
          <Card id="section-shipping" className="scroll-mt-24 transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TruckLine className="h-4 w-4 text-primary" />
                Livraison & retours
              </CardTitle>
              <CardDescription>
                Réponds aux 3 questions COD : délai, frais, retour. Boost confiance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ShippingInfoEditor
                value={pageSettings.shippingInfo}
                onChange={(shippingInfo) => setPageSettings((s) => ({ ...s, shippingInfo }))}
              />
            </CardContent>
          </Card>

          {/* ── 5f. Vidéo produit ───────────────────────────── */}
          <Card id="section-video" className="scroll-mt-24 transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <VideoIcon className="h-4 w-4 text-primary" />
                Vidéo produit
              </CardTitle>
              <CardDescription>
                YouTube, Vimeo ou MP4. La vidéo prouve mieux que mille mots — surtout en COD.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VideoEditor
                value={pageSettings.video}
                onChange={(video) => setPageSettings((s) => ({ ...s, video }))}
              />
            </CardContent>
          </Card>

          {/* ── 5g. Comparatif ──────────────────────────────── */}
          <Card id="section-comparison" className="scroll-mt-24 transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary" />
                Comparatif
              </CardTitle>
              <CardDescription>
                Mets en lumière ce qui te différencie. Format « nous vs autres » sur 3-5 critères.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComparisonEditor
                value={pageSettings.comparison}
                onChange={(comparison) => setPageSettings((s) => ({ ...s, comparison }))}
              />
            </CardContent>
          </Card>

          {/* ── 5h. Formulaire COD ──────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Formulaire de commande (COD)
              </CardTitle>
              <CardDescription>
                Réglages partagés avec toute la boutique — édités ici pour rester cohérents avec la fiche produit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodFormPanel
                value={codForm}
                onChange={(next) => { setCodForm(next); setCodFormDirty(true); }}
                advancedHref={`/dashboard/stores/${storeId}/product-page#cod-form`}
                currency={currency}
              />
            </CardContent>
          </Card>
          </>)}

          {tab === 'seo' && (<>
          {/* ── 6. Tags ──────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                Tags
              </CardTitle>
              <CardDescription>
                Étiquettes consommées par les collections automatiques (« promo », « ete », « homme »…). Entrée ou virgule pour valider.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TagsInput value={tags} onChange={setTags} placeholder="ex: promo, nouveaute, homme…" />
            </CardContent>
          </Card>

          {/* ── 7. Marge & profit ──────────────────────────── */}
          <ProfitCalculator value={profit} onChange={setProfit} currency={currency} />

          {/* ── 7bis. Collections ──────────────────────────── */}
          <CollectionsPicker
            storeId={storeId}
            selected={selectedCollections}
            onChange={setSelectedCollections}
          />

          {/* ── 8. SEO ─────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SearchIcon className="h-4 w-4 text-primary" />
                Référencement (SEO)
              </CardTitle>
              <CardDescription>
                Ce qui apparaît dans Google et sur les aperçus de partage (Facebook, WhatsApp). Vide = on utilise le nom + description.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="seoTitle">Titre SEO ({seoTitle.length}/60)</Label>
                <Input
                  id="seoTitle"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder={name || 'Titre pour Google'}
                  maxLength={70}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seoDescription">Description SEO ({seoDescription.length}/160)</Label>
                <textarea
                  id="seoDescription"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  rows={3}
                  maxLength={200}
                  placeholder="Résumé qui apparaîtra dans les résultats de recherche."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {/* Live Google preview */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Aperçu Google
                </div>
                <div className="space-y-0.5">
                  <div className="truncate text-[11px] text-emerald-700">
                    {storeSlug ? publicStoreUrl({ slug: storeSlug, customDomain: storeCustomDomain, customDomainVerified: storeCustomDomainVerified }, `product/${slug}`).replace(/^https?:\/\//, '') : `boutique.com/product/${slug}`}
                  </div>
                  <div className="truncate text-sm font-semibold text-[#1a0dab]">
                    {seoTitle || name || 'Titre du produit'}
                  </div>
                  <div className="line-clamp-2 text-[12px] text-slate-600">
                    {seoDescription || description || 'Description du produit…'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          </>)}
        </div>

        {/* ── Right — sticky live preview, scrollable in son propre conteneur
              pour que le vendeur puisse parcourir TOUTE la description (et
              demain les sections conversion) sans quitter le formulaire à
              gauche. La hauteur est calée sur viewport-2rem pour rester
              sticky correctement sur les écrans hauts. */}
        <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          <ProductLivePreview
            name={name}
            description={description}
            price={parseFloat(price) || 0}
            compareAtPrice={parseFloat(compareAtPrice) || undefined}
            currency={currency}
            images={images}
            showGallery={pageSettings.showGallery}
            showDescription={pageSettings.showDescription}
            showTrustBadges={pageSettings.showTrustBadges}
            showRatingStrip={pageSettings.showRatingStrip}
            ratingStripStars={storeRatingStars}
            ratingStripReviews={storeRatingReviews}
            badges={pageSettings.badges}
            timerEndsAt={pageSettings.timer?.endsAt}
            timerHeadline={pageSettings.timer?.headline}
            timerAccentColor={pageSettings.timer?.accentColor}
            accentColor={pageSettings.accentColor}
            codSubmitLabel={storeCodSubmit}
            stock={parseInt(stock, 10) || 0}
            trackInventory={type === 'physical'}
            features={pageSettings.features}
            specs={pageSettings.specs}
            faq={pageSettings.faq}
            shippingInfo={pageSettings.shippingInfo}
            video={pageSettings.video}
            comparison={pageSettings.comparison}
          />
        </aside>
      </div>

      {/* ── Sticky save bar — apparaît dès qu'un champ change. Évite au
            vendeur de scroller jusqu'en haut pour cliquer Enregistrer après
            une édition en fin de page. Le z-30 reste en dessous des modals
            (z-50) mais au-dessus du contenu normal. */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-amber-500/30 bg-gradient-to-r from-amber-500/95 via-orange-500/95 to-amber-500/95 backdrop-blur-sm shadow-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-white sm:text-sm">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
              <span className="hidden sm:inline">Modifications non enregistrées</span>
              <span className="sm:hidden">Non enregistré</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={status === 'saving'}
                className="h-9 gap-1.5 rounded-lg bg-white text-amber-700 shadow-md hover:bg-white/95"
              >
                {status === 'saving' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Enregistrer
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
