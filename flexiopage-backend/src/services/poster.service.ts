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
import { runLLM, getDialect, getPhotoCulture } from './fal-landing.service';
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

/**
 * Per-theme art direction. Each entry blends:
 *   1. Texture & palette
 *   2. Cinematic reference (so the LLM imagines a specific aesthetic)
 *   3. Copy tonality (how the headline should "feel")
 *
 * Used both in the LLM prompt (steers copy mood) and the hero image prompt
 * (steers FAL's lighting/grading). Richer descriptors → more inspired output.
 */
const THEME_GUIDANCE: Record<PosterTheme, string> = {
  'gold-dark':
    'dark luxury — deep obsidian black + brushed gold + warm amber rim-light; aesthetic of premium watches, niche perfumes, hi-end tech (Hublot / Tom Ford / Bang & Olufsen). Copy tone: confident, statement-making, slightly poetic.',
  cinema:
    'cinematic noir — pure black backdrop, hard side-key lighting, lens flares, anamorphic widescreen feel, golden/white headlines floating in negative space (Blade Runner ad / Apple keynote launch). Copy tone: dramatic reveal, bold one-liners with impact.',
  'warm-tan':
    'editorial natural — sand, beige, terracotta, oat, warm linen and raw wood textures; soft window light and analog film grain, slow-living artisan aesthetic (Aesop / Le Labo / Kinfolk magazine). Copy tone: warm, sensory, story-driven, human.',
};

