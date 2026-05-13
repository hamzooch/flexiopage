/**
 * Poster generator — single tall vertical image meant for ads (TryAd-style).
 *
 * Produces a structured JSON `PosterContent` that the frontend renders into
 * a downloadable PNG via html-to-image. The renderer supports RTL and three
 * style themes (gold-dark, cinema, warm-tan) inspired by the examples
 * shared by the operator (phone holder, mini-cinema, vacuum mount).
 *
 * Pipeline:
 *   1. LLM (Claude via FAL any-llm) — produces the copy + image prompts
 *   2. FAL FLUX in parallel — generates lifestyle/avatar images
 *   3. Returns the merged JSON; FE composes + offers download
 *
 * Cost: charged through the existing AI wallet bucket as a `landing` (500).
 */
import { runLLM } from './fal-landing.service';
import { generateImagesParallel } from './image-generation.service';

export type PosterTheme = 'gold-dark' | 'cinema' | 'warm-tan';

export interface PosterFeature {
  /** Short title — 3-6 words. */
  title: string;
  /** One-line body — 8-15 words. */
  body: string;
  /** Lucide-react icon id (subset). */
  icon: 'check' | 'shield' | 'truck' | 'clock' | 'star' | 'sparkles' | 'zap' | 'gift' | 'crown' | 'lock' | 'refresh';
}

export interface PosterTestimonial {
  quote: string;
  author: string;
  role?: string;
  rating?: number;
  /** Generated avatar image URL. */
  avatarUrl?: string;
}

export interface PosterContent {
  theme: PosterTheme;
  /** RTL when language is ar/he/fa/ur, otherwise ltr. */
  direction: 'ltr' | 'rtl';
  language: string;
  hero: {
    badge?: string;
    title: string;
    subtitle: string;
    /** Big primary headline above the photo (ad-style). */
    eyebrow?: string;
    /** URL of the product photo (provided by the seller). */
    productImageUrl?: string;
    /** Optional generated lifestyle image as fallback. */
    lifestyleImageUrl?: string;
  };
  pricing: {
    priceAfter: number;
    priceBefore?: number;
    currency: string;
    discountBadge?: string;
  };
  trustBadges: string[];
  features: PosterFeature[];
  testimonials: PosterTestimonial[];
  cta: {
    label: string;
    /** Small reassurance line under the CTA. */
    reassurance?: string;
  };
}

interface PosterInput {
  storeName: string;
  product: {
    name: string;
    description?: string;
    images?: string[];
    price?: number;
    compareAtPrice?: number;
  };
  theme?: PosterTheme;
  language?: string;
  country?: string;
  currency?: string;
}

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

const THEME_GUIDANCE: Record<PosterTheme, string> = {
  'gold-dark': 'luxe sombre, doré et noir, accents OR, look ad luxury (montres, parfums, tech premium)',
  cinema: 'fond noir profond, éclairage cinématographique, gros titres dorés/blancs, look dramatique',
  'warm-tan': 'tons chauds (sable, beige, terracotta), produits artisanaux, look éditorial chaleureux',
};

function buildPrompt(input: PosterInput, theme: PosterTheme): string {
  const lang = (input.language || 'fr').toLowerCase();
  const country = input.country || 'SN';
  const currency = input.currency || 'USD';
  const rtl = RTL_LANGS.has(lang.split('-')[0]);

  return `Tu es un copywriter d'ads pour le marché ${country}, langue ${lang}${rtl ? ' (RTL)' : ''}.

# Produit
Nom: ${input.product.name}
${input.product.description ? `Description: ${input.product.description}\n` : ''}${input.product.price ? `Prix: ${input.product.price} ${currency}\n` : ''}${input.product.compareAtPrice ? `Prix avant remise: ${input.product.compareAtPrice} ${currency}\n` : ''}

# Style visuel
Thème: ${theme} — ${THEME_GUIDANCE[theme]}

# Format de sortie : JSON pur uniquement (pas de markdown), structure exacte :
{
  "hero": {
    "badge": "ÉDITION LIMITÉE",                                 // 2-3 mots, all caps
    "eyebrow": "(optionnel) tagline courte au-dessus du titre",
    "title": "Titre principal — 4 à 8 mots, accroche émotionnelle",
    "subtitle": "Sous-titre — 1 phrase, 8-15 mots, focus sur le bénéfice clé"
  },
  "pricing": {
    "discountBadge": "−30% (ou laisser vide)",                  // pas obligatoire
    "trustBadges": ["Livraison gratuite", "Paiement à la livraison"]
  },
  "features": [                                                  // EXACTEMENT 3 features
    { "icon": "shield", "title": "court", "body": "1 phrase 8-12 mots" },
    { "icon": "truck", "title": "court", "body": "1 phrase 8-12 mots" },
    { "icon": "sparkles", "title": "court", "body": "1 phrase 8-12 mots" }
  ],
  "testimonials": [                                              // EXACTEMENT 2 témoignages
    {
      "quote": "Citation 1 phrase 12-20 mots, dans la langue du client",
      "author": "Prénom plausible",
      "role": "Ville, ${country}",
      "rating": 5,
      "avatarPrompt": "headshot of a smiling [age] [gender] from ${country}, natural light, photorealistic, no text, editorial photography"
    },
    {
      "quote": "Citation 2 dans le même esprit, mais différente",
      "author": "autre prénom",
      "role": "autre ville, ${country}",
      "rating": 5,
      "avatarPrompt": "headshot of a smiling [age] [gender] from ${country}, natural light, photorealistic, no text"
    }
  ],
  "cta": {
    "label": "COMMANDER MAINTENANT",                            // courte, 2-3 mots, all caps
    "reassurance": "Aucun prépaiement · Paiement à la livraison"
  }
}

# Règles de copy
- Tout le texte client (sauf icon/avatarPrompt) doit être dans la langue cible (${lang}).
- Le ton est direct, vendeur, mobile/social-media (Instagram/TikTok ads).
- Icons autorisés: check, shield, truck, clock, star, sparkles, zap, gift, crown, lock, refresh.
- avatarPrompt reste TOUJOURS en anglais (le modèle d'image en a besoin).
- Pas de markdown, pas d'explication, JSON direct.`;
}

