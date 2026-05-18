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
import { runLLM, getDialect, getPhotoCulture } from './fal-landing.service';
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

  const dialect = getDialect(country, lang);

  return `You are a senior creative copywriter at a top MENA ecommerce agency. You have written 800+ winning landing pages and you OWN the voice of the ${country} market — direct, vivid, locally idiomatic, scroll-stopping, never corporate.
Write the copy for a HIGH-CONVERTING, EMOTIONALLY-CHARGED landing page in ${langName}.
${dialect ? `\nLOCAL VOICE / DIALECT (${country}) — MANDATORY:\n${dialect}\nThe reader must INSTANTLY recognise their own way of speaking. NEVER fall back to neutral Modern Standard Arabic if a dialect is specified.\n` : ''}
PRODUCT
- Name: ${p.name}
- Category: ${p.category || 'general'}
${p.description ? `- Description: ${p.description}\n` : ''}${p.price != null ? `- Price: ${p.price} ${currency}\n` : ''}${p.compareAtPrice != null ? `- Old price: ${p.compareAtPrice} ${currency}\n` : ''}

COPY PHILOSOPHY (critical — read carefully):
- Sell the TRANSFORMATION, not the spec. ("a screen that hurts your eyes" → "the kind of screen you forget is there").
- Every line earns its place. If a sentence could appear on any competitor's page, REWRITE IT.
- One concrete sensory detail per benefit (a sound, a texture, a number, a moment).
- BAN this list of clichés: "premium", "haute qualité", "the best", "amazing", "revolutionary", "découvrez", "profitez", "n'attendez plus".
- Prefer: punchy verbs, specific numbers, micro-stories, fresh metaphors, friendly slang that locals actually say.
- Tone: like a smart friend recommending it in a voice message — confident, warm, never salesy.

Return JSON ONLY (no markdown), exactly this shape:
{
  "headline": "BIG emotional hook, 5-9 words, ${langName}. A scroll-stopper. State the transformation or pose a vivid question. Not a feature, a feeling.",
  "subheadline": "one supporting line 10-16 words, adds the 'why now' or a sensory detail",
  "reassurance": ["free-delivery phrase 2-4 words, ${langName}", "cash-on-delivery phrase 2-4 words, ${langName}"],
  "benefits": [
    { "title": "2-4 words concrete title", "body": "1 sentence 10-16 words: ONE benefit, ONE sensory detail or number, no fluff" },
    { "title": "2-4 words DIFFERENT angle", "body": "1 sentence 10-16 words, different angle (ease, speed, durability, status, joy, time-saved)" },
    { "title": "2-4 words DIFFERENT angle", "body": "1 sentence 10-16 words, yet another angle" },
    { "title": "2-4 words DIFFERENT angle", "body": "1 sentence 10-16 words, the last angle" }
  ],
  "socialProof": "one specific trust line with a precise (non-round) number — e.g. '1 247 clients depuis mars', 'note 4.8/5 sur 312 avis'",
  "testimonials": [
    { "quote": "1 sentence 14-22 words. A REAL moment — sensory, specific. Local voice. NOT 'super produit je recommande'.", "author": "First name M. - City, ${country}" },
    { "quote": "another 1 sentence 14-22 words. Different angle from the first (if first = quality, this one = service / speed / status)", "author": "Different first name M. - different City, ${country}" }
  ],
  "cta": "2-3 word call to action ALL CAPS, direct action verb, ${langName}",
  "ctaReassurance": "2-4 word reassurance that kills the last objection (returns, guarantee, safe payment), ${langName}"
}

STRICT RULES
- EVERY string in ${langName}${RTL_LANGS.has(lang) ? ' (proper script, natural local register, no romanisation)' : ''}.
- No markdown, no commentary — valid JSON only.`;
}