function buildPrompt(input: PosterInput, theme: PosterTheme): string {
  const lang = (input.language || 'fr').toLowerCase();
  const country = input.country || 'SN';
  const currency = input.currency || 'USD';
  const rtl = RTL_LANGS.has(lang.split('-')[0]);
  const dialect = getDialect(country, lang.split('-')[0]);
  const photoCulture = getPhotoCulture(country);

  return `Tu es un DIRECTEUR ARTISTIQUE + COPYWRITER d'élite pour des ads social media (Instagram / TikTok / Meta) du marché ${country}, langue ${lang}${rtl ? ' (RTL — lis et écris de droite à gauche)' : ''}.
Tu as écrit pour Nike, Apple, L'Oréal, Sephora MENA. Ton job : transformer un produit ordinaire en OBJET DE DÉSIR avec un copy qui scroll-stoppe en 0.5s.${dialect ? `\n\n# DIALECTE / VOIX LOCALE (${country}) — IMPÉRATIF\n${dialect}\nLe lecteur doit RECONNAÎTRE sa langue dès le premier mot, comme un ami du quartier qui lui parle. JAMAIS de fusha plate, JAMAIS de français corporate.` : ''}\n\n# Ambiance photo locale (utilisée pour les scènes / portraits)\n${photoCulture}

# Produit
Nom: ${input.product.name}
${input.product.description ? `Description: ${input.product.description}\n` : ''}${input.product.price ? `Prix: ${input.product.price} ${currency}\n` : ''}${input.product.compareAtPrice ? `Prix avant remise: ${input.product.compareAtPrice} ${currency}\n` : ''}

# Direction artistique
Thème "${theme}" — ${THEME_GUIDANCE[theme]}

# Philosophie du copy (CRITIQUE)
- Vise l'ÉMOTION avant la feature. (Pas "écran HD" → "des couleurs qui te coupent le souffle".)
- Préfère le concret sensoriel à l'abstrait. (Pas "haute qualité" → "le grain du cuir sous tes doigts".)
- Chaque phrase doit avoir UN verbe fort, UN bénéfice mesurable, ou UNE image mentale précise.
- Évite : "premium", "qualité supérieure", "le meilleur", "incroyable", "révolutionnaire" — clichés.
- Privilégie : verbes d'action, chiffres précis, métaphores locales, twist inattendu.
- Tutoiement / parler direct, langage de quartier mais propre, jamais corporate.

# Format de sortie : JSON pur uniquement (pas de markdown), structure exacte :
{
  "hero": {
    "badge": "ÉDITION LIMITÉE",                                 // 2-3 mots, ALL CAPS, percutant (ex: "NOUVEAU 2026", "STOCK FINAL", "−72H SEULEMENT", "PRIVATE DROP"). Évite "ÉDITION LIMITÉE" si pas créatif.
    "eyebrow": "tagline 3-5 mots, mood / promesse, posée au-dessus du titre (ex: 'Quand le détail change tout', 'Le confort, niveau pro')",
    "title": "TITRE PRINCIPAL — 4 à 7 mots, SCROLL-STOPPER. Pas une description, une PROMESSE ou une PROVOCATION. Évite 'Découvrez' / 'Profitez'. Privilégie verbe d'action ou image mentale forte.",
    "subtitle": "Sous-titre — 1 phrase, 10-16 mots. Explique le 'pourquoi maintenant' ou ajoute un bénéfice sensoriel concret. Pas de listing de features, raconte une mini-expérience."
  },
  "pricing": {
    "discountBadge": "−30% (laisse vide si pas de promo réelle, sinon valeur réaliste)",
    "trustBadges": ["3 trust badges courts, localement crédibles (paiement à la livraison, livraison 24-72h, satisfait ou remboursé 7 jours, etc.). 2 à 4 mots chacun, dans la langue cible."]
  },
  "features": [                                                  // EXACTEMENT 4 features — chacune un BÉNÉFICE différent, pas une feature technique
    { "icon": "shield", "title": "2-4 mots concrets", "body": "1 phrase 8-14 mots, bénéfice tangible + détail sensoriel ou chiffré, jamais 'haute qualité'" },
    { "icon": "truck",  "title": "2-4 mots concrets", "body": "1 phrase 8-14 mots, vise un autre angle (vitesse, simplicité d'usage, durabilité, statut, plaisir, gain de temps)" },
    { "icon": "sparkles","title": "2-4 mots concrets", "body": "1 phrase 8-14 mots, encore un angle différent" },
    { "icon": "zap",    "title": "2-4 mots concrets", "body": "1 phrase 8-14 mots, le dernier angle" }
  ],
  "socialProof": "+500 commandes satisfaites en 2 mois",        // 1 ligne CHIFFRÉE PRÉCISE (pas un nombre rond mou). 5-10 mots, langue cible. Inventer un nombre plausible et SPÉCIFIQUE (ex: '1 247 clients en 90 jours', 'note 4.8/5 sur 312 avis').
  "testimonials": [                                              // EXACTEMENT 2 témoignages, voix de VRAIES personnes
    {
      "quote": "Citation 1 phrase 12-20 mots, langue cible, ton de quartier, parle d'un MOMENT précis ou d'une transformation concrète (jamais 'super produit je recommande')",
      "author": "Prénom plausible local",
      "role": "Ville, ${country}",
      "rating": 5,
      "avatarPrompt": "candid editorial portrait of a [age 25-45] [gender] from ${country}, set in a ${photoCulture} environment, soft natural light, slight smile, looking slightly off-camera, warm skin tones, shallow depth of field, shot on 85mm, modern magazine photography, no text, no logos"
    },
    {
      "quote": "Citation 2 — ANGLE DIFFÉRENT du premier (si le 1er parle qualité, le 2e parle service ou livraison ou statut)",
      "author": "autre prénom local",
      "role": "autre ville, ${country}",
      "rating": 5,
      "avatarPrompt": "candid editorial portrait of a [different age/gender from first] from ${country}, set in ${photoCulture} environment, golden hour soft light, genuine warm expression, shallow depth of field, 85mm prime lens look, contemporary fashion photography, no text"
    }
  ],
  "cta": {
    "label": "COMMANDER MAINTENANT",                            // 2-3 mots ALL CAPS, verbe d'action direct
    "hook": "Phrase 3-6 mots avec ! final — URGENCE / RARETÉ / FOMO. Pas un cliché ('Ne ratez pas !'), invente un angle frais (stock, deadline, statut, transformation). Langue cible.",
    "reassurance": "1 ligne courte (4-8 mots) qui lève la dernière objection — paiement, retour, garantie. Langue cible."
  },
  "productShot": {
    // SCÈNE HERO ÉDITORIALE — devient l'arrière-plan de l'affiche entière.
    // Le produit (référence) sera composé dedans ; tu décris UNIQUEMENT l'écosystème
    // visuel qui le sublime. Anglais uniquement, 30-50 mots.
    //
    // PENSE COMME UN PHOTOGRAPHE PRO :
    //   • Lieu / surface (matière précise : marbre veiné, béton brut, lin froissé, bois patiné, sable…)
    //   • Lumière (direction + qualité : rim-light, golden hour, soft window, hard noon, neon glow…)
    //   • Caméra (focale + angle : 35mm wide, 85mm portrait, low-angle hero, top-down flatlay, dutch tilt…)
    //   • Mood (un seul mot fort : mysterious, serene, electric, intimate, monumental…)
    //   • Profondeur (shallow DoF, bokeh, atmospheric haze, layered foreground/background)
    //
    // Exemples de RÉFÉRENCE (vise ce niveau) :
    //   - Parfum luxe : "highly polished onyx-black marble plinth catching a single warm amber rim-light from the right, cinematic noir backdrop fading to absolute black, faint volumetric haze, ultra shallow depth of field, 85mm lens, magazine cover composition, mysterious and quiet"
    //   - Casque audio : "rain-slicked midnight concrete rooftop, vivid magenta-cyan neon reflections, lens flare from off-frame streetlight, low hero angle looking up, atmospheric haze, cyberpunk editorial mood, premium fashion-tech photography"
    //   - Crème skincare : "soft morning light on raw travertine stone, single dewdrop on a folded linen napkin nearby, pale ivory and oat color palette, slow-living Kinfolk aesthetic, top-down flatlay 45° tilt, gentle film grain, serene and quiet"
    //   - Tech gadget : "warm walnut wood desk in golden hour, bokeh of string lights and a brass desk lamp, single beam of side window light, shot on 50mm at f/1.8, intimate work-from-home editorial, cozy and aspirational"
    //
    // RÈGLES COMPOSITION (overlays texte HTML viennent par-dessus) :
    //   - TOP ~30% : sombre / calme / peu chargé (zone badge + titre).
    //   - BOTTOM ~25% : sombre / calme / peu chargé (zone prix + CTA).
    //   - MIDDLE : le produit est le héros visuel — net, éclairé, respirant (laisse de l'air autour).
    //   - JAMAIS de texte / logo / pancarte / écriture où que ce soit dans la scène.
    "scene": "english scene description, 30-50 words, must include: surface material, light direction/quality, camera focal length & angle, mood adjective, depth-of-field cue"
  }
}

# Règles strictes
- Tout le texte client (sauf icon / avatarPrompt / productShot.scene) doit être en ${lang}${rtl ? ' (ÉCRITURE NATURELLE DE DROITE À GAUCHE — pas de translittération)' : ''}.
- Icons autorisés : check, shield, truck, clock, star, sparkles, zap, gift, crown, lock, refresh — CHOISIS celui qui matche sémantiquement (pas au hasard).
- avatarPrompt et productShot.scene restent TOUJOURS en anglais (input modèle).
- productShot.scene ne décrit JAMAIS le produit — uniquement scène / lumière / mood / composition.
- Pas de markdown, pas d'explication, pas de commentaire — JSON direct et valide.`;
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
  theme: PosterTheme = 'gold-dark',
): Promise<string | undefined> {
  if (!rawUrl) return undefined;
  const sceneText = (scene || '').trim()
    || `cinematic editorial environment with dramatic sculpted side-light, deep moody shadows, subtle atmospheric haze, very shallow depth of field, 85mm lens, ultra-premium magazine cover aesthetic, contemporary luxury mood`;
  const themeArtDirection = THEME_GUIDANCE[theme];
  const prompt = [
    // Frame the model as a top-tier creative, not a generic image generator.
    `Award-winning fashion / luxury advertising photograph for a premium social-media ad poster. Square 1:1.`,
    `Reference aesthetic & mood: ${themeArtDirection}`,
    `Scene composition: ${sceneText}.`,
    // Hard product fidelity — reference image preservation.
    `PRODUCT FIDELITY (non-negotiable): the product visible MUST be the EXACT same physical item as in the reference image — identical shape, proportions, colors, materials, surface finish, branding marks and every visible detail. Do not redesign, restyle, recolor or substitute it. Keep it fully visible, tack-sharp, no part cropped out, as the unmistakable focal point.`,
    // Cinematic lighting & art direction — this is where "creative + modern" lives.
    `Lighting: sculpted, intentional, single dominant light direction (rim-light, side-key or top-back light) with controlled fall-off into rich shadows. Add subtle volumetric haze, a soft natural contact shadow under the product, and a hint of color grading aligned with the theme. NEVER flat, NEVER on-camera flash, NEVER stocky white-background packshot.`,
    `Camera & lens: shot on a fast prime (35mm, 50mm or 85mm at f/1.8–f/2.8) for shallow depth of field and creamy background separation. Hero angle (slight low-angle or 3/4 hero), strong compositional symmetry or thirds.`,
    `Finish: editorial color grade, deep blacks, controlled highlights, subtle film grain, ultra-high resolution, magazine cover quality, rule-of-thirds composition with the product on a power-point.`,
    // Composition safe-zones for the HTML overlay on top.
    `Text-overlay safe zones (CRITICAL — the renderer overlays text here):`,
    `  - Top ~30%: keep visually quiet, low-contrast and darker than the middle so a white headline reads cleanly. No busy detail in this band.`,
    `  - Bottom ~25%: keep visually quiet and darker, simple gradient or shadow ok. No busy detail.`,
    `  - Middle band ~45%: the product is the sole hero — well-lit, in focus, with comfortable breathing space around it.`,
    // Absolute no-text rule — text comes from HTML overlay, not the model.
    `ABSOLUTELY NO TEXT inside the image: no words, captions, prices, logos overlay, watermarks, brand text re-renderings, badges, signs, packaging text re-render, posters, stickers, UI chrome or any written character of any language. Zero text. The original product's existing branding on its surface is the only allowed text and must remain unchanged.`,
    // Negative cues phrased as positive instructions (Nano-Banana ignores classic negative prompt).
    `Avoid: amateur snapshot look, harsh on-camera flash, plastic CGI sheen, oversaturated colors, generic e-commerce white seamless background, stock-photo blandness, fish-eye distortion, cluttered props, busy patterned backgrounds behind the product.`,
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
    enhanceProductImage(rawProductImage, parsed.productShot?.scene, input.product.name, theme),
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
