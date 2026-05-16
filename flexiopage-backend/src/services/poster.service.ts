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
import { generateImage, generateImagesParallel } from './image-generation.service';

export type PosterTheme = 'gold-dark' | 'cinema' | 'warm-tan';

/**
 * Output canvas format. Same LLM content; the frontend canvas adapts
 * its dimensions and layout based on this flag.
 *   - story     → 768 × ~2200 (vertical ad, landing page hero, TikTok)
 *   - square    → 1080 × 1080 (Facebook / Instagram feed post)
 *   - landscape → 1200 × 630  (Facebook link card, LinkedIn, Twitter)
 */
export type PosterFormat = 'story' | 'square' | 'landscape';

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
  /** Canvas size + layout adaptation hint, default 'story'. */
  format: PosterFormat;
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
  /**
   * One short chiffré social-proof line shown between features and
   * testimonials, e.g. "+500 commandes satisfaites" — adds credibility.
   */
  socialProof?: string;
  cta: {
    label: string;
    /**
     * Big urgency hook displayed just above the CTA button —
     * e.g. "Ne ratez pas cette offre !" / "ما تضيعش الفرصة".
     */
    hook?: string;
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
  format?: PosterFormat;
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
    "trustBadges": ["Livraison gratuite", "Paiement à la livraison", "Garantie qualité"]   // 2 à 3 items
  },
  "features": [                                                  // EXACTEMENT 4 features
    { "icon": "shield", "title": "court 2-4 mots", "body": "1 phrase 8-14 mots, focus bénéfice concret" },
    { "icon": "truck", "title": "court 2-4 mots", "body": "1 phrase 8-14 mots" },
    { "icon": "sparkles", "title": "court 2-4 mots", "body": "1 phrase 8-14 mots" },
    { "icon": "zap", "title": "court 2-4 mots", "body": "1 phrase 8-14 mots" }
  ],
  "socialProof": "+500 commandes satisfaites en 2 mois",        // 1 ligne CHIFFRÉE, 5-10 mots, dans la langue cible. Inventer un nombre plausible.
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
    "hook": "Ne ratez pas cette offre !",                       // PHRASE URGENCE, 3-6 mots, ! final, langue cible. Au-dessus du bouton CTA.
    "reassurance": "Aucun prépaiement · Paiement à la livraison"
  },
  "productShot": {
    // Scène hero éditoriale pour la photo produit. C'est l'image qui va REMPLIR
    // toute l'affiche en arrière-plan, avec le texte overlayé par-dessus.
    // CRITIQUE : NE DÉCRIS PAS LE PRODUIT (la photo de référence s'en charge).
    // Décris uniquement : environnement, surface, lumière, angle de caméra,
    // ambiance/mood, depth-of-field. Adapté à la catégorie produit.
    // Anglais uniquement. 25-40 mots.
    //
    // Exemples bons:
    //   - Aspirateur: "modern minimalist living room interior, sleek marble floor, large floor-to-ceiling window with soft morning sunlight streaming in, slight haze in air, shot from low angle, shallow depth of field, premium editorial lifestyle photography, cinematic mood"
    //   - Parfum: "polished dark marble surface with subtle reflections, single dramatic side rim-light, deep moody shadows fading to black, luxury still-life composition, magazine-cover aesthetic, very shallow depth of field"
    //   - Casque audio: "matte concrete urban rooftop at golden hour, warm orange backlight, lens flare bokeh, slightly elevated camera angle, editorial fashion-tech photography, premium lifestyle mood"
    //   - Gadget tech: "warm wooden desk in cozy modern home office, ambient string-light bokeh in background, golden hour window light, slight depth of field, lifestyle product photography"
    //
    // Règles composition (IMPORTANT pour les overlays texte HTML par-dessus):
    //   - Le TOP de l'image (~30%) doit être plutôt sombre/uniforme/peu chargé
    //     (pour overlay badge + titre lisible).
    //   - Le BOTTOM (~25%) doit être plutôt sombre/uniforme aussi (overlay prix + CTA).
    //   - Le produit reste le focal point au centre, pas trop gros (laisse de l'air).
    "scene": "english scene description, 25-40 words, matches product category, includes lighting/angle/mood/depth"
  }
}

# Règles de copy
- Tout le texte client (sauf icon/avatarPrompt/productShot.scene) doit être dans la langue cible (${lang}).
- Le ton est direct, vendeur, mobile/social-media (Instagram/TikTok ads).
- Icons autorisés: check, shield, truck, clock, star, sparkles, zap, gift, crown, lock, refresh.
- avatarPrompt et productShot.scene restent TOUJOURS en anglais (les modèles d'image en ont besoin).
- productShot.scene ne doit JAMAIS décrire le produit lui-même — uniquement scène/lumière/mood/composition.
- Pas de markdown, pas d'explication, JSON direct.`;
}

