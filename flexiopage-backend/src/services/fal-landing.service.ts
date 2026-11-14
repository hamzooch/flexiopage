/**
 * AI landing & product page generation — ayor.ia / tryad.app style.
 *
 * 3-step pipeline:
 *   1) Strategic LLM (Claude 3.5 Sonnet via fal any-llm) writes the page
 *      in the country's exact dialect, AND outputs short ENGLISH image
 *      prompts for hero/gallery/avatar slots.
 *   2) FLUX (schnell by default) generates each image in parallel.
 *   3) Image URLs are injected back into the section JSON.
 *
 * Env overrides:
 *   - FAL_KEY                  required
 *   - FAL_LLM_MODEL            default 'anthropic/claude-sonnet-4.5' (top Claude on fal)
 *   - FAL_LLM_TEMPERATURE      default '0.85' — bump for more creativity, drop for consistency
 *   - FAL_IMAGE_MODEL          default 'fal-ai/flux/schnell'
 *   - FAL_AVATAR_MODEL         default same as FAL_IMAGE_MODEL
 *   - LANDING_AI_IMAGES_ENABLED  default 'true' — set to 'false' to skip step 2
 */
import path from 'path';
import fs from 'fs/promises';
import type { TemplateSection } from '../data/landing-templates';
import {
  generateImagesParallel,
  isBannerPrompt,
  classifyCategory,
  resolveLandingCategory,
  type ImageGenInput,
  type CategoryClass,
} from './image-generation.service';
import { persistRemoteImage } from './storage.service';
import { logger } from '../lib/logger';
import { fetchWithRetry } from '../lib/outbound-fetch';
import { lockLandingSections, lockSeo, shapeCodSalesPage } from './landing-facts';

const FAL_BASE = 'https://fal.run';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const ARAB_COUNTRIES = new Set([
  'SA','AE','EG','MA','TN','DZ','QA','KW','BH','OM',
  'IQ','JO','LB','YE','PS','SY','SD','LY','MR','DJ','KM','SO',
]);

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);

/**
 * Per-country dialect & cultural cues. The LLM is told to write IN this
 * dialect, not in MSA, so the page sounds like a friend recommending the
 * product — exactly what dropshipping landing pages do.
 */
const DIALECT_MAP: Record<string, string> = {
  TN: `Tunisian Derja only (تونسي). The whole page is Tunisian, not Fusha and not Moroccan or Algerian.
Write the way someone in Tunis writes a Facebook comment. Short sentences. Arabic script.
Use: توّا، برشة، ياسر، نحب، متاع، باش، كيفاش، علاش، فمّا، ما فماش، تنجم، زادة، مالا، إنتي / إنتا، أحنا، حتى شيء، كان.
French words stay as Tunisians say them: كوموند، كولي، كاش، كاليتي، برومو.
Do NOT use: دابا، بزاف، غادي، ديال، دروك، واش، راه، كاين، اشترِ، احصل، نحن نقدم، الآن، منتجنا الفاخر.
Good: "كوموندي توّا. تخلّص للكولي كاش كي توصلك الكولية، حتى شيء قبل."
Bad: "اكتشف منتجنا الجديد بأعلى جودة والتوصيل المجاني."`,

  MA: `Moroccan Darija (دارجة). MUST sound like a Moroccan on Facebook, NOT MSA.
Examples:
  - "بزّاف" (beaucoup), "غادي" (futur), "بغيت" (je veux), "كنحبّ" (j'aime)
  - "دابا" (maintenant), "هاد" (ce/cette), "ديال" (de), "نتا / نتي"
French/Spanish loanwords: "qualité", "livraison", "promotion", "ofertas".
Example: "هاد المنتج راه ديال الجودة، الأسعار خاصها تكون في متناولك".
Avoid Fusha — write the way Moroccans actually message each other.`,

  DZ: `Algerian Darja only (دارجة جزائرية). The whole page is Algerian, not Fusha and not Moroccan or Tunisian.
Write the way someone in Algiers or Oran writes on Messenger. Short sentences. Arabic script.
Use: دروك، بزاف، راني، راك / راكي، واش، علاه، كيفاش، تاع، نتا / نتي، حنا، والو، غير، صح، مليح، كاين.
French words stay as Algerians say them: كوموند، كولي، كاش، كاليتي، برومو.
Do NOT use: دابا، ديال، غادي، متاع، توّا، برشة، اشترِ، احصل، نحن نقدم، الآن، التوصيل المجاني.
Good: "كوموندي دروك. تخلّص للكولي كاش كي يوصلك الكولي، والو قبل."
Bad: "اكتشف منتجنا الجديد بأعلى جودة والتوصيل المجاني."`,

  EG: `Egyptian Arabic (مصري) — Cairo dialect. Casual, expressive, direct. NEVER MSA.
Markers: "أوي" (très), "كده" (comme ça), "ايه" (quoi), "إنت / إنتي", "إحنا", "بقى" (alors), "خالص" (du tout).
Cultural touchpoints: ramadan, mahragan, cafés in Zamalek.`,

  SA: `Saudi Khaliji (خليجي). For tone "professional", lean toward MSA-ish but keep warm. For "friendly", use full Khaliji.
Markers: "أبغى" (je veux), "وش" (quoi), "زين" (bien), "هاي / هذي" (ce/cette), "أنت / أنتي".
Local cues: Vision 2030, Riyadh Park / Mall of Arabia, Hajj / Umrah seasons.`,

  AE: `Emirati Khaliji with English loanwords accepted ("offer", "delivery", "free shipping"). Cosmopolitan, premium tone. Dubai / Abu Dhabi lifestyle.`,

  KW: 'Kuwaiti Khaliji. Use "ابي" (je veux), "شلون" (comment).',
  QA: 'Qatari Khaliji.',
  BH: 'Bahraini Khaliji.',
  OM: 'Omani Arabic, lean toward MSA.',

  JO: `Levantine Jordanian Arabic. Markers: "بدي" (je veux), "هلق" (maintenant), "كيف" (comment), "شو" (quoi), "إنت / إنتي".`,
  LB: `Lebanese Levantine — casual, warm. Markers: "بدي", "هلق", "شو", "كتير" (beaucoup). French loanwords welcome ("merci", "bonjour").`,
  PS: 'Palestinian Levantine, similar to Jordanian.',
  SY: 'Syrian Levantine.',

  IQ: `Iraqi Arabic (عراقي). Markers: "أريد" or "اَكو" (il y a), "ماكو" (il n'y a pas), "هواية" (beaucoup), "إنت / إنتي".`,

  YE: 'Yemeni Arabic / MSA — lean MSA for clarity.',
  LY: 'Libyan Arabic — markers: "نبي" (je veux), "هكي" (comme ça).',
  SD: 'Sudanese Arabic — markers: "داير" (je veux), "كده" (comme ça).',
  MR: 'Hassaniya Arabic / MSA.',

  // ── Europe — ton conversationnel local, pas un anglais traduit ───
  IT: `Italian conversational — should sound like an Italian friend on Instagram / WhatsApp recommending the product, NOT a marketing brochure.
Tone markers:
  - Direct 2nd person ("tu") with warm familiarity. NEVER "Lei" (too formal for D2C).
  - Real expressions: "davvero", "proprio quello", "fidati", "te lo dico io", "a casa tua in 48 ore".
  - Emoji used sparingly but naturally (🇮🇹 ✨ 🔥) — like a real post, not a banner.
Cultural hooks: domenica in famiglia, aperitivo, casa al mare, regalo perfetto, made in Italy.
Bad example (do NOT do this): "Scopri il nostro nuovo prodotto innovativo dalle qualità superiori".
Good example: "Lo abbiamo testato per settimane prima di lanciarlo. Risultato? 9 italiane su 10 lo riordinano. Provalo a casa, soldi indietro se non ti piace."`,

  ES: `Spanish conversational (España) — should sound like a Spanish friend on Instagram / WhatsApp, NOT a corporate ad.
Tone markers:
  - 2nd person familiar ("tú"), NEVER "usted" (too formal for D2C).
  - Casual phrasings: "de verdad", "te lo digo en serio", "te va a flipar", "una pasada", "vale la pena".
  - Real Spanish punch: "fíjate", "encima", "porque sí".
  - Emoji modérés (🔥 ✨ 🇪🇸) usés comme dans un post réel.
Cultural hooks: domingos en familia, vermut, casa de playa, regalo perfecto, hecho a mano.
Bad example: "Descubre nuestro nuevo producto innovador de alta calidad".
Good example: "Lo probamos durante semanas antes de sacarlo. Resultado: 9 de cada 10 chicas lo repiten. Pruébalo en casa, devolución gratuita si no te gusta."`,

  // Note: la France (FR) reste sans entrée dédiée — l'AI génère un
  // français standard ce qui convient pour la plupart des marques D2C.
};

/**
 * Country-specific photo direction for FLUX. Helps the image model produce
 * scenes that look local — Tunisian café vs Saudi mall vs Egyptian apartment.
 */
const PHOTO_CULTURE: Record<string, string> = {
  TN: 'modern Tunisian apartment or seaside café (Sidi Bou Said, La Marsa), warm Mediterranean light, bougainvillea, tile patterns',
  MA: 'Moroccan riad or Casablanca apartment, zellige tiles, warm sunset light, mint tea on a brass tray',
  DZ: 'Algerian urban apartment (Algiers), warm light, contemporary Maghreb interior',
  EG: 'modern Cairo apartment, Egyptian woman/man (matching context), warm golden hour light',
  SA: 'modern Saudi villa or Riyadh mall context, soft natural light, premium minimalist interior',
  AE: 'luxury Dubai apartment with skyline view, premium minimalist styling, soft daylight',
  KW: 'modern Kuwaiti home interior',
  QA: 'modern Qatari home, Doha skyline view',
  BH: 'modern Bahraini home',
  OM: 'modern Omani home, Muscat coastal light',
  JO: 'modern Amman apartment',
  LB: 'modern Beirut apartment, mountain light',
  PS: 'modern Palestinian home',
  SY: 'modern Syrian home',
  IQ: 'modern Baghdad apartment',
  FR: 'Parisian apartment with herringbone floors, soft daylight',
  US: 'modern American living room, natural daylight',
  GB: 'London apartment with sash window',
  DE: 'Berlin apartment, minimalist',
  // Europe — décors qui résonnent localement, évitent l'AI generic « modern home »
  IT: 'sun-lit Italian apartment in Milan or Rome, terracotta tiles, soft Mediterranean light, espresso cup on a wooden table, or rustic Tuscan stone wall context for cottagecore products',
  ES: 'bright Spanish apartment in Madrid or Barcelona, white walls, warm golden hour light, terraza con plantas, or Mediterranean coastal context (Costa Brava, Valencia)',
  PT: 'Lisbon apartment with azulejos tile accents, soft Atlantic light, pastéis de nata on a plate',
  BE: 'Brussels or Antwerp apartment, soft northern European daylight, minimalist styling',
  NL: 'Amsterdam apartment, large window facing canal, scandi-minimal interior, soft natural light',
  CH: 'Swiss alpine chalet or Zurich apartment, warm wood, clean lines, mountain daylight',
};

function isArabCountry(code?: string): boolean {
  return !!code && ARAB_COUNTRIES.has(code.toUpperCase());
}

function deriveLanguage(language: string | undefined, country: string | undefined): string {
  const lang = (language || '').trim().toLowerCase();
  if (lang) return lang;
  if (isArabCountry(country)) return 'ar';
  return 'en';
}

function deriveDirection(language: string): 'ltr' | 'rtl' {
  return RTL_LANGS.has(language.split('-')[0]) ? 'rtl' : 'ltr';
}

/**
 * Returns the dialect/voice guidance for a given country (TN → Tunisian Derja,
 * MA → Moroccan Darija, etc.). Used by every LLM prompt so the copy actually
 * sounds local. Exported so the poster + landing-image services can reuse
 * the same dialect tables.
 */
