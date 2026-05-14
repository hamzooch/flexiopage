/**
 * Landing-page-as-image generator (TryAd-style, a notch better).
 *
 * Produces a single tall 9:16 mockup of a complete, production-ready
 * ecommerce landing page — HERO, PRODUCT DETAILS & BENEFITS, AUTHORITY &
 * SOCIAL PROOF, FINAL OFFER — rendered entirely by an image model.
 *
 * Pipeline:
 *   1. LLM (Claude via FAL any-llm) — writes the REAL copy in the target
 *      language (headline, benefits, testimonials, CTA). TryAd lets the
 *      image model hallucinate the text; we feed it intentional, on-brand
 *      copy so the words are deliberate and the product details are right.
 *   2. Image model (Nano Banana, 9:16) — composes the full designed page
 *      with that copy baked in, plus the seller's product photo as a
 *      reference so the REAL product appears (not an invented one).
 *
 * Cost: charged through the existing AI wallet bucket as a `landing`.
 */
import { runLLM } from './fal-landing.service';
import { generateImage } from './image-generation.service';

const LANDING_IMAGE_MODEL = process.env.FAL_LANDING_IMAGE_MODEL || 'fal-ai/nano-banana';

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

const LANG_NAME: Record<string, string> = {
  ar: 'Arabic (Tunisian Derja script)',
  fr: 'French',
  en: 'English',
};

export interface LandingImageInput {
  storeName: string;
  product: {
    name: string;
    category?: string;
    description?: string;
    images?: string[];
    price?: number;
    compareAtPrice?: number;
  };
  language?: string;
  country?: string;
  currency?: string;
}

/** Structured copy the LLM writes, then we bake into the image prompt. */
interface LandingCopy {
  headline: string;
  subheadline?: string;
  reassurance: string[];          // ["توصيل بلاش", "الدفع عند الاستلام"]
  benefits: Array<{ title: string; body: string }>;
  socialProof: string;            // 1 short trust line
  testimonials: Array<{ quote: string; author: string }>;
  cta: string;                    // "اطلب الآن"
  ctaReassurance: string;         // "ضمان الجودة"
}

export interface LandingImageResult {
  imageUrl: string;
  width: number;
  height: number;
  copy: LandingCopy;
}

function safeJsonExtract<T>(raw: string): T | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(trimmed) as T; } catch {}
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]) as T; } catch {}
  }
  return null;
}

/** Step 1 — write the real landing copy in the target language. */
function buildCopyPrompt(input: LandingImageInput): string {
  const lang = (input.language || 'fr').toLowerCase().split('-')[0];
  const langName = LANG_NAME[lang] || input.language || 'French';
  const currency = input.currency || 'TND';
  const country = input.country || 'TN';
  const p = input.product;

  return `You are a conversion-focused ecommerce copywriter for the ${country} market.
Write the copy for a high-converting landing page, in ${langName}.

PRODUCT
- Name: ${p.name}
- Category: ${p.category || 'general'}
${p.description ? `- Description: ${p.description}\n` : ''}${p.price != null ? `- Price: ${p.price} ${currency}\n` : ''}${p.compareAtPrice != null ? `- Old price: ${p.compareAtPrice} ${currency}\n` : ''}

Return JSON ONLY (no markdown), exactly this shape:
{
  "headline": "punchy emotional hook, 5-9 words, in ${langName}",
  "subheadline": "optional one-line support, 8-14 words",
  "reassurance": ["free delivery phrase", "cash on delivery phrase"],
  "benefits": [
    { "title": "short 2-4 words", "body": "1 sentence, 8-14 words" },
    { "title": "short 2-4 words", "body": "1 sentence, 8-14 words" },
    { "title": "short 2-4 words", "body": "1 sentence, 8-14 words" },
    { "title": "short 2-4 words", "body": "1 sentence, 8-14 words" }
  ],
  "socialProof": "one short trust line, e.g. local handcrafted service",
  "testimonials": [
    { "quote": "1 sentence customer review, 12-18 words", "author": "First name M. - City, ${country}" },
    { "quote": "different 1 sentence review", "author": "First name M. - City, ${country}" }
  ],
  "cta": "2-3 word call to action, e.g. Order Now",
  "ctaReassurance": "2-3 word quality guarantee phrase"
}

RULES
- EVERY string must be written in ${langName} (not English), except keep it natural for ${country}.
- Tone: direct, punchy, mobile ad style.
- No markdown, no explanation — JSON only.`;
}

