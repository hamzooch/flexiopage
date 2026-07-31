/**
 * Génération IA (GPT) pour peupler rapidement le catalogue marketplace.
 * À partir d'un titre + type digital + prix de gros, on demande à OpenAI
 * de produire : description marketing, catégorie, tags, prix retail suggéré.
 *
 * Fallback : si OPENAI_API_KEY absente ou API en erreur, on renvoie des
 * valeurs par défaut cohérentes (2x le prix de gros pour le retail, etc.).
 */
import type { DigitalKind } from '../models/Product.model';

export interface GenerateMarketplaceInput {
  title: string;
  digitalKind: DigitalKind;
  wholesalePrice: number;
  currency: string;
  /** Contexte libre pour affiner le prompt (URL, description brève, cible…). */
  hint?: string;
}

export interface GenerateMarketplaceOutput {
  description: string;
  category: string;
  tags: string[];
  suggestedRetailPrice: number;
  /** True quand la vraie IA a répondu ; false quand on tombe sur le fallback. */
  aiGenerated: boolean;
}

const DIGITAL_KIND_LABEL: Record<DigitalKind, string> = {
  download: 'a downloadable file (PDF, ZIP, images, etc.)',
  course: 'a video course (lessons grouped in modules)',
  license: 'a software license key',
  membership: 'a recurring membership area with content',
  service: 'a service or consultation booking',
};

export async function generateMarketplaceProduct(
  input: GenerateMarketplaceInput,
): Promise<GenerateMarketplaceOutput> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      return await callOpenAI(apiKey, input);
    } catch (err) {
      console.warn('[marketplace-ai] OpenAI failed, using fallback:', (err as Error).message);
    }
  }

  return fallback(input);
}

async function callOpenAI(
  apiKey: string,
  input: GenerateMarketplaceInput,
): Promise<GenerateMarketplaceOutput> {
  const prompt = `You are a marketing copywriter for a digital products marketplace serving French-speaking African e-commerce sellers.

Generate a JSON object describing this new marketplace product.

Product context:
- Title: ${input.title}
- Type: ${DIGITAL_KIND_LABEL[input.digitalKind]}
- Wholesale price (what sellers pay ONCE, on their first sale): ${input.wholesalePrice} ${input.currency}
- Additional context: ${input.hint || 'none'}

Return ONLY a valid JSON object (no markdown fences) with this exact shape:
{
  "description": "A persuasive 2-3 sentence description in French, aimed at sellers deciding whether to add this product to their store. Focus on the value they'll deliver to their customers and their profit potential.",
  "category": "one short French category label (e.g. 'ebook', 'formation', 'template', 'design', 'logiciel')",
  "tags": ["3", "to", "6", "lowercase", "french", "tags"],
  "suggestedRetailPrice": <number — a realistic retail price in ${input.currency}, typically 2x to 4x the wholesale price of ${input.wholesalePrice}, based on the product type and perceived value>
}

Constraints:
- description: French, 2-3 sentences, no emojis, plain text
- category: single word or short French label, lowercase
- tags: array of 3 to 6 short lowercase French tags, no # symbol
- suggestedRetailPrice: integer, must be > ${input.wholesalePrice}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty AI response');

  const parsed = JSON.parse(content) as Partial<GenerateMarketplaceOutput>;

  return {
    description: cleanStr(parsed.description) || fallback(input).description,
    category: cleanStr(parsed.category)?.toLowerCase() || fallback(input).category,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags
          .map((t) => String(t).trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 6)
      : fallback(input).tags,
    suggestedRetailPrice:
      typeof parsed.suggestedRetailPrice === 'number' &&
      Number.isFinite(parsed.suggestedRetailPrice) &&
      parsed.suggestedRetailPrice > input.wholesalePrice
        ? Math.round(parsed.suggestedRetailPrice)
        : fallback(input).suggestedRetailPrice,
    aiGenerated: true,
  };
}

function cleanStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Fallback sans IA — heuristiques simples pour ne pas bloquer la création
 * quand la clé n'est pas configurée ou que l'API répond en erreur.
 */
function fallback(input: GenerateMarketplaceInput): GenerateMarketplaceOutput {
  const kindLabel: Record<DigitalKind, string> = {
    download: 'un fichier téléchargeable prêt à revendre à vos clients',
    course: 'une formation vidéo structurée à revendre à vos clients',
    license: 'une clé de licence logicielle à revendre à vos clients',
    membership: 'un accès membre à revendre à vos clients',
    service: 'une prestation de service à proposer à vos clients',
  };
  const defaultCategory: Record<DigitalKind, string> = {
    download: 'ebook',
    course: 'formation',
    license: 'logiciel',
    membership: 'accès',
    service: 'service',
  };

  return {
    description: `${input.title} — ${kindLabel[input.digitalKind]}. Fixez votre prix, publiez dans votre boutique et commencez à vendre.`,
    category: defaultCategory[input.digitalKind],
    tags: [defaultCategory[input.digitalKind], input.digitalKind, 'digital'],
    suggestedRetailPrice: Math.max(input.wholesalePrice * 3, input.wholesalePrice + 1),
    aiGenerated: false,
  };
}
