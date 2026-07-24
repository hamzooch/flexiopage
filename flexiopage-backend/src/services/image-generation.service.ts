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
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const FAL_BASE = 'https://fal.run';

export type ImageAspect = 'square' | 'portrait' | 'landscape' | 'wide' | 'tall';

/**
 * Slot pour lequel l'image est générée. Détermine :
 *   - Le modèle par défaut (hero → FLUX pro, avatar → Realism, etc.)
 *   - Si le post-processing (upscale/face restore) s'applique
 *   - Si l'absence de reference image doit émettre un warning
 *   - Le prompt d'évaluation du quality gate (product fidelity vs face quality)
 */
export type ImageSlot = 'hero' | 'gallery' | 'product' | 'avatar' | 'banner' | 'video-poster' | 'other';

export interface ImageGenInput {
  prompt: string;
  aspect?: ImageAspect;
  /** Override explicite du modèle. Prime sur le routing par catégorie. */
  model?: string;
  /** Prompt négatif pour éloigner FLUX des artefacts (ignoré par Nano Banana). */
  negativePrompt?: string;
  /**
   * Reference image URL(s) — quand set, l'endpoint image-to-image / edit est
   * utilisé pour que la sortie CONTIENNE le vrai produit référence. Pour
   * Nano Banana, ça route vers `fal-ai/nano-banana/edit`.
   */
  referenceImages?: string[];
  /**
   * Slot de destination (hero / gallery / avatar / …). Active le routing par
   * catégorie, le post-processing adapté et le quality gate contextualisé.
   * Absent → traité comme 'other' (comportement legacy identique).
   */
  slot?: ImageSlot;
  /**
   * Catégorie produit (« fashion », « beauty », « electronics », « food »,
   * « luxury », etc.). Utilisée par le routing pour choisir un modèle plus
   * qualitatif sur les catégories haut de gamme (fashion → FLUX pro partout).
   * Case-insensitive, fuzzy-matched. Absent → défauts par slot.
   */
  productCategory?: string;
  /**
   * Quand true : si l'appel n'a PAS de referenceImages alors qu'il attend un
   * produit (hero/product/gallery avec un produit existant), on log un warn
   * pour repérer les régressions (le produit généré est alors un look-alike
   * inventé, pas le vrai produit du vendeur).
   */
  expectsProductReference?: boolean;
  /** Désactive le quality gate pour cet appel (usage interne des retries). */
  skipQualityGate?: boolean;
  /** Désactive le post-processing pour cet appel (usage interne des retries). */
  skipPostProcessing?: boolean;
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
  // 9:16 — tall vertical, e.g. a full long-scroll landing-page mockup.
  tall:      { width: 768,  height: 1365, label: 'portrait_16_9' },
};

const NANO_ASPECT: Record<ImageAspect, { ratio: string; width: number; height: number }> = {
  square:    { ratio: '1:1',  width: 1024, height: 1024 },
  portrait:  { ratio: '3:4',  width: 768,  height: 1024 },
  landscape: { ratio: '4:3',  width: 1024, height: 768 },
  wide:      { ratio: '16:9', width: 1280, height: 720 },
  tall:      { ratio: '9:16', width: 768,  height: 1365 },
};

/** Ideogram v3 uses Ideogram-style aspect tokens (ASPECT_*). */
const IDEOGRAM_ASPECT: Record<ImageAspect, { token: string; width: number; height: number }> = {
  square:    { token: 'ASPECT_1_1',  width: 1024, height: 1024 },
  portrait:  { token: 'ASPECT_3_4',  width: 768,  height: 1024 },
  landscape: { token: 'ASPECT_4_3',  width: 1024, height: 768 },
  wide:      { token: 'ASPECT_16_9', width: 1280, height: 720 },
  tall:      { token: 'ASPECT_9_16', width: 768,  height: 1365 },
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
 * fal.ai can only fetch image URLs from the public internet. In dev, product
 * images live at `http://localhost:5051/uploads/...` which fal cannot reach
 * → request fails with HTTP 422 "Could not generate images with the given
 * prompts and images".
 *
 * For each URL handed to nano-banana/edit (or any image-to-image endpoint),
 * detect a private/loopback host and inline the file as a base64 data URI so
 * fal receives the bytes directly. Public URLs (S3, R2, CDNs) pass through
 * unchanged.
 *
 * Falls back to the original URL on any error so the caller still sees a
 * meaningful upstream error rather than a silent inlining bug.
 */
const PRIVATE_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i;
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
};

