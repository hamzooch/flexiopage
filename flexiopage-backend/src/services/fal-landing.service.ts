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
 *   - FAL_LLM_MODEL            default 'anthropic/claude-3-5-sonnet'
 *   - FAL_IMAGE_MODEL          default 'fal-ai/flux/schnell'
 *   - FAL_AVATAR_MODEL         default same as FAL_IMAGE_MODEL
 *   - LANDING_AI_IMAGES_ENABLED  default 'true' — set to 'false' to skip step 2
 */
import path from 'path';
import fs from 'fs/promises';
import type { TemplateSection } from '../data/landing-templates';
import {
  generateImagesParallel,
  getHeroModel,
  getGalleryModel,
  getAvatarModel,
  getBannerModel,
  isBannerPrompt,
  type ImageGenInput,
} from './image-generation.service';
import { persistRemoteImage } from './storage.service';

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
  TN: `Tunisian Derja (تونسي). MUST sound like a Tunisian on Facebook, NOT MSA / Fusha.
Examples of expected vocabulary:
  - "بَرشة" (beaucoup), "ياسر" (énormément), "نَجم" (peux), "نحب" (j'aime / je veux)
  - "تَوّا" (maintenant), "مَالا" (alors), "أهَكّا" (c'est ça), "زادة" (aussi)
  - "إنتي / إنتا" (tu f./m.), "أحنا" (nous)
French loanwords integrated naturally: "famille", "qualité", "promotion", "livraison", "stock", "garantie".
Mix typical: "إكتشف الـ produit الجديد متاعنا، بَرشة عائلات تونسية thqou فيه".
NEVER use Fusha conjugations like "اشترِ" — say "اشري" / "إكتشف".`,

  MA: `Moroccan Darija (دارجة). MUST sound like a Moroccan on Facebook, NOT MSA.
Examples:
  - "بزّاف" (beaucoup), "غادي" (futur), "بغيت" (je veux), "كنحبّ" (j'aime)
  - "دابا" (maintenant), "هاد" (ce/cette), "ديال" (de), "نتا / نتي"
French/Spanish loanwords: "qualité", "livraison", "promotion", "ofertas".
Example: "هاد المنتج راه ديال الجودة، الأسعار خاصها تكون في متناولك".
Avoid Fusha — write the way Moroccans actually message each other.`,

  DZ: `Algerian Darija (دزيري) — also called "Derja". MUST sound exactly like an Algerian friend on Facebook / WhatsApp. NEVER use Modern Standard Arabic (Fusha / فصحى).
Mandatory dialect markers:
  - "بزاف" (beaucoup), "ياسر" (énormément), "راني" (je suis en train de), "راكي / راك" (tu es)
  - "كاش" (du/de la), "ندير" (faire), "نحوس" (chercher), "هاكا" (comme ça)
  - "وقتاه" (quand), "علاش" (pourquoi), "كيفاش" (comment), "ديالك" (à toi)
  - "نتا / نتي" (tu m./f.), "حنا" (nous)
Heavy French loanwords are NORMAL and EXPECTED: "qualité", "livraison gratuite", "promo", "garantie", "service", "stock", "famille", "maison", "cadeau".
Mix freely: "هاد ال produit راه original، توصلك lvr في 48 ساعة، promo limitée!"
Local cues: Alger, Oran, Constantine, Ramadan, école, dimanche.
ANTI-EXAMPLE (do NOT do this): "اكتشف منتجنا الجديد بأعلى جودة" — too Fusha.
GOOD EXAMPLE: "إكتشف الـ produit الجديد متاعنا، rapport qualité-prix رهيب، بزاف ناس عجبهم".`,

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

function getDialect(country?: string, language?: string): string {
  if (!country) {
    if (language === 'ar') return 'Modern Standard Arabic (فصحى) — neutral pan-Arab tone.';
    return '';
  }
  const code = country.toUpperCase();
  return DIALECT_MAP[code] || (isArabCountry(code) ? 'Modern Standard Arabic (فصحى).' : '');
}

