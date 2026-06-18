'use client';

/**
 * Studio IA — unified creator combining:
 *   • Tab "Affiche"  → single poster image (PNG/JPG export) — TryAd-like
 *   • Tab "Landing"  → full 9:16 landing-page mockup (single AI image)
 *
 * Shared selectors at the top (store / product / language / Arab country)
 * stay the same when switching tabs — pick the audience once, generate
 * both formats from it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as htmlToImage from 'html-to-image';
import {
  Loader2, Sparkles, Download, ArrowLeft, Image as ImageIcon, AlertTriangle,
  LayoutTemplate, ExternalLink, Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import {
  storesApi,
  type PosterContent,
  type PosterTheme,
  type PosterFormat,
  type LandingImageResult,
} from '@/lib/api';
import { PosterCanvas } from '@/components/poster/poster-canvas';
import { useWalletStore } from '@/stores/wallet-store';
import { useAuthStore } from '@/stores/auth-store';
import { PageHeader } from '@/components/dashboard/page-header';
import { cn } from '@/lib/utils';

interface StoreLite { _id: string; name: string; slug: string; settings?: { country?: string; language?: string; currency?: string } }
interface ProductLite { _id: string; name: string; price: number; compareAtPrice?: number; images?: string[] }

type StudioTab = 'poster' | 'landing';

// ─────────────────────────────────────────────────────────────────────
// Static options
// ─────────────────────────────────────────────────────────────────────

const THEMES: { value: PosterTheme; label: string; description: string; preview: string }[] = [
  { value: 'gold-dark', label: 'Or & Noir', description: 'Luxury · accents dorés', preview: 'linear-gradient(135deg,#0d0a08 0%,#1a1410 50%,#d9b56a 100%)' },
  { value: 'cinema',    label: 'Cinéma',    description: 'Noir profond + jaune',   preview: 'linear-gradient(135deg,#050505 0%,#141416 50%,#f5d76e 100%)' },
  { value: 'warm-tan',  label: 'Sable',     description: 'Beige éditorial',        preview: 'linear-gradient(135deg,#f5ebd9 0%,#e8d5b4 50%,#a8743a 100%)' },
];

const FORMATS: { value: PosterFormat; label: string; size: string; aspect: string }[] = [
  { value: 'story',     label: 'Story / Affiche', size: '768 × 2200',  aspect: '9/26' },
  { value: 'square',    label: 'Post carré',      size: '1080 × 1080', aspect: '1/1' },
  { value: 'landscape', label: 'Lien / OG',       size: '1200 × 630',  aspect: '40/21' },
];

const LANGS: { code: string; label: string; flag: string }[] = [
  { code: 'fr', label: 'Français',     flag: '🇫🇷' },
  { code: 'ar', label: 'العربية',      flag: '🇸🇦' },
  { code: 'en', label: 'English',      flag: '🇬🇧' },
];

/**
 * Arab countries used as a sub-selector when language === 'ar'.
 * Each one maps to a real dialect on the backend (Tunisian Derja, Moroccan
 * Darija, Egyptian, etc.) so the AI writes in the LOCAL voice, not in MSA.
 */
