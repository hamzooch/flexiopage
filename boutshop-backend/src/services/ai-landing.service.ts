/**
 * AI-powered landing page content generation.
 * Uses OpenAI API if OPENAI_API_KEY is set; otherwise returns smart defaults.
 */
import { LANDING_TEMPLATES, type TemplateSection } from '../data/landing-templates';

export interface GenerateLandingInput {
  storeName: string;
  productType: 'digital' | 'physical' | 'mixed';
  productNames?: string;
  description?: string;
  tone?: 'professional' | 'friendly' | 'minimal';
}

function generateId(): string {
  return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Build sections with unique ids from template or default structure */
export function getSectionsFromTemplate(templateId: string): TemplateSection[] {
  const template = LANDING_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return getDefaultSections('mixed');
  return template.sections.map((s, i) => ({
    ...s,
    id: generateId(),
    order: i,
    props: { ...s.props },
  }));
}

/** Default sections when no template/AI */
function getDefaultSections(productType: 'digital' | 'physical' | 'mixed'): TemplateSection[] {
  const base = [
    { id: generateId(), type: 'hero', order: 0, props: { title: 'Welcome', subtitle: 'Discover our products.', ctaText: 'Shop Now', layout: 'center' } },
    { id: generateId(), type: 'cta', order: 1, props: { title: 'Ready to get started?', buttonText: 'Get Started' } },
  ];
  return base;
}

/** AI-generated or fallback sections based on input */
export async function generateLandingWithAI(input: GenerateLandingInput): Promise<{
  sections: TemplateSection[];
  seoTitle?: string;
  seoDescription?: string;
}> {
  const { storeName, productType, description, productNames, tone = 'professional' } = input;
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const result = await callOpenAI(apiKey, {
        storeName,
        productType,
        productNames: productNames || '',
        description: description || '',
        tone,
      });
      return result;
    } catch (err) {
      console.warn('AI generation failed, using fallback:', err);
    }
  }

  // Fallback: pick a matching template and personalize props
  const template =
    LANDING_TEMPLATES.find((t) => t.category === productType) ||
    LANDING_TEMPLATES.find((t) => t.category === 'mixed')!;
  const sections = getSectionsFromTemplate(template.id);

  // Personalize first hero
  const hero = sections.find((s) => s.type === 'hero');
  if (hero && hero.props) {
    hero.props.title = hero.props.title || `${storeName} – ${productType === 'digital' ? 'Digital Products' : productType === 'physical' ? 'Quality Products' : 'Shop'}`;
    hero.props.subtitle = description || (hero.props.subtitle as string);
  }

  return {
    sections,
    seoTitle: `${storeName} | ${productType === 'digital' ? 'Digital Products' : 'Online Store'}`,
    seoDescription: description || `Shop at ${storeName}. ${productType === 'digital' ? 'Instant digital delivery.' : 'Fast shipping.'}`,
  };
}

async function callOpenAI(
  apiKey: string,
  input: { storeName: string; productType: string; productNames: string; description: string; tone: string }
): Promise<{ sections: TemplateSection[]; seoTitle?: string; seoDescription?: string }> {
  const prompt = `You are a landing page copywriter. Generate a JSON object for a landing page with these rules:
- Store name: ${input.storeName}
- Product type: ${input.productType}
- Product names or context: ${input.productNames || 'not specified'}
- Additional description: ${input.description || 'none'}
- Tone: ${input.tone}

Return ONLY a valid JSON object (no markdown) with this shape:
{
  "sections": [
    { "id": "unique-id", "type": "hero|features|products|testimonials|cta|faq", "order": 0, "props": { "title": "...", "subtitle": "...", "ctaText": "...", etc. } }
  ],
  "seoTitle": "string",
  "seoDescription": "string"
}
Include 3 to 5 sections. Types allowed: hero, features, products, testimonials, cta, faq. Each section has "id", "type", "order", "props". Hero has title, subtitle, ctaText. Features has title, subtitle, items: [{ title, description }]. Testimonials has title, items: [{ quote, author }]. CTA has title, subtitle, buttonText. FAQ has title, items: [{ question, answer }].`;

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
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty AI response');

  let parsed: { sections?: TemplateSection[]; seoTitle?: string; seoDescription?: string };
  try {
    const cleaned = content.replace(/^```json?\s*|\s*```$/g, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Invalid JSON from AI');
  }

  const sections = (parsed.sections || []).map((s, i) => ({
    id: s.id || generateId(),
    type: s.type || 'hero',
    order: i,
    props: s.props || {},
  }));

  return {
    sections,
    seoTitle: parsed.seoTitle,
    seoDescription: parsed.seoDescription,
  };
}
