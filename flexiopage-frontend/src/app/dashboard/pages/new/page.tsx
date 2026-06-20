'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, jobsApi, type GenerationJob } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { SectionEditor, type PageSection } from '@/components/landing/SectionEditor';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import { DevicePreviewFrame } from '@/components/landing/DevicePreviewFrame';
import {
  LayoutTemplate,
  Sparkles,
  FileText,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Package,
  Image as ImageIcon,
  Upload,
  Check,
  PackagePlus,
  AlertCircle,
  Pencil,
  Eye,
  X,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

type Step =
  | 'choice'
  | 'choose-product'
  | 'from-image'
  | 'template'
  | 'template-preview'
  | 'generating'
  | 'editor';

/** Sample products injected into the `products` section during template
 *  previews — gives sellers a realistic look without needing real catalog data. */
const PREVIEW_PRODUCTS = [
  {
    _id: 'preview-1',
    name: 'Sample Product 1',
    price: 29.99,
    images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80'],
  },
  {
    _id: 'preview-2',
    name: 'Sample Product 2',
    price: 49.99,
    images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80'],
  },
  {
    _id: 'preview-3',
    name: 'Sample Product 3',
    price: 79.99,
    images: ['https://images.unsplash.com/photo-1491637639811-60e2756cc1c7?w=600&q=80'],
  },
];

type Tone = 'professional' | 'friendly' | 'minimal';
type PageKind = 'landing' | 'product';

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
const directionOf = (lang: string): 'ltr' | 'rtl' => (RTL_LANGS.has(lang.split('-')[0]) ? 'rtl' : 'ltr');

interface ProductLite {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  price?: number;
  compareAtPrice?: number;
  type?: 'physical' | 'digital';
  images?: string[];
}

interface TemplateLite {
  id: string;
  name: string;
  description: string;
  category: string;
  sectionCount: number;
}

const SECTION_TYPES = [
  { id: 'hero', label: 'Hero' },
  { id: 'features', label: 'Features' },
  { id: 'steps', label: 'How it works' },
  { id: 'stats', label: 'Stats' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'image', label: 'Image (bloc photo)' },
  { id: 'product', label: 'Product detail' },
  { id: 'products', label: 'Products grid' },
  { id: 'brands', label: 'Brands / press' },
  { id: 'video', label: 'Video' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'cta', label: 'Call to action' },
  { id: 'cod-form', label: 'Order form (COD)' },
  { id: 'faq', label: 'FAQ' },
  { id: 'footer', label: 'Footer' },
] as const;

/**
 * Strip provider names (fal.ai, FAL_KEY, Claude, Florence, FLUX, Nano Banana,
 * Replicate, OpenAI) from any backend error before it reaches the user — keep
 * the rest of the message so debugging clues survive (rate-limit, timeout, etc).
 * Returns null if the sanitized message is empty/unsafe, so callers can fall
 * back to a generic copy.
 */
function sanitizeAiError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const blacklist = /fal\.ai|FAL_KEY|FAL[_ -]?API|\bFAL\b|Florence(?:-\d+)?|Nano[ -]?Banana(?:[ -]?Edit)?|\bClaude\b|\bFLUX\b|Replicate|OpenAI|Anthropic/gi;
  const cleaned = raw.replace(blacklist, "le service IA").trim();
  if (!cleaned) return null;
  // If the cleaned message no longer makes sense (e.g. "is not configured"), drop it.
  if (/^(is |n'est pas )/i.test(cleaned)) return null;
  return cleaned;
}

export default function NewLandingPagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get('storeId');
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  // wizard
  const [step, setStep] = useState<Step>('choice');
  const [error, setError] = useState('');

  // store + products bootstrap
  const [storeName, setStoreName] = useState('');
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // generation inputs
  const [tone, setTone] = useState<Tone>('professional');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageProductId, setImageProductId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageCaption, setImageCaption] = useState('');

  // generation context (locale + pricing)
  const [language, setLanguage] = useState<string>('en');
  const [languageTouched, setLanguageTouched] = useState<boolean>(false);
  const [country, setCountry] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [priceBefore, setPriceBefore] = useState<string>('');
  const [priceAfter, setPriceAfter] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USD');
  const [pageKind, setPageKind] = useState<PageKind>('landing');

  // template
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  // template-preview — sections loaded for the currently-previewed template,
  // plus its id/name so the confirm button knows which one to apply.
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [previewSections, setPreviewSections] = useState<PageSection[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // editor / save
  const [sections, setSections] = useState<PageSection[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // split-view editor state
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Async generation job
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<GenerationJob | null>(null);

  // ────────────────────────────── Bootstrap
  useEffect(() => {
    if (!storeId) {
      setError('No store selected');
      setProductsLoading(false);
      return;
    }
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as {
          store?: {
            name?: string;
            settings?: { currency?: string; language?: string; country?: string };
          };
        }).store;
        if (s?.name) setStoreName(s.name);
        // Pre-fill landing-page generation context from store settings
        const sl = s?.settings?.language;
        const sc = s?.settings?.country;
        const su = s?.settings?.currency;
        if (sc) setCountry(sc);
        if (su) setCurrency(su);
        if (sl) {
          // Treat store-level language as the user's chosen default
          setLanguage(sl);
          setLanguageTouched(true);
        } else if (typeof navigator !== 'undefined' && navigator.language) {
          // Pas de réglage côté store : on tombe sur la langue du navigateur
          // plutôt que de forcer l'anglais. Ça évite de générer une landing
          // en anglais pour un vendeur francophone qui n'a jamais touché aux
          // paramètres de boutique.
          const browserLang = navigator.language.slice(0, 2).toLowerCase();
          if (LANGUAGES.some((l) => l.code === browserLang)) {
            setLanguage(browserLang);
          }
        }
      })
      .catch(() => {});
    setProductsLoading(true);
    storesApi
      .listProducts(storeId)
      .then((res) => setProducts(((res.data as { products: ProductLite[] }).products) || []))
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [storeId]);

  useEffect(() => {
    if (storeId && step === 'template' && templates.length === 0) {
      setTemplatesLoading(true);
      storesApi
        .getPageTemplates(storeId)
        .then((res) => setTemplates(res.data.templates || []))
        .catch(() => setTemplates([]))
        .finally(() => setTemplatesLoading(false));
    }
  }, [storeId, step, templates.length]);

  // ────────────────────────────── Job polling
  useEffect(() => {
    if (!jobId || step !== 'generating') return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      try {
        const res = await jobsApi.get(jobId);
        if (cancelled) return;
        const j = res.data.job;
        setJob(j);
        if (j.status === 'succeeded' && j.result) {
          // Populate editor state from the job result
          // Bind le cod-form auto-ajouté au produit sélectionné, si l'utilisateur
          // a généré depuis un produit. Évite que le renderer tombe sur le
          // premier produit du catalogue (qui peut ne pas être celui ciblé).
          const sourceSlug = selectedProductId
            ? products.find((x) => x._id === selectedProductId)?.slug
            : undefined;
          setSections(withDefaultCodForm((j.result.sections as PageSection[]) || [], sourceSlug));
          setSeoTitle(j.result.seoTitle || '');
          setSeoDescription(j.result.seoDescription || '');
          if (j.result.language) setLanguage(j.result.language);
          if (j.result.currency) setCurrency(j.result.currency);
          if (j.result.imageCaption) setImageCaption(j.result.imageCaption);
          // Pre-fill name/slug from the selected product (or fallback)
          if (selectedProductId) {
            const p = products.find((x) => x._id === selectedProductId);
            const baseName = (p?.name || 'landing').toLowerCase().replace(/[^a-z0-9]+/g, '-');
            setName(baseName);
            setSlug(baseName);
          } else {
            setName('landing');
            setSlug('landing');
          }
          setStep('editor');
          setJobId(null);
        } else if (j.status === 'failed') {
          setError(j.error || 'Génération échouée. Réessaie.');
          setStep(selectedProductId ? 'choose-product' : 'from-image');
          setJobId(null);
        }
      } catch (err) {
        tries++;
        if (tries >= 5) {
          setError('Le serveur ne répond pas. Réessaie plus tard.');
          setStep(selectedProductId ? 'choose-product' : 'from-image');
          setJobId(null);
        }
      }
    };
    // Poll every 2.5s (job pipeline lasts 20-90s, faster polling just hammers the server)
    void tick();
    const interval = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, step]);

  // ────────────────────────────── Helpers
  // When the user picks a product, pre-fill price/category context with sensible defaults.
  useEffect(() => {
    if (!selectedProductId) return;
    const p = products.find((x) => x._id === selectedProductId);
    if (!p) return;
    if (p.compareAtPrice !== undefined && !priceBefore) setPriceBefore(String(p.compareAtPrice));
    if (p.price !== undefined && !priceAfter) setPriceAfter(String(p.price));
    if (p.type && !category) setCategory(p.type === 'digital' ? 'digital products' : 'physical products');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, products]);

  function addSection(type: string) {
    setSections((prev) => [
      ...prev,
      { id: `sec-${Date.now()}`, type, order: prev.length, props: { title: '', subtitle: '' } },
    ]);
  }

  // Toute nouvelle landing page se termine par un formulaire COD prêt à
  // l'emploi : un vendeur qui clique « Créer » obtient une page qui sait
  // déjà encaisser une commande sans avoir à composer manuellement le bloc.
  // Si l'IA ou le template a déjà inséré un cod-form on n'en ajoute pas.
  function withDefaultCodForm(input: PageSection[], productSlug?: string): PageSection[] {
    if (input.some((s) => s.type === 'cod-form')) return input;
    const codSection: PageSection = {
      id: `sec-cod-${Date.now()}`,
      type: 'cod-form',
      order: input.length,
      props: {
        title: 'Commander · Paiement à la livraison',
        subtitle: 'Remplis le formulaire, on te livre — tu paies à réception.',
        submitLabel: 'Commander maintenant',
        reassurance: 'Sans carte. Sans acompte. Livraison 24-72h.',
        ...(productSlug ? { productSlug } : {}),
        showEmail: true,
        requireEmail: false,
        showQuantity: true,
        showNotes: true,
        showPostalCode: false,
        showState: false,
      },
    };
    return [...input, codSection];
  }
  function updateSectionProps(index: number, props: Record<string, unknown>) {
    setSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], props: { ...next[index].props, ...props } };
      return next;
    });
  }
  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  }

  /**
   * Open the preview step for a template — loads its full sections from the
   * server and renders them via LandingRenderer so the seller sees a complete,
   * image-rich landing page before committing. From the preview they either
   * apply the template (→ editor) or go back to the list.
   */
  async function handlePreviewTemplate(templateId: string) {
    if (!storeId) return;
    setError('');
    setPreviewTemplateId(templateId);
    setPreviewSections([]);
    setPreviewLoading(true);
    setStep('template-preview');
    try {
      const res = await storesApi.getSectionsFromTemplate(storeId, templateId);
      setPreviewSections((res.data.sections || []) as PageSection[]);
    } catch {
      setError('Impossible de charger ce thème.');
      setStep('template');
    } finally {
      setPreviewLoading(false);
    }
  }

  /** Confirm-from-preview: drop the preview sections into the editor as the
   *  starting point. The seller can then customise/replace as they wish. */
  function applyPreviewedTemplate() {
    if (!previewTemplateId || previewSections.length === 0) return;
    setSections(withDefaultCodForm(previewSections));
    const t = templates.find((x) => x.id === previewTemplateId);
    if (t) setName(t.name.replace(/\s+/g, '-').toLowerCase());
    setSlug('');
    setStep('editor');
  }

  async function handleGenerateFromProduct() {
    if (!storeId || !selectedProductId) return;
    setGenerating(true);
    setError('');
    setJob(null);
    try {
      const res = await storesApi.generateFromProductAsync(storeId, {
        productId: selectedProductId,
        tone,
        language: language || undefined,
        country: country || undefined,
        category: category || undefined,
        priceBefore: priceBefore ? Number(priceBefore) : undefined,
        priceAfter: priceAfter ? Number(priceAfter) : undefined,
        currency: currency || undefined,
        pageKind,
      });
      setJobId(res.data.jobId);
      setStep('generating');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setError(
        isAdmin
          ? (msg || 'AI generation failed. Check FAL_KEY on the server.')
          : (sanitizeAiError(msg) || 'La génération a échoué. Réessaie dans un instant.'),
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateFromImage() {
    if (!storeId || !imageUrl.trim()) {
      setError('Please provide an image URL');
      return;
    }
    setGenerating(true);
    setError('');
    setImageCaption('');
    setJob(null);
    try {
      const res = await storesApi.generateFromImageAsync(storeId, {
        imageUrl: imageUrl.trim(),
        productId: imageProductId || undefined,
        tone,
        language: language || undefined,
        country: country || undefined,
        category: category || undefined,
        priceBefore: priceBefore ? Number(priceBefore) : undefined,
        priceAfter: priceAfter ? Number(priceAfter) : undefined,
        currency: currency || undefined,
        pageKind,
      });
      setJobId(res.data.jobId);
      setStep('generating');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setError(
        isAdmin
          ? (msg || 'AI generation failed. Check the image URL or FAL_KEY on the server.')
          : (sanitizeAiError(msg) || "La génération a échoué. Vérifie l'URL de l'image et réessaie."),
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleUploadImage(file: File) {
    if (!storeId) return;
    setUploading(true);
    setError('');
    try {
      const res = await storesApi.uploadMedia(storeId, file);
      const media = (res.data as { media?: { url?: string } }).media;
      if (media?.url) {
        const url = media.url.startsWith('http')
          ? media.url
          : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')}${media.url}`;
        setImageUrl(url);
      } else {
        setError('Upload failed: no URL returned');
      }
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setError('');
    try {
      await storesApi.createPage(storeId, {
        name: name.trim(),
        slug: slug.trim() || undefined,
        sections: sections.map((s) => ({ id: s.id, type: s.type, order: s.order, props: s.props })),
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        language: language || undefined,
        country: country || undefined,
        currency: currency || undefined,
        direction: directionOf(language),
        isPublished: false,
      });
      router.push(`/dashboard/pages?storeId=${storeId}`);
      router.refresh();
    } catch {
      setError('Failed to create page');
    } finally {
      setSaving(false);
    }
  }

  // ────────────────────────────── Guards
  if (!storeId) {
    return (
      <div className="space-y-6">
        <p className="text-destructive">No store selected.</p>
        <Link href="/dashboard/pages">
          <Button variant="outline">Back to pages</Button>
        </Link>
      </div>
    );
  }

  // ────────────────────────────── Empty state: require a product first
  if (!productsLoading && products.length === 0 && step === 'choice') {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in-up">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/pages')} className="-ml-2 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-8 text-center">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full gradient-brand opacity-10 blur-3xl" aria-hidden />
          <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl gradient-brand text-white shadow-lg shadow-primary/30 animate-float">
            <PackagePlus className="h-7 w-7" />
          </div>
          <h2 className="relative text-2xl font-bold tracking-tight">Add a product first</h2>
          <p className="relative mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Landing pages are built from products. Add at least one product to your store —
            then we'll generate a tailored page for it (or from an inspiration image).
          </p>
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link href={`/dashboard/products/new?storeId=${storeId}`}>
              <Button className="h-11 gap-2 rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-95">
                <PackagePlus className="h-4 w-4" />
                Add a product
              </Button>
            </Link>
            <Link href={`/dashboard/products?storeId=${storeId}`}>
              <Button variant="outline" className="h-11 rounded-xl">
                Manage products
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────── Step: Choice
  if (step === 'choice') {
    return (
      <div className="mx-auto max-w-5xl space-y-8 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/pages')} className="-ml-2 gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create a landing page</h1>
          <p className="text-muted-foreground">
            Pick how you want to start. AI options use your product data and image inspiration.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ChoiceCard
            icon={Package}
            badge="Recommended"
            title="From a product"
            desc="Pick one of your products. AI writes copy that matches it."
            accent="from-indigo-500 to-violet-600"
            glow="shadow-indigo-500/30"
            onClick={() => {
              setSelectedProductId(products[0]?._id || null);
              setStep('choose-product');
            }}
          />
          <ChoiceCard
            icon={ImageIcon}
            badge="AI vision"
            title="From an image"
            desc="Upload or paste an image URL. AI describes it and builds a page."
            accent="from-fuchsia-500 to-pink-600"
            glow="shadow-fuchsia-500/30"
            onClick={() => setStep('from-image')}
          />
          <ChoiceCard
            icon={LayoutTemplate}
            title="From template"
            desc="Pick a professional template. Edit and publish."
            accent="from-amber-500 to-orange-600"
            glow="shadow-amber-500/30"
            onClick={() => setStep('template')}
          />
          <ChoiceCard
            icon={FileText}
            title="Blank page"
            desc="Start from scratch. Add sections manually."
            accent="from-emerald-500 to-teal-600"
            glow="shadow-emerald-500/30"
            onClick={() => {
              setSections(withDefaultCodForm([]));
              setStep('editor');
            }}
          />
        </div>
      </div>
    );
  }

  // ────────────────────────────── Step: Choose product
  if (step === 'choose-product') {
    return (
      <div className="mx-auto max-w-3xl space-y-6 animate-fade-in-up">
        <Button variant="ghost" size="sm" onClick={() => setStep('choice')} className="-ml-2 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pick a product</h1>
          <p className="text-muted-foreground">
            We'll use the product's name, description, type and price to generate the landing copy.
          </p>
        </div>

        {error && <ErrorBox message={error} />}

        <div className="grid gap-3 sm:grid-cols-2">
          {products.map((p) => {
            const active = selectedProductId === p._id;
            return (
              <button
                key={p._id}
                type="button"
                onClick={() => setSelectedProductId(p._id)}
                className={cn(
                  'group relative overflow-hidden rounded-2xl border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                  active ? 'border-primary ring-4 ring-primary/15' : 'border-border/60 hover:border-primary/30'
                )}
              >
                <div className="flex items-start gap-3">
                  {p.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0]} alt={p.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                      <Package className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                      {active && (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-white">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[11px] font-medium">
                      {p.type && (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5',
                            p.type === 'digital' ? 'bg-fuchsia-500/10 text-fuchsia-700' : 'bg-indigo-500/10 text-indigo-700'
                          )}
                        >
                          {p.type}
                        </span>
                      )}
                      {p.price !== undefined && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          {formatCurrency(p.price, currency || 'USD', language)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <ContextForm
          tone={tone} setTone={setTone}
          language={language} setLanguage={(v) => { setLanguage(v); setLanguageTouched(true); }}
          languageTouched={languageTouched}
          country={country} setCountry={setCountry}
          category={category} setCategory={setCategory}
          priceBefore={priceBefore} setPriceBefore={setPriceBefore}
          priceAfter={priceAfter} setPriceAfter={setPriceAfter}
          currency={currency} setCurrency={setCurrency}
          pageKind={pageKind} setPageKind={setPageKind}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!selectedProductId || generating}
            onClick={handleGenerateFromProduct}
            className="h-11 gap-2 rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-95"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? (isAdmin ? 'Generating with fal.ai…' : 'Génération en cours…') : 'Générer la landing'}
          </Button>
          <Link href={`/dashboard/products/new?storeId=${storeId}`}>
            <Button variant="outline" className="h-11 gap-2 rounded-xl">
              <PackagePlus className="h-4 w-4" />
              Add another product
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ────────────────────────────── Step: From image
  if (step === 'from-image') {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in-up">
        <Button variant="ghost" size="sm" onClick={() => setStep('choice')} className="-ml-2 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate from an image</h1>
          <p className="text-muted-foreground">
            Upload an image or paste a URL. AI describes it and builds matching landing copy.
          </p>
        </div>

        {error && <ErrorBox message={error} />}

        <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
          <label
            htmlFor="image-upload"
            className={cn(
              'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-muted/30 px-6 py-10 text-center transition-all hover:border-primary/40 hover:bg-muted/50',
              uploading && 'opacity-60'
            )}
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-brand text-white shadow-md shadow-primary/25 group-hover:scale-105 transition-transform">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            </div>
            <div className="text-sm font-medium">
              {uploading ? 'Uploading...' : 'Click to upload an image'}
            </div>
            <div className="text-xs text-muted-foreground">PNG, JPG up to 10MB</div>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadImage(f);
              }}
            />
          </label>

          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or paste a URL
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="img-url">Image URL</Label>
            <Input
              id="img-url"
              type="url"
              placeholder="https://example.com/inspiration.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          {imageUrl && (
            <div className="overflow-hidden rounded-xl border border-border/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Preview" className="max-h-56 w-full object-cover" />
            </div>
          )}

          {products.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="opt-product">Optional: link a product (improves copy)</Label>
              <select
                id="opt-product"
                value={imageProductId || ''}
                onChange={(e) => setImageProductId(e.target.value || null)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No product</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <ContextForm
            tone={tone} setTone={setTone}
            language={language} setLanguage={(v) => { setLanguage(v); setLanguageTouched(true); }}
            languageTouched={languageTouched}
            country={country} setCountry={setCountry}
            category={category} setCategory={setCategory}
            priceBefore={priceBefore} setPriceBefore={setPriceBefore}
            priceAfter={priceAfter} setPriceAfter={setPriceAfter}
            currency={currency} setCurrency={setCurrency}
            pageKind={pageKind} setPageKind={setPageKind}
          />

          <Button
            disabled={!imageUrl.trim() || generating}
            onClick={handleGenerateFromImage}
            className="h-11 w-full gap-2 rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-95"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? (isAdmin ? 'Analyzing image with fal.ai…' : "Analyse de l'image…") : "Générer à partir de l'image"}
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────── Step: Template
  if (step === 'template') {
    return (
      <div className="mx-auto max-w-5xl space-y-6 animate-fade-in-up">
        <Button variant="ghost" size="sm" onClick={() => setStep('choice')} className="-ml-2 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Choose a template</h1>
        </div>
        {error && <ErrorBox message={error} />}
        {templatesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handlePreviewTemplate(t.id)}
                className="group overflow-hidden rounded-2xl border border-border/60 bg-card text-left transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
              >
                <div className="grid h-28 place-items-center bg-muted text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {t.category}
                </div>
                <div className="space-y-2 p-4">
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">{t.sectionCount} sections</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      <Eye className="h-3.5 w-3.5" />
                      Voir le thème
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────────── Step: Template preview
  if (step === 'template-preview') {
    const previewTpl = templates.find((x) => x.id === previewTemplateId);
    return (
      <div className="space-y-0 animate-fade-in-up">
        {/* Sticky preview header — name + action buttons */}
        <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('template')}
                className="-ml-1 gap-1.5 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Retour</span>
              </Button>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Aperçu du thème
                </div>
                <div className="truncate text-sm font-semibold sm:text-base">
                  {previewTpl?.name || 'Thème'}
                </div>
              </div>
            </div>
            <Button
              onClick={applyPreviewedTemplate}
              disabled={previewLoading || previewSections.length === 0}
              className="h-10 gap-2 rounded-xl gradient-brand text-white shadow-md shadow-primary/25 hover:opacity-95"
            >
              <Check className="h-4 w-4" />
              Utiliser ce thème
            </Button>
          </div>
        </div>

        {/* Preview frame — renders the template's sections with example
            product data so the seller sees a realistic, complete page. */}
        {previewLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : previewSections.length === 0 ? (
          <div className="py-24 text-center text-sm text-muted-foreground">
            Aucune section trouvée pour ce thème.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
            <LandingRenderer
              sections={previewSections}
              products={PREVIEW_PRODUCTS}
              direction={directionOf(language)}
              language={language}
              currency={currency}
            />
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────────── Step: Generating (4-step progress)
  if (step === 'generating') {
    const j = job;
    const progress = j?.progress ?? 5;
    type StepKey = 'analyze' | 'copy' | 'images' | 'assemble';
    const STEPS: { key: StepKey; label: string; sub: string }[] = [
      {
        key: 'analyze',
        label: isAdmin ? 'Analyse photo' : 'Analyse du produit',
        sub: isAdmin
          ? "Florence-2 décrit ce qu'il voit sur ton produit"
          : "L'IA détecte ce qu'il y a sur ta photo",
      },
      {
        key: 'copy',
        label: isAdmin ? 'Rédaction copy' : 'Rédaction du texte',
        sub: isAdmin
          ? 'Claude écrit en dialecte natif (anti-Fusha)'
          : 'Génération du copy en dialecte natif (anti-Fusha)',
      },
      {
        key: 'images',
        label: isAdmin ? 'Génération visuels' : 'Création des visuels',
        sub: isAdmin
          ? 'Nano Banana Edit place ton produit dans des scènes'
          : 'Ton produit est mis en scène dans des décors cinématiques',
      },
      {
        key: 'assemble',
        label: 'Assemblage',
        sub: 'Sauvegarde des images, finalisation des sections',
      },
    ];
    const stepStatus = (k: StepKey) => j?.steps?.[k] || 'pending';
    return (
      <div className="mx-auto max-w-2xl space-y-8 py-6 animate-fade-in-up">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl gradient-brand text-white shadow-lg shadow-primary/30 animate-float">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Génération en cours…</h1>
          <p className="text-sm text-muted-foreground">
            On crée ta landing page. Garde cet onglet ouvert — ça prend ~15 à 25 secondes.
          </p>
        </div>

        {/* Big progress bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-bold text-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full gradient-brand transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 4 steps */}
        <div className="space-y-3">
          {STEPS.map((s) => {
            const status = stepStatus(s.key);
            const isRunning = status === 'running';
            const isDone = status === 'done';
            const isFailed = status === 'failed';
            return (
              <div
                key={s.key}
                className={cn(
                  'flex items-center gap-4 rounded-2xl border p-4 transition-all',
                  isRunning && 'border-primary/40 bg-primary/5',
                  isDone && 'border-emerald-500/30 bg-emerald-500/5',
                  isFailed && 'border-destructive/40 bg-destructive/5',
                  !isRunning && !isDone && !isFailed && 'border-border/60 bg-card'
                )}
              >
                <div
                  className={cn(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                    isDone ? 'bg-emerald-500 text-white' :
                    isRunning ? 'gradient-brand text-white shadow-md shadow-primary/30' :
                    isFailed ? 'bg-destructive text-white' :
                    'bg-muted text-muted-foreground'
                  )}
                >
                  {isDone ? <Check className="h-5 w-5" strokeWidth={3} /> :
                    isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> :
                    isFailed ? <AlertCircle className="h-5 w-5" /> :
                    <span className="text-sm font-bold">{STEPS.findIndex((x) => x.key === s.key) + 1}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('font-semibold tracking-tight', !isRunning && !isDone && 'text-muted-foreground')}>
                      {s.label}
                    </span>
                    {isRunning && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        En cours
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {j?.status === 'failed' && (
          <ErrorBox message={j.error || 'Génération échouée'} />
        )}

        {/* Cancel */}
        <div className="flex justify-center pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setJobId(null);
              setJob(null);
              setStep(selectedProductId ? 'choose-product' : 'from-image');
            }}
          >
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────── Step: Editor (split view: form left / live preview right)
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-64px)] flex-col bg-muted/30 sm:-mx-6 lg:-mx-8">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => setStep('choice')} className="-ml-2 gap-1.5 shrink-0">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">{name || 'New landing page'}</h1>
            {storeName && <p className="truncate text-xs text-muted-foreground">{storeName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* device toggle */}
          <div className="hidden items-center rounded-lg border border-border/60 bg-card p-0.5 sm:inline-flex">
            <button
              type="button"
              onClick={() => setPreviewDevice('desktop')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                previewDevice === 'desktop' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Desktop preview"
            >
              <Monitor className="h-3.5 w-3.5" />
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setPreviewDevice('mobile')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                previewDevice === 'mobile' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Mobile
            </button>
          </div>
          <Button
            type="button"
            variant={editPanelOpen ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditPanelOpen((v) => !v)}
            className="h-9 gap-1.5 rounded-lg"
          >
            {editPanelOpen ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editPanelOpen ? 'Fermer l\'éditeur' : 'Modifier'}
          </Button>
          <form onSubmit={handleSubmit} className="contents">
            <Button
              type="submit"
              disabled={saving || !name.trim()}
              className="h-9 gap-1.5 rounded-lg gradient-brand text-white shadow-md shadow-primary/25 hover:opacity-95"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? 'Création...' : 'Créer'}
            </Button>
          </form>
        </div>
      </header>

      {/* AI vision banner */}
      {imageCaption && (
        <div className="shrink-0 border-b border-fuchsia-500/30 bg-fuchsia-500/5 px-4 py-2 text-xs sm:px-6">
          <span className="font-semibold text-fuchsia-700">AI vision:</span>{' '}
          <span className="text-fuchsia-700/90">{imageCaption}</span>
        </div>
      )}

      {/* Body: split */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT panel — form / sections editor */}
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r border-border/60 bg-card/40 transition-all duration-300',
            editPanelOpen ? 'w-full sm:w-[440px] lg:w-[480px]' : 'w-full sm:w-[340px]'
          )}
        >
          <div className="flex-1 overflow-y-auto p-5">
            {error && <div className="mb-4"><ErrorBox message={error} /></div>}

            {/* Page details — always visible */}
            <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
              <div>
                <h2 className="text-sm font-semibold">Détails</h2>
                <p className="text-xs text-muted-foreground">Nom et slug pour le SEO.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs">Nom de la page</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="ex. Home" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug" className="text-xs">Slug URL</Label>
                <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ex. home" />
              </div>
            </section>

            {/* SEO — always visible */}
            <section className="mt-4 space-y-3 rounded-2xl border border-border/60 bg-card p-4">
              <h2 className="text-sm font-semibold">SEO</h2>
              <div className="space-y-2">
                <Label className="text-xs">Titre SEO</Label>
                <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Titre pour les moteurs" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Description SEO</Label>
                <textarea
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Courte description"
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                />
              </div>
            </section>

            {/* Sections editor — only when "Modifier" is on */}
            {editPanelOpen ? (
              <section className="mt-4 rounded-2xl border border-primary/30 bg-card p-4 ring-2 ring-primary/10">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Sections ({sections.length})</h2>
                    <p className="text-xs text-muted-foreground">Édite ou ajoute des blocs.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pb-3">
                  {SECTION_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => addSection(t.id)}
                      className="inline-flex h-7 items-center rounded-md border border-border/60 bg-background px-2 text-[11px] font-medium hover:border-primary/40 hover:bg-muted"
                    >
                      + {t.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  {sections.map((sec, index) => (
                    <SectionEditor
                      key={sec.id}
                      section={sec}
                      index={index}
                      onUpdate={(props) => updateSectionProps(index, props)}
                      onRemove={() => removeSection(index)}
                    />
                  ))}
                  {sections.length === 0 && (
                    <p className="text-xs text-muted-foreground">Aucune section. Utilise les boutons ci-dessus.</p>
                  )}
                </div>
              </section>
            ) : (
              <section className="mt-4 rounded-2xl border border-dashed border-border/60 bg-card/40 p-5 text-center">
                <Pencil className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{sections.length} sections générées</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  L'aperçu à droite est la page finale. Clique « Modifier » dans la barre du haut pour ajuster les blocs.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() => setEditPanelOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier les sections
                </Button>
              </section>
            )}
          </div>

          {/* footer with secondary actions */}
          <div className="shrink-0 border-t border-border/60 bg-card px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={() => router.push(`/dashboard/pages?storeId=${storeId}`)}
            >
              Annuler et retour
            </Button>
          </div>
        </aside>

        {/* RIGHT panel — live preview */}
        <main className="hidden flex-1 flex-col overflow-hidden bg-muted/40 sm:flex">
          <div className="shrink-0 border-b border-border/60 bg-card/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700">
              <Eye className="h-3 w-3" />
              Aperçu live
            </span>
            <span className="ml-2">— les modifications s'affichent en direct</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sections.length > 0 ? (
              <div
                className={cn(
                  'mx-auto bg-background shadow-2xl ring-1 ring-black/5 transition-all duration-300',
                  previewDevice === 'mobile'
                    ? 'my-6 overflow-hidden rounded-[36px] border-8 border-foreground/80'
                    : 'min-h-full w-full'
                )}
                style={previewDevice === 'mobile' ? { width: 390 } : undefined}
              >
                <DevicePreviewFrame device={previewDevice}>
                  <LandingRenderer
                    sections={sections}
                    direction={directionOf(language)}
                    language={language}
                    currency={currency}
                  />
                </DevicePreviewFrame>
              </div>
            ) : (
              <div className="grid h-full min-h-[400px] place-items-center p-12 text-center text-sm text-muted-foreground">
                <div>
                  <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                  Aucune section pour le moment.<br />
                  Ajoute des blocs depuis le panneau de gauche pour voir l'aperçu.
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ────────────────────────────── Reusable bits

function ChoiceCard({
  icon: Icon,
  title,
  desc,
  accent,
  glow,
  badge,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  accent: string;
  glow: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl animate-fade-in-up"
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-30',
          accent
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-2">
        <div
          className={cn(
            'grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
            accent,
            glow
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{badge}</span>
        )}
      </div>
      <h3 className="relative mt-4 text-base font-semibold tracking-tight">{title}</h3>
      <p className="relative mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="relative mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
        Choose
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

const CURRENCIES: { code: string; label: string; symbol: string; group: 'arab' | 'africa' | 'eu' | 'other' }[] = [
  // Arab world
  { code: 'SAR', label: 'Saudi Riyal',           symbol: 'ر.س',  group: 'arab' },
  { code: 'AED', label: 'UAE Dirham',            symbol: 'د.إ',  group: 'arab' },
  { code: 'EGP', label: 'Egyptian Pound',        symbol: 'ج.م',  group: 'arab' },
  { code: 'MAD', label: 'Moroccan Dirham',       symbol: 'د.م.', group: 'arab' },
  { code: 'TND', label: 'Tunisian Dinar',        symbol: 'د.ت',  group: 'arab' },
  { code: 'DZD', label: 'Algerian Dinar',        symbol: 'د.ج',  group: 'arab' },
  { code: 'QAR', label: 'Qatari Riyal',          symbol: 'ر.ق',  group: 'arab' },
  { code: 'KWD', label: 'Kuwaiti Dinar',         symbol: 'د.ك',  group: 'arab' },
  { code: 'BHD', label: 'Bahraini Dinar',        symbol: '.د.ب', group: 'arab' },
  { code: 'OMR', label: 'Omani Rial',            symbol: 'ر.ع.', group: 'arab' },
  { code: 'JOD', label: 'Jordanian Dinar',       symbol: 'د.أ',  group: 'arab' },
  { code: 'LBP', label: 'Lebanese Pound',        symbol: 'ل.ل',  group: 'arab' },
  { code: 'IQD', label: 'Iraqi Dinar',           symbol: 'ع.د',  group: 'arab' },
  { code: 'YER', label: 'Yemeni Rial',           symbol: '﷼',    group: 'arab' },
  { code: 'SYP', label: 'Syrian Pound',          symbol: 'ل.س',  group: 'arab' },
  { code: 'LYD', label: 'Libyan Dinar',          symbol: 'ل.د',  group: 'arab' },
  { code: 'SDG', label: 'Sudanese Pound',        symbol: 'ج.س.', group: 'arab' },
  { code: 'MRU', label: 'Mauritanian Ouguiya',   symbol: 'أ.م',  group: 'arab' },
  // Afrique sub-saharienne
  { code: 'NGN', label: 'Nigerian Naira',        symbol: '₦',    group: 'africa' },
  { code: 'KES', label: 'Kenyan Shilling',       symbol: 'KSh',  group: 'africa' },
  { code: 'ZAR', label: 'South African Rand',    symbol: 'R',    group: 'africa' },
  { code: 'GHS', label: 'Ghanaian Cedi',         symbol: '₵',    group: 'africa' },
  { code: 'XOF', label: 'CFA Franc (BCEAO)',     symbol: 'CFA',  group: 'africa' },
  { code: 'XAF', label: 'CFA Franc (BEAC)',      symbol: 'FCFA', group: 'africa' },
  { code: 'ETB', label: 'Ethiopian Birr',        symbol: 'Br',   group: 'africa' },
  { code: 'TZS', label: 'Tanzanian Shilling',    symbol: 'TSh',  group: 'africa' },
  { code: 'UGX', label: 'Ugandan Shilling',      symbol: 'USh',  group: 'africa' },
  { code: 'RWF', label: 'Rwandan Franc',         symbol: 'FRw',  group: 'africa' },
  { code: 'GNF', label: 'Guinean Franc',         symbol: 'FG',   group: 'africa' },
  { code: 'CDF', label: 'Congolese Franc',       symbol: 'FC',   group: 'africa' },
  { code: 'AOA', label: 'Angolan Kwanza',        symbol: 'Kz',   group: 'africa' },
  { code: 'ZMW', label: 'Zambian Kwacha',        symbol: 'ZK',   group: 'africa' },
  { code: 'ZWL', label: 'Zimbabwean Dollar',     symbol: 'Z$',   group: 'africa' },
  { code: 'MZN', label: 'Mozambican Metical',    symbol: 'MT',   group: 'africa' },
  { code: 'MGA', label: 'Malagasy Ariary',       symbol: 'Ar',   group: 'africa' },
  { code: 'MUR', label: 'Mauritian Rupee',       symbol: '₨',    group: 'africa' },
  { code: 'BWP', label: 'Botswana Pula',         symbol: 'P',    group: 'africa' },
  { code: 'NAD', label: 'Namibian Dollar',       symbol: 'N$',   group: 'africa' },
  { code: 'MWK', label: 'Malawian Kwacha',       symbol: 'MK',   group: 'africa' },
  // EU & nearby
  { code: 'EUR', label: 'Euro',                  symbol: '€',    group: 'eu' },
  { code: 'GBP', label: 'British Pound',         symbol: '£',    group: 'eu' },
  { code: 'CHF', label: 'Swiss Franc',           symbol: 'CHF',  group: 'eu' },
  { code: 'TRY', label: 'Turkish Lira',          symbol: '₺',    group: 'eu' },
  { code: 'NOK', label: 'Norwegian Krone',       symbol: 'kr',   group: 'eu' },
  { code: 'SEK', label: 'Swedish Krona',         symbol: 'kr',   group: 'eu' },
  { code: 'DKK', label: 'Danish Krone',          symbol: 'kr',   group: 'eu' },
  { code: 'PLN', label: 'Polish Zloty',          symbol: 'zł',   group: 'eu' },
  // Other major
  { code: 'USD', label: 'US Dollar',             symbol: '$',    group: 'other' },
  { code: 'CAD', label: 'Canadian Dollar',       symbol: 'CA$',  group: 'other' },
  { code: 'AUD', label: 'Australian Dollar',     symbol: 'A$',   group: 'other' },
  { code: 'JPY', label: 'Japanese Yen',          symbol: '¥',    group: 'other' },
  { code: 'CNY', label: 'Chinese Yuan',          symbol: '¥',    group: 'other' },
  { code: 'INR', label: 'Indian Rupee',          symbol: '₹',    group: 'other' },
  { code: 'BRL', label: 'Brazilian Real',        symbol: 'R$',   group: 'other' },
  { code: 'MXN', label: 'Mexican Peso',          symbol: 'MX$',  group: 'other' },
];

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
];

type LandingCountryGroup = 'arab' | 'africa' | 'other';

const COUNTRIES: { code: string; label: string; currency: string; arab?: boolean; group: LandingCountryGroup }[] = [
  // Marchés arabes
  { code: 'SA', label: 'Saudi Arabia',          currency: 'SAR', arab: true, group: 'arab' },
  { code: 'AE', label: 'United Arab Emirates',  currency: 'AED', arab: true, group: 'arab' },
  { code: 'EG', label: 'Egypt',                 currency: 'EGP', arab: true, group: 'arab' },
  { code: 'MA', label: 'Morocco',               currency: 'MAD', arab: true, group: 'arab' },
  { code: 'TN', label: 'Tunisia',               currency: 'TND', arab: true, group: 'arab' },
  { code: 'DZ', label: 'Algeria',               currency: 'DZD', arab: true, group: 'arab' },
  { code: 'QA', label: 'Qatar',                 currency: 'QAR', arab: true, group: 'arab' },
  { code: 'KW', label: 'Kuwait',                currency: 'KWD', arab: true, group: 'arab' },
  { code: 'BH', label: 'Bahrain',               currency: 'BHD', arab: true, group: 'arab' },
  { code: 'OM', label: 'Oman',                  currency: 'OMR', arab: true, group: 'arab' },
  { code: 'IQ', label: 'Iraq',                  currency: 'IQD', arab: true, group: 'arab' },
  { code: 'JO', label: 'Jordan',                currency: 'JOD', arab: true, group: 'arab' },
  { code: 'LB', label: 'Lebanon',               currency: 'LBP', arab: true, group: 'arab' },
  { code: 'YE', label: 'Yemen',                 currency: 'YER', arab: true, group: 'arab' },
  { code: 'PS', label: 'Palestine',             currency: 'ILS', arab: true, group: 'arab' },
  { code: 'SY', label: 'Syria',                 currency: 'SYP', arab: true, group: 'arab' },
  { code: 'SD', label: 'Sudan',                 currency: 'SDG', arab: true, group: 'arab' },
  { code: 'LY', label: 'Libya',                 currency: 'LYD', arab: true, group: 'arab' },
  { code: 'MR', label: 'Mauritania',            currency: 'MRU', arab: true, group: 'arab' },
  // Afrique sub-saharienne
  { code: 'NG', label: 'Nigeria',               currency: 'NGN',             group: 'africa' },
  { code: 'KE', label: 'Kenya',                 currency: 'KES',             group: 'africa' },
  { code: 'ZA', label: 'South Africa',          currency: 'ZAR',             group: 'africa' },
  { code: 'GH', label: 'Ghana',                 currency: 'GHS',             group: 'africa' },
  { code: 'SN', label: 'Senegal',               currency: 'XOF',             group: 'africa' },
  { code: 'CI', label: 'Côte d\'Ivoire',        currency: 'XOF',             group: 'africa' },
  { code: 'CM', label: 'Cameroon',              currency: 'XAF',             group: 'africa' },
  { code: 'ET', label: 'Ethiopia',              currency: 'ETB',             group: 'africa' },
  { code: 'TZ', label: 'Tanzania',              currency: 'TZS',             group: 'africa' },
  { code: 'UG', label: 'Uganda',                currency: 'UGX',             group: 'africa' },
  { code: 'RW', label: 'Rwanda',                currency: 'RWF',             group: 'africa' },
  { code: 'BJ', label: 'Benin',                 currency: 'XOF',             group: 'africa' },
  { code: 'TG', label: 'Togo',                  currency: 'XOF',             group: 'africa' },
  { code: 'BF', label: 'Burkina Faso',          currency: 'XOF',             group: 'africa' },
  { code: 'ML', label: 'Mali',                  currency: 'XOF',             group: 'africa' },
  { code: 'NE', label: 'Niger',                 currency: 'XOF',             group: 'africa' },
  { code: 'GN', label: 'Guinea',                currency: 'GNF',             group: 'africa' },
  { code: 'GA', label: 'Gabon',                 currency: 'XAF',             group: 'africa' },
  { code: 'CG', label: 'Congo (Brazzaville)',   currency: 'XAF',             group: 'africa' },
  { code: 'CD', label: 'DR Congo',              currency: 'CDF',             group: 'africa' },
  { code: 'AO', label: 'Angola',                currency: 'AOA',             group: 'africa' },
  { code: 'ZW', label: 'Zimbabwe',              currency: 'ZWL',             group: 'africa' },
  { code: 'ZM', label: 'Zambia',                currency: 'ZMW',             group: 'africa' },
  { code: 'MZ', label: 'Mozambique',            currency: 'MZN',             group: 'africa' },
  { code: 'MG', label: 'Madagascar',            currency: 'MGA',             group: 'africa' },
  { code: 'MU', label: 'Mauritius',             currency: 'MUR',             group: 'africa' },
  { code: 'BW', label: 'Botswana',              currency: 'BWP',             group: 'africa' },
  { code: 'NA', label: 'Namibia',               currency: 'NAD',             group: 'africa' },
  { code: 'MW', label: 'Malawi',                currency: 'MWK',             group: 'africa' },
  // EU + autres
  { code: 'FR', label: 'France',                currency: 'EUR',             group: 'other' },
  { code: 'BE', label: 'Belgium',               currency: 'EUR',             group: 'other' },
  { code: 'CH', label: 'Switzerland',           currency: 'CHF',             group: 'other' },
  { code: 'CA', label: 'Canada',                currency: 'CAD',             group: 'other' },
  { code: 'US', label: 'United States',         currency: 'USD',             group: 'other' },
  { code: 'GB', label: 'United Kingdom',        currency: 'GBP',             group: 'other' },
  { code: 'DE', label: 'Germany',               currency: 'EUR',             group: 'other' },
  { code: 'ES', label: 'Spain',                 currency: 'EUR',             group: 'other' },
  { code: 'IT', label: 'Italy',                 currency: 'EUR',             group: 'other' },
  { code: 'NL', label: 'Netherlands',           currency: 'EUR',             group: 'other' },
  { code: 'PT', label: 'Portugal',              currency: 'EUR',             group: 'other' },
  { code: 'TR', label: 'Turkey',                currency: 'TRY',             group: 'other' },
];

function ContextForm(props: {
  tone: Tone; setTone: (t: Tone) => void;
  language: string; setLanguage: (v: string) => void;
  languageTouched: boolean;
  country: string; setCountry: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  priceBefore: string; setPriceBefore: (v: string) => void;
  priceAfter: string; setPriceAfter: (v: string) => void;
  currency: string; setCurrency: (v: string) => void;
  pageKind: PageKind; setPageKind: (k: PageKind) => void;
}) {
  const {
    tone, setTone,
    language, setLanguage,
    languageTouched,
    country, setCountry,
    category, setCategory,
    priceBefore, setPriceBefore,
    priceAfter, setPriceAfter,
    currency, setCurrency,
    pageKind, setPageKind,
  } = props;

  const before = priceBefore ? Number(priceBefore) : NaN;
  const after = priceAfter ? Number(priceAfter) : NaN;
  const hasDiscount = Number.isFinite(before) && Number.isFinite(after) && before > after;
  const discountPct = hasDiscount ? Math.round(((before - after) / before) * 100) : 0;

  const selectedCountry = COUNTRIES.find((c) => c.code === country);
  const isArab = !!selectedCountry?.arab;
  const isRtl = directionOf(language) === 'rtl';

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Generation context</h3>
          <p className="text-xs text-muted-foreground">Help the AI write copy that fits your market.</p>
        </div>
        {hasDiscount && (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            -{discountPct}%
          </span>
        )}
      </div>

      <div className="space-y-2">
        <Label>Page type</Label>
        <div className="inline-flex rounded-xl border border-border/70 bg-card p-1">
          {(['landing', 'product'] as PageKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPageKind(k)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                pageKind === k ? 'gradient-brand text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {k === 'landing' ? 'Landing page' : 'Product page'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ctx-country">Target country</Label>
          <select
            id="ctx-country"
            value={country}
            onChange={(e) => {
              const v = e.target.value;
              setCountry(v);
              const match = COUNTRIES.find((c) => c.code === v);
              if (match) {
                // Always sync the currency when the country changes (better UX)
                setCurrency(match.currency);
                // For Arab countries, default the language to Arabic — only if the
                // user hasn't manually picked one yet.
                if (match.arab && !languageTouched && language !== 'ar') {
                  setLanguage('ar');
                }
              }
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Any —</option>
            <optgroup label="Arab world">
              {COUNTRIES.filter((c) => c.group === 'arab').map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </optgroup>
            <optgroup label="Africa">
              {COUNTRIES.filter((c) => c.group === 'africa').map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </optgroup>
            <optgroup label="Other">
              {COUNTRIES.filter((c) => c.group === 'other').map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ctx-lang">Language {isRtl && <span className="ml-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">RTL</span>}</Label>
          <select
            id="ctx-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      {isArab && (
        <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-2 text-xs text-fuchsia-700">
          {language === 'ar'
            ? 'Arabic auto-selected for this market. The page will be generated in Arabic with RTL layout.'
            : 'Arab market detected. Switch the language to Arabic for native copy and RTL layout.'}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="ctx-cat">Category / niche</Label>
        <Input
          id="ctx-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. fashion, leather goods, online courses, supplements..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="ctx-pb">Price before</Label>
          <Input
            id="ctx-pb"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={priceBefore}
            onChange={(e) => setPriceBefore(e.target.value)}
            placeholder="129"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ctx-pa">Price after</Label>
          <Input
            id="ctx-pa"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={priceAfter}
            onChange={(e) => setPriceAfter(e.target.value)}
            placeholder="89"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ctx-cur">Currency</Label>
          <select
            id="ctx-cur"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <optgroup label="Arab world">
              {CURRENCIES.filter((c) => c.group === 'arab').map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label} ({c.symbol})
                </option>
              ))}
            </optgroup>
            <optgroup label="Africa">
              {CURRENCIES.filter((c) => c.group === 'africa').map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label} ({c.symbol})
                </option>
              ))}
            </optgroup>
            <optgroup label="Europe & nearby">
              {CURRENCIES.filter((c) => c.group === 'eu').map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label} ({c.symbol})
                </option>
              ))}
            </optgroup>
            <optgroup label="Other">
              {CURRENCIES.filter((c) => c.group === 'other').map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label} ({c.symbol})
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <ToneSelect tone={tone} setTone={setTone} />
    </div>
  );
}

function ToneSelect({ tone, setTone }: { tone: Tone; setTone: (t: Tone) => void }) {
  const opts: { id: Tone; label: string }[] = [
    { id: 'professional', label: 'Professional' },
    { id: 'friendly', label: 'Friendly' },
    { id: 'minimal', label: 'Minimal' },
  ];
  return (
    <div className="space-y-2">
      <Label>Tone</Label>
      <div className="inline-flex rounded-xl border border-border/70 bg-card p-1">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setTone(o.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              tone === o.id
                ? 'gradient-brand text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