const ARAB_COUNTRIES: { code: string; label: string; flag: string; dialect: string }[] = [
  { code: 'TN', label: 'Tunisie',         flag: '🇹🇳', dialect: 'Derja تونسي' },
  { code: 'MA', label: 'Maroc',           flag: '🇲🇦', dialect: 'Darija دارجة' },
  { code: 'DZ', label: 'Algérie',         flag: '🇩🇿', dialect: 'Derja دزيري' },
  { code: 'EG', label: 'Égypte',          flag: '🇪🇬', dialect: 'مصري Cairo' },
  { code: 'SA', label: 'Arabie saoudite', flag: '🇸🇦', dialect: 'خليجي Khaliji' },
  { code: 'AE', label: 'Émirats',         flag: '🇦🇪', dialect: 'Khaliji + EN' },
  { code: 'KW', label: 'Koweït',          flag: '🇰🇼', dialect: 'Khaliji كويتي' },
  { code: 'QA', label: 'Qatar',           flag: '🇶🇦', dialect: 'Khaliji قطري' },
  { code: 'BH', label: 'Bahreïn',         flag: '🇧🇭', dialect: 'Khaliji بحريني' },
  { code: 'OM', label: 'Oman',            flag: '🇴🇲', dialect: 'عماني' },
  { code: 'JO', label: 'Jordanie',        flag: '🇯🇴', dialect: 'Levantin أردني' },
  { code: 'LB', label: 'Liban',           flag: '🇱🇧', dialect: 'Levantin لبناني' },
  { code: 'PS', label: 'Palestine',       flag: '🇵🇸', dialect: 'Levantin' },
  { code: 'SY', label: 'Syrie',           flag: '🇸🇾', dialect: 'Levantin سوري' },
  { code: 'IQ', label: 'Irak',            flag: '🇮🇶', dialect: 'عراقي' },
  { code: 'LY', label: 'Libye',           flag: '🇱🇾', dialect: 'ليبي' },
  { code: 'SD', label: 'Soudan',          flag: '🇸🇩', dialect: 'سوداني' },
  { code: 'YE', label: 'Yémen',           flag: '🇾🇪', dialect: 'يمني' },
  { code: 'MR', label: 'Mauritanie',      flag: '🇲🇷', dialect: 'Hassaniya' },
];

