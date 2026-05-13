/**
 * AI image generation via fal.ai.
 *
 * Per-slot model strategy (the right model for the right job):
 *   • HERO    → FLUX pro 1.1   ($0.04/img)  — premium photoreal hero shot
 *   • GALLERY → FLUX schnell   ($0.003/img) — cheap & fast, 8-10 images
 *   • AVATAR  → FLUX realism   ($0.025/img) — photoreal humans for testimonials
 *   • BANNER  → Ideogram v3    ($0.06/img)  — best at LEGIBLE text in image
 *                                              (−50%, NEW, etc.)
 *
 * Overrides via env vars (each defaults shown above):
 *   - FAL_HERO_MODEL     (default 'fal-ai/flux-pro/v1.1')
 *   - FAL_GALLERY_MODEL  (default 'fal-ai/flux/schnell')
 *   - FAL_AVATAR_MODEL   (default 'fal-ai/flux-realism')
 *   - FAL_BANNER_MODEL   (default 'fal-ai/ideogram/v3')
 *
 * Legacy: FAL_IMAGE_MODEL still works — it becomes the GALLERY default and
 * the global fallback when nothing else is set.
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

/** Ideogram v3 uses Ideogram-style aspect tokens (ASPECT_*). */
const IDEOGRAM_ASPECT: Record<ImageAspect, { token: string; width: number; height: number }> = {
  square:    { token: 'ASPECT_1_1',  width: 1024, height: 1024 },
  portrait:  { token: 'ASPECT_3_4',  width: 768,  height: 1024 },
  landscape: { token: 'ASPECT_4_3',  width: 1024, height: 768 },
  wide:      { token: 'ASPECT_16_9', width: 1280, height: 720 },
};

function getFalKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) {
    // Admins see the real cause; everyone else sees a generic message
    // (errorHandler picks based on req.user.role).
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

/** Global fallback — kept for backwards-compatibility with FAL_IMAGE_MODEL. */
const DEFAULT_MODEL = process.env.FAL_IMAGE_MODEL || 'fal-ai/flux/schnell';

/** Per-kind models. Defaults follow the recommended cost/quality split. */
const HERO_MODEL    = process.env.FAL_HERO_MODEL    || 'fal-ai/flux-pro/v1.1';
const GALLERY_MODEL = process.env.FAL_GALLERY_MODEL || DEFAULT_MODEL; // schnell by default
const AVATAR_MODEL  = process.env.FAL_AVATAR_MODEL  || 'fal-ai/flux-realism';
const BANNER_MODEL  = process.env.FAL_BANNER_MODEL  || 'fal-ai/ideogram/v3';

function isNanoBanana(model: string): boolean {
  return /nano-banana/i.test(model);
}

function isIdeogram(model: string): boolean {
  return /ideogram/i.test(model);
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

  // Ideogram v3 — text-rendering specialist for banners / promo overlays.
  if (isIdeogram(endpoint)) {
    const a = IDEOGRAM_ASPECT[aspect];
    return {
      prompt: input.prompt,
      aspect_ratio: a.token,
      rendering_speed: 'BALANCED',
      style: 'AUTO',
      // Useful flags supported by Ideogram for transactional banners:
      magic_prompt_option: 'AUTO',
      num_images: 1,
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
  if (isNanoBanana(model)) return NANO_ASPECT[aspect];
  if (isIdeogram(model))   return IDEOGRAM_ASPECT[aspect];
  return FLUX_ASPECT[aspect];
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
    const err = new Error(`fal.ai ${endpoint} error ${res.status}: ${text}`) as Error & {
      statusCode?: number;
      publicMessage?: string;
    };
    err.statusCode = 502;
    err.publicMessage = `La génération de l'image a échoué (code ${res.status}). Réessaie dans un instant.`;
    throw err;
  }
  const out = (await res.json()) as {
    images?: Array<{ url?: string; width?: number; height?: number }>;
  };
  const first = out.images?.[0];
  if (!first?.url) {
    const err = new Error('fal.ai returned no image') as Error & {
      statusCode?: number;
      publicMessage?: string;
    };
    err.statusCode = 502;
    err.publicMessage = "La génération de l'image n'a rien retourné. Réessaie.";
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

/** Heuristic — does this prompt ask for legible text inside the image? */
export function isBannerPrompt(prompt: string): boolean {
  // Look for explicit text directives or common promo/banner cues. The LLM
  // emits prompts like: `banner with the text "−50%"` or `promo card reading SOLDES`.
  return /(\btext\s+["“][^"”]+["”])|(\b(banner|promo|sale|sticker|badge|label|étiquette|bannière|affiche)\b.*\b(reading|saying|with the text|que dit|écrit))|(["“][−\-]?\d{1,3}\s*%["”])/i.test(prompt);
}

export function getHeroModel(): string    { return HERO_MODEL; }
export function getGalleryModel(): string { return GALLERY_MODEL; }
export function getAvatarModel(): string  { return AVATAR_MODEL; }
export function getBannerModel(): string  { return BANNER_MODEL; }