export function getDialect(country?: string, language?: string): string {
  const lang = (language || '').trim().toLowerCase();
  const code = (country || '').trim().toUpperCase();
  if (lang.startsWith('fr')) {
    if (code === 'TN') return 'French as spoken in Tunisia. The whole page stays in French, "tu", direct. Do not switch to Arabic.';
    if (code === 'DZ') return 'French as spoken in Algeria. The whole page stays in French, "tu", direct. Do not switch to Arabic.';
    if (code === 'MA') return 'French as spoken in Morocco. The whole page stays in French, "tu", direct. Do not switch to Arabic.';
    return '';
  }
  if (lang.startsWith('en') || lang.startsWith('es') || lang.startsWith('de') || lang.startsWith('pt') || lang.startsWith('it')) {
    if (lang.startsWith('it')) return DIALECT_MAP.IT || '';
    if (lang.startsWith('es')) return DIALECT_MAP.ES || '';
    return '';
  }
  if (lang === 'ar-tn') return DIALECT_MAP.TN;
  if (lang === 'ar-dz') return DIALECT_MAP.DZ;
  if (lang === 'ar-ma') return DIALECT_MAP.MA;
  if (lang.startsWith('ar') || (!lang && isArabCountry(code))) {
    return DIALECT_MAP[code] || 'Spoken Arabic of the buyer’s country, the way people write on WhatsApp. Not formal Fusha. Not a mix of Moroccan, Tunisian and Algerian.';
  }
  return !lang && DIALECT_MAP[code] ? DIALECT_MAP[code] : '';
}

function dialectFewShot(language?: string, country?: string): string {
  const lang = (language || '').toLowerCase();
  if (!lang.startsWith('ar')) return '';
  const code = (country || '').toUpperCase();
  const voice =
    lang === 'ar-tn' ? 'tn' :
    lang === 'ar-dz' ? 'dz' :
    lang === 'ar-ma' ? 'ma' :
    code === 'TN' ? 'tn' :
    code === 'DZ' ? 'dz' :
    code === 'MA' ? 'ma' : 'ar';
  const examples: Record<string, string> = {
    tn: `
# Exemple à imiter — tounsi uniquement
title: "كوموندي توّا، وخلّص كي توصلك"
subtitle: "تبعث الإسم والتيليفون. نعيّطوا لك. تخلّص للكولي كاش، حتى شيء قبل."
ctaText: "كوموندي · الخلاص عند الإستلام"
quote: "حليت الكولية قبل ما نخلّص. الكاليتي باهية." — أميرة، تونس
ما تستعملش: دابا، بزاف، ديال، دروك، واش، اشترِ، نحن نقدم، التوصيل المجاني.`,
    dz: `
# Exemple à imiter — darja djazairia uniquement
title: "كوموندي دروك، وخلّص كي يوصلك"
subtitle: "دير السمية والتيليفون. نعيّطوا لك. تخلّص للكولي كاش، والو قبل."
ctaText: "كوموندي · الخلاص عند الإستلام"
quote: "حليت الكولي قبل ما نخلّص. الكاليتي مليحة." — أمينة، الجزائر
ما تستعملش: دابا، ديال، غادي، متاع، توّا، برشة، اشترِ، نحن نقدم، التوصيل المجاني.`,
    ma: `
# Exemple à imiter — darija maghribiya uniquement
title: "كوموندي دابا، وخلّص ملي يوصلك"
subtitle: "كتب السميه والتيليفون. غادي نعيّطوا ليك. تخلّص للكولي كاش، والو قبل."
ctaText: "كوموندي · الخلاص عند الإستلام"
quote: "حليت الكوليس قبل ما نخلّص. الكاليتي مزيانة." — فاطمة، الدار البيضاء
ما تستعملش: توّا، برشة، متاع، دروك، اشترِ، نحن نقدم، التوصيل المجاني.`,
    ar: `
# Exemple à imiter — العربية المحكية للبلد المختار، مش الفصحى
title: "اطلبه، وادفع عند الاستلام"
subtitle: "اكتب اسمك ورقمك. نتصل فيك. تدفع للمندوب كاش، ولا شيء قبل."
ctaText: "اطلب · الدفع عند الاستلام"
ما تكتبش: اشترِ الآن، احصل على، نحن نقدم، منتجنا الفاخر، التوصيل المجاني.`,
  };
  return examples[voice] || '';
}

/**
 * Returns the photo / scene cultural cue for a given country code. Used by
 * the image prompts so testimonials and lifestyle shots look local.
 */
export function getPhotoCulture(country?: string): string {
  if (!country) return 'modern, warm natural light, lifestyle photography';
  return PHOTO_CULTURE[country.toUpperCase()] || 'modern, warm natural light, lifestyle photography';
}

/** Exposed so the controllers / other services can validate / default. */
export function isArabCountryCode(code?: string): boolean {
  return isArabCountry(code);
}

const LANGUAGE_LABEL: Record<string, string> = {
  ar: 'spoken Arabic of the selected country',
  'ar-tn': 'Tunisian Derja (تونسي)',
  'ar-dz': 'Algerian Darja (دارجة جزائرية)',
  'ar-ma': 'Moroccan Darija (دارجة مغربية)',
  fr: 'French (français)',
  en: 'English',
  es: 'Spanish (español)',
  de: 'German (Deutsch)',
  it: 'Italian (italiano)',
  pt: 'Portuguese (português)',
  he: 'Hebrew (עברית)',
  fa: 'Persian (فارسی)',
  ur: 'Urdu (اردو)',
};

// ─────────────────────────────────────────────────────────────────────
// Local-image fal helper (unchanged)
// ─────────────────────────────────────────────────────────────────────
/**
 * Prépare une URL image pour fal.ai. Fal.ai a besoin d'une URL
 * absolue publique OU d'un data URL — jamais d'un chemin relatif ni
 * d'un hostname `localhost`.
 *
 * Trois cas :
 *   1. data:… → renvoyé tel quel.
 *   2. URL relative (`/uploads/…`) OU localhost → lecture disque +
 *      encodage base64 en data URL. Le fichier voyage avec la requête.
 *   3. URL absolue publique → renvoyée telle quelle (fal-ai fetch).
 *
 * Répare aussi les URLs `https//…` (colon manquant) au passage — sinon
 * `new URL()` throw, on renvoie la chaîne cassée, fal-ai répond 422.
 */
export async function resolveImageForFal(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) return imageUrl;
  const fixed = /^https?\/\//i.test(imageUrl)
    ? imageUrl.replace(/^(https?)\/\//i, '$1://')
    : imageUrl;

  const publicPrefix = (process.env.PUBLIC_URL_PREFIX || '/uploads').replace(/\/+$/, '');

  // Extrait un pathname exploitable pour la lecture disque :
  //   - URL absolue localhost → url.pathname
  //   - Chemin relatif (`/uploads/...`) → tel quel (sans query)
  //   - URL absolue publique → null (on la renvoie sans toucher)
  let pathname: string | null = null;
  try {
    const url = new URL(fixed);
    const isLocalHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '0.0.0.0' ||
      url.hostname.endsWith('.local');
    if (isLocalHost) pathname = url.pathname;
  } catch {
    // Relative path — c'est ce que le backend stocke par défaut quand le
    // driver de storage est `local` (pas Cloudinary/S3). Fal-ai ne peut
    // pas fetch un chemin relatif, il faut inliner le fichier.
    if (fixed.startsWith('/')) pathname = fixed.split('?')[0];
  }

  if (!pathname) return fixed;
  if (!pathname.startsWith(publicPrefix + '/')) return fixed;

  const relKey = pathname.slice(publicPrefix.length + 1);
  const uploadRoot = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadRoot, relKey);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(uploadRoot))) return fixed;
  const buf = await fs.readFile(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export interface ProductInput {
  name: string;
  /**
   * Slug réel du produit en base. Passé pour que le cod-form auto-injecté
   * pointe sur le BON produit du catalogue : sans ce slug le renderer
   * retombait sur `products[0]` (premier produit du catalogue) et la
   * landing se retrouvait à vendre un autre article que celui ciblé.
   */
  slug?: string;
  description?: string;
  price?: number;
  compareAtPrice?: number;
  type?: 'physical' | 'digital';
  images?: string[];
  /**
   * Tags produit (fashion, luxury, beauty, electronics…). Utilisés par le
   * routing d'image pour choisir un modèle premium sur les catégories
   * haut de gamme. Optionnel — le fallback est le nom + la catégorie
   * explicite du seller.
   */
  tags?: string[];
}

export interface GenerationContext {
  language?: string;
  country?: string;
  category?: string;
  priceBefore?: number;
  priceAfter?: number;
  currency?: string;
  pageKind?: 'landing' | 'product';
}

export interface FalGenerateInput extends GenerationContext {
  storeName: string;
  product?: ProductInput;
  imageCaption?: string;
  imageUrl?: string;
  tone?: 'professional' | 'friendly' | 'minimal';
}

export interface FalGenerateResult {
  sections: TemplateSection[];
  seoTitle?: string;
  seoDescription?: string;
  imageCaption?: string;
  language: string;
  direction: 'ltr' | 'rtl';
  currency?: string;
  country?: string;
  dialect?: string;
  imagesGenerated?: number;
}

function generateId(): string {
  return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getFalKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) {
    const err = new Error('FAL_KEY is not configured on the server') as Error & {
      statusCode?: number;
      publicMessage?: string;
    };
    err.statusCode = 503;
    err.publicMessage = 'Le service de génération AI est temporairement indisponible. Contacte le support.';
    throw err;
  }
  return key;
}

async function falRequest<T>(
  model: string,
  input: Record<string, unknown>,
  options: { timeoutMs?: number } = {}
): Promise<T> {
  const key = getFalKey();
  const ctrl = new AbortController();
  const timeoutMs = options.timeoutMs ?? 90_000;
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchWithRetry(`${FAL_BASE}/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${key}`,
      },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      // Log du corps complet — les contrôleurs avalent l'erreur et le vendeur
      // ne voit que "code 422" : sans cette ligne, impossible de diagnostiquer
      // en prod (quel champ rejeté, image inaccessible, modèle retiré…).
      logger.error({ model, status: res.status, body: text.slice(0, 2000) }, '[fal] sync request failed');
      const err = new Error(`fal.ai ${model} error ${res.status}: ${text}`) as Error & {
        statusCode?: number;
        publicMessage?: string;
      };
      err.statusCode = 502;
      err.publicMessage = `Le service IA a renvoyé une erreur (code ${res.status}). Réessaie dans un instant.`;
      throw err;
    }
    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      const e = new Error(`fal.ai ${model} timeout after ${timeoutMs}ms`) as Error & {
        statusCode?: number;
        publicMessage?: string;
      };
      e.statusCode = 504;
      e.publicMessage = "Le service IA n'a pas répondu à temps. Réessaie.";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Caption an image. Default: Claude Sonnet 4.5 vision via fal's any-llm/vision
 * endpoint — much richer than Florence-2 (mentions material, finish, packaging,
 * dimensions, staging) which is what the copywriter LLM downstream actually
 * needs. Override with FAL_CAPTION_MODEL.
 *
 * Two-step fallback: vision LLM → Florence-2 → empty string. The pipeline
 * tolerates an empty caption (less rich copy, no crash).
 *
 * Available models on fal-ai/any-llm/vision (verified by 422 response):
 *   • anthropic/claude-sonnet-4.5          ← DEFAULT (best detail, same family as LLM copywriter)
 *   • anthropic/claude-haiku-4.5           — cheaper Claude
 *   • anthropic/claude-3.7-sonnet
 *   • anthropic/claude-3.5-sonnet
 *   • google/gemini-2.5-pro                — top tier Google
 *   • google/gemini-2.5-flash              — cheap multilingual
 *   • google/gemini-2.5-flash-lite         — cheapest Google
 *   • openai/gpt-4o, openai/gpt-4.1, openai/gpt-5-chat, openai/gpt-5-mini
 *   • meta-llama/llama-4-maverick          — open weights vision
 *   • qwen/qwen3-vl-235b-a22b-instruct     — top Qwen vision
 *   • x-ai/grok-4-fast
 */
const CAPTION_MODEL = process.env.FAL_CAPTION_MODEL || 'anthropic/claude-sonnet-4.5';
const CAPTION_PROMPT =
  'You are describing this product photo for a copywriter who will write a landing page from your description and CANNOT see the image.\n\n' +
  'Return 3–5 sentences covering ALL of:\n' +
  '1. Object type & category (e.g. "leather bifold wallet", "stainless-steel insulated water bottle")\n' +
  '2. Material(s), finish, texture (matte/glossy, smooth/grained, knit/woven)\n' +
  '3. Exact color palette (specific colors, e.g. "warm caramel brown with dark chocolate stitching", not just "brown")\n' +
  '4. Distinctive design details (logo position, hardware, buttons, zippers, prints, contrast panels)\n' +
  '5. Scale & form (size estimate, shape, proportions)\n' +
  '6. Staging context (background, surface, lighting, props if any)\n' +
  '7. Packaging visible (box, label, tag) if applicable\n\n' +
  'Style: factual reporter tone. NO marketing language ("premium", "elegant"…), NO invented features. Reply in English regardless of any text inside the image.';