/** Step 2 — the design-director prompt for the image model, copy baked in. */
function buildImagePrompt(input: LandingImageInput, copy: LandingCopy): string {
  const lang = (input.language || 'fr').toLowerCase().split('-')[0];
  const langName = LANG_NAME[lang] || input.language || 'French';
  const rtl = RTL_LANGS.has(lang);
  const currency = input.currency || 'TND';
  const p = input.product;
  const priceLine = p.price != null
    ? `${p.price} ${currency}${p.compareAtPrice != null ? ` (old price ${p.compareAtPrice} ${currency}, crossed out)` : ''}`
    : 'price clearly highlighted';

  const benefitsText = copy.benefits
    .map((b, i) => `   ${i + 1}. "${b.title}" — ${b.body}`)
    .join('\n');
  const testimonialsText = copy.testimonials
    .map((t) => `   - "${t.quote}" — ${t.author} (5 stars)`)
    .join('\n');

  return `Act as a top-tier ecommerce landing page designer and conversion-focused creative director.
Create a premium, high-converting vertical landing page DESIGN MOCKUP for "${p.name}" (${p.category || 'Electronics & Gadgets'}).

LANGUAGE: ${langName}${rtl ? ' — proper RIGHT-TO-LEFT (RTL) layout' : ''}.

DESIGN RULES (CRITICAL):
- Vertical 9:16 long-scroll format, single connected page split into stacked sections.
- ${rtl ? 'Proper RTL layout — text aligned right, reading right-to-left.' : 'Clean LTR layout.'}
- Typography: BOLD, MODERN, HIGH-CONTRAST. ${rtl ? 'Use a clean Arabic font (Cairo / Almarai style).' : 'Use a clean modern sans-serif.'}
- Visuals: premium, realistic, modern, visually rich. Production-ready mockup, NOT a wireframe.
- All text must be SHARP, LARGE and perfectly READABLE. No tiny unreadable text. No gibberish text.
- Modern ecommerce palette: clean white cards on a dark charcoal background, one strong accent color.

USE EXACTLY THIS COPY (render it as the on-image text, do not invent other text):

1. HERO SECTION
   - Brand mark: "${input.storeName}"
   - Headline: "${copy.headline}"
   ${copy.subheadline ? `- Subheadline: "${copy.subheadline}"` : ''}
   - Premium realistic packshot of the product "${p.name}".
   - Price block: ${priceLine}
   - Two reassurance pills: "${copy.reassurance.join('", "')}"

2. PRODUCT DETAILS & BENEFITS
   - A grid of 4 white benefit cards, each with a product/lifestyle photo, a bold title and a short body:
${benefitsText}

3. AUTHORITY & SOCIAL PROOF
   - A collage of happy real customers using the product.
   - Trust line: "${copy.socialProof}"
   - 2 testimonial cards, each with a clear 5-star row, large readable text:
${testimonialsText}

4. FINAL OFFER
   - A bold lifestyle hero shot of the product.
   - A massive, impossible-to-miss CTA button: "${copy.cta}"
   - Reassurance under the button: "${copy.ctaReassurance}"

The final image must look like a polished, production-ready landing page mockup. Text must be crisp and legible.`;
}

export async function generateLandingImage(input: LandingImageInput): Promise<LandingImageResult> {
  // 1. Real copy in the target language.
  let copy: LandingCopy;
  try {
    const raw = await runLLM(buildCopyPrompt(input));
    const parsed = safeJsonExtract<Partial<LandingCopy>>(raw);
    if (!parsed) throw new Error('LLM returned invalid JSON');
    copy = {
      headline: parsed.headline || input.product.name,
      subheadline: parsed.subheadline,
      reassurance: Array.isArray(parsed.reassurance) && parsed.reassurance.length
        ? parsed.reassurance.slice(0, 2)
        : ['Livraison gratuite', 'Paiement à la livraison'],
      benefits: Array.isArray(parsed.benefits) && parsed.benefits.length
        ? parsed.benefits.slice(0, 4).map((b) => ({ title: b?.title || '', body: b?.body || '' }))
        : [],
      socialProof: parsed.socialProof || '',
      testimonials: Array.isArray(parsed.testimonials)
        ? parsed.testimonials.slice(0, 2).map((t) => ({ quote: t?.quote || '', author: t?.author || '' }))
        : [],
      cta: parsed.cta || 'Commander',
      ctaReassurance: parsed.ctaReassurance || 'Garantie qualité',
    };
    // Pad benefits to 4 so the prompt always has a full grid.
    while (copy.benefits.length < 4) copy.benefits.push({ title: '', body: '' });
  } catch (err) {
    throw new Error(`Landing copy generation failed: ${(err as Error).message}`);
  }

  // 2. Compose the full landing-page image. Pass the seller's real product
  //    photo as a reference so the actual product shows up in the mockup.
  const prompt = buildImagePrompt(input, copy);
  const refs = (input.product.images || []).filter((u) => typeof u === 'string' && u.length > 0).slice(0, 1);
  const image = await generateImage({
    prompt,
    aspect: 'tall',
    model: LANDING_IMAGE_MODEL,
    ...(refs.length ? { referenceImages: refs } : {}),
  });

  return {
    imageUrl: image.url,
    width: image.width,
    height: image.height,
    copy,
  };
}
