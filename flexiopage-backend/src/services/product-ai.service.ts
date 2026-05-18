/**
 * AI helpers for the product creation flow.
 *
 * Right now: `generateProductDescription` writes a punchy, conversion-focused
 * product description in the language / market the seller picks, using the
 * same FAL any-llm pipe as the landing-page generator (Claude under the hood).
 *
 * Future: short title polishing, SEO meta-description, tag suggestions, etc.
 */
import { runLLM, getDialect } from './fal-landing.service';

export interface ProductDescriptionInput {
  /** Product name as typed by the seller (required). */
  name: string;
  /** Optional category hint — drives the angle ("skincare" vs "tech"). */
  category?: string;
  /** Optional free-text keywords to anchor the copy on (comma-separated). */
  keywords?: string;
  /** Target language code: 'fr' | 'ar' | 'en' (default 'fr'). */
  language?: string;
  /** Country code (used to pick a dialect for Arabic — TN, MA, DZ…). */
  country?: string;
  /** Copy tone — defaults to 'engaging'. */
  tone?: 'engaging' | 'professional' | 'luxury' | 'youthful' | 'minimal';
  /** Price in the store currency (helps the LLM gauge positioning). */
  price?: number;
  currency?: string;
}

export interface ProductDescriptionResult {
  /** Plain-text body the seller can paste into the description field. */
  description: string;
}

const LANG_NAME: Record<string, string> = {
  ar: 'Arabic (العربية)',
  fr: 'French',
  en: 'English',
};

const TONE_GUIDANCE: Record<NonNullable<ProductDescriptionInput['tone']>, string> = {
  engaging:     "Direct, friendly, scroll-stopping mobile-ad voice. Sells the transformation, not the spec sheet.",
  professional: "Clear, neutral and trust-building. Concrete benefits, no hype.",
  luxury:       "Premium, slightly poetic. Quiet luxury voice — short sentences with weight, sensory details.",
  youthful:     "Casual, playful, slang-friendly. Speaks like a friend recommending the product on TikTok.",
  minimal:      "Stripped-down editorial. Two or three short paragraphs, every word earns its place.",
};

/**
 * Generate a conversion-focused product description in the target language.
 * Output is plain text (no markdown headings) suitable for direct paste into
 * the seller's description field.
 */
export async function generateProductDescription(
  input: ProductDescriptionInput
): Promise<ProductDescriptionResult> {
  const lang = (input.language || 'fr').toLowerCase().split('-')[0];
  const langName = LANG_NAME[lang] || 'French';
  const tone = input.tone || 'engaging';
  const dialect = getDialect(input.country, lang);
  const priceLine = input.price != null
    ? `Selling price: ${input.price} ${input.currency || 'TND'}.`
    : '';

  const prompt = `You are an elite ecommerce copywriter. Write a HIGH-CONVERTING product description for the storefront, in ${langName}.

PRODUCT
- Name: ${input.name}
${input.category ? `- Category: ${input.category}\n` : ''}${input.keywords ? `- Key features / keywords: ${input.keywords}\n` : ''}${priceLine ? `- ${priceLine}\n` : ''}

COPY TONE: ${tone} — ${TONE_GUIDANCE[tone]}
${dialect ? `\nLOCAL VOICE (${input.country}): ${dialect}\nThe buyer must INSTANTLY recognise their own way of speaking. Never fall back to neutral MSA when a dialect is specified.\n` : ''}
WRITE THE DESCRIPTION
- 90 to 160 words total.
- 2 to 3 short paragraphs. NO markdown headings, NO bullet lists, NO emoji.
- Open with a punchy hook that sells the BENEFIT or TRANSFORMATION (not the spec).
- Middle paragraph: 2-3 concrete sensory or functional details that prove the quality.
- Last paragraph: a clear push to buy (without saying "buy now") + one quick reassurance.
- BAN clichés: "premium", "haute qualité", "incroyable", "amazing", "the best", "découvrez", "profitez".
- Prefer punchy verbs, specific numbers, fresh metaphors. Tutoiement / friendly direct address.
- Output ONLY the description text. No commentary, no quotes around it, no preamble like "Here is the description".`;

  const raw = await runLLM(prompt);
  // Strip accidental wrapping quotes / markdown the LLM sometimes adds.
  const description = raw
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/gi, '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();

  if (!description) {
    const err = new Error('AI returned an empty description') as Error & { statusCode?: number };
    err.statusCode = 502;
    throw err;
  }
  return { description };
}