function getPhotoCulture(country?: string): string {
  if (!country) return 'modern, warm natural light, lifestyle photography';
  return PHOTO_CULTURE[country.toUpperCase()] || 'modern, warm natural light, lifestyle photography';
}

const LANGUAGE_LABEL: Record<string, string> = {
  ar: 'Arabic (العربية)',
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
export async function resolveImageForFal(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) return imageUrl;
  let url: URL;
  try { url = new URL(imageUrl); } catch { return imageUrl; }
  const isLocal =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '0.0.0.0' ||
    url.hostname.endsWith('.local');
  if (!isLocal) return imageUrl;
  const publicPrefix = (process.env.PUBLIC_URL_PREFIX || '/uploads').replace(/\/+$/, '');
  if (!url.pathname.startsWith(publicPrefix + '/')) return imageUrl;
  const relKey = url.pathname.slice(publicPrefix.length + 1);
  const uploadRoot = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadRoot, relKey);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(uploadRoot))) return imageUrl;
  const buf = await fs.readFile(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export interface ProductInput {
  name: string;
  description?: string;
  price?: number;
  type?: 'physical' | 'digital';
  images?: string[];
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
    const res = await fetch(`${FAL_BASE}/${model}`, {
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

const LLM_MODEL = process.env.FAL_LLM_MODEL || 'anthropic/claude-sonnet-4.5';

/**
 * Run the strategic LLM through fal's queue endpoint. Claude Sonnet 4.5
 * by default — much better than Gemini Flash at dialect copy and large
 * JSON outputs.
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
async function falQueueRequest<T>(
  model: string,
  input: Record<string, unknown>,
  options: { maxWaitMs?: number; pollIntervalMs?: number } = {},
): Promise<T> {
  const key = getFalKey();
  const maxWaitMs = options.maxWaitMs ?? 300_000;        // 5 min cap
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const submitUrl = `https://queue.fal.run/${model}`;

  // 1. Submit
  const submit = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${key}`,
    },
    body: JSON.stringify(input),
  });
  if (!submit.ok) {
    const text = await submit.text();
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
    const st = await fetch(queued.status_url, {
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
  const out = await fetch(queued.response_url, {
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
// PROMPT v2 — dialect-precise + image prompt slots
// ─────────────────────────────────────────────────────────────────────
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
  const audienceLines = [
    `Output language: ${langLabel}.`,
    dialect ? `Dialect & cultural register (MANDATORY — do not write in MSA / Fusha):\n${dialect}` : '',
    country ? `Target market: ${country}.` : '',
    category ? `Niche: ${category}.` : '',
    `Direction: ${direction}.`,
  ].filter(Boolean).join('\n');

  const productImagesProvided = (product?.images?.length || 0) > 0;

  const sectionsSchema = `
Return between 9 and 14 sections in this preferred order: hero, features, steps, stats, gallery, product, brands, testimonials, video, pricing, cod-form, faq, cta, footer.

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

- "stats" props: { "title"?, "items": [{ "value", "label" }] } — 3–4 believable numbers.

- "gallery" props: { "title"?, "subtitle"?, "imagePrompts": ["scene 1", "scene 2", "scene 3", "scene 4"] }
  4 short ENGLISH prompts for varied lifestyle/usage shots in the local culture. The pipeline turns them into images.

- "product" props: {
    "name", "tagline", "priceBefore"?, "priceAfter"?, "currency"?, "discountPct"?,
    "highlights": [4–6 short bullets, 4–8 words each],
    "ctaText", "trustBadges"?: [...] (e.g. "دفع عند الاستلام", "شحن مجاني" for AR markets),
    "rating"?: 4.7, "reviewCount"?: 1240,
    "imagePrompt": "scene only — the product as a clean premium hero still life on a soft warm backdrop, slightly off-center"${productImagesProvided ? ',\n    "gallery": ["__PRODUCT_IMAGE_0__", "__PRODUCT_IMAGE_1__", ...]' : ''}
  }
  ${productImagesProvided ? 'IMPORTANT: a product photo is provided — DO NOT set product.imageUrl. Always write a scene-only "imagePrompt": the pipeline regenerates the main product shot from the real photo (image-to-image) so it shows the SAME product in a premium styled scene. The raw photos only feed the small "gallery" thumbnail strip.' : ''}

- "brands" props: { "title"?, "items": [{ "name" }] } — 4–6 plausible local media outlet names.

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

  const productPageRules = pageKind === 'product'
    ? '\nThis is a PRODUCT detail page. Order: hero (split, with product image) → product → gallery → features → stats → testimonials → cod-form → faq → cta → footer.\n⚠️ MANDATORY: every output MUST contain exactly one "cod-form" section, placed right after testimonials. Omitting it = invalid output. The cod-form productSlug should match the product on this page.'
    : '\nThis is a LANDING page for a single offer. Order: hero → features → stats → gallery → product → testimonials → brands → cod-form → faq → cta → footer.\n⚠️ MANDATORY: every output MUST contain exactly one "cod-form" section, placed before the faq. Omitting it = invalid output (the page has no conversion point).';

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
5. Before writing, mentally answer: "What is this object?" → write that answer in 2-3 words → that's your product category. Use it consistently.`
    : '';

  // ──────── Arabic few-shots (only injected when targeting Arab market) ────────
  // Real ad-creative copy patterns. The LLM is told to MIMIC the structure and
  // tone, NOT copy the words. This is the single biggest quality lever for
  // dialect-correct, conversion-focused Arabic copy.
  const arabFewShots = isArabicDialect ? `
# 📝 Few-shot: voici comment écrit un bon copywriter dropshipping arabe (style à imiter, PAS à copier)

Hero (Algérie, Darija):
  title: "اللي كاينة في الديار توصلكم في 48 ساعة"
  subtitle: "اكتشف الـ produit اللي عجب بزاف ناس في الجزائر — qualité ممتازة و livraison gratuite حتى الباب."
  ctaText: "اطلب دروك (paiement à la livraison)"

Hero (Tunisie, Derja):
  title: "العرض اللي ينتظرو الكل، توا متاعك."
  subtitle: "بَرشة عائلات تونسية تستعمل الـ produit هذا. توصلك ل dar في 48 ساعة، قابل للtester قبل ما تخلص."
  ctaText: "اطلب توا · livraison gratuite"

Features item (Maroc, Darija):
  title: "جودة كتعمر"
  description: "Matériaux ديال الجودة، خدامة ل سنين. هاد الـ produit راه فيه garantie سنة كاملة."

Testimonial (Saoudi, Khaliji):
  quote: "صراحة فاجأني المنتج، الجودة ممتازة وأنا أمي اشتري له صديقاتي بعد ما شفته."
  author: "نورة الشمري"
  role: "ربة بيت — الرياض"

CTA section (Égypte, Masri):
  title: "اطلبه دلوقتي قبل ما يخلص!"
  subtitle: "آخر 50 قطعة في المخزون — الدفع عند الاستلام والشحن مجاني لكل المحافظات."
  buttonText: "اطلب دلوقتي"
  urgency: "عرض محدود · ينتهي قريب"

FAQ (Algérie, Darija):
  question: "كيفاش ندفع؟"
  answer: "تقدر تدفع cash à la livraison ملي يوصلك الكولي للديار، ولا par carte بان كاش transaction sécurisée."

# 🚫 ANTI-PATTERNS — ne JAMAIS écrire comme ça (trop Fusha / trop générique):
  ❌ "اشترِ الآن منتجنا الفاخر بأعلى جودة"  (verbe-initial classique, "الآن", "الفاخر")
  ❌ "احصل على أفضل المنتجات"               (forme impérative MSA "احصل على")
  ❌ "نحن نقدم لكم أرقى الخدمات"            (formel, vide, pas de spécifique)
  ❌ "اكتشف عالم الجمال مع منتجاتنا"        (cliché publicitaire, aucune sensation)

# ✅ PRINCIPES de copy (à appliquer dans CHAQUE section):
  - PARLE comme sur Facebook/WhatsApp, pas comme un journal de presse
  - 2ème personne directe ("إنتي", "نتا", "إنت") — JAMAIS de "نحن نقدم"
  - SPÉCIFIQUE: prix, durée (48h, 7 jours), nombres (1500 client), bénéfice concret
  - SENSORIEL: décris la sensation/usage, pas l'abstraction
  - URGENCE crédible: "آخر X قطعة", "ينتهي السبت", PAS "اشتري بسرعة"
  - Mots français intégrés QUAND la dialect_map le permet (Maghreb surtout)
  - Questions rhétoriques OK pour le hero/cta — donne du rythme conversationnel
` : '';

  return `You are a senior conversion copywriter and dropshipping landing-page strategist. You write copy that sells — specific, sensory, culturally native — in the EXACT dialect of the target country. You output ONE valid JSON object only.

# Brand
Store: ${storeName}
Tone: ${tone}

# Audience
${audienceLines}

# Page kind
${pageKind}${productPageRules}

# Product
${productBlock}
${priceLines ? `\n# Pricing\n${priceLines}` : ''}${imageBlock}
${arabFewShots}
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
- ALL human-readable copy in ${langLabel}${dialect ? ` (dialect: ${dialect.split(/[.\n]/)[0]})` : ''}.${arabHint}
${isArabicDialect ? `- DIALECT IS NON-NEGOTIABLE. Re-read the dialect block above before writing each section. After drafting, scan your output for any Fusha forms (e.g. "اشترِ", "احصل على", "الذي", verb-initial sentences with classical conjugation) and REWRITE them in ${country?.toUpperCase() || 'the target'} dialect with the markers listed.\n- French loanwords are encouraged where the dialect block lists them — DO NOT translate them to Arabic equivalents.` : ''}
- ALL "imagePrompt" / "imagePrompts" fields stay in ENGLISH (image model needs English).
- 9 to 13 sections. Start with "hero", end with "footer". Always include "cta" near the end.
- NEVER invent a filename or URL. The ONLY allowed values for "imageUrl", "posterUrl", "avatarUrl", "images", "gallery" are: an http(s):// URL we already gave you, OR the literal placeholder "__PRODUCT_IMAGE_N__". For every other case, OMIT the field entirely and use "imagePrompt" / "imagePrompts" instead.
${hasDiscount ? `- Mention savings (-${discountPct}%) and strikethrough ${fmt(priceBefore)} → ${fmt(priceAfter)} in hero AND cta.` : ''}
- Specificity > generic. Every benefit concrete. No filler ("amazing", "the best") without proof.
- Testimonial author names native to ${country || 'the target country'}.
- For Arab markets, default trust badges & FAQ should address: cash on delivery (الدفع عند الاستلام), free shipping (شحن مجاني), 7-day returns, original product authenticity.`;
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
  'hero','features','stats','gallery','product','products','brands','video','pricing','testimonials','steps','cta','faq','footer',
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
  kind: 'hero' | 'gallery' | 'product' | 'avatar' | 'video' | 'banner' | 'generic';
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
  productImage?: string
): ImageSlot[] {
  const slots: ImageSlot[] = [];

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
      // Detect "banner-style" prompts even when emitted under imagePrompt.
      // These prompts ask for legible text → route to Ideogram, no reference.
      const isBanner = isBannerPrompt(prompt);
      const kind: ImageSlot['kind'] =
        isBanner ? 'banner' :
        sec.type === 'hero' ? 'hero' :
        sec.type === 'video' ? 'video' :
        sec.type === 'product' ? 'product' : 'generic';
      const useRef = !isBanner && productImage && (kind === 'hero' || kind === 'product' || kind === 'generic');
      slots.push({
        prompt,
        kind,
        referenceImage: useRef ? productImage : undefined,
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
      prompts.forEach((prompt, idx) => {
        slots.push({
          prompt,
          kind: 'gallery',
          referenceImage: productImage,
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
  generic: 'square',
};

/**
 * Pick the model to use for a given slot kind. Each kind has a configurable
 * default in the image-generation service (env-overridable).
 *   hero    → FLUX pro 1.1
 *   gallery → FLUX schnell
 *   avatar  → FLUX realism
 *   banner  → Ideogram v3 (text-in-image specialist)
 *   product / video / generic → gallery default
 */
function modelForKind(kind: ImageSlot['kind']): string | undefined {
  switch (kind) {
    case 'hero':    return getHeroModel();
    case 'gallery': return getGalleryModel();
    case 'avatar':  return getAvatarModel();
    case 'banner':  return getBannerModel();
    case 'product':
    case 'video':
    case 'generic':
    default:
      return getGalleryModel();
  }
}

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
  'no text, no typography, no logos, no watermark, no UI elements, no borders';

/** Portrait style for testimonial avatars — real people, not products. */
const PORTRAIT_STYLE =
  ', natural candid headshot, soft window light, warm neutral out-of-focus background, ' +
  'authentic genuine smile, sharp catchlight in the eyes, subtle film grain, editorial portrait photography, ' +
  '85mm lens, shallow depth of field, ultra detailed, 4k, no text, no logos, no watermark';

async function buildImageGenInput(slot: ImageSlot): Promise<ImageGenInput> {
  const aspect = ASPECT_FOR_KIND[slot.kind];

  // Banner prompts ASK for legible text in the image — leave them untouched.
  // Every other slot gets the shared house style so the whole page is one
  // coherent shoot; avatars get the people-specific portrait style instead.
  const isBanner = slot.kind === 'banner';
  const isAvatar = slot.kind === 'avatar';
  const cleanScene = slot.prompt.trim().replace(/[.,;\s]+$/, '');
  let finalPrompt = isBanner
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

  // Nano Banana Edit fidelity guard. When we hand it a reference photo we
  // want it to PLACE THE SAME PRODUCT in a new scene — not invent a similar
  // object. The model honours strong, explicit identity locks at the very
  // start of the prompt much better than vague "based on this product"
  // wording, so we prepend a fixed lock when a reference is attached.
  const model = modelForKind(slot.kind) || '';
  const isNanoBananaEdit = /nano-banana/i.test(model) && referenceImages && referenceImages.length > 0;
  if (isNanoBananaEdit) {
    const fidelityLock =
      'Use the product from the reference image EXACTLY — keep its real shape, color, material, branding, hardware and proportions identical to the reference. Do NOT change the product, do NOT invent a new variant. Compose a NEW scene around this same product. Scene: ';
    finalPrompt = fidelityLock + finalPrompt;
  }

  // Negative prompts only apply to FLUX-class models. Banners want text in
  // the image so we MUST NOT add "text, watermark, logo" to the negative.
  const negativePrompt = isBanner
    ? 'blurry, lowres, distorted, deformed'
    : 'text, watermark, logo, deformed, blurry, lowres, ugly, extra fingers, distorted face';

  return {
    prompt: finalPrompt,
    aspect,
    model: modelForKind(slot.kind),
    negativePrompt,
    referenceImages,
  };
}

/**
 * Cleanup pass: prune internal fields, resolve gallery placeholders,
 * fall back to product images when AI didn't generate any.
 */
function finalize(
  sections: Array<{ type: string; props: Record<string, unknown> }>,
  fallbackProduct?: ProductInput,
  currency?: string
): TemplateSection[] {
  const productImages = fallbackProduct?.images?.filter((u) => typeof u === 'string' && u.length > 0) || [];
  const firstImage = productImages[0];

  for (const sec of sections) {
    const p = sec.props;
    // Strip imagePrompt-style fields from the final output (already consumed)
    delete p.imagePrompt;
    delete p.imagePrompts;
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
      if (!Array.isArray(p.gallery) && productImages.length > 0) p.gallery = productImages;
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

  // ── Enforce: every physical-product landing MUST have a cod-form ────
  // Digital products skip COD entirely (instant download = no delivery).
  // For everything else we ensure exactly one cod-form is present with
  // a minimal 3-field shape — nom complet + téléphone + adresse — so the
  // seller can convert directly from the landing without any extra steps.
  const isDigitalProduct = fallbackProduct?.type === 'digital';
  if (!isDigitalProduct) {
    const hasCodForm = sections.some((s) => s.type === 'cod-form');
    if (!hasCodForm) {
      const productSlug = fallbackProduct?.name
        ? fallbackProduct.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
        : undefined;
      const codFormSection = {
        type: 'cod-form',
        props: {
          title: 'Commandez maintenant',
          subtitle: 'Remplis tes coordonnées — on te rappelle pour confirmer, puis on livre. Pas d\'acompte, paiement à la livraison.',
          submitLabel: 'Confirmer ma commande',
          reassurance: 'Paiement uniquement à la réception · Livraison rapide',
          productSlug,
          // Minimal-friction defaults: 3 essential fields only
          showEmail: false,
          requireEmail: false,
          showPostalCode: false,
          showState: false,
          showNotes: false,
          showQuantity: true,
        } as Record<string, unknown>,
      };
      // Prefer to insert just before the FAQ; otherwise before footer; otherwise at end.
      const faqIdx = sections.findIndex((s) => s.type === 'faq');
      const footerIdx = sections.findIndex((s) => s.type === 'footer');
      let insertAt: number;
      if (faqIdx >= 0) insertAt = faqIdx;
      else if (footerIdx >= 0) insertAt = footerIdx;
      else insertAt = sections.length;
      sections.splice(insertAt, 0, codFormSection);
      console.log('[landing-gen] auto-injected cod-form section (LLM skipped it)');
    } else {
      // The LLM did emit a cod-form — strip the optional clutter fields so
      // the rendered form stays focused on nom/téléphone/adresse and
      // mirrors the seller's expectation.
      for (const sec of sections) {
        if (sec.type === 'cod-form') {
          const p = sec.props as Record<string, unknown>;
          if (p.showEmail === undefined) p.showEmail = false;
          if (p.showNotes === undefined) p.showNotes = false;
        }
      }
    }
  }

  return sections.map((s, i) => ({
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
 * Pre-fill ONLY the product detail section with the raw product image (it
 * shows the unaltered photo). Hero / gallery slots are intentionally left
 * empty so the pipeline generates AI VARIANTS of the same product via
 * image-to-image (Nano Banana Edit) — placing the product into lifestyle
 * scenes, studio shots, flatlays, etc.
 */

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

    // The raw uploaded photos still feed the product section's thumbnail strip.
    if (sec.type === 'product') {
      const existing = Array.isArray(p.gallery)
        ? (p.gallery as unknown[]).filter((u) => typeof u === 'string' && u) as string[]
        : [];
      if (existing.length === 0) p.gallery = productImages;
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
  country: string | undefined
): void {
  const productName = product?.name || 'product';
  const productDesc = product?.description ? product.description.slice(0, 120) : '';
  const culture = getPhotoCulture(country);
  const subject = `${productName}${productDesc ? ` (${productDesc})` : ''}`;
  // When a product image is available, generation will be img-to-img —
  // wording must reference "this exact product", not describe a new one.
  const hasRef = (product?.images?.filter((u) => typeof u === 'string' && u.length > 0).length || 0) > 0;
  const productPhrase = hasRef ? 'the exact product shown in the reference image' : `a ${subject}`;

  for (const sec of sections) {
    const p = sec.props;
    if (!p || typeof p !== 'object') continue;

    // Fallback prompts describe the SCENE ONLY — the pipeline appends the
    // shared house photography style (HOUSE_STYLE), so every fallback image
    // lands in the same coherent, premium world. The reference-image variants
    // tell Nano Banana Edit to keep the exact product.
    const refLock = hasRef
      ? `the exact product from the reference image, kept visually identical (same shape, color, material, branding)`
      : '';

    // HERO — wide lifestyle scene featuring the product
    if (sec.type === 'hero' && !p.imagePrompt && !p.imageUrl) {
      p.imagePrompt = hasRef
        ? `A person happily using ${refLock} as the main subject of a wide lifestyle scene set in ${culture}, subject off-center on the left third, warm morning daylight`
        : `A person happily using a ${subject} in a bright real-world setting (${culture}), subject off-center on the left third, warm morning daylight`;
      if (!p.layout) p.layout = 'split';
    }

    // GALLERY — 4 distinct angles, all in the SAME warm-daylight world
    if (sec.type === 'gallery') {
      const hasImages = Array.isArray(p.images) && (p.images as unknown[]).filter((u) => typeof u === 'string' && u).length > 0;
      const hasPrompts = Array.isArray(p.imagePrompts) && (p.imagePrompts as unknown[]).filter((s) => typeof s === 'string' && s).length > 0;
      if (!hasImages && !hasPrompts) {
        const noun = hasRef ? refLock : `a ${subject}`;
        p.imagePrompts = [
          `Close-up macro detail of ${noun}, revealing texture and craftsmanship, on a soft warm-toned surface`,
          `${noun} in genuine everyday use within ${culture}, candid framing, warm daylight`,
          `Top-down flat-lay of ${noun} on a linen or marble surface with 3-4 elegant complementary objects, intentional negative space`,
          `${noun} as a curated still life on a wooden shelf with soft props, warm daylight from the side`,
        ];
      }
    }

    // PRODUCT (rare path: only when injectProductImagesFirst didn't run)
    if (sec.type === 'product' && !p.imagePrompt && !p.imageUrl) {
      p.imagePrompt = hasRef
        ? `${refLock} as a clean hero still life on a soft warm gradient backdrop, subject slightly off-center`
        : `A ${subject} as a clean hero still life on a soft warm gradient backdrop, subject slightly off-center`;
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
  console.log(`[landing-gen] start kind=${input.pageKind} country=${input.country} lang=${language} llm=${LLM_MODEL}`);
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

  // Inject the user's real product images FIRST (priority over AI generation),
  // then synthesize prompts only for slots that are still empty.
  injectProductImagesFirst(sections, productImages);
  synthesizeMissingPrompts(sections, input.product, input.country);
  injectPromoBannerIfDiscount(sections, input);

  // STEP 2 — image generation (parallel) — gated by env
  await tick('images', 'running');
  const imagesEnabled = (process.env.LANDING_AI_IMAGES_ENABLED || 'true').toLowerCase() !== 'false';
  let imagesGenerated = 0;
  if (imagesEnabled) {
    const productImageRef = productImages[0];
    const slots = collectImageSlots(sections, productImageRef);
    const refCount = slots.filter((s) => s.referenceImage).length;
    console.log(`[landing-gen] image slots collected: ${slots.length} (${refCount} with product reference for img2img)`);
    if (slots.length > 0) {
      const t2 = Date.now();
      const inputs = await Promise.all(slots.map(buildImageGenInput));
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
  const finalSections = finalize(sections, input.product, input.currency);
  console.log(`[landing-gen] done in ${Date.now() - t0}ms — ${finalSections.length} sections, ${imagesGenerated} images`);
  await tick('assemble', 'done');

  return {
    sections: finalSections,
    seoTitle: parsed.seoTitle,
    seoDescription: parsed.seoDescription,
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