interface RawLlmOutput {
  hero?: { badge?: string; eyebrow?: string; title?: string; subtitle?: string };
  pricing?: { discountBadge?: string; trustBadges?: string[] };
  features?: Array<{ icon?: PosterFeature['icon']; title?: string; body?: string }>;
  socialProof?: string;
  testimonials?: Array<{ quote?: string; author?: string; role?: string; rating?: number; avatarPrompt?: string }>;
  cta?: { label?: string; hook?: string; reassurance?: string };
  productShot?: { scene?: string };
}

/**
 * Generate a full hero scene via nano-banana/edit: the product (from the
 * reference image) is placed inside a cinematic editorial environment. The
 * resulting image fills the entire poster canvas — text/badge/price/CTA are
 * then overlaid by the HTML renderer.
 *
 * The scene prompt embeds composition hints (dim top/bottom safe-zones) so
 * the model leaves room for the text overlays. The reference image
 * guarantees the actual product appears unchanged.
 *
 * Returns the original URL on any failure so the poster never breaks.
 */
async function enhanceProductImage(
  rawUrl: string | undefined,
  scene: string | undefined,
  productName: string,
): Promise<string | undefined> {
  if (!rawUrl) return undefined;
  const sceneText = (scene || '').trim()
    || `cinematic editorial environment with soft dramatic lighting, shallow depth of field, premium magazine-cover aesthetic`;
  const prompt = [
    `Editorial hero scene for a premium social-media ad poster, square 1:1 format.`,
    `Scene: ${sceneText}.`,
    `The product visible in the image MUST be the exact same item as in the reference image — same shape, color, materials, branding, every visible detail preserved. Do not invent or substitute a different product. Keep the product fully visible and in sharp focus as the clear focal point, centered or slightly off-center, with comfortable breathing room around it.`,
    `Lighting and grading: magazine-quality, cinematic, premium color grading, realistic shadows, subtle contact shadow under the product, no harsh flat lighting.`,
    `CRITICAL composition constraints for text overlay legibility:`,
    `  - The top ~30% of the frame must stay relatively dark, calm and uncluttered (this zone will be covered by a headline overlay).`,
    `  - The bottom ~25% of the frame must stay relatively dark, calm and uncluttered (this zone will be covered by a price + CTA overlay).`,
    `  - The product is the hero of the middle band — bright, sharp, well-lit.`,
    `Absolutely NO text rendered in the image: no captions, no logos overlay, no watermarks, no price tags, no UI chrome, no badges, no signs, no posters, no writing of any kind anywhere in the frame.`,
  ].join(' ');
  try {
    const result = await generateImage({
      prompt,
      aspect: 'square',
      model: 'fal-ai/nano-banana/edit',
      referenceImages: [rawUrl],
    });
    return result.url;
  } catch (err) {
    console.warn(`[poster] hero scene generation failed for "${productName}", falling back to raw:`, (err as Error).message);
    return rawUrl;
  }
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
  const format: PosterFormat = input.format || 'story';

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

  // 2. Avatar generation + product hero shot — in parallel (best-effort, both
  //    fall back gracefully on failure so the poster always renders).
  const rawProductImage = input.product.images?.[0];
  const avatarPrompts = (parsed.testimonials || []).map((t) => t.avatarPrompt || '').filter(Boolean);
  const [avatars, enhancedProductImage] = await Promise.all([
    avatarPrompts.length > 0
      ? generateImagesParallel(avatarPrompts.map((p) => ({ prompt: p, isAvatar: true })))
      : Promise.resolve([] as Awaited<ReturnType<typeof generateImagesParallel>>),
    enhanceProductImage(rawProductImage, parsed.productShot?.scene, input.product.name),
  ]);

  // 3. Assemble
  const productImage = enhancedProductImage || rawProductImage;
  const currency = input.currency || 'USD';

  const features: PosterFeature[] = (parsed.features || [])
    .slice(0, 4)
    .map((f) => ({
      icon: (['check', 'shield', 'truck', 'clock', 'star', 'sparkles', 'zap', 'gift', 'crown', 'lock', 'refresh'].includes(f.icon as string) ? f.icon! : 'check') as PosterFeature['icon'],
      title: (f.title || '').slice(0, 60),
      body: (f.body || '').slice(0, 200),
    }));
  while (features.length < 4) {
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
    format,
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
    socialProof: (parsed.socialProof || '').slice(0, 120) || undefined,
    testimonials,
    cta: {
      label: (parsed.cta?.label || 'COMMANDER').slice(0, 40),
      hook: (parsed.cta?.hook || '').slice(0, 80) || undefined,
      reassurance: parsed.cta?.reassurance,
    },
  };
}