interface RawLlmOutput {
  hero?: { badge?: string; eyebrow?: string; title?: string; subtitle?: string };
  pricing?: { discountBadge?: string; trustBadges?: string[] };
  features?: Array<{ icon?: PosterFeature['icon']; title?: string; body?: string }>;
  testimonials?: Array<{ quote?: string; author?: string; role?: string; rating?: number; avatarPrompt?: string }>;
  cta?: { label?: string; reassurance?: string };
}

function safeJsonExtract<T>(raw: string): T | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(trimmed) as T; } catch {}
  // Try to grab the first JSON object
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]) as T; } catch {}
  }
  return null;
}

export async function generatePoster(input: PosterInput): Promise<PosterContent> {
  const lang = (input.language || 'fr').toLowerCase();
  const direction: 'ltr' | 'rtl' = RTL_LANGS.has(lang.split('-')[0]) ? 'rtl' : 'ltr';
  const theme: PosterTheme = input.theme || 'gold-dark';

  // 1. LLM call
  const prompt = buildPrompt(input, theme);
  let llmRaw = '';
  try {
    llmRaw = await runLLM(prompt);
  } catch (err) {
    throw new Error(`LLM call failed: ${(err as Error).message}`);
  }
  const parsed = safeJsonExtract<RawLlmOutput>(llmRaw);
  if (!parsed) {
    throw new Error('LLM returned invalid JSON');
  }

  // 2. Avatar generation (parallel, best-effort)
  const avatarPrompts = (parsed.testimonials || []).map((t) => t.avatarPrompt || '').filter(Boolean);
  const avatars = avatarPrompts.length > 0
    ? await generateImagesParallel(avatarPrompts.map((p) => ({ prompt: p, isAvatar: true })))
    : [];

  // 3. Assemble
  const productImage = input.product.images?.[0];
  const currency = input.currency || 'USD';

  const features: PosterFeature[] = (parsed.features || [])
    .slice(0, 3)
    .map((f) => ({
      icon: (['check', 'shield', 'truck', 'clock', 'star', 'sparkles', 'zap', 'gift', 'crown', 'lock', 'refresh'].includes(f.icon as string) ? f.icon! : 'check') as PosterFeature['icon'],
      title: (f.title || '').slice(0, 60),
      body: (f.body || '').slice(0, 200),
    }));
  while (features.length < 3) {
    features.push({ icon: 'check', title: '—', body: '—' });
  }

  const testimonials: PosterTestimonial[] = (parsed.testimonials || []).slice(0, 2).map((t, i) => ({
    quote: (t.quote || '').slice(0, 240),
    author: (t.author || '—').slice(0, 50),
    role: (t.role || '').slice(0, 50),
    rating: typeof t.rating === 'number' ? t.rating : 5,
    avatarUrl: avatars[i]?.url,
  }));

  return {
    theme,
    direction,
    language: lang,
    hero: {
      badge: parsed.hero?.badge,
      eyebrow: parsed.hero?.eyebrow,
      title: parsed.hero?.title || input.product.name,
      subtitle: parsed.hero?.subtitle || (input.product.description?.slice(0, 120) || ''),
      productImageUrl: productImage,
    },
    pricing: {
      priceAfter: input.product.price ?? 0,
      priceBefore: input.product.compareAtPrice,
      currency,
      discountBadge: parsed.pricing?.discountBadge,
    },
    trustBadges: parsed.pricing?.trustBadges?.slice(0, 3) || ['Paiement à la livraison', 'Livraison rapide'],
    features,
    testimonials,
    cta: {
      label: (parsed.cta?.label || 'COMMANDER').slice(0, 40),
      reassurance: parsed.cta?.reassurance,
    },
  };
}