function posterPreviewZoom(format: PosterFormat | undefined): number {
  switch (format || 'story') {
    case 'square':    return 0.32;
    case 'landscape': return 0.22;
    case 'story':
    default:          return 0.45;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStoreId = searchParams.get('storeId') || '';
  const initialTab: StudioTab = searchParams.get('tab') === 'landing' ? 'landing' : 'poster';

  // ── Shared state (top of page) ────────────────────────────────────
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState(initialStoreId);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productId, setProductId] = useState('');
  const [language, setLanguage] = useState<string>('fr');
  const [arabCountry, setArabCountry] = useState<string>('TN');

  // ── Poster-specific state ────────────────────────────────────────
  const [theme, setTheme] = useState<PosterTheme>('gold-dark');
  const [format, setFormat] = useState<PosterFormat>('story');
  const [posterGenerating, setPosterGenerating] = useState(false);
  const [posterError, setPosterError] = useState('');
  const [poster, setPoster] = useState<PosterContent | null>(null);
  const posterRef = useRef<HTMLDivElement | null>(null);

  // ── Landing-specific state ───────────────────────────────────────
  const [landingGenerating, setLandingGenerating] = useState(false);
  const [landingError, setLandingError] = useState('');
  const [landing, setLanding] = useState<LandingImageResult | null>(null);
  const [landingDownloading, setLandingDownloading] = useState(false);

  // ── Wallet / auth ────────────────────────────────────────────────
  const refreshWallet = useWalletStore((s) => s.refresh);
  const wallet = useWalletStore((s) => s.wallet);
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  // ── URL sync (tab) ───────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Load stores + initial wallet refresh ─────────────────────────
  useEffect(() => {
    storesApi.list()
      .then((res) => {
        const list = (res.data as { stores: StoreLite[] }).stores;
        setStores(list);
        if (!storeId && list.length > 0) setStoreId(list[0]._id);
      })
      .catch(() => setStores([]));
    refreshWallet();
  }, [refreshWallet, storeId]);

  // ── Load products + sync language/country from store settings ────
  useEffect(() => {
    if (!storeId) return;
    storesApi.listProducts(storeId, { published: 'true' })
      .then((res) => {
        const list = (res.data as { products: ProductLite[] }).products;
        setProducts(list);
        if (list.length > 0 && !productId) setProductId(list[0]._id);
      })
      .catch(() => setProducts([]));
    const store = stores.find((s) => s._id === storeId);
    if (store?.settings?.language) setLanguage(store.settings.language);
    // If store country is itself arab, pre-select it as arab country
    if (store?.settings?.country && ARAB_COUNTRIES.some((c) => c.code === store.settings?.country?.toUpperCase())) {
      setArabCountry(store.settings.country.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Derived ──────────────────────────────────────────────────────
  const isArabic = language === 'ar';
  const country = useMemo(() => {
    if (isArabic) return arabCountry;
    const store = stores.find((s) => s._id === storeId);
    return store?.settings?.country || undefined;
  }, [isArabic, arabCountry, stores, storeId]);
  const generating = posterGenerating || landingGenerating;
  const ready = storeId && productId && !generating;

  // ── Actions ──────────────────────────────────────────────────────
  async function handleGeneratePoster() {
    setPosterError('');
    setPoster(null);
    if (!storeId || !productId) {
      setPosterError('Sélectionne une boutique et un produit.');
      return;
    }
    setPosterGenerating(true);
    try {
      const res = await storesApi.generatePoster(storeId, {
        productId, theme, format, language,
        ...(country ? { country } : {}),
      });
      setPoster(res.data.poster);
      refreshWallet();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; code?: string; cost?: number } } };
      const msg = e.response?.data?.error || 'Erreur lors de la génération';
      if (e.response?.data?.code === 'insufficient_ai_balance') {
        const cost = e.response.data.cost;
        const costStr = typeof cost === 'number' ? ` (coût : ${cost} token${cost === 1 ? '' : 's'})` : '';
        setPosterError(`${msg}${costStr} — Recharge ton solde IA dans /dashboard/wallet.`);
      } else {
        setPosterError(msg);
      }
    } finally {
      setPosterGenerating(false);
    }
  }

  async function handleGenerateLanding() {
    setLandingError('');
    setLanding(null);
    if (!storeId || !productId) {
      setLandingError('Sélectionne une boutique et un produit.');
      return;
    }
    setLandingGenerating(true);
    try {
      const res = await storesApi.generateLandingImage(storeId, {
        productId, language,
        ...(country ? { country } : {}),
      });
      setLanding(res.data.result);
      refreshWallet();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; code?: string; cost?: number } } };
      const msg = e.response?.data?.error || 'Erreur lors de la génération';
      if (e.response?.data?.code === 'insufficient_ai_balance') {
        const cost = e.response.data.cost;
        const costStr = typeof cost === 'number' ? ` (coût : ${cost} token${cost === 1 ? '' : 's'})` : '';
        setLandingError(`${msg}${costStr} — Recharge ton solde IA dans /dashboard/wallet.`);
      } else {
        setLandingError(msg);
      }
    } finally {
      setLandingGenerating(false);
    }
  }

  async function handleDownloadPoster(fmt: 'png' | 'jpg') {
    if (!posterRef.current) return;
    try {
      const opts = { pixelRatio: 2, cacheBust: true, backgroundColor: '#000' };
      const dataUrl = fmt === 'jpg'
        ? await htmlToImage.toJpeg(posterRef.current, { ...opts, quality: 0.95 })
        : await htmlToImage.toPng(posterRef.current, opts);
      const link = document.createElement('a');
      link.download = `affiche-${Date.now()}.${fmt}`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      setPosterError(`Téléchargement échoué : ${(err as Error).message}`);
    }
  }

  async function handleDownloadLanding() {
    if (!landing) return;
    setLandingDownloading(true);
    try {
      const res = await fetch(landing.imageUrl, { cache: 'no-store' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `landing-${Date.now()}.jpg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(landing.imageUrl, '_blank');
    } finally {
      setLandingDownloading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Link href="/dashboard/pages" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux pages
      </Link>

      <PageHeader
        icon={Wand2}
        title="Studio IA"
        description="Génère affiches et landing pages depuis ton produit. Choisis l'audience une fois, switch entre les formats."
        actions={wallet ? (
          <div className="rounded-lg border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-500/10 to-pink-500/10 px-3 py-1.5 text-[11px]">
            <span className="font-semibold text-fuchsia-700">Solde IA</span> · {Math.round(wallet.aiBalance).toLocaleString()} token{Math.round(wallet.aiBalance) === 1 ? '' : 's'}
            <span className="ml-2 text-muted-foreground">coût ≈ {wallet.aiCosts.landing} token{wallet.aiCosts.landing === 1 ? '' : 's'}/génération</span>
          </div>
        ) : undefined}
      />

      {/* ── SHARED SELECTORS — boutique / produit / langue / pays ── */}
      <Card className="overflow-hidden">
        <div className="border-b border-border/50 bg-gradient-to-r from-muted/20 to-muted/5 px-4 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            1. Audience & produit
          </div>
        </div>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="store" className="text-xs">Boutique</Label>
              <select
                id="store"
                value={storeId}
                onChange={(e) => { setStoreId(e.target.value); setProductId(''); }}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Choisir —</option>
                {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="product" className="text-xs">Produit</Label>
              <select
                id="product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                disabled={!storeId}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">— Choisir —</option>
                {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Langue + (si arabe) pays arabe — pile dans le même bloc */}
          <div>
            <Label className="text-xs">Langue de l&apos;audience</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {LANGS.map((l) => {
                const active = language === l.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLanguage(l.code)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                      active
                        ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    <span className="text-sm">{l.flag}</span>
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isArabic && (
            <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-xs font-semibold text-amber-900">
                    Pays arabe ciblé — détermine le DIALECTE
                  </Label>
                  <p className="mt-0.5 text-[10px] text-amber-800/70">
                    L&apos;IA écrira en {ARAB_COUNTRIES.find((c) => c.code === arabCountry)?.dialect || 'Derja locale'} —
                    pas en arabe classique (fusha).
                  </p>
                </div>
                <span className="text-2xl">
                  {ARAB_COUNTRIES.find((c) => c.code === arabCountry)?.flag || '🌐'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
                {ARAB_COUNTRIES.map((c) => {
                  const active = arabCountry === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setArabCountry(c.code)}
                      className={cn(
                        'flex flex-col items-center gap-0.5 rounded-md border p-1.5 text-center transition-all',
                        active
                          ? 'border-amber-500 bg-amber-500/15 shadow-sm'
                          : 'border-amber-500/20 bg-card/50 hover:border-amber-500/50 hover:bg-amber-500/5'
                      )}
                      title={c.dialect}
                    >
                      <span className="text-base leading-none">{c.flag}</span>
                      <span className="text-[10px] font-semibold leading-tight">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── TABS ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-sm">
        <TabButton
          active={tab === 'poster'}
          icon={<ImageIcon className="h-4 w-4" />}
          label="Affiche"
          sublabel="Story · Post · OG"
          onClick={() => setTab('poster')}
        />
        <TabButton
          active={tab === 'landing'}
          icon={<LayoutTemplate className="h-4 w-4" />}
          label="Landing"
          sublabel="Page complète 9:16"
          onClick={() => setTab('landing')}
        />
      </div>

      {/* ── TAB CONTENT ───────────────────────────────────────── */}
      {tab === 'poster' ? (
        <PosterTab
          ready={!!ready}
          generating={posterGenerating}
          error={posterError}
          poster={poster}
          theme={theme}
          format={format}
          isAdmin={isAdmin}
          onThemeChange={setTheme}
          onFormatChange={setFormat}
          onGenerate={handleGeneratePoster}
          onDownload={handleDownloadPoster}
          exportRef={posterRef}
        />
      ) : (
        <LandingTab
          ready={!!ready}
          generating={landingGenerating}
          error={landingError}
          landing={landing}
          downloading={landingDownloading}
          onGenerate={handleGenerateLanding}
          onDownload={handleDownloadLanding}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────

function TabButton({
  active, icon, label, sublabel, onClick,
}: {
  active: boolean; icon: React.ReactNode; label: string; sublabel: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
        active
          ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-md'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {icon}
      <div className="flex flex-col items-start leading-tight">
        <span className="text-sm font-semibold">{label}</span>
        <span className={cn('text-[10px]', active ? 'text-white/80' : 'text-muted-foreground')}>{sublabel}</span>
      </div>
    </button>
  );
}

// ── POSTER TAB ───────────────────────────────────────────────────────

interface PosterTabProps {
  ready: boolean;
  generating: boolean;
  error: string;
  poster: PosterContent | null;
  theme: PosterTheme;
  format: PosterFormat;
  isAdmin: boolean;
  onThemeChange: (t: PosterTheme) => void;
  onFormatChange: (f: PosterFormat) => void;
  onGenerate: () => void;
  onDownload: (fmt: 'png' | 'jpg') => void;
  exportRef: React.MutableRefObject<HTMLDivElement | null>;
}

function PosterTab(props: PosterTabProps) {
  const {
    ready, generating, error, poster, theme, format, isAdmin,
    onThemeChange, onFormatChange, onGenerate, onDownload, exportRef,
  } = props;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* LEFT — style + format + CTA */}
      <Card className="overflow-hidden">
        <div className="border-b border-border/50 bg-gradient-to-r from-muted/20 to-muted/5 px-4 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            2. Style de l&apos;affiche
          </div>
        </div>
        <CardContent className="space-y-4 pt-4">
          <div>
            <Label className="text-xs">Format de sortie</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {FORMATS.map((opt) => {
                const active = format === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onFormatChange(opt.value)}
                    className={cn(
                      'overflow-hidden rounded-lg border p-2.5 text-left transition-all',
                      active ? 'border-primary bg-primary/5 ring-2 ring-primary/15 shadow-sm'
                             : 'border-border hover:border-primary/40 hover:bg-muted/30'
                    )}
                  >
                    <div className="mb-1.5 grid place-items-center rounded bg-muted/40 p-2">
                      <div
                        className="rounded-sm bg-gradient-to-br from-amber-400 to-orange-600"
                        style={{ aspectRatio: opt.aspect, width: '55%', maxHeight: 36 }}
                      />
                    </div>
                    <div className="text-[11px] font-semibold leading-tight">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground">{opt.size}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs">Direction artistique</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {THEMES.map((opt) => {
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onThemeChange(opt.value)}
                    className={cn(
                      'overflow-hidden rounded-lg border text-left transition-all',
                      active ? 'border-primary ring-2 ring-primary/15 shadow-sm'
                             : 'border-border hover:border-primary/40'
                    )}
                  >
                    <div style={{ background: opt.preview, height: 48 }} />
                    <div className="p-1.5">
                      <div className="text-[11px] font-semibold leading-tight">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{opt.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <Button
            onClick={onGenerate}
            disabled={!ready}
            className="w-full gap-2 gradient-brand h-11 text-sm"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Génération en cours…' : poster ? "Régénérer l'affiche" : "Générer l'affiche"}
          </Button>

          {generating && (
            <p className="text-center text-[11px] text-muted-foreground">
              {isAdmin
                ? 'Étape 1 : copy (Claude) · Étape 2 : scène hero + avatars (FLUX)'
                : 'Étape 1 : rédaction · Étape 2 : composition visuelle'} · ~30 à 60s
            </p>
          )}
        </CardContent>
      </Card>

      {/* RIGHT — preview */}
      <PreviewCard
        title="Aperçu"
        subtitle={poster ? 'Pleine résolution prête à télécharger' : 'L\'affiche apparaîtra ici'}
        downloadButtons={poster && (
          <>
            <Button size="sm" onClick={() => onDownload('png')} className="h-8 gap-1 px-2.5 text-xs">
              <Download className="h-3.5 w-3.5" /> PNG
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDownload('jpg')} className="h-8 gap-1 px-2.5 text-xs">
              <Download className="h-3.5 w-3.5" /> JPG
            </Button>
          </>
        )}
      >
        {!poster && !generating && (
          <EmptyState
            icon={<ImageIcon className="h-8 w-8 text-muted-foreground/50" />}
            title="L'aperçu apparaîtra ici"
            hint="Configure à gauche et clique Générer"
          />
        )}
        {generating && !poster && <GeneratingState text="~30 à 60 secondes" />}
        {poster && (
          <div
            className="mx-auto"
            style={{ width: 'fit-content', maxWidth: '100%', zoom: posterPreviewZoom(poster.format) }}
          >
            <PosterCanvas content={poster} exportRef={exportRef} />
          </div>
        )}
      </PreviewCard>
    </div>
  );
}

// ── LANDING TAB ───────────────────────────────────────────────────────

interface LandingTabProps {
  ready: boolean;
  generating: boolean;
  error: string;
  landing: LandingImageResult | null;
  downloading: boolean;
  onGenerate: () => void;
  onDownload: () => void;
}

function LandingTab(props: LandingTabProps) {
  const { ready, generating, error, landing, downloading, onGenerate, onDownload } = props;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* LEFT — info + CTA + copy details */}
      <Card className="overflow-hidden">
        <div className="border-b border-border/50 bg-gradient-to-r from-muted/20 to-muted/5 px-4 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            2. Composition de la landing
          </div>
        </div>
        <CardContent className="space-y-4 pt-4">
          <div className="rounded-xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/5 via-pink-500/5 to-transparent p-3">
            <div className="flex items-start gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fuchsia-500/15 text-fuchsia-700">
                <LayoutTemplate className="h-4 w-4" />
              </div>
              <div className="text-xs text-foreground/80">
                <strong>Une seule image 9:16</strong> qui contient toute la landing
                (hero, bénéfices, témoignages, CTA) — design éditorial DTC, prête
                pour pub Meta / TikTok ou hero de page produit.
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <Button
            onClick={onGenerate}
            disabled={!ready}
            className="w-full gap-2 gradient-brand h-11 text-sm"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Génération en cours…' : landing ? 'Régénérer la landing' : 'Générer la landing'}
          </Button>

          {generating && (
            <p className="text-center text-[11px] text-muted-foreground">
              Étape 1 : rédaction du texte · Étape 2 : composition du design · ~30 à 90s
            </p>
          )}

          {/* Copy details — accordion below */}
          {landing && (
            <details className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-foreground hover:text-primary">
                Texte généré (copier / réutiliser)
              </summary>
              <div className="mt-3 space-y-2.5 text-xs">
                <CopyField label="Titre" value={landing.copy.headline} />
                {landing.copy.subheadline && <CopyField label="Sous-titre" value={landing.copy.subheadline} />}
                <CopyField label="Réassurance" value={landing.copy.reassurance.join(' · ')} />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bénéfices</div>
                  <ul className="mt-1 space-y-1">
                    {landing.copy.benefits.filter((b) => b.title || b.body).map((b, i) => (
                      <li key={i} className="rounded-md bg-card px-2 py-1">
                        <span className="font-medium">{b.title}</span>
                        {b.body && <span className="text-muted-foreground"> — {b.body}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <CopyField label="CTA" value={`${landing.copy.cta} · ${landing.copy.ctaReassurance}`} />
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* RIGHT — preview */}
      <PreviewCard
        title="Aperçu"
        subtitle={landing ? 'Image 9:16 prête à télécharger' : 'La landing apparaîtra ici'}
        downloadButtons={landing && (
          <>
            <Button size="sm" onClick={onDownload} disabled={downloading} className="h-8 gap-1 px-2.5 text-xs">
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              JPG
            </Button>
            <Button size="sm" variant="outline" asChild className="h-8 gap-1 px-2.5 text-xs">
              <a href={landing.imageUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Ouvrir
              </a>
            </Button>
          </>
        )}
      >
        {!landing && !generating && (
          <EmptyState
            icon={<LayoutTemplate className="h-8 w-8 text-muted-foreground/50" />}
            title="L'aperçu apparaîtra ici"
            hint="Configure à gauche et clique Générer"
          />
        )}
        {generating && !landing && <GeneratingState text="~30 à 90 secondes" />}
        {landing && (
          <div className="mx-auto" style={{ maxWidth: 320 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={landing.imageUrl}
              alt="Landing page générée"
              className="w-full rounded-lg shadow-sm"
            />
          </div>
        )}
      </PreviewCard>
    </div>
  );
}

// ── SHARED PREVIEW UI ────────────────────────────────────────────────

function PreviewCard({
  title, subtitle, downloadButtons, children,
}: {
  title: string;
  subtitle: string;
  downloadButtons?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:sticky lg:top-20 lg:self-start">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-gradient-to-r from-muted/20 to-muted/5 px-4 py-2.5">
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[10px] text-muted-foreground">{subtitle}</div>
          </div>
          {downloadButtons && <div className="flex gap-1">{downloadButtons}</div>}
        </div>
        <CardContent className="bg-muted/30 p-3">{children}</CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border/60 py-14 text-center">
      {icon}
      <p className="mt-2 text-xs font-medium text-muted-foreground">{title}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p>
    </div>
  );
}

function GeneratingState({ text }: { text: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-fuchsia-500/30 bg-fuchsia-500/5 py-14 text-center">
      <Loader2 className="h-7 w-7 animate-spin text-fuchsia-500" />
      <p className="mt-2 text-xs font-medium text-foreground">Génération en cours…</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{text}</p>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