export async function captionImage(imageUrl: string): Promise<string> {
  const resolved = await resolveImageForFal(imageUrl);

  // Primary: Claude 3.5 Sonnet vision via fal-ai/any-llm/vision.
  // IMPORTANT: this is a separate endpoint from `fal-ai/any-llm` (text-only).
  // The vision endpoint accepts `image_url` (http URL or data URL).
  try {
    const out = await falRequest<{ output?: string; usage?: unknown }>(
      'fal-ai/any-llm/vision',
      {
        model: CAPTION_MODEL,
        prompt: CAPTION_PROMPT,
        image_url: resolved,
      },
      { timeoutMs: 20_000 }
    );
    const caption = (out.output || '').trim();
    if (caption.length > 20) {
      console.log(`[caption] vision OK (${CAPTION_MODEL}, ${caption.length} chars)`);
      return caption;
    }
    console.warn('[caption] vision returned suspiciously short output, falling back. raw=', JSON.stringify(out).slice(0, 200));
  } catch (err) {
    console.warn(`[caption] vision LLM failed (${CAPTION_MODEL}), falling back to Florence-2:`, (err as Error).message);
  }

  // Fallback: Florence-2 (small VL model, less verbose but very reliable).
  try {
    const out = await falRequest<{ results?: { '<MORE_DETAILED_CAPTION>'?: string; '<DETAILED_CAPTION>'?: string; '<CAPTION>'?: string } }>(
      'fal-ai/florence-2-large/more-detailed-caption',
      { image_url: resolved },
      { timeoutMs: 15_000 }
    );
    const r = out.results || {};
    const caption = (r['<MORE_DETAILED_CAPTION>'] || r['<DETAILED_CAPTION>'] || r['<CAPTION>'] || '').trim();
    console.log(`[caption] Florence-2 fallback used (${caption.length} chars)`);
    return caption;
  } catch (err) {
    console.warn('[caption] Florence-2 fallback also failed:', (err as Error).message);
    return '';
  }
}

/**
 * Caption multiple product images in parallel and merge into a single
 * "what the LLM sees" description. Failures don't break the pipeline —
 * the LLM just gets less visual context.
 */
async function captionProductImages(images: string[], max = 3): Promise<string> {
  const subset = images.slice(0, max);
  if (subset.length === 0) return '';
  const captions = await Promise.all(
    subset.map(async (url) => {
      try {
        const c = await captionImage(url);
        return c.length > 0 ? c : null;
      } catch (err) {
        console.warn(`[landing-gen] caption failed for ${url.slice(0, 60)}:`, (err as Error).message);
        return null;
      }
    })
  );
  const list = captions.filter((c): c is string => !!c);
  if (list.length === 0) return '';
  return list.map((c, i) => `Image ${i + 1}: ${c}`).join('\n');
}

// fal.ai any-llm registry (as of this edit) accepts these Claude models:
//   anthropic/claude-sonnet-4.5  (best Claude available on fal)
//   anthropic/claude-haiku-4.5
//   anthropic/claude-3.7-sonnet
//   anthropic/claude-3.5-sonnet
// Other strong picks for marketing copy: openai/gpt-5-chat, openai/gpt-4.1,
// google/gemini-2.5-pro, deepseek/deepseek-v3.1-terminus.
// Override via FAL_LLM_MODEL env when you want to test alternatives.
const LLM_MODEL = process.env.FAL_LLM_MODEL || 'anthropic/claude-sonnet-4.5';
// Marketing copy lives at the upper end of the creativity dial — too cold
// (≤0.5) and every page sounds identical; too hot (≥1.0) and we get
// hallucinations of fake stats / made-up product features. 0.85 is the
// sweet spot for "specific but inspired" output on Claude.
const LLM_TEMPERATURE = parseFloat(process.env.FAL_LLM_TEMPERATURE || '0.85');

/**
 * Run the strategic LLM through fal's queue endpoint. Claude Sonnet 4.5
 * by default — top Claude available via fal.ai any-llm, sharper at dialect
 * copy and richer at structured JSON than Sonnet 3.5 / 3.7, and much better
 * than Gemini Flash for the volume of arabic derja / french conversion copy
 * this pipeline needs.
 *
 * We use the queue API (queue.fal.run) instead of the sync API (fal.run)
 * because Claude generating ~10 sections of structured JSON with image
 * prompts routinely takes 60-120s, and the sync endpoint has tight HTTP
 * timeouts (we kept hitting "timeout after 90000ms"). The queue pattern
 * submits the job, polls every 2s for up to 5 minutes, and only returns
 * once the LLM is done — no HTTP layer in the timeout path.
 */
export async function runLLM(prompt: string): Promise<string> {
  const out = await falQueueRequest<{ output?: string }>('fal-ai/any-llm', {
    model: LLM_MODEL,
    prompt,
    temperature: LLM_TEMPERATURE,
  });
  return (out.output || '').trim();
}

/**
 * Long-running fal.ai request via the queue API. Pattern:
 *   1. POST queue.fal.run/<model>           → returns request_id + URLs
 *   2. Poll status_url every pollInterval   → wait for COMPLETED
 *   3. GET response_url                     → fetch the actual output
 *
 * Bounded by maxWaitMs (default 5 min) so a stuck queue can't hang the
 * generation forever; one retry on FAILED states (often transient
 * rate-limit / capacity blips, not real failures).
 */