async function inlinePrivateUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return url; }
  if (!PRIVATE_HOST_RE.test(parsed.hostname)) return url;

  // Map http://localhost:.../uploads/<key> → <UPLOAD_PATH>/<key>
  const m = parsed.pathname.match(/^\/uploads\/(.+)$/);
  if (!m) {
    console.warn('[image-gen] private URL not in /uploads/, cannot inline:', url);
    return url;
  }
  const uploadRoot = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadRoot, m[1]);
  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mime = MIME_BY_EXT[ext] || 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.warn(`[image-gen] could not inline local file ${filePath}:`, (err as Error).message);
    return url;
  }
}

/**
 * Decide the actual fal endpoint to use. When the caller passes
 * referenceImages, route to an image-to-image endpoint so the output
 * contains the REAL reference product — not a similar-looking invention.
 *
 * Previous bug: only Nano-Banana base models were rewritten to `/edit`.
 * Other base models (e.g. `fal-ai/flux-pro/v1.1`) silently fell through
 * to the FLUX text-to-image branch which DROPS the reference, so hero /
 * product slots regenerated a generic look-alike instead of preserving
 * the seller's actual product.
 *
 * Fix: any reference-bearing call is forced onto an img2img endpoint.
 * Override the fallback with `FAL_IMG2IMG_MODEL` (e.g. set it to
 * `fal-ai/flux-pro/kontext` for Flux-quality product-preserving scenes).
 */