/** Step 2 — the design-director prompt for the image model, copy baked in. */
function buildImagePrompt(input: LandingImageInput, copy: LandingCopy): string {
  const lang = (input.language || 'fr').toLowerCase().split('-')[0];
  const langName = LANG_NAME[lang] || input.language || 'French';
  const rtl = RTL_LANGS.has(lang);
  const currency = input.currency || 'TND';
  const country = input.country || 'TN';
  const photoCulture = getPhotoCulture(country);
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

  return `You are an AWARD-WINNING senior product / brand designer (Awwwards, CSS Design Awards). You design landing pages for premium DTC brands — your work looks like Linear, Apple Store, Tesla, On Running, Aesop, Glossier, Notion, Stripe. You compose, you don't decorate.

MISSION: design and render a single, production-ready, premium vertical 9:16 ECOMMERCE LANDING PAGE MOCKUP for "${p.name}" (${p.category || 'consumer product'}).

LANGUAGE: ${langName}${rtl ? ' — full RIGHT-TO-LEFT (RTL) layout. Text aligned right, reading right-to-left, numerals also rendered in the appropriate locale.' : ' — clean LTR layout.'}
LOCAL CULTURE (${country}): all human / lifestyle photos must feel authentic to this market — ${photoCulture}. Cast diverse REAL-looking local people (correct skin tones, clothing styles, interiors). No generic stock.

VISUAL DESIGN LANGUAGE (CRITICAL — this is what makes it "modern and inspiring"):
- Editorial DTC aesthetic 2026 — generous whitespace, confident typographic hierarchy, restrained palette, bold accent moments. Not a template, not a wireframe, not a brochure. A REAL product page.
- Palette: ONE strong base (off-white #F7F5F2 OR deep charcoal #0E0E10) + ONE refined accent (warm terracotta, brushed brass, electric cobalt, sage green or muted plum — pick what fits the product). No rainbow, no random gradients.
- Typography: oversized headline (display sans, geometric or modern serif — like General Sans, Inter Display, GT Super, Cabinet Grotesk${rtl ? ' / for Arabic use a clean modern Arabic display font such as Cairo Bold, Almarai Black or 29LT Bukra' : ''}). Tight tracking on the hero, comfortable leading on body. Mix weights for hierarchy (300 / 500 / 800).
- Layout: asymmetric, magazine-grade. Use the full canvas — let the product breathe, let images bleed to edges. Vary section rhythm: full-bleed hero → 2-col cards → full-bleed photo → grid → CTA.
- Photography: cinematic, editorial. Soft natural light, real human moments, shallow depth of field, subtle film grain. The product is REAL (use the reference image as the truth source for the product itself). Lifestyle shots feel candid, never stock.
- Cards: subtle (1px hairline borders OR soft 10-20% shadows, never both). Generous internal padding. Rounded radius 12-20px, consistent across the page.
- Micro-details that lift the design: a small kerned eyebrow label above each section, a thin divider line, a tiny price-currency superscript, a 5-star row in solid accent color, a discreet trust pill, a "as seen on" logo strip (faded grayscale, generic shape).
- All text PERFECTLY LEGIBLE and CRISP. No gibberish, no Lorem Ipsum, no garbled letters, no placeholder Latin in an Arabic block. Big body sizes (mobile-readable). Real characters in the target script.

USE EXACTLY THIS COPY (render it verbatim — do NOT translate, do NOT shorten, do NOT invent extra text):

1. HERO (full bleed, ~32% of page height)
   - Tiny eyebrow label: "${input.storeName}"
   - OVERSIZED display headline: "${copy.headline}"
   ${copy.subheadline ? `- Subheadline beneath, 60% size of headline: "${copy.subheadline}"` : ''}
   - Premium realistic packshot of "${p.name}" — IDENTICAL to the reference image (same shape, colors, materials, branding). Hero composition, soft contact shadow, breathing room.
   - Price block beside or below the product: ${priceLine}
   - Two reassurance pills with tiny icons: "${copy.reassurance.join('", "')}"

2. PRODUCT DETAILS & BENEFITS (~28% of page height)
   - Section eyebrow: a one-word label like "BENEFITS" / "FONCTIONNALITÉS" / "المميزات" in the target language.
   - 2×2 grid of 4 benefit cards. Each card: a small editorial product / lifestyle photo OR a single iconic line illustration, a bold short title, a one-line body. Cards aligned, equal heights, consistent spacing:
${benefitsText}

3. AUTHORITY & SOCIAL PROOF (~22% of page height)
   - One striking full-bleed lifestyle photo of a real diverse customer naturally using the product (genuine candid moment, not posed stock).
   - Trust line under it, centered, medium weight: "${copy.socialProof}"
   - 2 testimonial cards stacked or side-by-side. Each card: 5 filled stars in the accent color, a large readable quote, the author line below in muted gray:
${testimonialsText}

4. FINAL OFFER & CTA (~18% of page height)
   - A bold cinematic hero shot of the product (different angle from the hero — lifestyle context, dramatic lighting).
   - Massive CTA button, full-width, accent color, oversized weight, rounded radius matching cards: "${copy.cta}"
   - Tiny reassurance line under the button, muted gray: "${copy.ctaReassurance}"
   - At the very bottom, a faint footer line with a single brand mark "${input.storeName}".

ABSOLUTE RULES:
- ONE single connected page composition, not multiple disconnected screens. Sections flow into each other vertically.
- NO browser chrome, NO phone mockup frame, NO device bezel — design AS IF rendered at full bleed.
- NO Lorem Ipsum, NO duplicated text, NO English where ${langName} is asked, NO placeholder text anywhere.
- Product fidelity is sacred: every appearance of the product must match the reference image exactly — same shape, colors, materials, logos.
- AVOID: cluttered layouts, decorative emojis, clip-art, neon glow gradients, web-3 holographic styles, generic icon sets, low-effort centered-everything compositions, AI-looking smooth plastic illustrations.
- The result should feel like it was hand-crafted in Figma by a senior designer, then shot for a portfolio.`;
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