export async function falQueueRequest<T>(
  model: string,
  input: Record<string, unknown>,
  options: { maxWaitMs?: number; pollIntervalMs?: number } = {},
): Promise<T> {
  const key = getFalKey();
  const maxWaitMs = options.maxWaitMs ?? 300_000;        // 5 min cap
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const submitUrl = `https://queue.fal.run/${model}`;

  // 1. Submit
  const submit = await fetchWithRetry(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${key}`,
    },
    body: JSON.stringify(input),
  });
  if (!submit.ok) {
    const text = await submit.text();
    logger.error({ model, status: submit.status, body: text.slice(0, 2000) }, '[fal] queue submit failed');
    const err = new Error(`fal.ai ${model} queue submit error ${submit.status}: ${text}`) as Error & {
      statusCode?: number;
      publicMessage?: string;
    };
    err.statusCode = 502;
    err.publicMessage = `Le service IA a renvoyé une erreur (code ${submit.status}). Réessaie dans un instant.`;
    throw err;
  }
  const queued = (await submit.json()) as {
    request_id: string;
    status_url: string;
    response_url: string;
  };

  // 2. Poll
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const st = await fetchWithRetry(queued.status_url, {
      headers: { Authorization: `Key ${key}` },
    });
    if (!st.ok) {
      // Transient lookup failure — keep polling, don't give up.
      continue;
    }
    const sj = (await st.json()) as { status?: string };
    if (sj.status === 'COMPLETED') break;
    if (sj.status === 'FAILED' || sj.status === 'CANCELLED') {
      const err = new Error(`fal.ai ${model} queue ${sj.status}`) as Error & {
        statusCode?: number;
        publicMessage?: string;
      };
      err.statusCode = 502;
      err.publicMessage = "Le service IA a échoué pendant la génération. Réessaie.";
      throw err;
    }
    // IN_QUEUE or IN_PROGRESS → continue polling
  }
  if (Date.now() >= deadline) {
    const err = new Error(`fal.ai ${model} queue timeout after ${maxWaitMs}ms`) as Error & {
      statusCode?: number;
      publicMessage?: string;
    };
    err.statusCode = 504;
    err.publicMessage = "Le service IA n'a pas répondu à temps. Réessaie.";
    throw err;
  }

  // 3. Fetch the actual output
  const out = await fetchWithRetry(queued.response_url, {
    headers: { Authorization: `Key ${key}` },
  });
  if (!out.ok) {
    const text = await out.text();
    const err = new Error(`fal.ai ${model} queue fetch error ${out.status}: ${text}`) as Error & {
      statusCode?: number;
      publicMessage?: string;
    };
    err.statusCode = 502;
    err.publicMessage = `Le service IA a renvoyé une erreur (code ${out.status}).`;
    throw err;
  }
  return (await out.json()) as T;
}

// ─────────────────────────────────────────────────────────────────────
// Templates par catégorie — structure de landing éprouvée par verticale
// ─────────────────────────────────────────────────────────────────────
// Chaque catégorie (beauty / fashion / tech / food / luxury) a un funnel
// qui convertit mieux qu'une structure générique. Le template définit
// l'ordre de sections idéal + les points de focus copywriting. Le LLM
// reçoit ces instructions PAR-DESSUS le schema générique — il compose
// alors dans l'ordre optimal pour la catégorie détectée.
//
// Sources : patterns observés sur les top landings DTC 2024-2025 (Curology,
// Glossier, Away, Warby Parker, Kettle & Fire, Loewe, Aesop). Les "focus"
// sont extraits des messages qui reviennent le plus dans leurs meilleurs
// hero + testimonials.

interface CategoryTemplate {
  /** Ordre de sections recommandé (le LLM peut ajuster mais doit s'en approcher). */
  sectionOrder: string[];
  /** Focus copywriting court : ce que la copy doit absolument transmettre. */
  focus: string;
  /** Angles hero éprouvés pour la catégorie — few-shots pour l'ouverture. */
  heroAngles: string;
}

/**
 * ETA de livraison par pays — même table que le composant DeliveryEta côté
 * storefront, dupliquée ici pour que le cod-form auto-injecté annonce un
 * délai crédible et local ("livrée en 48h à Casablanca" > "livrée sous peu").
 * Coarse-grained : la vraie ETA est confirmée par MogaDelivery après la
 * commande. Objectif = tuer l'hésitation "ça arrive quand ?" au moment de
 * décider.
 */
const LANDING_ETA: Record<string, string> = {
  SN: 'en 48h', CI: 'en 48h', ML: 'en 3-4j', BF: 'en 3-4j', BJ: 'en 3-4j',
  TG: 'en 3-4j', GN: 'en 3-5j', NE: 'en 4-5j', GM: 'en 3-4j', GH: 'en 3-4j',
  NG: 'en 3-5j', CM: 'en 3-5j', MA: 'en 48h', TN: 'en 48h', DZ: 'en 3-4j',
  LY: 'en 4-6j',
};

const CATEGORY_TEMPLATES: Record<CategoryClass, CategoryTemplate> = {
  beauty: {
    sectionOrder: ['hero', 'features', 'product', 'gallery', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer'],
    focus:
      'Nomme le problème visible (peau, cheveux, dents) seulement si la fiche le dit. Explique comment on l\'utilise. Jamais de délai de résultat, de pourcentage, ni de nombre de clientes inventés.',
    heroAngles: [
      'Problème concret : "Ton [zone] mérite mieux que [habitude actuelle]." seulement si la fiche décrit cette zone.',
      'Usage : "Tu l\'appliques le soir. Tu paies le livreur quand tu as le flacon en main."',
      'Texture : décris la sensation écrite dans la fiche, puis le paiement à la livraison.',
    ].join('\n  '),
  },
  fashion: {
    sectionOrder: ['hero', 'features', 'product', 'gallery', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer'],
    focus:
      'Occasion, coupe et matière, uniquement avec les mots de la fiche. Le guide taille va dans la FAQ seulement si les tailles sont dans la fiche. Pas de "premium". Le hero montre le vêtement porté dans une vie locale, pas un studio inventé.',
    heroAngles: [
      'Occasion : "Tu le portes du bureau au dîner." seulement si la fiche le permet.',
      'Matière : cite la matière écrite dans la fiche, puis le prix réel.',
      'Commande : "Tu l\'ouvres avant de payer le livreur."',
    ].join('\n  '),
  },
  electronics: {
    sectionOrder: ['hero', 'features', 'product', 'gallery', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer'],
    focus:
      'Le bénéfice avant la spec, et seulement les specs présentes dans la fiche. La FAQ répond à la compatibilité et à l\'usage si la fiche les donne. Sinon, dis que l\'appel de confirmation précise le point. Pas de garantie inventée.',
    heroAngles: [
      'Usage : une phrase sur ce que l\'objet fait, tirée de la fiche.',
      'Commande : "Tu le testes quand le livreur arrive. Tu paies seulement s\'il te convient."',
    ].join('\n  '),
  },
  food: {
    sectionOrder: ['hero', 'features', 'product', 'gallery', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer'],
    focus:
      'Ingrédients et usage tels qu\'écrits dans la fiche. Aucune promesse de poids, d\'énergie en X jours, ou de certification absente de la fiche.',
    heroAngles: [
      'Ingrédient : cite un ingrédient réel de la fiche, puis comment on le prend.',
      'Commande : "Tu paies le livreur en cash, rien avant."',
    ].join('\n  '),
  },
  luxury: {
    sectionOrder: ['hero', 'features', 'product', 'gallery', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer'],
    focus:
      'Savoir-faire et histoire uniquement si la fiche le dit. Pas de "premium", pas de presse inventée, pas d\'atelier ou de date que le vendeur n\'a pas écrits.',
    heroAngles: [
      'Matière : cite la matière et le geste seulement s\'ils sont dans la fiche.',
      'Commande : "Tu le vois avant de payer le livreur."',
    ].join('\n  '),
  },
  generic: {
    // Structure par défaut — le LLM garde sa logique actuelle.
    sectionOrder: [],
    focus: '',
    heroAngles: '',
  },
};

/**
 * Frameworks copywriting DTC éprouvés. Injectés au system prompt pour que le
 * LLM utilise des structures qui convertissent (PAS, BAB, SSS, AIDA) au lieu
 * de sa moyenne corporate. Universel — pas spécifique à une catégorie.
 */
const DTC_COPY_FORMULAS = `
# 🧠 FRAMEWORKS COPY À UTILISER (obligatoire — pas de copy générique)

## HERO — Utilise PAS (Problem → Agitate → Solve)
   Structure :
     Ligne 1 (title) : Nomme le problème du prospect en 6-11 mots avec un angle spécifique
     Ligne 2 (subtitle, partie 1) : Amplifie la douleur — décris CE QU'IL RESSENT dans son quotidien
     Ligne 2 (subtitle, partie 2) : Introduis la solution avec un fait PRÉSENT dans la fiche (matière, usage, prix). Jamais un pourcentage ou un nombre de clients.
   Exemple beauty : "Ton sourire mérite mieux que du blanchiment agressif." / "Un sérum sans peroxyde, à poser le soir. Tu payes seulement quand le livreur te le remet."
   Exemple tech    : "Ton chargeur casse tous les 3 mois." / "Câble tressé, prise USB-C, et tu le testes avant de payer le livreur."

## FEATURES — Utilise BAB (Before → After → Bridge) sur chaque item
   Structure : titre = le RÉSULTAT concret, description = le BÉNÉFICE + le POURQUOI CE PRODUIT le délivre
   Bad  : "Qualité premium" — "Fabriqué avec des matériaux de haute qualité"
   Good : "Ne craque pas au premier hiver" — "Cuir véritable, coutures renforcées — pas de plastique premier prix." (seulement si la fiche dit cuir)

## TESTIMONIALS — une phrase concrète, pas une histoire inventée
   Une phrase sur l'usage réel du produit, un prénom local, une ville.
   Pas d'âge, pas de chiffre, pas de résultat médical, pas de "X clientes".
   Exemple : "La broderie est nette, et j'ai payé le livreur seulement après avoir ouvert le colis." — Amina, Dakar

## CTA — Utilise AIDA (Attention → Interest → Desire → Action)
   title      (Attention) : STOP-scroll — question directe ou fait choquant
   subtitle   (Interest+Desire) : la promesse + l'urgence crédible + la levée d'objection COD
   buttonText (Action) : verbe direct à la 2e personne + bénéfice ("Reçois le mien", pas "Acheter")
   urgency    : objection COD ("tu payes quand tu l'as en main"). JAMAIS un stock, un délai ou un "X pièces restantes" inventé.

## FAQ — Adresse les VRAIES objections COD, pas des questions marketing bidon
   Les 5 questions doivent couvrir dans cet ordre :
   1. Comment payer (cash au livreur, rien avant)
   2. Ce qui se passe si l'acheteur est absent (on appelle avant)
   3. Et si le produit ne convient pas (il regarde le colis avant de payer)
   4. Où on livre (villes du transporteur, l'appel confirme)
   5. Une question propre au produit (taille, matière, usage) répondue UNIQUEMENT avec la fiche. Si la fiche ne le dit pas, la réponse est : l'appel de confirmation le précise. Pas de délai, pas de retour, pas de garantie inventés.

# ❌ INTERDIT dans TOUT le copy :
   - Mots vides : "premium", "exception", "univers", "expérience", "engagement", "excellence", "innovation"
   - Impératifs vides : "Achetez maintenant !", "Découvrez !", "Profitez !"
   - Slogans "nous vous proposons", "notre engagement", "chez [marque], on croit que…"
   - Superlatifs non prouvés : "meilleur du marché", "le plus efficace"

# ✅ OBLIGATOIRE partout :
   - Faits de la fiche seulement (nom, matière, prix donné). Zéro client, zéro avis, zéro stock, zéro presse inventés.
   - 2e personne directe (tu/إنتي/إنت — jamais "vous" sauf B2B explicite)
   - Nom de ville locale au moins 2 fois dans la page (Casablanca, Dakar, Tunis, Alger, etc.)
   - Levée d'objection COD dans hero + testimonial + FAQ + CTA
`;

/**
 * Récupère le template landing pour une catégorie donnée. Retourne un objet
 * vide pour 'generic' → le LLM garde sa liberté par défaut.
 */
function getCategoryTemplateBlock(category?: string, pageKind?: string): string {
  const cls = classifyCategory(category);
  const tpl = CATEGORY_TEMPLATES[cls];
  if (cls === 'generic' || !tpl.sectionOrder.length) return '';
  const order = pageKind === 'product'
    ? ['hero', 'product', 'gallery', 'features', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer']
    : tpl.sectionOrder;
  return `
# 📐 TEMPLATE STRUCTURE — CATÉGORIE DÉTECTÉE : ${cls.toUpperCase()}
Ordre de sections (obligatoire) :
  ${order.join(' → ')}

Focus copywriting spécifique à la catégorie :
${tpl.focus}

Angles hero éprouvés (mime l'un des 3, ne copie pas les mots — adapte au produit) :
  ${tpl.heroAngles}
`;
}

// ─────────────────────────────────────────────────────────────────────
// PROMPT v2 — dialect-precise + image prompt slots
// ─────────────────────────────────────────────────────────────────────
function salesPageContract(pageKind: 'landing' | 'product', hasDiscount: boolean, discountPct: number): string {
  const productPage = pageKind === 'product';
  const order = productPage
    ? 'hero → product → gallery → features → steps → testimonials → cod-form → faq → cta → footer'
    : 'hero → features → product → gallery → steps → testimonials → cod-form → faq → cta → footer';
  return `
# PAGE: ${productPage ? 'PRODUCT PAGE' : 'LANDING PAGE'}
Write EXACTLY these 10 sections, in this order, and no others:
${order}

${productPage
  ? 'The buyer is already looking at this product. Put the catalog name and the real price in the hero and in the product block before the longer benefits. Photos come before the story.'
  : 'The buyer comes from an ad and does not know the product yet. Open on the outcome, then the benefits, then the offer and the real price, then the photos, then how cash on delivery works.'}

The order line above is mandatory. The numbers below only say what each block contains.

Every button scrolls to "#cod-order-form-section". The buyer pays the courier in cash and nothing before. Do not invent a delay, a return window, a stock count, a review score, or a discount.

1. hero — title (6–11 words), subtitle (one fact from the product data + cash on delivery), ctaText, ctaHref, trustLine, layout "split"${hasDiscount ? `, badge "−${discountPct}%"` : ''}. Omit imageUrl. Write an English imagePrompt of this exact product.
2. features — 4 to 6 items. Each item: icon, title = the result, description = the fact from the product data that supports it. No "premium".
3. product — name is the catalog name exactly, tagline, priceAfter, currency, 4 highlights taken from the description, ctaText, ctaHref, trustBadges. ${hasDiscount ? `Include priceBefore and discountPct ${discountPct}.` : 'Do not invent priceBefore.'} No rating. No reviewCount. Omit imageUrl. Write an English imagePrompt.
4. gallery — title plus 4 English imagePrompts. Four different scenes of the same product. Do not paste catalog URLs.
5. steps — exactly 3: the buyer places the order, the shop confirms by phone, the buyer pays the courier in cash. No invented delay.
6. testimonials — exactly 3. One sentence each, a local first name and a city. No score, no customer count, no medical result.
7. cod-form — exactly one. Title about cash on delivery. reassurance = pay on delivery only.
8. faq — exactly 5, in the order of the FAQ framework above.
9. cta — title, subtitle, buttonText, buttonHref, urgency = pay only when the parcel is in hand.${hasDiscount ? ` Mention −${discountPct}%.` : ''}
10. footer — brandName, tagline, paymentMethods ["cod"].

Do not emit stats, brands, pricing, a product grid, or a video.
`;
}

function buildPrompt(input: FalGenerateInput, language: string, direction: 'ltr' | 'rtl'): string {
  const {
    storeName,
    product,
    imageCaption,
    tone = 'professional',
    country,
    category,
    priceBefore,
    priceAfter,
    currency,
    pageKind = 'landing',
  } = input;

  const productBlock = product
    ? [
        `Product name: ${product.name}`,
        product.description ? `Product description: ${product.description}` : '',
        product.type ? `Product type: ${product.type}` : '',
        product.images?.length ? `Product images already provided: ${product.images.length}` : '',
      ].filter(Boolean).join('\n')
    : 'No product data provided.';

  const cur = currency || '';
  const fmt = (n?: number) => (typeof n === 'number' ? `${n}${cur ? ' ' + cur : ''}` : '');
  const hasDiscount =
    typeof priceBefore === 'number' && typeof priceAfter === 'number' && priceBefore > priceAfter;
  const discountPct = hasDiscount ? Math.round(((priceBefore! - priceAfter!) / priceBefore!) * 100) : 0;

  const priceLines = [
    typeof priceBefore === 'number' ? `Original price (before): ${fmt(priceBefore)}` : '',
    typeof priceAfter  === 'number' ? `Sale price (after): ${fmt(priceAfter)}` : '',
    hasDiscount ? `Discount: -${discountPct}%` : '',
  ].filter(Boolean).join('\n');

  const langLabel = LANGUAGE_LABEL[language] || language;
  const dialect = getDialect(country, language);
  const photoCulture = getPhotoCulture(country);
  const arabHint = direction === 'rtl'
    ? '\n- Page is RTL. Phrase naturally — never transliterate.'
    : '';

  const isArabicDialect = direction === 'rtl' && language.startsWith('ar') && !!dialect;
  // French copy is the other half of our traffic (Maghreb + W. Africa).
  // Without an explicit few-shot, the model defaults to euro-corporate tone
  // ("Découvrez notre gamme premium") which never converts in COD markets.
  const isFrenchCopy = language.startsWith('fr');
  const audienceLines = [
    `Output language: ${langLabel}.`,
    dialect ? `Dialect & cultural register (MANDATORY — do not write in MSA / Fusha):\n${dialect}` : '',
    country ? `Target market: ${country}.` : '',
    category ? `Niche: ${category}.` : '',
    `Direction: ${direction}.`,
  ].filter(Boolean).join('\n');

  const productImagesProvided = (product?.images?.length || 0) > 0;

  const sectionsSchema = `
The PAGE block above is the contract: exactly those 10 sections, in that order. Use the prop shapes below. Do not add stats, brands, pricing, a product grid, or a video.

For sections that need images, output an "imagePrompt" field — a short ENGLISH description (under 35 words) of ONE scene. NEVER write Arabic text inside imagePrompt — image models do that poorly. Describe the scene visually only.

# Image direction — ONE COHERENT, PREMIUM PHOTOSHOOT
Cultural anchor: ${photoCulture}.

Quality bar — every image on this page belongs to the SAME 2026 luxury-brand
shoot (think Apple product page, Aesop, Le Labo, Loewe campaign). The viewer
should feel one art director shot the whole page in one afternoon.

🎯 WRITE THE SCENE ONLY — describe the SUBJECT, the SETTING, the ACTION and the
COMPOSITION. Do NOT write camera names, f-stops, lens specs, lighting jargon,
"4k", "8k", "photorealistic", "no text" or "cinematic" — the pipeline appends a
fixed, consistent house photography style to every prompt automatically.
Adding your own conflicting style words BREAKS the page's visual coherence.

Good imagePrompt:  "a young Tunisian woman in a sunlit kitchen using the product, warm morning light through a window, off-center on the left third"
Bad imagePrompt:   "product shot, 8k, photorealistic, cinematic, shot on Sony A7, no text" ← style words forbidden

Keep ONE consistent world across all images: same kind of light (e.g. soft
morning daylight), same palette family, same level of realism. If the hero is a
warm sunlit home, the gallery and CTA stay in that same warm sunlit world — not
a neon studio, not a dark moody set.

Vary scene types across the page — NEVER use the same composition twice.
Pick a different bucket for each image:
  • Close-up product detail — macro shot, dramatic chiaroscuro lighting,
    one tight angle revealing texture, material, craftsmanship
  • Lifestyle in-use — hands holding/wearing/using the product, real-world
    context (market, café, home interior), candid framing
  • Environmental still life — product placed in a curated scene with
    complementary props (linen, marble, fresh flowers, ceramic, leather),
    NO PEOPLE, painterly composition
  • Full-frame human portrait — model wearing/holding the product, cropped
    at chest or thighs, eye contact, confident editorial pose
  • Flat-lay overhead — top-down composition with the product surrounded
    by 3-5 complementary objects, intentional negative space
  • Atmospheric mood — extreme shallow depth, product partially out of
    frame, focus on color/light/feeling rather than literal product

Composition rules — break the stock-photo defaults:
  ✓ ASYMMETRIC framing (subject off-center on a 1/3 line)
  ✓ Intentional negative space — at least 30% of the frame is breathing room
  ✓ ONE strong focal point per image, single light source
  ✓ A clear color story (1 dominant + 1 accent — not 5 random colors)
  ✓ Honest grain / texture — feels analog, not over-processed
  ✗ Centered subject + blurred background — too generic
  ✗ Beige hotel-room interior, white seamless backdrop, generic smiles
  ✗ Multiple competing colors, busy backgrounds, lens flare overload
  ✗ Symmetrical "Pinterest aesthetic" without intention

Per-section schema:

- "hero" props: { "title", "subtitle", "ctaText", "ctaSecondary"?, "badge"?, "layout": "split", "imagePrompt": "scene only — someone using/wearing/holding the product in ${photoCulture}, subject off-center, warm daylight" }
  Title 6–11 words, benefit-driven. Subtitle 1–2 sentences.
  ${productImagesProvided ? 'IMPORTANT: a product photo is provided — DO NOT set hero.imageUrl. Write a scene-only "imagePrompt": the pipeline regenerates the hero from the real product photo (image-to-image), keeping the SAME product in a premium styled scene.' : ''}

- "features" props: { "title", "subtitle", "items": [{ "title", "description", "icon" }] }
  4–6 items. Icon ∈ {"check","shield","truck","clock","star","heart","sparkles","zap","gift","leaf","award","crown","lock","refresh","headphones"}.

- "stats": DO NOT emit this section. Customer counts, percentages and stock figures are forbidden unless they appear verbatim in the product data above.

- "gallery" props: { "title"?, "subtitle"?, "imagePrompts": ["scene 1", "scene 2", "scene 3", "scene 4"] }
  4 short ENGLISH prompts for varied lifestyle/usage shots in the local culture. The pipeline turns them into images.

- "product" props: {
    "name", "tagline", "priceBefore"?, "priceAfter"?, "currency"?, "discountPct"?,
    "highlights": [4–6 short bullets, 4–8 words each],
    "ctaText", "trustBadges"?: [...] (e.g. "دفع عند الاستلام", "شحن مجاني" for AR markets),
    Do NOT set "rating" or "reviewCount".
    "imagePrompt": "scene only — the product as a clean premium hero still life on a soft warm backdrop, slightly off-center"${productImagesProvided ? ',\n    "gallery": ["__PRODUCT_IMAGE_0__", "__PRODUCT_IMAGE_1__", ...]' : ''}
  }
  ${productImagesProvided ? 'IMPORTANT: a product photo is provided — DO NOT set product.imageUrl. Always write a scene-only "imagePrompt": the pipeline regenerates the main product shot from the real photo (image-to-image) so it shows the SAME product in a premium styled scene. The raw photos only feed the small "gallery" thumbnail strip.' : ''}

- "brands": DO NOT emit this section. Never invent press outlets, magazines, or "as seen in" logos.

- "testimonials" props: { "title", "items": [{ "quote", "author", "role"?, "rating"?, "imagePrompt": "scene only — a warm friendly [age range] [gender] [country origin], relaxed at home" }] }
  3 items. Authors must be plausible names for ${country || 'the target country'}. Quotes 2–3 sentences, specific.

- "video" props: { "title"?, "subtitle"?, "imagePrompt": "scene only — a lifestyle still that works as a video poster, set in ${photoCulture}" } — optional.

- "steps" props: { "title", "subtitle"?, "items": [{ "title", "description", "icon" }] }
  3 numbered steps explaining how the product / service works — e.g. "Choose your size", "Place your order with cash on delivery", "Receive in 48h". Use the same icon set as "features".

- "pricing" props: { "title", "subtitle"?, "plans": [{ "name", "price", "period"?, "features": [...], "ctaText", "highlight"? }] } — 1 plan for single product, 2–3 for SaaS.

- "faq" props: { "title", "items": [{ "question", "answer" }] } — 5 items addressing real local objections.

- "cta" props: { "title", "subtitle", "buttonText", "secondaryText"?, "urgency"?,
    "bannerPrompt"?: "promotional sticker reading \\"−${'${'}discountPct${'}'}%\\" in bold sans-serif, vibrant brand colors, modern flat design" }
  The optional "bannerPrompt" generates a promo image WITH LEGIBLE TEXT (Ideogram v3).
  Use it for cta/hero/features when you want a graphic with text like "−50%", "NEW",
  "SOLDES", "العرض ينتهي قريبا". ALWAYS wrap the exact text the image must contain in
  straight double quotes inside the prompt. Skip bannerPrompt when no promo / no discount.

- "cod-form" props: {
    "title": "...", "subtitle"?: "...", "submitLabel"?: "...", "reassurance"?: "...",
    "productSlug"?: "<slug-of-the-product-this-form-orders, OR omit to use the page's primary product>",
    "showEmail"?: true, "requireEmail"?: false,
    "showPostalCode"?: <true if MA/TN/DZ — otherwise false>,
    "showState"?: <true if DZ (wilaya) or large country>,
    "showNotes"?: true, "showQuantity"?: true
  }
  Inline cash-on-delivery order form. Use this section on physical-product landing pages
  near the bottom (after testimonials, before faq). Title should be punchy, e.g. "Commandez maintenant"
  or "اطلب الآن — الدفع عند الاستلام". Subtitle reinforces no-prepayment trust.

- "footer" props: { "brandName", "tagline"?, "links": [{ "label", "href" }], "socials"?: [{ "name", "href" }], "paymentMethods"?: [...] }
  For Arab markets, paymentMethods should include "cod" (cash on delivery) which is the dominant method.
`;

  // Two very different narratives — same section vocabulary, different
  // sequence + copy register + per-section prop shape. Without this
  // per-kind blueprint the LLM produces two visually identical pages
  // and sellers can't tell why they'd pick one over the other.
  const salesPageRules = salesPageContract(pageKind, hasDiscount, discountPct);
  const imageBlock = imageCaption
    ? `\n# 🛑 PRODUCT IDENTITY — ABSOLUTE SOURCE OF TRUTH 🛑
A vision model has DESCRIBED the actual product photo. This description is THE product. You MUST write copy about THIS exact object, nothing else.

Vision description:
"""
${imageCaption}
"""

# Hard rules (violating these = invalid output):
1. The PRODUCT TYPE (the very first noun in the description, e.g. "wallet", "phone holder", "candle", "watch") IS the product. NEVER substitute it with another category. If the description starts with "magnetic phone mount with rotating base" you MUST write about a magnetic phone mount with rotating base — not headphones, not a speaker, not generic "products".
2. Every concrete attribute (color, material, finish, hardware, distinctive parts) mentioned in the description MUST appear at least once across your copy (hero, features, product, faq).
3. Forbidden: inventing features or attributes NOT in the description. If the description doesn't say "waterproof", do NOT claim waterproof. If it doesn't mention a battery, do NOT mention battery life.
4. The hero title, product.name and faq questions all refer to THE SAME OBJECT.
5. Before writing, mentally answer: "What is this object?" → write that answer in 2-3 words → that's your product category. Use it consistently.
6. Image prompts must show THIS object: same type, same color, same number of pieces as the vision description. Never write a different color or a different outfit.`
    : '';

  const arabFewShots = isArabicDialect ? dialectFewShot(language, country) + `
# Règle d'écriture
كل العنوان، الأزرار، الأسئلة والأجوبة بنفس اللهجة المختارة. جملة قصيرة. ما تخلطش لهجتين.
ما تكتبش الفصحى: اشترِ، احصل على، نحن نقدم، الآن، الفاخر.
` : '';
  // ──────── French few-shots (FR Maghreb + Afrique francophone) ────────
  // Same purpose as the arab block: kill the corporate-marketing default
  // voice and force a direct, WhatsApp-grade tone that actually converts
  // for COD audiences.
  const frenchFewShots = isFrenchCopy ? `
# 📝 Few-shot: voici comment écrit un bon copywriter dropshipping français COD (style à imiter, PAS à copier)

Hero (Maroc):
  title: "Reçu chez toi en 48h — paiement quand tu l'as en main."
  subtitle: "Tu paies cash au livreur, zéro avance, zéro carte."
  ctaText: "Commander · paiement à la livraison"

Hero (Sénégal):
  title: "Le caftan brodé, livré chez toi. Tu paies au livreur."
  subtitle: "Soie brodée, coupe ample. On t'appelle pour confirmer l'adresse avant le passage."
  ctaText: "Commander · paiement à la livraison"

Features item (générique FR):
  title: "Solide, vraiment solide"
  description: "Cuir véritable, coutures renforcées — pas du plastique premier prix."

Testimonial (Côte d'Ivoire):
  quote: "J'étais sceptique au début, mais quand le livreur est passé chez moi à Yopougon avec le colis, j'ai vu la qualité avant même de payer. Excellent."
  author: "Aïcha Koné"
  role: "Cliente — Abidjan"

CTA section (Tunisie FR):
  title: "Commande maintenant, paye à la réception."
  subtitle: "Tu ouvres le colis avant de payer. Si ça ne te plaît pas, tu refuses."
  buttonText: "Commander maintenant"
  urgency: "Tu payes seulement quand tu l'as en main"

FAQ (Maroc FR):
  question: "Et si je ne suis pas satisfait ?"
  answer: "Le livreur attend que tu ouvres le colis. Si ça ne te convient pas, tu refuses, tu ne paies rien. Aucune avance, aucun frais caché."

# 🚫 ANTI-PATTERNS — ne JAMAIS écrire comme ça (trop corporate / cliché Amazon) :
  ❌ "Découvrez notre gamme premium de produits d'exception"  (vide, cliché, zéro spécifique)
  ❌ "Nous vous proposons les meilleurs articles du marché"   (nous-on, formel, mensonge implicite)
  ❌ "Profitez d'une expérience client inégalée"              (jargon SaaS, aucune image mentale)
  ❌ "Notre engagement : votre satisfaction"                  (slogan publicitaire des années 2000)
  ❌ "Achetez dès maintenant !"                               (impératif vide sans raison crédible)

# ✅ PRINCIPES de copy FR (à appliquer dans CHAQUE section):
  - PARLE direct : "tu" + verbe à la 2ème personne, jamais "vous" sauf B2B explicite
  - SPÉCIFIQUE : le produit réel, le prix donné, une ville locale (Yopougon, Casa, Dakar). Pas de nombre de clients.
  - CONCRET : la sensation, l'usage, le moment précis ("quand le livreur passe", "le matin avant le café")
  - URGENCE = paiement à la livraison, PAS un stock ou un réappro inventé
  - Adresse l'objection COD frontalement : "tu payes seulement quand tu l'as en main"
  - Rythme court : phrases de 6-12 mots dans les CTA, jamais de subordonnée alambiquée
  - Zéro mot-jargon : pas de "premium", "exception", "engagement", "expérience", "univers"
` : '';

  // Templates + frameworks copywriting — injectés avant le schema pour
  // que le LLM voie d'abord LA STRUCTURE optimale (template catégorie) et
  // LES FORMULES qui convertissent (PAS / BAB / SSS / AIDA), puis compose
  // dans le schema générique en respectant ces contraintes.
  const categoryTemplateBlock = getCategoryTemplateBlock(input.category, pageKind);

  return `You write the sales page of a real online store that takes orders with cash on delivery. The buyer should trust the shop: clear offer, real price, how the order works, then the order form. Voice: direct and concrete, like a good salesperson. No slang, no fake stock, no invented delay, no invented customer count. You output ONE valid JSON object only.

# Brand
Store: ${storeName}
Tone: ${tone}

# Audience
${audienceLines}

# Page kind
${pageKind}
${salesPageRules}

# Product
${productBlock}
${priceLines ? `\n# Pricing\n${priceLines}` : '\n# Pricing\nNo crossed-out price was provided. Do not invent priceBefore, a discount, or a "back to X" price.'}${imageBlock}

# Truth lock
${product?.name ? `- The catalog name is exactly "${product.name}". seoTitle MUST contain it. Do not rename the product, and do not add pieces, colors, or materials that are absent from the name, the description, and the vision caption.` : '- Do not invent a product name.'}
- Do NOT output "stats" or "brands". Do NOT invent ratings, review counts, customer counts, remaining stock, press outlets, delivery delays, or return windows.
- Testimonials may use plausible local first names. Quotes must not cite a number of buyers or a score.
- Every imagePrompt must depict the same product (same garment, same color, same pieces). Never describe a look-alike.
${categoryTemplateBlock}${DTC_COPY_FORMULAS}
${arabFewShots}${frenchFewShots}
# Section schema
${sectionsSchema}

# Output (return ONLY this JSON, no markdown, no commentary)
{
  "sections": [ { "type": "hero", "props": { ... } }, ... ],
  "seoTitle": "string ≤60 chars",
  "seoDescription": "string ≤155 chars"
}

# Hard rules
- Strict JSON. No trailing commas. No code fences.
- ALL human-readable copy in ${langLabel}. Titles, buttons, FAQ, testimonials and the order form use that language only.${arabHint}
${isArabicDialect ? `- DIALECT IS NON-NEGOTIABLE. Re-read the dialect block above before writing each section. After drafting, scan your output for any Fusha forms (e.g. "اشترِ", "احصل على", "الذي", verb-initial sentences with classical conjugation) and REWRITE them in ${country?.toUpperCase() || 'the target'} dialect with the markers listed.\n- French loanwords are encouraged where the dialect block lists them — DO NOT translate them to Arabic equivalents.` : ''}
${isFrenchCopy ? `- VOICE IS NON-NEGOTIABLE. Re-read the French few-shot above before EACH section. After drafting, scan for forbidden corporate jargon ("premium", "exception", "univers", "engagement", "découvrez notre gamme", "expérience inégalée", "nous vous proposons") and REWRITE in the direct tu-form WhatsApp-tone shown in the examples.\n- Use "tu" (B2C), never "vous". Address the COD payment objection head-on. Never invent a customer count, a rating, a stock level, a press mention, or a price.` : ''}
- ALL "imagePrompt" / "imagePrompts" fields stay in ENGLISH (image model needs English).
- Exactly 10 sections, in the PAGE order: hero, then the blocks listed there, ending with footer. Include features, product, gallery, steps, testimonials, cod-form, faq and cta.
- NEVER invent a filename or URL. The ONLY allowed values for "imageUrl", "posterUrl", "avatarUrl", "images", "gallery" are: an http(s):// URL we already gave you, OR the literal placeholder "__PRODUCT_IMAGE_N__". For every other case, OMIT the field entirely and use "imagePrompt" / "imagePrompts" instead.
${hasDiscount ? `- Mention savings (-${discountPct}%) and strikethrough ${fmt(priceBefore)} → ${fmt(priceAfter)} in hero AND cta.` : ''}
- Specificity > generic. Every benefit concrete. No filler ("amazing", "the best") without proof.
- Testimonial author names native to ${country || 'the target country'}.
- Trust badges and the FAQ may promise cash on delivery only. Do not promise free shipping, a return window, or a certificate unless that exact promise is written in the product data.`;
}

// ─────────────────────────────────────────────────────────────────────
// JSON parsing & section normalization (now with image-prompt extraction)
// ─────────────────────────────────────────────────────────────────────
interface RawAiResult {
  sections?: Array<{ type?: string; props?: Record<string, unknown> }>;
  seoTitle?: string;
  seoDescription?: string;
}

function parseLLMJson(content: string): RawAiResult {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* fall through */ }
  }
  const err = new Error('AI returned invalid JSON') as Error & { statusCode?: number };
  err.statusCode = 502;
  throw err;
}

const ALLOWED_TYPES = new Set([
  'hero','features','stats','gallery','product','products','brands','video','pricing','testimonials','steps','cta','faq','footer','cod-form',
]);

/**
 * Recognize well-formed image URLs (real ones we can render). Anything else
 * (e.g. "hero-image.png" invented by the LLM) is treated as missing so the
 * pipeline either generates an AI image or falls back to a product image.
 */
function isRealImageUrl(u: unknown): u is string {
  if (typeof u !== 'string' || !u) return false;
  return /^(https?:|data:|blob:)/i.test(u) || u.startsWith('/uploads/');
}

/**
 * Replace literal "__PRODUCT_IMAGE_N__" placeholders with the real product
 * image URLs. Drops any other invented URL that doesn't look real. Walks
 * known image-bearing keys (imageUrl / posterUrl / avatarUrl / images / gallery)
 * so we don't accidentally rewrite text content like product names.
 */
const IMAGE_KEYS = new Set(['imageUrl', 'posterUrl', 'avatarUrl', 'image']);
const IMAGE_LIST_KEYS = new Set(['images', 'gallery']);

function resolveProductPlaceholders(value: unknown, images: string[], parentKey?: string): unknown {
  if (typeof value === 'string') {
    const m = value.match(/^__PRODUCT_IMAGE_(\d+)__$/);
    if (m) return images[Number(m[1])] || images[0] || '';
    // If the parent key is an image key but the value isn't a valid URL,
    // drop it (return empty) so the AI image-gen / product fallback kicks in.
    if (parentKey && IMAGE_KEYS.has(parentKey) && !isRealImageUrl(value)) return '';
    return value;
  }
  if (Array.isArray(value)) {
    const mapped = value.map((v) => resolveProductPlaceholders(v, images, parentKey));
    if (parentKey && IMAGE_LIST_KEYS.has(parentKey)) {
      return mapped.filter((u) => isRealImageUrl(u));
    }
    return mapped;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveProductPlaceholders(v, images, k);
    }
    return out;
  }
  return value;
}

interface ImageSlot {
  /** Setter that injects the URL once the image is generated. */
  apply: (url: string) => void;
  /** Prompt for the image model. */
  prompt: string;
  /** Hint for sizing / model selection. */
  kind: 'hero' | 'gallery' | 'product' | 'avatar' | 'video' | 'banner' | 'hook' | 'generic';
  /**
   * If set, the slot is generated via image-to-image so the output contains
   * THIS exact reference product. Used for hero & gallery so the AI variants
   * actually feature the user's product, not random images.
   */
  referenceImage?: string;
}

/**
 * Walk the section list, find every imagePrompt / imagePrompts field, and
 * return a list of slots whose apply() will inject a generated URL.
 *
 * When productImage is provided:
 *   - hero / gallery / product slots get it as `referenceImage` so they're
 *     generated via image-to-image (Nano Banana Edit) and contain THE
 *     SAME product the user uploaded.
 *   - testimonial avatars and video posters skip the reference (they're
 *     people / scenes, not the product).
 */
function collectImageSlots(
  sections: Array<{ type: string; props: Record<string, unknown> }>,
  productImages: string[] = [],
): ImageSlot[] {
  const slots: ImageSlot[] = [];
  const refAt = (index: number) => (productImages.length > 0 ? productImages[index % productImages.length] : undefined);

  for (const sec of sections) {
    const p = sec.props;
    if (!p || typeof p !== 'object') continue;

    // Banner slot — promotional image with legible text overlay (Ideogram v3).
    // The LLM may emit `bannerPrompt` in cta/hero/features/etc., OR an
    // `imagePrompt` that explicitly asks for text in the image.
    if (typeof p.bannerPrompt === 'string' && !p.bannerUrl) {
      slots.push({
        prompt: p.bannerPrompt,
        kind: 'banner',
        apply: (url) => { p.bannerUrl = url; },
      });
    }

    // hero / video / product / generic single-image slot
    if (typeof p.imagePrompt === 'string' && !p.imageUrl) {
      const prompt = p.imagePrompt;
      // Hook ads keep the product photo AND paint a short offer on it.
      // A banner detector would send them to Ideogram and drop the photo.
      const hooks = p.creativeMode === 'hooks';
      const isBanner = !hooks && isBannerPrompt(prompt);
      const kind: ImageSlot['kind'] =
        hooks ? 'hook' :
        isBanner ? 'banner' :
        sec.type === 'hero' ? 'hero' :
        sec.type === 'video' ? 'video' :
        sec.type === 'product' ? 'product' : 'generic';
      // Video posters showcase the product in use — they MUST use the product
      // reference, otherwise the model invents a generic look-alike.
      const useRef = productImages.length > 0 && (kind === 'hook' || (!isBanner && (kind === 'hero' || kind === 'product' || kind === 'generic' || kind === 'video')));
      const refIndex = sec.type === 'product' && productImages.length > 1 ? 1 : 0;
      slots.push({
        prompt,
        kind,
        referenceImage: useRef ? refAt(refIndex) : undefined,
        apply: (url) => {
          if (sec.type === 'video') p.posterUrl = url;
          else p.imageUrl = url;
        },
      });
    }

    // gallery: multiple images — every gallery slot uses the product as ref
    if (sec.type === 'gallery' && Array.isArray(p.imagePrompts) && (!Array.isArray(p.images) || p.images.length === 0)) {
      const prompts = (p.imagePrompts as unknown[]).filter((x) => typeof x === 'string') as string[];
      const urls: (string | null)[] = new Array(prompts.length).fill(null);
      p.images = urls; // placeholder slot, finalized after generation
      const hooks = p.creativeMode === 'hooks';
      prompts.forEach((prompt, idx) => {
        slots.push({
          prompt,
          kind: hooks ? 'hook' : 'gallery',
          referenceImage: refAt(idx),
          apply: (url) => { urls[idx] = url; },
        });
      });
    }

    // testimonials: per-item avatar (NEVER uses product reference — these are people)
    if (sec.type === 'testimonials' && Array.isArray(p.items)) {
      (p.items as Array<Record<string, unknown>>).forEach((item) => {
        if (typeof item.imagePrompt === 'string' && !item.avatarUrl) {
          const prompt = item.imagePrompt;
          slots.push({
            prompt,
            kind: 'avatar',
            apply: (url) => { item.avatarUrl = url; },
          });
        }
      });
    }
  }
  return slots;
}

const ASPECT_FOR_KIND: Record<ImageSlot['kind'], 'square' | 'portrait' | 'landscape' | 'wide'> = {
  hero:    'wide',
  gallery: 'square',
  product: 'square',
  avatar:  'portrait',
  video:   'wide',
  banner:  'wide',     // promo banners are typically wide
  hook:    'portrait', // pub 4:5, le texte de l'accroche doit rester lisible
  generic: 'square',
};

/**
 * House visual style — appended to EVERY product / lifestyle image prompt so
 * the whole page reads as one art-directed photoshoot instead of 12 unrelated
 * stock photos. This is the single biggest lever for visual COHERENCE and a
 * premium feel: same camera, same light, same color grade everywhere.
 */
const HOUSE_STYLE =
  ', premium editorial ecommerce photography, shot on a full-frame camera with a 50mm prime lens at f/2.0, ' +
  'soft directional natural light from one side, refined neutral color grade with a single warm accent tone, ' +
  'subtle organic film grain, crisp focus on the subject, shallow depth of field, generous intentional negative space, ' +
  'clean modern 2026 brand campaign look, high dynamic range, ultra detailed, sharp, 4k, ' +
  'no text, no typography, no watermark, no UI elements, no borders';

/** Portrait style for testimonial avatars — real people, not products. */
const PORTRAIT_STYLE =
  ', natural candid headshot, soft window light, warm neutral out-of-focus background, ' +
  'authentic genuine smile, sharp catchlight in the eyes, subtle film grain, editorial portrait photography, ' +
  '85mm lens, shallow depth of field, ultra detailed, 4k, no text, no logos, no watermark';

/**
 * Mappe le `kind` du slot local (fal-landing) vers le `slot` typé de
 * image-generation.service — permet à ce dernier de faire le routing
 * catégorie + le post-processing + le quality gate au bon niveau.
 */
function toGenSlot(kind: ImageSlot['kind']): 'hero' | 'gallery' | 'product' | 'avatar' | 'banner' | 'video-poster' | 'hook' | 'other' {
  switch (kind) {
    case 'hero': return 'hero';
    case 'gallery': return 'gallery';
    case 'product': return 'product';
    case 'avatar': return 'avatar';
    case 'banner': return 'banner';
    case 'hook': return 'hook';
    case 'video': return 'video-poster';
    case 'generic':
    default: return 'other';
  }
}

/**
 * Slots qui portent une mise en scène produit : quand un produit existe côté
 * store, ces slots DOIVENT recevoir la reference photo (sinon le modèle
 * invente un look-alike). Sert au warn `expectsProductReference`.
 */
const PRODUCT_BEARING_KINDS = new Set<ImageSlot['kind']>(['hero', 'gallery', 'product', 'video', 'hook']);

async function buildImageGenInput(
  slot: ImageSlot,
  ctx?: { productCategory?: string; productExists?: boolean },
): Promise<ImageGenInput> {
  const aspect = ASPECT_FOR_KIND[slot.kind];

  // Banner prompts ASK for legible text in the image — leave them untouched.
  // Every other slot gets the shared house style so the whole page is one
  // coherent shoot; avatars get the people-specific portrait style instead.
  const isBanner = slot.kind === 'banner';
  const isHook = slot.kind === 'hook';
  const isAvatar = slot.kind === 'avatar';
  const cleanScene = slot.prompt.trim().replace(/[.,;\s]+$/, '');
  // Les accroches portent du texte. Le style maison ajoute « no text » et
  // empêcherait l'offre d'apparaître sur l'image.
  let finalPrompt = isBanner || isHook
    ? slot.prompt
    : cleanScene + (isAvatar ? PORTRAIT_STYLE : HOUSE_STYLE);

  // If reference image is a relative /uploads/... path, fal.ai cannot fetch
  // localhost — convert it to a base64 data URL so fal receives the bytes.
  let referenceImages: string[] | undefined;
  if (slot.referenceImage) {
    try {
      const resolved = await resolveImageForFal(slot.referenceImage);
      referenceImages = [resolved];
    } catch (err) {
      console.warn('[image-gen] could not resolve reference image, falling back to text-to-image:', (err as Error).message);
    }
  }

  // Img2img fidelity guard. When we hand the model a reference photo we want
  // it to PLACE THE SAME PRODUCT in a new scene — not invent a similar object.
  // Any img2img-capable model (Nano Banana Edit, Flux Pro Kontext, …) honours
  // strong, explicit, repeated identity locks at the very start of the prompt
  // much better than vague "based on this product" wording. Trigger as soon
  // as we have a reference image, regardless of the model name — the new
  // routing layer will pick the right img2img endpoint.
  const hasReference = !!(referenceImages && referenceImages.length > 0);
  if (hasReference) {
    finalPrompt =
      'The reference photo is the real product. Keep that exact product: same color, same shape, same material, same pieces. ' +
      'Do not replace it with a similar product. Remove watermarks, price stickers and seller logos that are not printed on the product. ' +
      finalPrompt;
  }

  // Negative prompts only apply to FLUX-class models. Banners want text in
  // the image so we MUST NOT add "text, watermark, logo" to the negative.
  // For img2img runs we additionally veto "different product" drift.
  const baseNeg = 'text, watermark, logo, deformed, blurry, lowres, ugly, extra fingers, distorted face';
  const negativePrompt = isBanner || isHook
    ? 'misspelled text, extra words, watermark, different product, blurry, lowres, distorted, deformed'
    : hasReference
      ? `${baseNeg}, different product, alternative product, redesigned product, similar but different, wrong color variant, wrong branding, generic look-alike`
      : baseNeg;

  return {
    prompt: finalPrompt,
    aspect,
    // `model` volontairement omis : image-generation.service.ts fera le
    // routing via `resolveModelForCategory(slot, productCategory)`. Les
    // vendeurs de fashion/luxury basculent auto sur FLUX pro partout, les
    // vendeurs de beauty/food basculent sur FLUX Realism, le reste garde
    // les défauts par slot. Les env FAL_*_MODEL restent respectées.
    negativePrompt,
    referenceImages,
    slot: toGenSlot(slot.kind),
    productCategory: ctx?.productCategory,
    // Warn si un slot produit attend une reference et n'en a pas — permet
    // de repérer les cas où le pipeline régénère un look-alike au lieu du
    // vrai produit du vendeur.
    expectsProductReference:
      !!ctx?.productExists && PRODUCT_BEARING_KINDS.has(slot.kind) && !slot.referenceImage,
  };
}

/**
 * Détecte la catégorie produit pour le routing d'image. Priorité :
 *   1. `input.context.category` défini par le seller (le plus fiable)
 *   2. Concat des tags produit
 *   3. Nom du produit (dernier recours, moins précis)
 * Retourne `undefined` si rien de significatif → routing par slot par défaut.
 */
function detectProductCategory(input: FalGenerateInput): string | undefined {
  const tags = input.product?.tags && Array.isArray(input.product.tags)
    ? (input.product.tags as string[]).join(' ')
    : '';
  return resolveLandingCategory(input.category, input.product?.name, tags);
}

/**
 * Cleanup pass: prune internal fields, resolve gallery placeholders,
 * fall back to product images when AI didn't generate any.
 */
function finalize(
  sections: Array<{ type: string; props: Record<string, unknown> }>,
  fallbackProduct?: ProductInput,
  currency?: string,
  country?: string,
  language?: string,
  pageKind?: 'landing' | 'product',
  storeName?: string,
): TemplateSection[] {
  const productImages = fallbackProduct?.images?.filter((u) => typeof u === 'string' && u.length > 0) || [];
  const firstImage = productImages[0];

  for (const sec of sections) {
    const p = sec.props;
    // Strip imagePrompt-style fields from the final output (already consumed)
    delete p.imagePrompt;
    delete p.imagePrompts;
    delete p.creativeMode;
    if (sec.type === 'testimonials' && Array.isArray(p.items)) {
      (p.items as Array<Record<string, unknown>>).forEach((it) => { delete it.imagePrompt; });
    }

    // Inject currency
    if ((sec.type === 'product' || sec.type === 'pricing') && currency && !p.currency) {
      p.currency = currency;
    }

    // Gallery: filter nulls
    if (sec.type === 'gallery' && Array.isArray(p.images)) {
      p.images = (p.images as Array<string | null>).filter((u) => typeof u === 'string' && u.length > 0);
      if ((p.images as string[]).length === 0 && productImages.length > 0) {
        p.images = productImages;
      }
    }

    // Hero / product fallback to product image
    if (sec.type === 'hero' && firstImage && !p.imageUrl) {
      p.imageUrl = firstImage;
      if (!p.layout) p.layout = 'split';
    }
    if (sec.type === 'product') {
      if (!p.imageUrl && firstImage) p.imageUrl = firstImage;
      // Ne pas recoller les photos catalogue sous une accroche déjà générée.
      if (!p.imageUrl && !Array.isArray(p.gallery) && productImages.length > 0) p.gallery = productImages;
    }
  }

  // If we ended up with no visual section at all and product images exist, splice one
  if (productImages.length > 0) {
    const hasVisual = sections.some(
      (s) => s.type === 'gallery' || (s.type === 'product' && s.props.imageUrl) || (s.type === 'hero' && s.props.imageUrl)
    );
    if (!hasVisual) {
      const heroIdx = sections.findIndex((s) => s.type === 'hero');
      const gallerySection = { type: 'gallery', props: { images: productImages } };
      if (heroIdx >= 0) sections.splice(heroIdx + 1, 0, gallerySection);
      else sections.unshift(gallerySection);
    }
  }

  const isDigitalProduct = fallbackProduct?.type === 'digital';
  const eta = country ? LANDING_ETA[country.toUpperCase()] : undefined;
  const productSlug = fallbackProduct?.slug
    || (fallbackProduct?.name
      ? fallbackProduct.name.normalize('NFD').replace(/\p{Diacritic}/gu, '')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
      : undefined);
  const ordered = isDigitalProduct
    ? sections
    : shapeCodSalesPage(sections, {
        productName: fallbackProduct?.name,
        productSlug,
        productPrice: fallbackProduct?.price,
        productDescription: fallbackProduct?.description,
        productImages,
        storeName,
        currency,
        country,
        language,
        eta,
        pageKind,
      });

  const visible = ordered.filter((s) => {
    if (s.type !== 'video') return true;
    const p = s.props;
    return Boolean(p.url || p.posterUrl || p.videoUrl);
  });

  return visible.map((s, i) => ({
    id: generateId(),
    type: s.type,
    order: i,
    props: s.props,
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────
/**
 * Auto-inject a promo banner imagePrompt when the seller has set a
 * compareAtPrice (priceBefore > priceAfter) but the LLM forgot to emit a
 * `bannerPrompt`. The banner is rendered by Ideogram v3 (text specialist)
 * and applied to the CTA section if present, otherwise to the hero. We
 * skip if any section already has a banner — no point duplicating.
 *
 * Why this matters: a "-XX%" sticker on the page is the single biggest
 * conversion lever on COD landings, and asking the LLM to ALWAYS emit it
 * costs a long, fragile prompt rule. Doing it deterministically here is
 * cheaper and more reliable.
 */
function injectPromoBannerIfDiscount(
  sections: Array<{ type: string; props: Record<string, unknown> }>,
  input: FalGenerateInput,
): void {
  const priceBefore = input.priceBefore;
  const priceAfter = input.priceAfter ?? input.product?.price;
  if (typeof priceBefore !== 'number' || typeof priceAfter !== 'number') return;
  if (priceBefore <= priceAfter) return;

  const discountPct = Math.round(((priceBefore - priceAfter) / priceBefore) * 100);
  if (discountPct < 5) return; // sub-5% isn't worth shouting about

  const alreadyHasBanner = sections.some((s) => {
    const p = s.props || {};
    return typeof p.bannerPrompt === 'string' || typeof p.bannerUrl === 'string';
  });
  if (alreadyHasBanner) return;

  const lang = (input.language || 'fr').toLowerCase();
  // Pick the local banner copy so the sticker looks native, not stock.
  const offerWord =
    lang.startsWith('ar') ? 'عرض خاص' :
    lang.startsWith('en') ? 'LIMITED OFFER' :
    'OFFRE LIMITÉE';

  const bannerPrompt =
    `Modern promotional sticker badge reading "-${discountPct}%" in bold sans-serif as the centerpiece, ` +
    `with the smaller text "${offerWord}" arching above it. ` +
    `Vibrant orange and amber gradient background, white text with subtle drop shadow, ` +
    `circular tilted sticker shape, flat 2026 e-commerce design, sharp edges, no realistic photo, ` +
    `transparent surroundings, high contrast for legibility on a product page.`;

  // Prefer cta (best conversion placement); fall back to hero.
  const cta = sections.find((s) => s.type === 'cta');
  const hero = sections.find((s) => s.type === 'hero');
  const target = cta || hero;
  if (!target) return;
  target.props.bannerPrompt = bannerPrompt;
  console.log(`[landing-gen] auto-injected -${discountPct}% promo banner on ${target.type}`);
}

function injectProductImagesFirst(
  sections: Array<{ type: string; props: Record<string, unknown> }>,
  productImages: string[]
): void {
  if (productImages.length === 0) return;
  const productSet = new Set(productImages);

  for (const sec of sections) {
    const p = sec.props;
    if (!p || typeof p !== 'object') continue;

    // Hero & product images are REGENERATED from the real product photo
    // (image-to-image, Nano Banana Edit) — never shown as the raw catalog
    // photo. If the LLM pinned a raw product URL onto imageUrl, clear it so
    // a generation slot is created with that photo as the *reference*.
    if (sec.type === 'hero' || sec.type === 'product') {
      if (typeof p.imageUrl === 'string' && productSet.has(p.imageUrl)) {
        delete p.imageUrl;
      }
      if (typeof p.imagePrompt !== 'string' || !p.imagePrompt.trim()) {
        p.imagePrompt = sec.type === 'hero'
          ? 'someone using the product as the main subject of a wide lifestyle scene, subject off-center, warm daylight'
          : 'the product as a clean premium hero still life on a soft warm backdrop, slightly off-center';
      }
      if (sec.type === 'hero' && !p.layout) p.layout = 'split';
    }

  }
}

/**
 * Fallback image-prompt synthesizer. Runs AFTER injectProductImagesFirst.
 *
 * When the user provided a product image, prompts are REWRITTEN as
 * image-to-image instructions ("place this exact product in […]"). The
 * pipeline routes those to Nano Banana Edit so the output contains the
 * SAME product, in different scenes / styles.
 */
function synthesizeMissingPrompts(
  sections: Array<{ type: string; props: Record<string, unknown> }>,
  product: ProductInput | undefined,
  country: string | undefined,
): void {
  const productName = product?.name || 'product';
  const productDesc = product?.description ? product.description.slice(0, 120) : '';
  const culture = getPhotoCulture(country);
  const subject = `${productName}${productDesc ? ` (${productDesc})` : ''}`;
  // When a product image is available, generation will be img-to-img —
  // wording must reference "this exact product", not describe a new one.
  const hasRef = (product?.images?.filter((u) => typeof u === 'string' && u.length > 0).length || 0) > 0;

  for (const sec of sections) {
    const p = sec.props;
    if (!p || typeof p !== 'object') continue;

    // HERO — sans photo produit, on décrit une scène. Avec photo, les
    // accroches sont posées après cette boucle.
    if (!hasRef && sec.type === 'hero' && !p.imagePrompt && !p.imageUrl) {
      p.imagePrompt = `A person happily using a ${subject} in a bright real-world setting (${culture}), subject off-center on the left third, warm morning daylight`;
      if (!p.layout) p.layout = 'split';
    }

    if (sec.type === 'gallery' && !hasRef) {
      const hasImages = Array.isArray(p.images) && (p.images as unknown[]).filter((u) => typeof u === 'string' && u && !String(u).startsWith('__')).length > 0;
      const hasPrompts = Array.isArray(p.imagePrompts) && (p.imagePrompts as unknown[]).filter((s) => typeof s === 'string' && s).length > 0;
      if (!hasImages && !hasPrompts) {
        const noun = `a ${subject}`;
        p.imagePrompts = [
          `Close-up macro detail of ${noun}, revealing texture and craftsmanship, on a soft warm-toned surface`,
          `${noun} in genuine everyday use within ${culture}, candid framing, warm daylight`,
          `Top-down flat-lay of ${noun} on a linen or marble surface with 3-4 elegant complementary objects, intentional negative space`,
          `${noun} as a curated still life on a wooden shelf with soft props, warm daylight from the side`,
        ];
      }
    }

    if (!hasRef && sec.type === 'product' && !p.imagePrompt && !p.imageUrl) {
      p.imagePrompt = `A ${subject} as a clean hero still life on a soft warm gradient backdrop, subject slightly off-center`;
    }

    // TESTIMONIALS — avatars, NO product reference (these are people)
    if (sec.type === 'testimonials' && Array.isArray(p.items)) {
      (p.items as Array<Record<string, unknown>>).forEach((it, idx) => {
        if (!it.imagePrompt && !it.avatarUrl) {
          const gender = idx % 2 === 0 ? 'woman' : 'man';
          const age = ['28', '34', '42'][idx % 3];
          const heritage = country ? `${country.toUpperCase()} origin` : 'mixed heritage';
          it.imagePrompt = `A warm, friendly ${age} year old ${gender} with ${heritage}, relaxed at home`;
        }
      });
    }
  }

  if (hasRef) stageProductShoot(sections, country);
}

/**
 * Prépare une série de photos du VRAI produit : une scène par bloc,
 * sans texte peint sur l'image. Le modèle part de la photo fournie
 * (catalogue ou lien) et ne change que le décor.
 */
function stageProductShoot(
  sections: Array<{ type: string; props: Record<string, unknown> }>,
  country: string | undefined,
): void {
  const culture = getPhotoCulture(country);
  const heroPrompt = `the product large in the frame, used naturally in a real ${culture} home, warm side daylight, quiet background`;
  const productPrompt = 'the product alone, clean studio photograph on a soft warm backdrop, gentle contact shadow, sharp detail';
  const framePrompts = [
    'a close view of the product material and construction, soft light, nothing else in the frame',
    `the product in everyday use in ${culture}, natural and unposed`,
    'the product in a simple still life with two plain props, warm daylight from the side',
    'a three-quarter view of the product with empty space on one side, soft background',
  ];

  if (!sections.some((s) => s.type === 'gallery')) {
    const heroIdx = sections.findIndex((s) => s.type === 'hero');
    const gallery = { type: 'gallery', props: { imagePrompts: framePrompts } as Record<string, unknown> };
    if (heroIdx >= 0) sections.splice(heroIdx + 1, 0, gallery);
    else sections.unshift(gallery);
  }

  for (const sec of sections) {
    const p = sec.props;
    if (!p) continue;
    if (sec.type === 'hero') {
      delete p.imageUrl;
      delete p.creativeMode;
      p.imagePrompt = heroPrompt;
      if (!p.layout) p.layout = 'split';
    }
    if (sec.type === 'gallery') {
      delete p.images;
      delete p.creativeMode;
      p.imagePrompts = framePrompts;
    }
    if (sec.type === 'product') {
      delete p.imageUrl;
      delete p.gallery;
      delete p.creativeMode;
      p.imagePrompt = productPrompt;
    }
  }
}

/** Optional progress callback for async job tracking. 4 named steps. */
export type PipelineStep = 'analyze' | 'copy' | 'images' | 'assemble';
export type PipelineProgress = (u: { step: PipelineStep; status: 'running' | 'done' | 'failed' }) => void | Promise<void>;

async function runFullPipeline(
  input: FalGenerateInput,
  language: string,
  direction: 'ltr' | 'rtl',
  onProgress?: PipelineProgress
): Promise<FalGenerateResult> {
  const t0 = Date.now();
  const resolvedCategory = resolveLandingCategory(
    input.category,
    input.product?.name,
    input.product?.tags?.join(' '),
  );
  if (resolvedCategory !== input.category) {
    input = { ...input, category: resolvedCategory };
  }
  console.log(`[landing-gen] start kind=${input.pageKind} country=${input.country} lang=${language} category=${input.category || '-'} llm=${LLM_MODEL}`);
  const tick = async (step: PipelineStep, status: 'running' | 'done' | 'failed') => {
    if (onProgress) {
      try { await onProgress({ step, status }); } catch { /* progress errors must not block the pipeline */ }
    }
  };

  // STEP 0 — multimodal: caption product images so the LLM can "see" what's on
  // the photo (fal any-llm doesn't accept image input, so we use Florence-2
  // as a vision-to-text bridge).
  await tick('analyze', 'running');
  const productImagesForCaptioning = input.product?.images?.filter((u) => typeof u === 'string' && u.length > 0) || [];
  if (productImagesForCaptioning.length > 0 && !input.imageCaption) {
    try {
      const merged = await captionProductImages(productImagesForCaptioning);
      if (merged) {
        input = { ...input, imageCaption: merged };
        console.log(`[landing-gen] product captioning ok (${merged.length} chars across ${productImagesForCaptioning.length} img)`);
      }
    } catch (err) {
      console.warn('[landing-gen] product captioning failed (non-fatal):', (err as Error).message);
    }
  }
  await tick('analyze', 'done');

  // STEP 1 — strategic LLM
  await tick('copy', 'running');
  const prompt = buildPrompt(input, language, direction);
  let raw: string;
  try {
    raw = await runLLM(prompt);
  } catch (err) {
    console.error('[landing-gen] LLM failed:', (err as Error).message);
    throw err;
  }
  const t1 = Date.now();
  console.log(`[landing-gen] LLM ok in ${t1 - t0}ms (${raw.length} chars)`);

  let parsed: RawAiResult;
  try {
    parsed = parseLLMJson(raw);
  } catch (err) {
    console.error('[landing-gen] JSON parse failed. First 400 chars of LLM output:\n', raw.slice(0, 400));
    throw err;
  }
  console.log(`[landing-gen] parsed sections: ${parsed.sections?.length ?? 0}`);
  await tick('copy', 'done');

  const productImages = input.product?.images?.filter((u) => typeof u === 'string' && u.length > 0) || [];

  // Whitelist + replace product placeholders + drop bad sections
  const sections = (parsed.sections || [])
    .filter((s) => s && typeof s.type === 'string' && ALLOWED_TYPES.has(s.type as string))
    .map((s) => ({
      type: s.type as string,
      props: resolveProductPlaceholders((s.props && typeof s.props === 'object') ? s.props : {}, productImages) as Record<string, unknown>,
    }));

  const allowDiscount =
    typeof input.priceBefore === 'number' &&
    typeof input.priceAfter === 'number' &&
    input.priceBefore > input.priceAfter;
  const factualSections = lockLandingSections(sections, {
    productName: input.product?.name,
    allowDiscount,
  });

  // Inject the user's real product images FIRST (priority over AI generation),
  // then synthesize prompts only for slots that are still empty.
  injectProductImagesFirst(factualSections, productImages);
  synthesizeMissingPrompts(factualSections, input.product, input.country);
  injectPromoBannerIfDiscount(factualSections, input);

  // STEP 2 — image generation (parallel) — gated by env
  await tick('images', 'running');
  const imagesEnabled = (process.env.LANDING_AI_IMAGES_ENABLED || 'true').toLowerCase() !== 'false';
  let imagesGenerated = 0;
  if (imagesEnabled) {
    const productImageRef = productImages[0];
    const slots = collectImageSlots(factualSections, productImages);
    const refCount = slots.filter((s) => s.referenceImage).length;
    console.log(`[landing-gen] image slots collected: ${slots.length} (${refCount} with product reference for img2img)`);
    if (slots.length > 0) {
      const t2 = Date.now();
      // Contexte partagé pour tous les slots : catégorie détectée + présence
      // d'un produit référence (drive le warn `expectsProductReference`).
      const genCtx = {
        productCategory: detectProductCategory(input),
        productExists: !!productImageRef,
      };
      const inputs = await Promise.all(slots.map((s) => buildImageGenInput(s, genCtx)));
      const results = await generateImagesParallel(inputs);

      // Persist generated images to our own storage (fal.media URLs expire in ~24h).
      // We do this in parallel too — each slot independently.
      const persistedUrls = await Promise.all(
        results.map(async (res, i) => {
          if (!res?.url) return null;
          try {
            const folder = `ai-landing/${slots[i].kind}`;
            return await persistRemoteImage(res.url, folder);
          } catch (err) {
            console.warn(`[landing-gen] persist failed for slot #${i} (${slots[i].kind}):`, (err as Error).message);
            // Fall back to the volatile fal URL — at least the page works for 24h
            return res.url;
          }
        })
      );

      persistedUrls.forEach((url, i) => {
        if (url) {
          slots[i].apply(url);
          imagesGenerated++;
        } else {
          console.warn(`[landing-gen] image slot #${i} (${slots[i].kind}) returned null. prompt: "${slots[i].prompt.slice(0, 80)}"`);
        }
      });
      console.log(`[landing-gen] images: ${imagesGenerated}/${slots.length} ok+persisted in ${Date.now() - t2}ms`);
    }
  } else {
    console.log('[landing-gen] image generation disabled via env');
  }
  await tick('images', 'done');

  // STEP 3 — finalize / inject fallbacks
  await tick('assemble', 'running');
  const finalSections = finalize(factualSections, input.product, input.currency, input.country, language, input.pageKind, input.storeName);
  const seo = lockSeo(parsed.seoTitle, parsed.seoDescription, input.product?.name);
  console.log(`[landing-gen] done in ${Date.now() - t0}ms — ${finalSections.length} sections, ${imagesGenerated} images`);
  await tick('assemble', 'done');

  return {
    sections: finalSections,
    seoTitle: seo.seoTitle,
    seoDescription: seo.seoDescription,
    imageCaption: input.imageCaption,
    language,
    direction,
    currency: input.currency,
    country: input.country,
    dialect: getDialect(input.country, language) || undefined,
    imagesGenerated,
  };
}

export async function generateLandingFromProduct(
  storeName: string,
  product: ProductInput,
  tone?: 'professional' | 'friendly' | 'minimal',
  context?: GenerationContext,
  onProgress?: PipelineProgress
): Promise<FalGenerateResult> {
  const language = deriveLanguage(context?.language, context?.country);
  const direction = deriveDirection(language);
  return runFullPipeline({ storeName, product, tone, ...context, language }, language, direction, onProgress);
}

export async function generateLandingFromImage(
  storeName: string,
  imageUrl: string,
  product?: ProductInput,
  tone?: 'professional' | 'friendly' | 'minimal',
  context?: GenerationContext,
  onProgress?: PipelineProgress
): Promise<FalGenerateResult> {
  const caption = await captionImage(imageUrl);
  const language = deriveLanguage(context?.language, context?.country);
  const direction = deriveDirection(language);
  const result = await runFullPipeline(
    { storeName, product, imageCaption: caption, imageUrl, tone, ...context, language },
    language,
    direction,
    onProgress
  );
  return { ...result, imageCaption: caption };
}