function resolveEndpoint(model: string, hasReference: boolean): string {
  if (!hasReference) return model;
  // Already an img2img endpoint — keep it.
  if (/\/(edit|kontext|image-to-image|img2img)/i.test(model)) return model;
  // Nano-Banana base → /edit.
  if (isNanoBanana(model)) return 'fal-ai/nano-banana/edit';
  // Any other text-to-image model (flux-pro, flux-schnell, flux-realism,
  // ideogram, etc.) cannot honour a reference image. Fall back to a real
  // img2img endpoint — Nano-Banana Edit by default, configurable.
  return process.env.FAL_IMG2IMG_MODEL || 'fal-ai/nano-banana/edit';
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

  // Flux Pro Kontext (and the /max variant) — premium img2img that keeps the
  // subject identity while letting Flux compose the surrounding scene. Schema
  // is single `image_url` (not `image_urls`) + Nano-style aspect ratio token.
  if (/flux-pro\/kontext/i.test(endpoint)) {
    return {
      prompt: input.prompt,
      image_url: refs[0],
      aspect_ratio: NANO_ASPECT[aspect].ratio,
      num_images: 1,
      output_format: 'jpeg',
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
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
 * Génère une image sur fal.ai + assessment qualité + post-processing.
 *
 * Pipeline complet :
 *   1. Résolution modèle : override explicite > routing par catégorie/slot > défaut
 *   2. Warning si un slot produit attend une reference et n'en a pas
 *   3. Appel fal → URL image
 *   4. Quality gate (Claude Haiku vision) — si score < seuil, retry UNE fois
 *      avec un prompt renforcé (max 2 tentatives)
 *   5. Post-processing selon slot (upscale + face restore)
 *
 * Chaque étape est best-effort : les échecs de gate/upscale ne bloquent pas
 * la génération, ils dégradent gracieusement vers l'image brute.
 */
export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  const slot = input.slot || 'other';

  // ── 1. Résolution du modèle ──────────────────────────────────────────
  // Ordre de priorité : `input.model` explicite > routing (slot+catégorie)
  // > DEFAULT_MODEL. Le routing permet à un vendeur de fashion d'avoir
  // FLUX pro partout sans changer d'env vars.
  const model = input.model || resolveModelForCategory(slot, input.productCategory);

  // ── 2. Reference product check ──────────────────────────────────────
  // Si l'appelant attend explicitement une reference et n'en a pas, on log
  // un warn : ça signale les régressions où le pipeline landing perd la
  // photo produit et régénère un look-alike inventé.
  const hasRef = !!input.referenceImages?.length;
  if (input.expectsProductReference && !hasRef) {
    console.warn(
      `[image-gen] slot='${slot}' attendait une reference product mais aucune n'a été fournie — ` +
      `le produit dans l'image sera INVENTÉ par le modèle (pas le vrai produit du vendeur). ` +
      `Prompt: "${input.prompt.slice(0, 80)}…"`,
    );
  }

  // ── 3. Génération initiale ──────────────────────────────────────────
  const initial = await callFalDirect({ ...input, model });

  // ── 4. Quality gate + retry ─────────────────────────────────────────
  let finalUrl = initial.url;
  let finalDims = { width: initial.width, height: initial.height };
  if (QUALITY_GATE_ENABLED && !input.skipQualityGate) {
    const refUrl = input.referenceImages?.[0];
    // Ne passe une URL http/https à Claude (skip les data: du refs inlinés).
    const refForRating = refUrl && /^https?:\/\//.test(refUrl) ? refUrl : undefined;
    const score = await assessImageQuality(initial.url, slot, refForRating);
    if (score && score.total < QUALITY_GATE_THRESHOLD) {
      console.info(
        `[image-gen] quality gate: ${score.total}/30 < ${QUALITY_GATE_THRESHOLD} (slot=${slot}, ` +
        `fidelity=${score.productFidelity} defects=${score.defects} brand=${score.brandQuality}). ` +
        `Reason: ${score.reason}. Retrying…`,
      );
      try {
        // Retry avec prompt renforcé + skip gate/upscale sur le retry lui-même
        // pour ne pas boucler + éviter le coût du double post-process.
        const retry = await callFalDirect({
          ...input,
          model,
          prompt: reinforcePrompt(input.prompt, score, slot),
          negativePrompt: reinforceNegativePrompt(input.negativePrompt, slot),
          skipQualityGate: true,
          skipPostProcessing: true,
        });
        // On garde le retry seulement s'il note mieux (ou pas dispo → on garde).
        const retryScore = await assessImageQuality(retry.url, slot, refForRating);
        if (!retryScore || retryScore.total >= score.total) {
          finalUrl = retry.url;
          finalDims = { width: retry.width, height: retry.height };
        }
      } catch (err) {
        console.warn('[image-gen] retry failed, keeping original:', (err as Error).message);
      }
    }
  }

  // ── 5. Post-processing (upscale + face restore) ─────────────────────
  if (!input.skipPostProcessing && shouldUpscale(slot)) {
    finalUrl = await enhanceImage(finalUrl, slot);
  }

  return {
    url: finalUrl,
    width: finalDims.width,
    height: finalDims.height,
  };
}

/**
 * Renforce le prompt pour un retry après un mauvais score. Injecte des
 * indices ciblés selon les faiblesses détectées par le quality gate.
 */
function reinforcePrompt(originalPrompt: string, score: QualityScore, slot: ImageSlot): string {
  const boosters: string[] = [];
  if (score.defects < 6) {
    boosters.push('photograph without any visual defects, no distorted hands, no broken text, no artifacts');
  }
  if (score.brandQuality < 6) {
    boosters.push('premium editorial photography, magazine quality, real photo not AI-generated look');
  }
  if (score.productFidelity < 6 && slot !== 'avatar' && slot !== 'banner') {
    boosters.push('the product must be IDENTICAL to the reference, same shape same color same materials');
  }
  if (slot === 'avatar' && score.productFidelity < 6) {
    boosters.push('natural authentic human face, real skin texture with pores, symmetry not forced');
  }
  return `${originalPrompt}\n\n${boosters.join(', ')}`.trim();
}

/**
 * Épaissit le prompt négatif pour un retry, en ciblant les défauts fréquents
 * selon le slot.
 */
function reinforceNegativePrompt(base: string | undefined, slot: ImageSlot): string {
  const extras: string[] = [
    'AI-generated look',
    'smooth plastic',
    'over-processed',
    'artificial lighting',
    'generic stock photo',
    'digital art',
    'render',
    '3d',
  ];
  if (slot === 'avatar') extras.push('uncanny symmetrical face', 'glossy skin', 'wax figure');
  else if (slot === 'banner') extras.push('misspelled text', 'garbled letters');
  else extras.push('multiple products', 'wrong product variant', 'similar look-alike product');
  return [base?.trim(), extras.join(', ')].filter(Boolean).join(', ');
}

/**
 * Appel brut à fal.ai (isolé du orchestrator pour permettre les retries
 * internes du generateImage sans re-passer par la logique gate/upscale).
 */
async function callFalDirect(input: ImageGenInput): Promise<ImageGenResult> {
  const key = getFalKey();
  const model = input.model || DEFAULT_MODEL;
  const aspect = input.aspect || 'square';
  const inlinedRefs = input.referenceImages?.length
    ? await Promise.all(input.referenceImages.map(inlinePrivateUrl))
    : input.referenceImages;
  const adjusted: ImageGenInput = { ...input, referenceImages: inlinedRefs };
  const hasRef = !!adjusted.referenceImages?.length;
  const endpoint = resolveEndpoint(model, hasRef);
  const body = buildBody(endpoint, adjusted);

  const res = await fetch(`${FAL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
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

// ─────────────────────────────────────────────────────────────────────
// Category-based model routing
// ─────────────────────────────────────────────────────────────────────
// Certaines catégories bénéficient énormément d'un modèle premium (fashion +
// luxury sur FLUX pro), d'autres marchent parfaitement en modèle rapide
// (electronics sur nano-banana). Le routing ci-dessous permet à un vendeur
// de bijoux d'avoir toute sa galerie en FLUX pro sans changer de config.
//
// Les catégories acceptent des synonymes multilingues (fr/en/ar romanisé)
// pour matcher les tags que le vendeur pose sur ses produits.

export type CategoryClass = 'luxury' | 'fashion' | 'beauty' | 'food' | 'electronics' | 'generic';

const CATEGORY_KEYWORDS: Array<{ class: CategoryClass; patterns: RegExp[] }> = [
  {
    class: 'luxury',
    patterns: [
      /\b(luxury|luxe|premium|haut[\s-]?de[\s-]?gamme|prestige|jewelry|jewellery|bijou|bijoux|watch|montre|horlogerie|leather|cuir|handbag|sac[\s-]?à[\s-]?main|perfume|parfum)\b/i,
    ],
  },
  {
    class: 'fashion',
    patterns: [
      /\b(fashion|mode|apparel|clothing|v[êe]tement|vetement|habit|chaussure|shoes|sneaker|boot|robe|dress|shirt|chemise|pantalon|jean|tenue|streetwear|outfit)\b/i,
    ],
  },
  {
    class: 'beauty',
    patterns: [
      /\b(beauty|beaut[ée]|cosmetic|cosm[ée]tique|makeup|maquillage|skincare|soin|serum|s[ée]rum|cream|cr[èe]me|lipstick|rouge[\s-]?à[\s-]?l[èe]vres|foundation|fond[\s-]?de[\s-]?teint|shampoo|shampoing|hair[\s-]?care|coiffure)\b/i,
    ],
  },
  {
    class: 'food',
    patterns: [
      /\b(food|nourriture|cuisine|drink|boisson|snack|dessert|cake|g[âa]teau|coffee|caf[ée]|th[ée]|tea|chocolat|chocolate|epicerie|grocery|organic|bio)\b/i,
    ],
  },
  {
    class: 'electronics',
    patterns: [
      /\b(electronic|tech|gadget|phone|smartphone|laptop|ordinateur|casque|headphone|earphone|speaker|enceinte|smartwatch|montre[\s-]?connect[ée]e|charger|chargeur|cable|c[âa]ble|accessoire[\s-]?tech)\b/i,
    ],
  },
];

/**
 * Détecte la classe catégorie à partir d'un texte libre (tag produit, nom,
 * catégorie brute). Retourne 'generic' quand rien ne matche — les défauts par
 * slot s'appliquent alors.
 */
export function classifyCategory(input?: string): CategoryClass {
  if (!input) return 'generic';
  const text = input.trim();
  if (!text) return 'generic';
  for (const { class: cls, patterns } of CATEGORY_KEYWORDS) {
    if (patterns.some((r) => r.test(text))) return cls;
  }
  return 'generic';
}

/**
 * Modèle recommandé pour (slot, catégorie). Les vendeurs de fashion / luxury
 * / beauty méritent FLUX pro (ou Realism pour la peau) partout car leur
 * conversion dépend crucialement de la qualité photo. Les vendeurs
 * d'electronics/generic gardent le mix rapide/économique par défaut.
 *
 * Les env `FAL_*_MODEL` restent prioritaires (override manuel > routing).
 */
export function resolveModelForCategory(
  slot: ImageSlot,
  category?: string,
): string {
  const cls = classifyCategory(category);
  // Banner reste sur Ideogram (spécialiste texte) quelle que soit la catégorie.
  if (slot === 'banner') return BANNER_MODEL;
  // Avatar : Realism partout — c'est LE modèle pour les visages humains.
  if (slot === 'avatar') return AVATAR_MODEL;

  // Slots visuels produit (hero / gallery / product / video-poster).
  if (cls === 'luxury' || cls === 'fashion') {
    // Luxury/fashion : FLUX pro partout — la qualité prime sur le coût.
    return process.env.FAL_HERO_MODEL || 'fal-ai/flux-pro/v1.1';
  }
  if (cls === 'beauty' || cls === 'food') {
    // Beauty / food : FLUX Realism (meilleur rendu peau/matière/texture).
    return process.env.FAL_AVATAR_MODEL || 'fal-ai/flux-realism';
  }
  // Electronics / generic → défauts par slot.
  switch (slot) {
    case 'hero':
    case 'video-poster':
      return HERO_MODEL;
    case 'gallery':
    case 'product':
      return GALLERY_MODEL;
    default:
      return DEFAULT_MODEL;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Quality gate — évaluation par Claude Haiku vision
// ─────────────────────────────────────────────────────────────────────
// Après génération, on demande à Claude Haiku 4.5 (vision-capable, ~$0.001
// par image) de noter la sortie sur 3 axes :
//   1. product_fidelity : le produit dans l'image correspond-il à la référence ?
//   2. defects           : mains cassées, texte illisible, artefacts flagrants ?
//   3. brand_quality     : rendu pro/éditorial vs. AI générique ?
//
// Si le score total < seuil → on retry UNE fois avec un seed différent + un
// renforcement de prompt. Borné à 2 tentatives pour garder le coût sous
// contrôle.

const QUALITY_GATE_ENABLED = process.env.IMAGE_QUALITY_GATE_ENABLED !== 'false';
// Seuil de retry sur 30 (=3 critères × 10). 18 = "acceptable" côté Claude,
// 21+ = "clairement bon". On garde 18 par défaut pour n'automatiser le retry
// que sur les vraies ratés (mains cassées, texte illisible, produit inventé
// alors qu'il y a une reference). Bumper à 21+ via env pour un mode qualité
// premium qui accepte de payer ~2× pour de meilleures images en moyenne.
const QUALITY_GATE_THRESHOLD = Number(process.env.IMAGE_QUALITY_GATE_THRESHOLD || 18); // /30
const QUALITY_GATE_MODEL = process.env.IMAGE_QUALITY_GATE_MODEL || 'claude-haiku-4-5-20251001';

let _anthropicQualityClient: Anthropic | null = null;
function getQualityClient(): Anthropic | null {
  if (_anthropicQualityClient) return _anthropicQualityClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropicQualityClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropicQualityClient;
}

interface QualityScore {
  productFidelity: number; // 0-10
  defects: number;         // 0-10 (10 = zero défaut)
  brandQuality: number;    // 0-10
  total: number;           // 0-30
  reason: string;
}

/**
 * Note l'image générée. Best-effort — en cas d'échec du LLM, retourne un
 * score neutre (7/10 sur tout) pour ne pas bloquer le pipeline.
 */
async function assessImageQuality(
  imageUrl: string,
  slot: ImageSlot,
  referenceUrl?: string,
): Promise<QualityScore | null> {
  const client = getQualityClient();
  if (!client) return null;

  // Adapte le prompt selon le slot : les avatars n'ont pas de « produit », les
  // banners sont évalués sur la lisibilité du texte.
  let criteria: string;
  if (slot === 'avatar') {
    criteria = [
      '1. face_quality (0-10) : visage réaliste, sans doigts en trop, pas de traits déformés, catchlight naturel dans les yeux',
      '2. defects (0-10, 10 = zéro défaut) : pas d\'artefacts (main cassée, œil déformé, texture peau plastique)',
      '3. authenticity (0-10) : ressemble à une vraie photo humaine (pas AI-glossy, pas symétrique)',
    ].join('\n');
  } else if (slot === 'banner') {
    criteria = [
      '1. text_legibility (0-10) : texte parfaitement lisible sans faute',
      '2. defects (0-10, 10 = zéro défaut) : pas d\'artefacts, pas de caractères déformés',
      '3. brand_quality (0-10) : rendu pro, contraste, hiérarchie visuelle',
    ].join('\n');
  } else {
    criteria = [
      referenceUrl
        ? '1. product_fidelity (0-10) : le produit dans la sortie est IDENTIQUE à celui de la référence (même forme, couleur, matière, hardware)'
        : '1. product_clarity (0-10) : le produit est bien visible, net, mis en scène clairement',
      '2. defects (0-10, 10 = zéro défaut) : pas d\'artefacts visibles (texte cassé, main déformée, watermark, doublon produit)',
      '3. brand_quality (0-10) : rendu photo éditorial pro (pas d\'aspect AI générique, plastique, over-processed)',
    ].join('\n');
  }

  const systemPrompt = [
    'Tu es un directeur artistique senior pour un site e-commerce. Tu évalues une image générée par IA.',
    'Note l\'image sur 3 critères, sur 10 chacun :',
    criteria,
    '',
    'Réponds UNIQUEMENT en JSON, aucun autre texte :',
    '{ "productFidelity": <0-10>, "defects": <0-10>, "brandQuality": <0-10>, "reason": "<phrase courte>" }',
    '',
    'Sois honnête : si tu vois un défaut visible, mets < 5. Si l\'image est acceptable pour un site e-commerce sérieux, mets 7-8. Réserve 9-10 aux images vraiment excellentes.',
  ].join('\n');

  try {
    const content: Anthropic.ContentBlockParam[] = [];
    // Reference d'abord si présente (pour comparaison).
    if (referenceUrl && /^https?:\/\//.test(referenceUrl)) {
      content.push({
        type: 'image',
        source: { type: 'url', url: referenceUrl },
      });
      content.push({ type: 'text', text: 'Image de RÉFÉRENCE (le produit à préserver) :' });
    }
    content.push({
      type: 'image',
      source: { type: 'url', url: imageUrl },
    });
    content.push({
      type: 'text',
      text: `Image GÉNÉRÉE à évaluer (slot: ${slot}). Note et retourne le JSON.`,
    });

    const resp = await client.messages.create({
      model: QUALITY_GATE_MODEL,
      max_tokens: 256,
      system: [{ type: 'text', text: systemPrompt }],
      messages: [{ role: 'user', content }],
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    const parsed = JSON.parse(text) as {
      productFidelity?: number;
      defects?: number;
      brandQuality?: number;
      reason?: string;
    };
    const productFidelity = Math.max(0, Math.min(10, Number(parsed.productFidelity) || 0));
    const defects = Math.max(0, Math.min(10, Number(parsed.defects) || 0));
    const brandQuality = Math.max(0, Math.min(10, Number(parsed.brandQuality) || 0));
    return {
      productFidelity,
      defects,
      brandQuality,
      total: productFidelity + defects + brandQuality,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
  } catch (err) {
    console.warn('[image-gen] quality gate failed (best-effort):', (err as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Post-processing : upscale + face restoration via fal
// ─────────────────────────────────────────────────────────────────────
// Après génération, on peut passer l'image dans fal-ai/clarity-upscaler qui
// 1) upscale 2× (résolution supérieure) 2) débruit + resharpe 3) offre une
// option face_enhancer pour les visages. Coût ~$0.01/image, ~15s.
//
// Par défaut on n'upscale que les slots à fort impact visuel (hero, product,
// avatar). Gallery est skippée sauf si le vendeur active FAL_UPSCALE_GALLERY.

const UPSCALE_ENABLED = process.env.FAL_UPSCALE_ENABLED !== 'false';
const UPSCALER_MODEL = process.env.FAL_UPSCALER_MODEL || 'fal-ai/clarity-upscaler';
const UPSCALE_GALLERY = process.env.FAL_UPSCALE_GALLERY === 'true';

/**
 * Slots qui bénéficient réellement de l'upscale. Gallery est opt-in car ça
 * multiplie le coût (4 gallery images × $0.01 = +$0.04 par landing) pour un
 * gain visuel moins critique que sur le hero.
 */
function shouldUpscale(slot: ImageSlot): boolean {
  if (!UPSCALE_ENABLED) return false;
  if (slot === 'banner') return false; // Ideogram sort déjà en haute qualité
  if (slot === 'gallery') return UPSCALE_GALLERY;
  return slot === 'hero' || slot === 'product' || slot === 'avatar' || slot === 'video-poster';
}

/**
 * Passe l'image dans clarity-upscaler. Sur avatars, on active `face_enhance`
 * pour restaurer les visages (GFPGAN interne). Best-effort — en cas d'échec,
 * on retourne l'URL originale.
 */
async function enhanceImage(url: string, slot: ImageSlot): Promise<string> {
  const key = getFalKey();
  const isFace = slot === 'avatar';
  try {
    const body: Record<string, unknown> = {
      image_url: url,
      upscale_factor: 2,
      // Guidance conservatrice — on veut préserver l'image, pas la ré-inventer.
      // creativity ∈ [0, 1], resemblance ∈ [0, 1] côté clarity-upscaler.
      creativity: 0.35,
      resemblance: 0.95,
      num_inference_steps: 18,
      output_format: 'jpeg',
    };
    if (isFace) {
      body.prompt = 'high quality face, natural skin, sharp catchlight, editorial portrait';
    }
    const res = await fetch(`${FAL_BASE}/${UPSCALER_MODEL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[image-gen] upscaler HTTP ${res.status} — using original`);
      return url;
    }
    const out = (await res.json()) as { image?: { url?: string }; images?: Array<{ url?: string }> };
    const upscaledUrl = out.image?.url || out.images?.[0]?.url;
    if (!upscaledUrl) {
      console.warn('[image-gen] upscaler returned no image — using original');
      return url;
    }
    return upscaledUrl;
  } catch (err) {
    console.warn('[image-gen] upscaler failed (best-effort):', (err as Error).message);
    return url;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cleanup des images produit scrapées (AliExpress / Alibaba / Amazon)
// ─────────────────────────────────────────────────────────────────────
// Les images scrapées arrivent souvent avec fond chargé, watermarks
// chinois/logos vendeur, résolution moyenne. Sans traitement, elles se
// retrouvent telles quelles dans les cartes produit du storefront et
// affaiblissent la perception qualité.
//
// Le pipeline en 2 étapes :
//   1. Background removal (fal-ai/imageutils/rembg) — isole le produit
//      sur fond transparent → propre pour e-commerce, ~$0.001/image.
//   2. Upscale (clarity-upscaler) — ×2 résolution, denoise, resharpe,
//      atténue les micro-watermarks. ~$0.01/image.
//
// Total : ~$0.011/image, ~$0.05 pour un import de 4-6 images.
// Env off pour désactiver : PRODUCT_IMAGE_CLEANUP_ENABLED=false

const IMAGE_CLEANUP_ENABLED = process.env.PRODUCT_IMAGE_CLEANUP_ENABLED !== 'false';
const BG_REMOVAL_MODEL = process.env.FAL_BG_REMOVAL_MODEL || 'fal-ai/imageutils/rembg';

/**
 * Retire le fond d'une image via fal. Retourne l'URL de la version cutout.
 * Best-effort : retourne l'URL originale en cas d'échec réseau/API.
 */
async function removeBackground(url: string): Promise<string> {
  const key = getFalKey();
  try {
    const res = await fetch(`${FAL_BASE}/${BG_REMOVAL_MODEL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
      body: JSON.stringify({ image_url: url }),
    });
    if (!res.ok) {
      console.warn(`[image-cleanup] bg removal HTTP ${res.status} — using original`);
      return url;
    }
    const out = (await res.json()) as { image?: { url?: string }; images?: Array<{ url?: string }> };
    const cutoutUrl = out.image?.url || out.images?.[0]?.url;
    if (!cutoutUrl) {
      console.warn('[image-cleanup] bg removal returned no image — using original');
      return url;
    }
    return cutoutUrl;
  } catch (err) {
    console.warn('[image-cleanup] bg removal failed (best-effort):', (err as Error).message);
    return url;
  }
}

/**
 * Nettoie une image produit scrapée : bg removal + upscale.
 *
 * Retourne l'URL de la version finale nettoyée (upscalée sur fond
 * transparent). En cas d'échec à n'importe quelle étape, dégrade
 * gracieusement vers l'étape précédente réussie — jamais de perte totale.
 *
 * Contexte d'usage : appelé sur chaque image scrapée AliExpress/Alibaba/
 * Amazon avant persistance en catalogue et avant utilisation comme reference
 * pour la génération landing.
 */
export async function cleanScrapedImage(url: string): Promise<string> {
  if (!IMAGE_CLEANUP_ENABLED) return url;
  if (!url || !/^https?:\/\//i.test(url)) return url;

  // 1. Isole le produit sur fond transparent.
  const cutoutUrl = await removeBackground(url);
  // 2. Upscale ×2 + denoise (réutilise enhanceImage avec slot 'product'
  //    qui active l'upscale sans face_enhance).
  const finalUrl = await enhanceImage(cutoutUrl, 'product');
  return finalUrl;
}

/**
 * Nettoie plusieurs images en parallèle avec bornes de concurrence.
 * Retourne les URLs nettoyées dans le MÊME ORDRE que l'entrée — les images
 * qui n'ont pas pu être nettoyées reviennent inchangées (pas de perte).
 */
export async function cleanScrapedImages(urls: string[]): Promise<string[]> {
  if (!urls.length || !IMAGE_CLEANUP_ENABLED) return urls;
  return Promise.all(urls.map((u) => cleanScrapedImage(u)));
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
