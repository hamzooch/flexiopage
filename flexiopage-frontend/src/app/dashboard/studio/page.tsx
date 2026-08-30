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
  LayoutTemplate, ExternalLink, Wand2, Video as VideoIcon, Play, Upload, Link2, Package, Mic,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import {
  storesApi,
  jobsApi,
  type PosterContent,
  type PosterTheme,
  type PosterFormat,
  type LandingImageResult,
  type VideoResult,
  type AiGenerationItem,
  type GenerationJob,
} from '@/lib/api';
import { mediaUrl } from '@/lib/utils';
import { History, RotateCcw, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { PosterCanvas } from '@/components/poster/poster-canvas';
import { useWalletStore } from '@/stores/wallet-store';
import { useAuthStore } from '@/stores/auth-store';
import { PageHeader } from '@/components/dashboard/page-header';
import { cn } from '@/lib/utils';

interface StoreLite { _id: string; name: string; slug: string; settings?: { country?: string; language?: string; currency?: string } }
interface ProductLite { _id: string; name: string; price: number; compareAtPrice?: number; images?: string[] }

type StudioTab = 'poster' | 'landing' | 'video';

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

/**
 * Exemples de prompts vidéo cliquables — proposent 3 esthétiques distinctes
 * pour aider le vendeur qui bloque devant la page vide. Cliquer un exemple
 * remplit le textarea, il reste éditable.
 */
const VIDEO_PROMPT_EXAMPLES: { label: string; prompt: string }[] = [
  {
    label: '360° studio luxe',
    prompt: 'Slow 360° rotation of the product on a black marble table, soft warm studio lighting, luxury premium mood, product stays sharp and centered.',
  },
  {
    label: 'Lifestyle chaud',
    prompt: 'Cinematic dolly-in on the product placed in a bright modern kitchen, morning sunlight, warm cozy mood, subtle bokeh in background.',
  },
  {
    label: 'Ads TikTok punchy',
    prompt: 'Fast punchy reveal of the product, product zooms in from black background, dynamic light flash, energetic mood, ideal for a TikTok ad hook.',
  },
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
  const rawTab = searchParams.get('tab');
  const initialTab: StudioTab =
    rawTab === 'landing' ? 'landing' : rawTab === 'video' ? 'video' : 'poster';

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

  // ── Video-specific state ─────────────────────────────────────────
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [video, setVideo] = useState<VideoResult | null>(null);
  const [videoCustomPrompt, setVideoCustomPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState<5 | 8 | 12>(8);
  // Ref sur la preview + flag flash — quand la vidéo arrive on scroll la
  // preview dans le viewport (surtout utile sur mobile où la preview est
  // sous les inputs) et on ajoute une animation courte pour attirer l'œil.
  const videoPreviewRef = useRef<HTMLDivElement | null>(null);
  const [videoFlash, setVideoFlash] = useState(false);
  // Source de l'image à animer — par défaut on prend la 1ʳᵉ photo du
  // produit, mais le vendeur peut uploader / coller une URL image / coller
  // une URL page produit à scraper. `ugc` bascule l'UI dans un mode
  // complet différent (avatar + script/scene) qui appelle un endpoint dédié.
  const [videoSource, setVideoSource] = useState<'product' | 'upload' | 'imageUrl' | 'productUrl' | 'ugc'>('product');
  const [videoImageUrlInput, setVideoImageUrlInput] = useState('');
  const [videoProductUrlInput, setVideoProductUrlInput] = useState('');
  const [videoResolvedImage, setVideoResolvedImage] = useState<string | null>(null);
  const [videoSourceBusy, setVideoSourceBusy] = useState(false);
  const [videoSourceError, setVideoSourceError] = useState('');
  // Voice-over IA optionnel — quand activé, on ajoute un script TTS qui
  // sera muxé sur la vidéo par le backend. Coûte plus de tokens (tarif
  // `video_with_voice` dans Settings) car il ajoute un appel ElevenLabs
  // + une étape ffmpeg. Défaut désactivé pour ne pas surprendre le vendeur.
  const [videoVoiceEnabled, setVideoVoiceEnabled] = useState(false);
  const [videoVoiceScript, setVideoVoiceScript] = useState('');
  // Job vidéo en cours — utilisé par la Timeline pour afficher chaque
  // étape en live (analyze/copy/images/assemble) au lieu d'un simple spinner.
  const [videoJob, setVideoJob] = useState<GenerationJob | null>(null);
  // Suggestions IA de prompts vidéo (0 token) — remplace les chips statiques
  // par 3 propositions contextualisées au produit courant quand le vendeur
  // clique sur "Suggère-moi".
  const [videoPromptSuggestions, setVideoPromptSuggestions] = useState<string[]>([]);
  const [videoSuggestionsBusy, setVideoSuggestionsBusy] = useState(false);
  // Bottom sheet mobile — s'ouvre auto après une génération réussie pour que
  // le vendeur voie sa création sans avoir à scroller (la preview desktop
  // est en colonne droite, en mobile elle est en bas du DOM).
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  // UGC state — actif seulement quand videoSource === 'ugc'. Mode "talking-head"
  // (Hedra lip-sync) ou "lifestyle" (Kling scène). Bibliothèque d'avatars
  // chargée une fois depuis /public/avatars/manifest.json.
  const [ugcMode, setUgcMode] = useState<'talking-head' | 'lifestyle'>('talking-head');
  const [ugcAvatarId, setUgcAvatarId] = useState<string | null>(null);
  const [ugcScenePrompt, setUgcScenePrompt] = useState('');
  const [ugcAvatars, setUgcAvatars] = useState<Array<{
    id: string; name: string; gender: string; region: string; imageUrl: string;
  }>>([]);
  // Drawer historique — ouvert via le FAB, contient les 5 dernières
  // générations du tab courant. Rend l'historique accessible sans scroller
  // en bas de la page (le panneau bottom est facile à louper).
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);

  // ── Recent generations (historique 30j côté backend) ────────────
  // On garde la liste par-kind pour que le panneau récentes affiche
  // uniquement les items pertinents pour le tab courant.
  const [recentPoster, setRecentPoster] = useState<AiGenerationItem[]>([]);
  const [recentLanding, setRecentLanding] = useState<AiGenerationItem[]>([]);
  const [recentVideo, setRecentVideo] = useState<AiGenerationItem[]>([]);

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

  // ── Load recent generations for the active store (all 3 kinds) ───
  // Silent — l'historique est un « nice to have » ; on ne rouge pas la
  // page si l'endpoint échoue.
  const reloadRecent = useMemo(
    () => async (kind?: 'poster' | 'landing' | 'video') => {
      if (!storeId) return;
      try {
        if (!kind || kind === 'poster') {
          const r = await storesApi.listAiGenerations(storeId, { kind: 'poster', limit: 8 });
          setRecentPoster(r.data.items);
        }
        if (!kind || kind === 'landing') {
          const r = await storesApi.listAiGenerations(storeId, { kind: 'landing', limit: 8 });
          setRecentLanding(r.data.items);
        }
        if (!kind || kind === 'video') {
          const r = await storesApi.listAiGenerations(storeId, { kind: 'video', limit: 8 });
          setRecentVideo(r.data.items);
        }
      } catch { /* silencieux */ }
    },
    [storeId],
  );
  useEffect(() => { reloadRecent(); }, [reloadRecent]);

  // ── Derived ──────────────────────────────────────────────────────
  const isArabic = language === 'ar';
  const country = useMemo(() => {
    if (isArabic) return arabCountry;
    const store = stores.find((s) => s._id === storeId);
    return store?.settings?.country || undefined;
  }, [isArabic, arabCountry, stores, storeId]);
  const generating = posterGenerating || landingGenerating || videoGenerating;
  const ready = storeId && productId && !generating;

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Traduit une erreur d'API en message actionnable pour le vendeur.
   * Messages génériques du backend ("Erreur lors de la génération")
   * sont remplacés par une explication + une action concrète.
   */
  function humanErrorMessage(err: unknown): string {
    const e = err as {
      code?: string;
      message?: string;
      response?: { status?: number; data?: { error?: string; code?: string; cost?: number; message?: string } };
    };
    // Network-level errors : pas de réponse HTTP du tout.
    if (e.code === 'ERR_NETWORK') return 'Connexion perdue. Vérifie ton internet puis réessaie.';
    if (e.code === 'ECONNABORTED') return 'Le serveur met trop de temps. Réessaie dans un instant.';
    const status = e.response?.status;
    const data = e.response?.data;
    const backendMsg = data?.error || data?.message;

    if (data?.code === 'insufficient_ai_balance') {
      const cost = data.cost;
      const costStr = typeof cost === 'number' ? ` — il te faut au moins ${cost} token${cost === 1 ? '' : 's'}` : '';
      return `Solde IA insuffisant${costStr}. Recharge dans /dashboard/wallet puis réessaie.`;
    }
    if (data?.error === 'product_has_no_image') {
      return backendMsg || "Ce produit n'a pas de photo — ajoute au moins une image avant de générer.";
    }
    if (status === 502 || status === 503 || status === 504) {
      return 'Le service IA est momentanément indisponible. Réessaie dans une minute — ta génération sera rejouée sans re-facturer.';
    }
    // Anti double-clic — 3s de fenêtre par (userId, kind). L'erreur remonte
    // toujours en 429, mais avec un code spécifique on donne un message clair.
    if (data?.error === 'generation_in_flight') {
      return backendMsg || 'Une génération est déjà en cours. Patiente 3 secondes.';
    }
    if (status === 429) return 'Trop de générations en peu de temps. Attends 30s et réessaie.';
    if (backendMsg) return backendMsg;
    return 'Génération échouée. Réessaie — si le problème persiste, contacte le support.';
  }

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
      reloadRecent('poster');
    } catch (err) {
      setPosterError(humanErrorMessage(err));
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
      reloadRecent('landing');
    } catch (err) {
      setLandingError(humanErrorMessage(err));
    } finally {
      setLandingGenerating(false);
    }
  }

  /** Upload une photo locale via /stores/:id/media puis mémorise l'URL. */
  async function handleVideoUpload(file: File) {
    if (!storeId) return;
    setVideoSourceError('');
    setVideoResolvedImage(null);
    // Garde-fous côté client — le backend refait la validation.
    if (!file.type.startsWith('image/')) {
      setVideoSourceError('Fichier non supporté — choisis une image.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setVideoSourceError('Image trop grosse (>15MB). Réduis-la puis réessaie.');
      return;
    }
    setVideoSourceBusy(true);
    try {
      const res = await storesApi.uploadMedia(storeId, file, 'media');
      const media = res.data.media as { url?: string } | undefined;
      const url = media?.url;
      if (!url) throw new Error('URL manquante dans la réponse serveur.');
      setVideoResolvedImage(url);
    } catch (err) {
      setVideoSourceError(humanErrorMessage(err));
    } finally {
      setVideoSourceBusy(false);
    }
  }

  /** Récupère l'image principale d'une page produit externe (og:image + fallbacks). */
  async function handleVideoScrapeProductUrl() {
    if (!storeId) return;
    const url = videoProductUrlInput.trim();
    if (!url) {
      setVideoSourceError('Colle une URL de page produit.');
      return;
    }
    setVideoSourceError('');
    setVideoResolvedImage(null);
    setVideoSourceBusy(true);
    try {
      const res = await storesApi.scrapeImageForVideo(storeId, url);
      setVideoResolvedImage(res.data.imageUrl);
    } catch (err) {
      setVideoSourceError(humanErrorMessage(err));
    } finally {
      setVideoSourceBusy(false);
    }
  }

  /** Reset propre quand l'utilisateur change de mode source. */
  function handleVideoSourceChange(next: 'product' | 'upload' | 'imageUrl' | 'productUrl' | 'ugc') {
    setVideoSource(next);
    setVideoResolvedImage(null);
    setVideoSourceError('');
  }

  /**
   * Génération UGC vidéo — flow spécifique (endpoint dédié, avatar +
   * mode talking/lifestyle). Poll le même job model que la vidéo Seedance
   * standard donc la Timeline live et le stockage marchent tel quel.
   */
  async function handleGenerateUgcVideo() {
    setVideoError('');
    setVideo(null);
    setVideoJob(null);
    if (!storeId || !productId) {
      setVideoError('Sélectionne une boutique et un produit.');
      return;
    }
    const avatar = ugcAvatars.find((a) => a.id === ugcAvatarId);
    if (!avatar) {
      setVideoError('Choisis un avatar dans la bibliothèque.');
      return;
    }
    if (ugcMode === 'talking-head' && !videoVoiceScript.trim()) {
      setVideoError('Écris le script que doit dire le personnage.');
      return;
    }
    if (ugcMode === 'lifestyle' && !ugcScenePrompt.trim()) {
      setVideoError('Décris la scène dans laquelle le personnage utilise le produit.');
      return;
    }
    setVideoGenerating(true);
    try {
      const res = await storesApi.generateUgcVideo(storeId, {
        productId,
        mode: ugcMode,
        avatarUrl: avatar.imageUrl,
        language,
        ...(country ? { country } : {}),
        ...(ugcMode === 'talking-head' ? { script: videoVoiceScript.trim() } : {}),
        ...(ugcMode === 'lifestyle' ? { scenePrompt: ugcScenePrompt.trim(), duration: 5 } : {}),
      });
      refreshWallet();
      const jobId = res.data.jobId;
      // Poll — même logique que handleGenerateVideo, extraite ici pour
      // rester simple (l'UGC prend 90-180s selon mode).
      const deadline = Date.now() + 8 * 60_000;
      let done = false;
      while (Date.now() < deadline && !done) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const jr = await jobsApi.get(jobId);
          const job = jr.data.job;
          setVideoJob(job);
          if (job.status === 'succeeded' && job.result?.videoUrl) {
            setVideo(job.result as VideoResult);
            reloadRecent('video');
            done = true;
            requestAnimationFrame(() => {
              videoPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            setVideoFlash(true);
            setTimeout(() => setVideoFlash(false), 2500);
          } else if (job.status === 'failed') {
            setVideoError(job.error || 'Génération UGC échouée. Réessaie.');
            done = true;
          }
        } catch {
          // poll transitoire en échec — on continue
        }
      }
      if (!done) {
        setVideoError("La génération UGC prend plus de temps que prévu. Réessaie — ta vidéo n'est facturée qu'une fois.");
      }
    } catch (err) {
      setVideoError(humanErrorMessage(err));
    } finally {
      setVideoGenerating(false);
    }
  }

  /** Récupère 3 propositions de prompts vidéo IA — gratuit, contextualisé au produit. */
  async function handleFetchVideoSuggestions() {
    if (!storeId || !productId) return;
    setVideoSuggestionsBusy(true);
    try {
      const res = await storesApi.suggestPrompt(storeId, { productId, kind: 'video' });
      setVideoPromptSuggestions(res.data.suggestions || []);
    } catch {
      // Silencieux : les chips fallback restent visibles.
    } finally {
      setVideoSuggestionsBusy(false);
    }
  }
  // Reset des suggestions quand le produit change — évite d'afficher des
  // propositions écrites pour le produit précédent.
  useEffect(() => {
    setVideoPromptSuggestions([]);
  }, [productId]);

  // Charge la bibliothèque d'avatars UGC une seule fois au montage.
  // Fetch en client-side pour ne pas gonfler le bundle (le manifest peut
  // grossir avec plus d'avatars sans impacter le premier paint).
  useEffect(() => {
    fetch('/avatars/manifest.json')
      .then((r) => r.json())
      .then((data) => setUgcAvatars(data.avatars || []))
      .catch(() => setUgcAvatars([]));
  }, []);

  // Auto-ouverture bottom sheet mobile — dès qu'une génération (poster/landing/
  // /video) tombe sur mobile, on montre la preview en overlay au lieu de
  // demander au vendeur de scroller. Desktop : la preview est déjà visible
  // en colonne droite, donc pas de sheet.
  useEffect(() => {
    if (!poster && !landing && !video) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 768px)').matches) return; // desktop
    setMobileSheetOpen(true);
  }, [poster, landing, video]);

  async function handleGenerateVideo() {
    setVideoError('');
    setVideo(null);
    setVideoJob(null);
    if (!storeId || !productId) {
      setVideoError('Sélectionne une boutique et un produit.');
      return;
    }
    // Résolution de la source image selon le mode. On veut que le vendeur
    // voie exactement quelle image va être animée avant de payer.
    let sourceImageUrl: string | undefined;
    if (videoSource === 'upload' || videoSource === 'productUrl') {
      if (!videoResolvedImage) {
        setVideoError(
          videoSource === 'upload'
            ? 'Uploade d\'abord une photo.'
            : 'Récupère d\'abord l\'image du lien produit.',
        );
        return;
      }
      sourceImageUrl = videoResolvedImage;
    } else if (videoSource === 'imageUrl') {
      const raw = videoImageUrlInput.trim();
      if (!raw) {
        setVideoError('Colle une URL d\'image.');
        return;
      }
      try {
        const u = new URL(raw);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
      } catch {
        setVideoError('URL image invalide (attendu : https://...).');
        return;
      }
      sourceImageUrl = raw;
    }
    setVideoGenerating(true);
    try {
      // Voice-over : envoyé seulement si le toggle est actif ET le script
      // n'est pas vide — le backend re-valide et facture au tarif majoré
      // `video_with_voice` uniquement dans ce cas.
      const voiceoverScript = videoVoiceEnabled ? videoVoiceScript.trim() : '';
      const res = await storesApi.generateVideo(storeId, {
        productId,
        language,
        duration: videoDuration,
        ...(country ? { country } : {}),
        ...(videoCustomPrompt.trim() ? { customPrompt: videoCustomPrompt.trim() } : {}),
        ...(sourceImageUrl ? { sourceImageUrl } : {}),
        ...(voiceoverScript ? { voiceoverScript, voiceoverLanguage: language } : {}),
      });
      refreshWallet();
      // Rendu asynchrone (1-6 min) : on poll le job toutes les 3 s jusqu'à
      // succès/échec. Une requête synchrone se faisait couper par le proxy
      // (502) sur les durées longues.
      const jobId = res.data.jobId;
      const deadline = Date.now() + 8 * 60_000;
      let done = false;
      while (Date.now() < deadline && !done) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const jr = await jobsApi.get(jobId);
          const job = jr.data.job;
          // Snapshot du job en state à chaque tick — pilote la Timeline live
          // (steps courants, progress bar, transition analyze→copy→images→assemble).
          setVideoJob(job);
          if (job.status === 'succeeded' && job.result?.videoUrl) {
            setVideo(job.result as VideoResult);
            reloadRecent('video');
            done = true;
            // UX : sur mobile la preview est sous les inputs → invisible
            // au moment où la vidéo arrive. On scroll vers elle et on
            // déclenche un flash court pour signaler la réception.
            // requestAnimationFrame → attend que React ait re-render la
            // preview avant de scroller (sinon on scroll vers du vide).
            requestAnimationFrame(() => {
              videoPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            setVideoFlash(true);
            setTimeout(() => setVideoFlash(false), 2500);
          } else if (job.status === 'failed') {
            setVideoError(job.error || 'Génération vidéo échouée. Réessaie.');
            done = true;
          }
        } catch {
          // Poll transitoirement en échec (réseau) — on continue jusqu'au deadline.
        }
      }
      if (!done) {
        setVideoError("La génération prend plus de temps que prévu. Réessaie dans quelques minutes — ta vidéo n'est facturée qu'une fois.");
      }
    } catch (err) {
      setVideoError(humanErrorMessage(err));
    } finally {
      setVideoGenerating(false);
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
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <div className="rounded-lg border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-500/10 to-pink-500/10 px-3 py-1.5">
              <span className="font-semibold text-fuchsia-700">Solde IA</span> · {Math.round(wallet.aiBalance).toLocaleString()} token{Math.round(wallet.aiBalance) === 1 ? '' : 's'}
            </div>
            {/* Coût par type — le vendeur voit avant de cliquer combien chaque
                génération va lui coûter. Fallback wallet.aiCosts.landing si
                le backend n'a pas encore un tarif dédié pour poster/video. */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-muted-foreground">
              <span className="font-medium text-foreground/80">Affiche</span> {wallet.aiCosts.poster ?? wallet.aiCosts.landing}
              <span className="mx-1 opacity-40">·</span>
              <span className="font-medium text-foreground/80">Landing</span> {wallet.aiCosts.landing}
              <span className="mx-1 opacity-40">·</span>
              <span className="font-medium text-foreground/80">Vidéo</span> {wallet.aiCosts.video ?? wallet.aiCosts.landing}
            </div>
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
        <TabButton
          active={tab === 'video'}
          icon={<VideoIcon className="h-4 w-4" />}
          label="Vidéo"
          sublabel="5s · Seedance IA"
          onClick={() => setTab('video')}
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
          cost={wallet?.aiCosts.poster ?? wallet?.aiCosts.landing}
        />
      ) : tab === 'landing' ? (
        <LandingTab
          ready={!!ready}
          generating={landingGenerating}
          error={landingError}
          landing={landing}
          downloading={landingDownloading}
          onGenerate={handleGenerateLanding}
          onDownload={handleDownloadLanding}
          cost={wallet?.aiCosts.landing}
        />
      ) : (
        <VideoTab
          ready={!!ready}
          generating={videoGenerating}
          error={videoError}
          video={video}
          customPrompt={videoCustomPrompt}
          onCustomPromptChange={setVideoCustomPrompt}
          duration={videoDuration}
          onDurationChange={setVideoDuration}
          onGenerate={handleGenerateVideo}
          cost={wallet?.aiCosts.video ?? wallet?.aiCosts.landing}
          costWithVoice={wallet?.aiCosts.video_with_voice}
          voiceEnabled={videoVoiceEnabled}
          onVoiceEnabledChange={setVideoVoiceEnabled}
          voiceScript={videoVoiceScript}
          onVoiceScriptChange={setVideoVoiceScript}
          job={videoJob}
          suggestions={videoPromptSuggestions}
          suggestionsBusy={videoSuggestionsBusy}
          onFetchSuggestions={handleFetchVideoSuggestions}
          onGenerateUgc={handleGenerateUgcVideo}
          ugcMode={ugcMode}
          onUgcModeChange={setUgcMode}
          ugcAvatarId={ugcAvatarId}
          onUgcAvatarChange={setUgcAvatarId}
          ugcScenePrompt={ugcScenePrompt}
          onUgcScenePromptChange={setUgcScenePrompt}
          ugcAvatars={ugcAvatars}
          costUgcTalking={wallet?.aiCosts.video_ugc_talking}
          costUgcLifestyle={wallet?.aiCosts.video_ugc_lifestyle}
          source={videoSource}
          onSourceChange={handleVideoSourceChange}
          imageUrlInput={videoImageUrlInput}
          onImageUrlInputChange={setVideoImageUrlInput}
          productUrlInput={videoProductUrlInput}
          onProductUrlInputChange={setVideoProductUrlInput}
          resolvedImage={videoResolvedImage}
          sourceBusy={videoSourceBusy}
          sourceError={videoSourceError}
          onUploadFile={handleVideoUpload}
          onScrapeProductUrl={handleVideoScrapeProductUrl}
          productFirstImage={products.find((p) => p._id === productId)?.images?.[0]}
          previewRef={videoPreviewRef}
          flash={videoFlash}
        />
      )}

      {/* ── RÉCENTES (par tab) ─────────────────────────────────────
          Historique 30j des générations réussies — permet de revoir /
          retélécharger sans reperdre les tokens ni le contexte. */}
      <RecentGenerationsPanel
        kind={tab}
        items={tab === 'poster' ? recentPoster : tab === 'landing' ? recentLanding : recentVideo}
        onLoad={(item) => {
          if (item.kind === 'poster') setPoster(item.result as unknown as PosterContent);
          else if (item.kind === 'landing') setLanding(item.result as unknown as LandingImageResult);
          else if (item.kind === 'video') setVideo(item.result as unknown as VideoResult);
        }}
      />

      {/* Bottom sheet mobile — s'affiche seulement < md, contient un rendu
          simplifié du dernier résultat + un bouton "Télécharger". Ferme la
          sheet pour revenir aux inputs. */}
      <MobilePreviewSheet
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        title={
          tab === 'poster' ? '🎨 Ton affiche est prête' :
          tab === 'landing' ? '📄 Ta landing est prête' :
          '🎬 Ta vidéo est prête'
        }
        footer={
          <div className="flex gap-2">
            {tab === 'video' && video && (
              <Button asChild size="sm" className="flex-1 gap-2">
                <a href={video.videoUrl} download={`video-${Date.now()}.mp4`}>
                  <Download className="h-3.5 w-3.5" /> Télécharger MP4
                </a>
              </Button>
            )}
            {tab === 'landing' && landing?.imageUrl && (
              <Button asChild size="sm" className="flex-1 gap-2">
                <a href={landing.imageUrl} download={`landing-${Date.now()}.png`}>
                  <Download className="h-3.5 w-3.5" /> Télécharger
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setMobileSheetOpen(false)}
            >
              Fermer
            </Button>
          </div>
        }
      >
        {tab === 'video' && video && (
          <div className="mx-auto w-full max-w-xs">
            <video
              key={video.videoUrl}
              src={video.videoUrl}
              controls
              autoPlay
              loop
              playsInline
              className="w-full rounded-lg bg-black"
            />
            <div className="mt-2 text-center text-[10px] text-muted-foreground">
              {video.durationSeconds}s · {video.width}×{video.height}
              {video.hasVoiceover && ' · voice-over'}
            </div>
          </div>
        )}
        {tab === 'landing' && landing?.imageUrl && (
          <div className="mx-auto w-full max-w-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={landing.imageUrl} alt="Landing" className="w-full rounded-lg" />
          </div>
        )}
        {tab === 'poster' && poster && (
          <div className="mx-auto w-full max-w-xs text-center text-xs text-muted-foreground">
            Affiche générée — retourne à l'écran principal pour l'exporter en PNG/JPG.
          </div>
        )}
      </MobilePreviewSheet>

      {/* FAB Historique — bouton flottant permanent bottom-right qui ouvre
          le drawer avec les 5 dernières générations du tab courant. Résout
          le pb "l'historique est en bas du DOM = mort" en le rendant
          accessible à 1 clic sans scroller. */}
      {(recentPoster.length + recentLanding.length + recentVideo.length) > 0 && (
        <button
          type="button"
          onClick={() => setHistoryDrawerOpen(true)}
          className="fixed bottom-5 right-5 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
          aria-label="Ouvrir l'historique des générations"
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">Historique</span>
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-fuchsia-500 px-1.5 text-[10px] font-bold text-white">
            {tab === 'poster' ? recentPoster.length : tab === 'landing' ? recentLanding.length : recentVideo.length}
          </span>
        </button>
      )}

      <HistoryDrawer
        open={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        kind={tab}
        items={tab === 'poster' ? recentPoster : tab === 'landing' ? recentLanding : recentVideo}
        onLoad={(item) => {
          if (item.kind === 'poster') setPoster(item.result as unknown as PosterContent);
          else if (item.kind === 'landing') setLanding(item.result as unknown as LandingImageResult);
          else if (item.kind === 'video') setVideo(item.result as unknown as VideoResult);
          setHistoryDrawerOpen(false);
        }}
      />
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
        // Sur mobile : gap plus serré + padding vertical réduit pour tenir 3 tabs sur 375px.
        'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-all sm:gap-2.5 sm:px-4 sm:py-2.5',
        active
          ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-md'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-col items-start leading-tight">
        <span className="truncate text-xs font-semibold sm:text-sm">{label}</span>
        {/* Sublabel caché en dessous de sm — sinon ça déborde à 3 tabs sur 375px. */}
        <span
          className={cn(
            'hidden truncate text-[10px] sm:block',
            active ? 'text-white/80' : 'text-muted-foreground',
          )}
        >
          {sublabel}
        </span>
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
  cost?: number;
}

function PosterTab(props: PosterTabProps) {
  const {
    ready, generating, error, poster, theme, format, isAdmin,
    onThemeChange, onFormatChange, onGenerate, onDownload, exportRef, cost,
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
          {cost != null && !generating && (
            <div className="text-center text-[10px] text-muted-foreground">
              Coût : {cost} token{cost === 1 ? '' : 's'} facturés à la génération
            </div>
          )}

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
  cost?: number;
}

function LandingTab(props: LandingTabProps) {
  const { ready, generating, error, landing, downloading, onGenerate, onDownload, cost } = props;

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
          {cost != null && !generating && (
            <div className="text-center text-[10px] text-muted-foreground">
              Coût : {cost} token{cost === 1 ? '' : 's'} facturés à la génération
            </div>
          )}

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
          <div className="mx-auto w-full max-w-[420px] sm:max-w-[320px]">
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

// ── VIDEO TAB ────────────────────────────────────────────────────────

type VideoSource = 'product' | 'upload' | 'imageUrl' | 'productUrl' | 'ugc';

interface VideoTabProps {
  ready: boolean;
  generating: boolean;
  error: string;
  video: VideoResult | null;
  customPrompt: string;
  onCustomPromptChange: (v: string) => void;
  duration: 5 | 8 | 12;
  onDurationChange: (v: 5 | 8 | 12) => void;
  onGenerate: () => void;
  cost?: number;
  /** Tarif majoré affiché à la place de `cost` quand voice-over est activé. */
  costWithVoice?: number;
  // ── Voice-over ──────────────────────────────────────────────────
  voiceEnabled: boolean;
  onVoiceEnabledChange: (v: boolean) => void;
  voiceScript: string;
  onVoiceScriptChange: (v: string) => void;
  /** Job en cours — piloté par le polling parent, alimente la Timeline live. */
  job: GenerationJob | null;
  /** 3 suggestions IA remplaçant les exemples statiques une fois chargées. */
  suggestions: string[];
  suggestionsBusy: boolean;
  onFetchSuggestions: () => void;
  // ── Source de l'image ────────────────────────────────────────────
  source: VideoSource;
  onSourceChange: (v: VideoSource) => void;
  // ── UGC (mode complet quand source === 'ugc') ─────────────────────
  onGenerateUgc: () => void;
  ugcMode: 'talking-head' | 'lifestyle';
  onUgcModeChange: (m: 'talking-head' | 'lifestyle') => void;
  ugcAvatarId: string | null;
  onUgcAvatarChange: (id: string | null) => void;
  ugcScenePrompt: string;
  onUgcScenePromptChange: (v: string) => void;
  ugcAvatars: Array<{ id: string; name: string; gender: string; region: string; imageUrl: string }>;
  costUgcTalking?: number;
  costUgcLifestyle?: number;
  imageUrlInput: string;
  onImageUrlInputChange: (v: string) => void;
  productUrlInput: string;
  onProductUrlInputChange: (v: string) => void;
  /** URL de l'image résolue après upload ou scrape (preview + backend). */
  resolvedImage: string | null;
  sourceBusy: boolean;
  sourceError: string;
  onUploadFile: (file: File) => void;
  onScrapeProductUrl: () => void;
  /** 1ʳᵉ photo du produit courant — pour l'aperçu du mode "product". */
  productFirstImage?: string;
  /** Ref sur le container de la preview vidéo — utilisé pour scrollIntoView
   *  quand la vidéo arrive (surtout utile en mobile). */
  previewRef: React.RefObject<HTMLDivElement>;
  /** True brièvement (~2.5s) après réception d'une nouvelle vidéo — déclenche
   *  un ring/pulse visuel autour de la preview pour attirer l'œil. */
  flash: boolean;
}

const VIDEO_DURATIONS = [5, 8, 12] as const;

function VideoTab(props: VideoTabProps) {
  const {
    ready, generating, error, video, customPrompt, onCustomPromptChange,
    duration, onDurationChange, onGenerate, cost, costWithVoice,
    source, onSourceChange, imageUrlInput, onImageUrlInputChange,
    productUrlInput, onProductUrlInputChange, resolvedImage, sourceBusy,
    sourceError, onUploadFile, onScrapeProductUrl, productFirstImage,
    previewRef, flash,
    voiceEnabled, onVoiceEnabledChange, voiceScript, onVoiceScriptChange,
    job,
    suggestions, suggestionsBusy, onFetchSuggestions,
    onGenerateUgc,
    ugcMode, onUgcModeChange,
    ugcAvatarId, onUgcAvatarChange,
    ugcScenePrompt, onUgcScenePromptChange,
    ugcAvatars, costUgcTalking, costUgcLifestyle,
  } = props;
  const isUgc = source === 'ugc';

  // Résolution "step validé" pour piloter le StepIndicator. Chaque étape
  // est considérée validée dès que le vendeur a fourni un input suffisant
  // pour cette étape — pas besoin de clicker "suivant", c'est du reactive.
  const step1Done =
    source === 'product' ? !!productFirstImage :
    source === 'imageUrl' ? imageUrlInput.trim().length > 0 :
    !!resolvedImage;
  const step2Done = duration != null;
  const step3Done = customPrompt.trim().length > 0;
  const step4Done = voiceEnabled ? voiceScript.trim().length > 0 : true; // OFF = validé auto
  // Coût effectif affiché sous le bouton — dépend du toggle voice-over.
  const effectiveCost = voiceEnabled && costWithVoice != null ? costWithVoice : cost;

  // Aperçu de l'image qui sera animée — dépend du mode source. Le mode
  // "imageUrl" affiche directement l'URL saisie (validation legère par la
  // balise <img>) ; les modes "upload" et "productUrl" affichent l'URL
  // résolue par le backend après upload / scrape.
  const previewImage =
    source === 'product' ? productFirstImage :
    source === 'imageUrl' ? (imageUrlInput.trim() || null) :
    resolvedImage;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* LEFT — info + optional custom prompt + CTA */}
      <Card className="overflow-hidden">
        <div className="border-b border-border/50 bg-gradient-to-r from-muted/20 to-muted/5 px-4 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            2. Génération vidéo
          </div>
        </div>
        <CardContent className="space-y-4 pt-4">
          {/* Step indicator sticky — 4 étapes cliquables (scroll-to-section)
              qui s'auto-check dès que l'input requis est présent. Rend le
              wizard des 4 sections lisible d'un coup d'œil au lieu de faire
              défiler l'écran pour comprendre où on en est. */}
          <StepIndicator
            steps={[
              { id: 'step-source', label: 'Source', done: step1Done },
              { id: 'step-duration', label: 'Durée', done: step2Done },
              { id: 'step-prompt', label: 'Prompt', done: step3Done },
              { id: 'step-voice', label: 'Voice-over', done: step4Done, optional: !voiceEnabled },
            ]}
          />

          <div className="rounded-xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/5 via-pink-500/5 to-transparent p-3">
            <div className="flex items-start gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fuchsia-500/15 text-fuchsia-700">
                <VideoIcon className="h-4 w-4" />
              </div>
              <div className="text-xs text-foreground/80">
                <strong>Vidéo IA {duration} secondes</strong> (720p) générée via
                Seedance (ByteDance) — depuis la photo du produit, une image que tu
                uploades, ou celle d&apos;un lien produit. Idéale pour ads Meta, TikTok,
                ou hero produit animé. Le MP4 est sauvegardé — retrouve tes vidéos
                dans « Récentes » ci-dessous.
              </div>
            </div>
          </div>

          {/* Source de l'image à animer — 5 modes. On veut que le vendeur
              voie exactement quelle photo va être animée avant de payer.
              Le brief produit (nom, description) reste utilisé pour le
              prompt LLM même quand la photo vient d'ailleurs. Le mode
              "ugc" bascule tout le formulaire dans un flow différent
              (avatar + script/scène, endpoint dédié Hedra/Kling). */}
          <div id="step-source" className="scroll-mt-24 space-y-2.5 rounded-xl border border-border/60 bg-muted/10 p-3">
            <Label className="text-sm font-semibold">Source de l&apos;image</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {([
                { key: 'product', label: 'Photo produit', icon: Package },
                { key: 'upload', label: 'Uploader', icon: Upload },
                { key: 'imageUrl', label: 'URL image', icon: ImageIcon },
                { key: 'productUrl', label: 'Lien produit', icon: Link2 },
                { key: 'ugc', label: 'UGC personnage', icon: Mic },
              ] as const).map((opt) => {
                const active = source === opt.key;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onSourceChange(opt.key)}
                    disabled={generating || sourceBusy}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold transition-all disabled:pointer-events-none disabled:opacity-50',
                      active
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Inputs contextuels selon le mode */}
            {source === 'upload' && (
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadFile(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={generating || sourceBusy}
                  className="w-full gap-1.5"
                >
                  {sourceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {sourceBusy ? 'Envoi…' : resolvedImage ? 'Changer la photo' : 'Choisir une photo (JPG/PNG, ≤15MB)'}
                </Button>
              </div>
            )}

            {source === 'imageUrl' && (
              <input
                type="url"
                value={imageUrlInput}
                onChange={(e) => onImageUrlInputChange(e.target.value)}
                placeholder="https://.../photo.jpg"
                disabled={generating}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
            )}

            {source === 'productUrl' && (
              <div className="flex gap-1.5">
                <input
                  type="url"
                  value={productUrlInput}
                  onChange={(e) => onProductUrlInputChange(e.target.value)}
                  placeholder="https://... (Amazon, AliExpress, blog produit…)"
                  disabled={generating || sourceBusy}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
                />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={onScrapeProductUrl}
                  disabled={generating || sourceBusy || !productUrlInput.trim()}
                  className="shrink-0 gap-1.5"
                >
                  {sourceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {sourceBusy ? 'Lecture…' : 'Récupérer'}
                </Button>
              </div>
            )}

            {sourceError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {sourceError}
              </div>
            )}

            {/* Mode UGC — remplace toute la config standard (durée / prompt /
                voice-over) par un flow spécifique : choix mode + avatar +
                script/scène. Endpoint dédié, tarif majoré selon le mode. */}
            {isUgc && (
              <div className="space-y-3 rounded-lg border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/[0.03] to-pink-500/[0.03] p-3">
                {/* Sous-mode UGC */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold">Type d&apos;UGC</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      {
                        key: 'talking-head' as const,
                        label: '🎤 Talking-head',
                        desc: 'Personne face caméra qui parle du produit (lip-sync IA)',
                        cost: costUgcTalking,
                      },
                      {
                        key: 'lifestyle' as const,
                        label: '🎬 Lifestyle',
                        desc: 'Personne qui utilise le produit dans une scène',
                        cost: costUgcLifestyle,
                      },
                    ]).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => onUgcModeChange(m.key)}
                        disabled={generating}
                        className={cn(
                          'rounded-lg border p-2 text-left transition-all disabled:pointer-events-none disabled:opacity-50',
                          ugcMode === m.key
                            ? 'border-fuchsia-500 bg-fuchsia-500/10 shadow-sm'
                            : 'border-border/60 bg-background hover:border-fuchsia-500/40',
                        )}
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          {m.label}
                          {m.cost != null && (
                            <span className="rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-700">
                              {m.cost} tk
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[9px] leading-snug text-muted-foreground">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bibliothèque d'avatars */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold">Choisis un personnage</Label>
                  {ugcAvatars.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[10px] text-muted-foreground">
                      Chargement de la bibliothèque…
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-4">
                      {ugcAvatars.map((av) => (
                        <button
                          key={av.id}
                          type="button"
                          onClick={() => onUgcAvatarChange(av.id)}
                          disabled={generating}
                          title={`${av.name} · ${av.region}`}
                          className={cn(
                            'group relative overflow-hidden rounded-lg border transition-all disabled:pointer-events-none disabled:opacity-50',
                            ugcAvatarId === av.id
                              ? 'border-fuchsia-500 ring-2 ring-fuchsia-500/40'
                              : 'border-border/60 hover:border-fuchsia-500/40',
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={av.imageUrl}
                            alt={av.name}
                            className="aspect-square h-full w-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-0.5 pt-3">
                            <div className="truncate text-[9px] font-semibold text-white">{av.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Input spécifique au mode */}
                {ugcMode === 'talking-head' ? (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">Que doit dire le personnage ?</Label>
                    <textarea
                      value={voiceScript}
                      onChange={(e) => onVoiceScriptChange(e.target.value)}
                      placeholder="Ex : Découvre le nouveau caftan Marrakech, tissu de soie brodée main. Livraison chez toi en 48h, paiement à la livraison !"
                      rows={3}
                      maxLength={300}
                      disabled={generating}
                      className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed focus:border-fuchsia-500/50 focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 disabled:opacity-50"
                    />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>La voix IA lit ce texte, le personnage bouge les lèvres en sync.</span>
                      <span className="tabular-nums">{voiceScript.length}/300</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">Décris la scène (5s de vidéo)</Label>
                    <textarea
                      value={ugcScenePrompt}
                      onChange={(e) => onUgcScenePromptChange(e.target.value)}
                      placeholder="Ex : Elle porte le caftan devant un miroir, tourne doucement pour montrer le dos, sourit à la caméra. Lumière naturelle du matin, ambiance chic."
                      rows={3}
                      maxLength={300}
                      disabled={generating}
                      className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed focus:border-fuchsia-500/50 focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 disabled:opacity-50"
                    />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Vidéo silencieuse (5s) — tu ajoutes musique / voix off en post-prod.</span>
                      <span className="tabular-nums">{ugcScenePrompt.length}/300</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preview de l'image qui sera animée — clé pour la confiance :
                le vendeur voit ce qui va être facturé avant de cliquer.
                Cachée en mode UGC car l'avatar picker fait déjà la preview. */}
            {!isUgc && previewImage && (
              <div className="flex items-center gap-2.5 rounded-md border border-border/60 bg-background p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImage}
                  alt="Aperçu source"
                  className="h-14 w-14 shrink-0 rounded-md object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                />
                <div className="min-w-0 flex-1 text-[10px] text-muted-foreground">
                  <div className="font-medium text-foreground">Image qui sera animée</div>
                  <div className="truncate">{previewImage}</div>
                </div>
              </div>
            )}
          </div>

          {/* Sélecteur de durée — 3 boutons segmentés. Le coût fal augmente
              proportionnellement à la durée ; on garde 10s en défaut car c'est
              le sweet spot pour un ad social. Caché en mode UGC (Hedra suit
              la durée de l'audio TTS, Kling est fixé à 5s dans le service). */}
          {!isUgc && (<div id="step-duration" className="scroll-mt-24 space-y-2">
            <Label className="text-sm font-semibold">Durée de la vidéo</Label>
            <div className="grid grid-cols-3 gap-2">
              {VIDEO_DURATIONS.map((d) => {
                const active = duration === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDurationChange(d)}
                    disabled={generating}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 ${
                      active
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    {d}s
                  </button>
                );
              })}
            </div>
          </div>)}

          {/* Prompt utilisateur — vraiment central : c'est LA façon de piloter la vidéo.
              Vide → l'IA écrit un prompt générique depuis le produit. Rempli →
              le prompt du vendeur est utilisé tel quel (traduction/nettoyage
              minimum côté backend). Caché en mode UGC — l'UGC a ses propres
              inputs (script talking-head / scène lifestyle) dans le bloc source. */}
          {!isUgc && (<div id="step-prompt" className="scroll-mt-24 space-y-2 rounded-xl border border-primary/25 bg-primary/[0.03] p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="video-prompt" className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Décris la vidéo que tu veux
              </Label>
              <div className="flex items-center gap-3">
                {/* Bouton "Suggère-moi" — 0 token, IA génère 3 propositions
                    contextualisées au produit courant. Idéal pour débloquer
                    le vendeur devant la textarea vide. */}
                <button
                  type="button"
                  onClick={onFetchSuggestions}
                  disabled={suggestionsBusy || generating}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  {suggestionsBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wand2 className="h-3 w-3" />
                  )}
                  {suggestionsBusy ? 'IA écrit…' : 'Suggère-moi'}
                </button>
                <button
                  type="button"
                  onClick={() => onCustomPromptChange('')}
                  disabled={!customPrompt}
                  className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-30"
                >
                  Effacer
                </button>
              </div>
            </div>
            <textarea
              id="video-prompt"
              value={customPrompt}
              onChange={(e) => onCustomPromptChange(e.target.value)}
              placeholder="Ex : Rotation lente à 360° sur une table en marbre, lumière chaude studio, ambiance luxe. Le produit reste net et centré, léger zoom en fin de plan."
              rows={5}
              maxLength={300}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>💡 Vide = l&apos;IA écrit à partir du produit. Rempli = c&apos;est ton prompt qui pilote la vidéo.</span>
              <span className="tabular-nums">{customPrompt.length}/300</span>
            </div>
            {/* Suggestions IA (si chargées) > sinon fallback exemples statiques.
                Les suggestions IA sont pleines phrases directement collables
                dans la textarea, les exemples statiques ont un label court. */}
            {suggestions.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                <div className="text-[9px] font-bold uppercase tracking-wider text-primary/70">
                  Suggestions IA — clique pour utiliser
                </div>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onCustomPromptChange(s)}
                      className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-left text-[11px] leading-snug text-foreground/85 transition-colors hover:border-primary/60 hover:bg-primary/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {VIDEO_PROMPT_EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => onCustomPromptChange(ex.prompt)}
                    className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            )}
          </div>)}

          {/* Voice-over IA optionnel — coche pour ajouter une voix off générée
              par ElevenLabs et muxée sur la vidéo. Coût majoré (voir badge sur
              le bouton). Défaut désactivé pour ne jamais surprendre le vendeur
              avec un débit supplémentaire non-consenti. Caché en mode UGC
              talking-head (le script est déjà lu par la voix baked-in Hedra). */}
          {!isUgc && (<div id="step-voice" className={cn(
            'scroll-mt-24 space-y-2.5 rounded-xl border p-3 transition-colors',
            voiceEnabled
              ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
              : 'border-border/60 bg-muted/10',
          )}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => onVoiceEnabledChange(e.target.checked)}
                disabled={generating}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Mic className="h-3.5 w-3.5 text-emerald-600" />
                  Ajouter un voice-over IA
                  {costWithVoice != null && cost != null && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      +{costWithVoice - cost} token{costWithVoice - cost === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Une voix IA (ElevenLabs multilingue) lit ton script par-dessus la vidéo. Idéal pour ads TikTok/Meta.
                </div>
              </div>
            </label>

            {voiceEnabled && (
              <div className="space-y-1.5 pl-6">
                <textarea
                  value={voiceScript}
                  onChange={(e) => onVoiceScriptChange(e.target.value)}
                  placeholder={
                    duration === 5
                      ? 'Script court (~15 mots max)'
                      : duration === 8
                        ? 'Script (~25 mots max)'
                        : 'Script (~40 mots max)'
                  }
                  rows={3}
                  maxLength={300}
                  disabled={generating}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed focus:border-emerald-500/50 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-50"
                />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>La voix parle dans la langue du produit. Coupé à la durée de la vidéo si trop long.</span>
                  <span className="tabular-nums">{voiceScript.length}/300</span>
                </div>
              </div>
            )}
          </div>)}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <Button
            onClick={isUgc ? onGenerateUgc : onGenerate}
            disabled={
              !ready ||
              (isUgc && !ugcAvatarId) ||
              (isUgc && ugcMode === 'talking-head' && !voiceScript.trim()) ||
              (isUgc && ugcMode === 'lifestyle' && !ugcScenePrompt.trim()) ||
              (!isUgc && voiceEnabled && !voiceScript.trim())
            }
            className="w-full gap-2 gradient-brand h-11 text-sm"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating
              ? 'Génération en cours…'
              : video
                ? 'Régénérer la vidéo'
                : isUgc
                  ? `Générer la vidéo UGC ${ugcMode === 'talking-head' ? 'talking-head' : 'lifestyle'}`
                  : 'Générer la vidéo'}
          </Button>
          {(() => {
            // Coût effectif — dépend du mode. UGC talking-head / lifestyle
            // ont leurs propres tarifs, vidéo standard voix-off ou non déjà
            // géré par `effectiveCost`.
            const shownCost = isUgc
              ? (ugcMode === 'talking-head' ? costUgcTalking : costUgcLifestyle)
              : effectiveCost;
            if (shownCost == null || generating) return null;
            const label = isUgc
              ? (ugcMode === 'talking-head' ? '(UGC talking-head, voix IA incluse)' : '(UGC lifestyle, sans son)')
              : voiceEnabled ? '(vidéo + voice-over)' : '';
            return (
              <div className="text-center text-[10px] text-muted-foreground">
                Coût : <strong>{shownCost} token{shownCost === 1 ? '' : 's'}</strong> {label} facturés à la génération
              </div>
            );
          })()}

          {generating && (
            <p className="text-center text-[11px] text-muted-foreground">
              {isUgc
                ? ugcMode === 'talking-head'
                  ? 'Étape 1 : voix IA · Étape 2 : Hedra lip-sync · ~90 à 180s'
                  : 'Étape 1 : Kling image-to-video · Étape 2 : finalisation · ~90 à 180s'
                : voiceEnabled
                  ? 'Étape 1 : rendu Seedance · Étape 2 : voix IA + mux · ~90 à 150s'
                  : 'Étape 1 : écriture du prompt · Étape 2 : rendu Seedance · ~60 à 120s'}
            </p>
          )}

          {/* Prompt utilisé — accordion pour transparence */}
          {video && (
            <details className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-foreground hover:text-primary">
                Détails de la génération
              </summary>
              <div className="mt-3 space-y-2.5 text-xs">
                <CopyField label="Prompt utilisé" value={video.prompt} />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Modèle</div>
                  <code className="mt-0.5 block break-all font-mono text-[11px]">{video.modelId}</code>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Durée</div>
                    <div className="mt-0.5 tabular-nums">{video.durationSeconds}s</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Résolution</div>
                    <div className="mt-0.5 tabular-nums">{video.width}×{video.height}</div>
                  </div>
                </div>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* RIGHT — video preview
          Le ring vert + animate-pulse flash 2.5s à la réception d'une
          nouvelle vidéo pour capter l'attention (le user vient d'attendre
          60-120s, il faut signaler visuellement que c'est prêt). */}
      <div
        ref={previewRef}
        className={cn(
          'scroll-mt-24 rounded-2xl transition-all duration-500',
          flash && 'ring-4 ring-emerald-400/70 ring-offset-2 ring-offset-background animate-pulse',
        )}
      >
      <PreviewCard
        title="Aperçu"
        subtitle={video ? 'Vidéo prête à télécharger' : 'La vidéo apparaîtra ici'}
        downloadButtons={video && (
          <>
            <Button size="sm" asChild className="h-8 gap-1 px-2.5 text-xs">
              {/* `download` demande au navigateur d'enregistrer plutôt que de
                  naviguer — fal.media renvoie un Content-Disposition compatible. */}
              <a href={video.videoUrl} download={`video-${Date.now()}.mp4`}>
                <Download className="h-3.5 w-3.5" /> MP4
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild className="h-8 gap-1 px-2.5 text-xs">
              <a href={video.videoUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Ouvrir
              </a>
            </Button>
          </>
        )}
      >
        {!video && !generating && (
          <EmptyState
            icon={<Play className="h-8 w-8 text-muted-foreground/50" />}
            title="La vidéo apparaîtra ici"
            hint="Configure à gauche et clique Générer"
          />
        )}
        {generating && !video && (
          <GenerationTimeline
            job={job}
            sourceImage={previewImage}
            stepLabels={{
              analyze: 'Analyse de l’image source',
              copy: 'Écriture du prompt vidéo IA',
              images: voiceEnabled
                ? 'Rendu Seedance + voice-over ElevenLabs'
                : 'Rendu Seedance 720p (le plus long)',
              assemble: voiceEnabled
                ? 'Mux audio + sauvegarde MP4'
                : 'Finalisation & sauvegarde',
            }}
            hint={voiceEnabled ? '≈ 90 à 150 secondes' : '≈ 60 à 120 secondes'}
          />
        )}
        {video && (
          <div className="mx-auto w-full max-w-[420px] sm:max-w-[320px]">
            {/* URL permanente : `persistRemoteVideo` ré-héberge le rendu
                fal.media dans notre storage (R2/local/S3), donc le player
                ne se retrouve jamais avec un lien expiré. */}
            <video
              key={video.videoUrl}
              src={video.videoUrl}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="w-full rounded-lg bg-black shadow-sm"
            />
          </div>
        )}
      </PreviewCard>
      </div>
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
        {/* Header : titre à gauche, boutons à droite. Sur mobile <380px, si
            les boutons ne rentrent pas ils passent sous le titre grâce au
            flex-wrap + min-w-0 sur la colonne texte pour éviter overflow. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-gradient-to-r from-muted/20 to-muted/5 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
          </div>
          {downloadButtons && <div className="flex shrink-0 gap-1">{downloadButtons}</div>}
        </div>
        <CardContent className="bg-muted/30 p-2 sm:p-3">{children}</CardContent>
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

/**
 * Drawer historique — s'ouvre depuis le FAB "Historique". Sur desktop
 * (≥ md) : slide-in depuis la droite (largeur 400px). Sur mobile : bottom
 * sheet (85vh). Affiche la même grille de vignettes que le RecentGenerationsPanel
 * mais dans un overlay accessible partout, plus besoin de scroller.
 */
function HistoryDrawer({
  open,
  onClose,
  kind,
  items,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  kind: StudioTab;
  items: AiGenerationItem[];
  onLoad: (item: AiGenerationItem) => void;
}) {
  const label = kind === 'poster' ? 'affiches' : kind === 'landing' ? 'landings' : 'vidéos';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border-border/60 bg-card shadow-2xl',
            // Mobile : bottom sheet 85vh
            'inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl border-t',
            // Desktop ≥ md : side drawer 400px collé à droite
            'md:inset-y-0 md:right-0 md:left-auto md:top-0 md:bottom-auto md:h-full md:max-h-none md:w-[400px] md:rounded-none md:border-t-0 md:border-l',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right',
            'duration-300',
          )}
        >
          {/* Drag handle mobile only */}
          <div className="flex shrink-0 justify-center pt-2 md:hidden">
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>
          <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 pt-3 pb-3 md:pt-5">
            <DialogPrimitive.Title className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-fuchsia-600" />
              {items.length} {label} récentes
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="grid place-items-center py-16 text-center text-xs text-muted-foreground">
                <History className="mb-2 h-6 w-6 opacity-40" />
                Aucune génération encore. Ton historique 30j s'affichera ici.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {items.map((item) => {
                  const thumb = item.preview?.thumbnailUrl;
                  const isVideo = item.kind === 'video';
                  const videoUrl = isVideo ? (item.result.videoUrl as string | undefined) : undefined;
                  return (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => onLoad(item)}
                      className="group overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="relative aspect-square w-full bg-muted">
                        {isVideo && videoUrl ? (
                          <video src={videoUrl} className="h-full w-full object-cover" muted loop playsInline />
                        ) : thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-muted-foreground/40">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-[11px] font-semibold">
                          {item.preview?.title || item.kind}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[9px] text-muted-foreground">
                          <span>{item.preview?.subtitle || item.kind}</span>
                          <span>{timeAgo(item.createdAt)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Indicateur d'étapes cliquable — chaque step montre son état (à faire /
 * en cours / fait). Cliquer scroll vers l'ancre correspondante (id). Rend
 * lisible d'un coup d'œil "où j'en suis" quand le formulaire dépasse
 * l'écran (cas du VideoTab avec ses 4 sections).
 *
 * Steps `optional: true` (ex: voice-over désactivé) restent grisés — pas
 * de check bleu et pas de barrière au passage à la suite.
 */
function StepIndicator({
  steps,
}: {
  steps: Array<{ id: string; label: string; done: boolean; optional?: boolean }>;
}) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-1 border-b border-border/50 bg-card/95 px-4 py-2 backdrop-blur">
      <ol className="flex items-center gap-1 overflow-x-auto sm:gap-2">
        {steps.map((s, i) => (
          <li key={s.id} className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => scrollTo(s.id)}
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors',
                s.done && !s.optional && 'text-emerald-700 hover:bg-emerald-500/10',
                !s.done && !s.optional && 'text-muted-foreground hover:bg-muted hover:text-foreground',
                s.optional && 'text-muted-foreground/60 hover:bg-muted',
              )}
              aria-current={!s.done && !s.optional ? 'step' : undefined}
            >
              <span className={cn(
                'grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold',
                s.done && !s.optional && 'bg-emerald-500 text-white',
                !s.done && !s.optional && 'bg-muted text-muted-foreground',
                s.optional && 'bg-muted/50 text-muted-foreground/60',
              )}>
                {s.done && !s.optional ? '✓' : i + 1}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
              {s.optional && <span className="text-[8px] uppercase opacity-60">Opt</span>}
            </button>
            {i < steps.length - 1 && (
              <span className={cn(
                'h-px w-3 sm:w-6',
                s.done ? 'bg-emerald-500/40' : 'bg-border',
              )} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Bottom sheet mobile — s'ouvre automatiquement quand une génération vient
 * d'aboutir sur mobile. Solutionne le "où est ma vidéo ?" post-génération
 * où la preview était en bas du DOM (invisible sans scroll).
 *
 * Desktop = ne s'affiche jamais (masqué via `md:hidden` + le parent ne
 * l'ouvre pas > md). La sheet occupe ~75% de la hauteur, drag-handle en
 * haut, dismiss au clic sur backdrop.
 */
function MobilePreviewSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl border-t border-border/60 bg-card shadow-2xl md:hidden',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'duration-300',
          )}
        >
          {/* Drag handle décoratif */}
          <div className="flex shrink-0 justify-center pt-2">
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>
          <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
            <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-border/60 bg-muted/30 px-4 py-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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

/**
 * Timeline live des étapes d'un GenerationJob. Chaque étape reflète le
 * state serveur (`job.steps.*` : pending / running / done / failed) et
 * s'anime selon son état. Utilisé pour la vidéo (60-150s d'attente) où
 * un simple spinner ne rassure plus le vendeur.
 *
 * `stepLabels` permet d'adapter la copie selon le kind (video vs future
 * landing async), tout en gardant le même composant + les mêmes 4 slots
 * matchant l'énum backend `JobStep`.
 */
function GenerationTimeline({
  job,
  stepLabels,
  sourceImage,
  hint,
}: {
  job: GenerationJob | null;
  stepLabels: Record<'analyze' | 'copy' | 'images' | 'assemble', string>;
  /** Image floutée en fond pendant l'attente — donne du contexte visuel. */
  sourceImage?: string | null;
  /** Petit texte sous la timeline (durée estimée, tip). */
  hint?: string;
}) {
  const steps: Array<'analyze' | 'copy' | 'images' | 'assemble'> = ['analyze', 'copy', 'images', 'assemble'];
  const progress = job?.progress ?? 0;
  return (
    <div className="relative overflow-hidden rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/[0.03]">
      {/* Image source floutée en fond — passe la génération de "vide" à
          "contextuel". aria-hidden car purement décoratif. */}
      {sourceImage && (
        <div className="pointer-events-none absolute inset-0 -z-0 opacity-25" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sourceImage} alt="" className="h-full w-full scale-110 object-cover blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-fuchsia-500/10 via-transparent to-background/80" />
        </div>
      )}

      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-8">
        {/* Progress bar globale */}
        <div className="mx-auto mb-5 h-1 max-w-xs overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-orange-500 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
          />
        </div>

        {/* 4 steps verticaux */}
        <ol className="mx-auto max-w-sm space-y-2.5">
          {steps.map((k) => {
            const st = job?.steps?.[k] ?? 'pending';
            const isRun = st === 'running';
            const isDone = st === 'done';
            const isFail = st === 'failed';
            return (
              <li
                key={k}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2 text-xs transition-colors',
                  isRun && 'border-fuchsia-500/60 bg-fuchsia-500/10',
                  isDone && 'border-emerald-500/40 bg-emerald-500/5',
                  isFail && 'border-destructive/40 bg-destructive/5',
                  !isRun && !isDone && !isFail && 'border-border/50 bg-background/40 opacity-60',
                )}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full">
                  {isDone && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                  {isRun && <Loader2 className="h-4 w-4 animate-spin text-fuchsia-600" />}
                  {isFail && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  {!isRun && !isDone && !isFail && (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                <span
                  className={cn(
                    'flex-1 font-medium',
                    isRun && 'text-foreground',
                    isDone && 'text-emerald-800',
                    isFail && 'text-destructive',
                    !isRun && !isDone && !isFail && 'text-muted-foreground',
                  )}
                >
                  {stepLabels[k]}
                </span>
                {isRun && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700">
                    En cours
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {hint && (
          <p className="mx-auto mt-4 max-w-sm text-center text-[10px] text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
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

// ─────────────────────────────────────────────────────────────────────
// Récentes — historique des générations réussies (30j côté backend)
// ─────────────────────────────────────────────────────────────────────

/** Format « il y a X min/h/j » — évite d'importer date-fns pour 6 lignes. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function RecentGenerationsPanel({
  kind, items, onLoad,
}: {
  kind: StudioTab;
  items: AiGenerationItem[];
  onLoad: (item: AiGenerationItem) => void;
}) {
  if (items.length === 0) return null;
  const label = kind === 'poster' ? 'affiches' : kind === 'landing' ? 'landings' : 'vidéos';
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 bg-gradient-to-r from-muted/20 to-muted/5 px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          Récentes {label} · {items.length}
        </div>
        <div className="text-[10px] text-muted-foreground">Conservées 30 jours</div>
      </div>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => {
            const thumb = item.preview?.thumbnailUrl;
            const isVideo = item.kind === 'video';
            const videoUrl = isVideo ? (item.result.videoUrl as string | undefined) : undefined;
            return (
              <div
                key={item._id}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="relative aspect-square w-full bg-muted">
                  {isVideo && videoUrl ? (
                    // Preview vidéo silencieuse — pas de contrôles pour rester compact.
                    <video
                      src={videoUrl}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                    />
                  ) : thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(thumb) || thumb} alt={item.preview?.title || ''} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-2.5 pb-2.5 pt-2">
                  <div className="truncate text-[11px] font-medium">{item.preview?.title || 'Sans titre'}</div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{timeAgo(item.createdAt)}</span>
                    {item.cost != null && <span>{item.cost} tk</span>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onLoad(item)}
                    className="mt-1 h-7 w-full gap-1 px-2 text-[10px]"
                  >
                    <RotateCcw className="h-3 w-3" /> Réutiliser
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
