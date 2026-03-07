/**
 * AI image generation via fal.ai.
 *
 * Used by the landing-page generator to fill hero, gallery, and testimonial
 * avatar slots with photorealistic lifestyle images that match the target
 * country and product niche — same approach as ayor.ia / tryad.app.
 *
 * Default model: Google's Nano Banana (gemini-2.5-flash-image) — best at
 * prompt-following and producing clean, photoreal lifestyle scenes.
 * Override with FAL_IMAGE_MODEL:
 *   - "fal-ai/nano-banana"      — DEFAULT (Google, fast, sharp prompts)
 *   - "fal-ai/flux/schnell"     — ultra-cheap FLUX
 *   - "fal-ai/flux/dev"         — better quality FLUX
 *   - "fal-ai/flux-pro/v1.1"    — premium FLUX
 *   - "fal-ai/flux-realism"     — photoreal humans (avatars)
 */
const FAL_BASE = 'https://fal.run';

export type ImageAspect = 'square' | 'portrait' | 'landscape' | 'wide';

export interface ImageGenInput {
  prompt: string;
  aspect?: ImageAspect;
  /** Override the model for a single call. */
  model?: string;
  /** Optional negative prompt to steer FLUX away from artifacts (ignored by Nano Banana). */
  negativePrompt?: string;
  /**
   * Reference image URL(s) — when set, image-to-image / edit endpoint is used
   * so the generated variant CONTAINS the actual reference product. For
   * Nano Banana, this routes to `fal-ai/nano-banana/edit`.
   */
  referenceImages?: string[];
}

export interface ImageGenResult {
  url: string;
  width: number;
  height: number;
}

const FLUX_ASPECT: Record<ImageAspect, { width: number; height: number; label: string }> = {
  square:    { width: 1024, height: 1024, label: 'square_hd' },
  portrait:  { width: 768,  height: 1024, label: 'portrait_4_3' },
  landscape: { width: 1024, height: 768,  label: 'landscape_4_3' },
  wide:      { width: 1280, height: 720,  label: 'landscape_16_9' },
};

const NANO_ASPECT: Record<ImageAspect, { ratio: string; width: number; height: number }> = {
  square:    { ratio: '1:1',  width: 1024, height: 1024 },
  portrait:  { ratio: '3:4',  width: 768,  height: 1024 },
  landscape: { ratio: '4:3',  width: 1024, height: 768 },
  wide:      { ratio: '16:9', width: 1280, height: 720 },
};

function getFalKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) {
    const err = new Error('FAL_KEY is not configured on the server') as Error & { statusCode?: number };
    err.statusCode = 500;
    throw err;
  }
  return key;
}

const DEFAULT_MODEL = process.env.FAL_IMAGE_MODEL || 'fal-ai/nano-banana';
const AVATAR_MODEL = process.env.FAL_AVATAR_MODEL || DEFAULT_MODEL;

function isNanoBanana(model: string): boolean {
  return /nano-banana/i.test(model);
}

/**
 * Decide the actual fal endpoint to use. When the caller passes
 * referenceImages, route to the model's image-to-image / edit endpoint so
 * the output contains the real reference product.
 */
function resolveEndpoint(model: string, hasReference: boolean): string {
  if (hasReference && isNanoBanana(model) && !/edit/.test(model)) {
    return 'fal-ai/nano-banana/edit';
  }
  return model;
}

/**
 * Build the request body for the chosen endpoint. Nano Banana, Nano Banana
 * Edit and FLUX have different schemas, so we adapt here.
 */
function buildBody(endpoint: string, input: ImageGenInput): Record<string, unknown> {
  const aspect = input.aspect || 'square';
  const refs = (input.referenceImages || []).filter((u) => typeof u === 'string' && u.length > 0);

  // Nano Banana Edit: image-to-image
  if (/nano-banana\/edit/.test(endpoint)) {
    return {
      prompt: input.prompt,
      image_urls: refs,
      num_images: 1,
      output_format: 'jpeg',
    };
  }

  // Nano Banana text-to-image
  if (isNanoBanana(endpoint)) {
    const a = NANO_ASPECT[aspect];
    return {
      prompt: input.prompt,
      num_images: 1,
      aspect_ratio: a.ratio,
      output_format: 'jpeg',
    };
  }

  // FLUX family (text-to-image only here; img2img variants would use a separate endpoint)
  const a = FLUX_ASPECT[aspect];
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: a.label,
    num_inference_steps: endpoint.includes('schnell') ? 4 : 28,
    num_images: 1,
    enable_safety_checker: true,
  };
  if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
  return body;
}

function defaultDimsFor(model: string, aspect: ImageAspect): { width: number; height: number } {
  return isNanoBanana(model) ? NANO_ASPECT[aspect] : FLUX_ASPECT[aspect];
}

/**
 * Generate one image. Returns a public URL (fal hosts the asset for ~24h —
 * for a real SaaS you'd download and re-upload to your own storage).
 */
export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  const key = getFalKey();
  const model = input.model || DEFAULT_MODEL;
  const aspect = input.aspect || 'square';
  const hasRef = !!input.referenceImages?.length;
  const endpoint = resolveEndpoint(model, hasRef);
  const body = buildBody(endpoint, input);

  const res = await fetch(`${FAL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`fal.ai ${endpoint} error ${res.status}: ${text}`) as Error & { statusCode?: number };
    err.statusCode = 502;
    throw err;
  }
  const out = (await res.json()) as {
    images?: Array<{ url?: string; width?: number; height?: number }>;
  };
  const first = out.images?.[0];
  if (!first?.url) {
    const err = new Error('fal.ai returned no image') as Error & { statusCode?: number };
    err.statusCode = 502;
    throw err;
  }
  const dims = defaultDimsFor(model, aspect);
  return {
    url: first.url,
    width: first.width ?? dims.width,
    height: first.height ?? dims.height,
  };
}

/**
 * Generate many images in parallel, returning {url, ...} per slot. If any one
 * call fails, the rejected entry resolves to null instead of bringing down
 * the whole page generation.
 */
export async function generateImagesParallel(
  inputs: Array<ImageGenInput | null | undefined>
): Promise<Array<ImageGenResult | null>> {
  return Promise.all(
    inputs.map(async (input) => {
      if (!input || !input.prompt?.trim()) return null;
      try {
        return await generateImage(input);
      } catch (err) {
        console.error('[image-gen] slot failed:', (err as Error).message);
        return null;
      }
    })
  );
}

export function isAvatarPrompt(prompt: string): boolean {
  return /\b(avatar|portrait|headshot|face of|person looking|smiling person)\b/i.test(prompt);
}

export function getAvatarModel(): string {
  return AVATAR_MODEL;
}
