/**
 * UGC video generation — 2 pipelines distincts pour vidéos type "personne
 * réelle qui interagit avec le produit", format qui convertit très bien
 * sur TikTok/Meta/Reels pour du COD en 2026.
 *
 * ┌──────────────────────────┬──────────────────────────────────────┐
 * │  Mode                    │  Pipeline                            │
 * ├──────────────────────────┼──────────────────────────────────────┤
 * │  talking-head            │  TTS ElevenLabs → Hedra Character-1  │
 * │  (personne parle)        │  (image + audio → vidéo lip-synced)  │
 * ├──────────────────────────┼──────────────────────────────────────┤
 * │  lifestyle               │  Kling v2 image-to-video (personnage │
 * │  (personne utilise)      │  + prompt → vidéo réaliste, muette)  │
 * └──────────────────────────┴──────────────────────────────────────┘
 *
 * Les deux modes partent d'une image de personnage (avatar) fournie par le
 * vendeur — soit choisi dans la bibliothèque pré-faite servie par le
 * frontend, soit upload custom (post-MVP). Hedra intègre l'audio dans le
 * MP4 final donc aucun mux ffmpeg n'est nécessaire pour talking-head.
 */
import { falQueueRequest, resolveImageForFal } from './fal-landing.service';
import { persistRemoteVideo } from './storage.service';
import { generateVoiceover } from './voiceover.service';
import { logger } from '../lib/logger';
import type { VideoProgressCallback } from './video-generation.service';

// Hedra Character-1 : image + audio → talking head lip-synced. Modèle
// spécialisé "talking avatar" — pas d'équivalent gratuit à ce niveau de
// qualité en 2026. Override via env pour tester d'autres providers.
const HEDRA_MODEL = process.env.FAL_HEDRA_MODEL || 'fal-ai/hedra/character-1';

// Kling v2 master i2v — motion humaine de très bonne qualité, gère bien
// les personnages (contrairement à Seedance qui excelle sur les objets).
const KLING_MODEL = process.env.FAL_KLING_MODEL || 'fal-ai/kling-video/v2/master/image-to-video';

// Durée Kling autorisée — 5 ou 10s côté fal ; on expose 5/10 pour rester
// sur des ratios logiques (10 remplace le 12 de Seedance).
const KLING_DURATIONS = [5, 10] as const;
const KLING_DEFAULT_DURATION = 5;

export interface UgcInput {
  storeName: string;
  product: {
    name: string;
    category?: string;
    description?: string;
    images?: string[];
    price?: number;
  };
  language?: string;
  country?: string;
  /** URL absolue de l'image du personnage (avatar). Peut être HTTPS
   *  public (bibliothèque frontend) ou fal.storage (upload custom). */
  avatarUrl: string;
  /** Mode UGC choisi par le vendeur. */
  mode: 'talking-head' | 'lifestyle';
  /** Script de voix-off — REQUIS pour talking-head, IGNORÉ pour lifestyle. */
  script?: string;
  /** Prompt de scène — REQUIS pour lifestyle, IGNORÉ pour talking-head. */
  scenePrompt?: string;
  /** Durée en secondes (lifestyle seulement, 5 ou 10). Talking-head suit
   *  la durée de l'audio TTS (Hedra détermine automatiquement). */
  duration?: number;
  /** Voix ElevenLabs (talking-head). Défaut = Rachel. */
  voice?: string;
}

export interface UgcResult {
  videoUrl: string;
  width: number;
  height: number;
  durationSeconds: number;
  mode: 'talking-head' | 'lifestyle';
  avatarUrl: string;
  script?: string;
  scenePrompt?: string;
  modelId: string;
}

/**
 * Mode talking-head — TTS puis Hedra. Hedra gère lui-même la synchronisation
 * audio+vidéo dans un MP4 unique, donc pas de mux nécessaire.
 */
async function generateTalkingHead(
  input: UgcInput,
  emit: (u: Parameters<VideoProgressCallback>[0]) => Promise<void>,
): Promise<UgcResult> {
  if (!input.script || input.script.trim().length === 0) {
    const err = new Error('Script required for talking-head') as Error & { statusCode?: number; publicMessage?: string };
    err.statusCode = 400;
    err.publicMessage = 'Le script est obligatoire pour un UGC talking-head.';
    throw err;
  }

  // Étape 1 : préparation avatar (upload sur fal.storage si nécessaire).
  await emit({ step: 'analyze', status: 'running' });
  const avatarFalUrl = await resolveImageForFal(input.avatarUrl);
  await emit({ step: 'analyze', status: 'done' });

  // Étape 2 : génération audio TTS ElevenLabs (voix baked dans vidéo Hedra).
  await emit({ step: 'copy', status: 'running' });
  const voice = await generateVoiceover({
    script: input.script,
    language: input.language,
    voice: input.voice,
  });
  await emit({ step: 'copy', status: 'done' });

  // Étape 3 : Hedra Character-1 — synchronise lèvres avec l'audio.
  await emit({ step: 'images', status: 'running' });
  const out = await falQueueRequest<{
    video?: { url?: string; content_type?: string };
  }>(
    HEDRA_MODEL,
    {
      image_url: avatarFalUrl,
      audio_url: voice.audioUrl,
    },
    { maxWaitMs: 5 * 60_000 },
  );
  await emit({ step: 'images', status: 'done' });

  const falVideoUrl = out?.video?.url;
  if (!falVideoUrl) {
    const err = new Error('Hedra returned no video URL') as Error & { statusCode?: number; publicMessage?: string };
    err.statusCode = 502;
    err.publicMessage = 'Le service UGC n\'a pas renvoyé de vidéo. Réessaie.';
    throw err;
  }

  // Étape 4 : persist en R2/S3/local.
  await emit({ step: 'assemble', status: 'running' });
  let videoUrl = falVideoUrl;
  try {
    videoUrl = await persistRemoteVideo(falVideoUrl);
  } catch (persistErr) {
    logger.warn(
      { err: (persistErr as Error).message, falVideoUrl },
      '[ugc-talking] persist failed — returning fal URL as fallback',
    );
  }

  return {
    videoUrl,
    // Hedra renvoie du 512×512 ou 720×720 selon input — on renvoie une
    // taille indicative, le frontend lit la vraie taille depuis <video>.
    width: 720,
    height: 720,
    // Durée basée sur celle du TTS si connue, sinon fallback 10s.
    durationSeconds: Math.round(voice.durationSeconds || 10),
    mode: 'talking-head',
    avatarUrl: input.avatarUrl,
    script: input.script,
    modelId: HEDRA_MODEL,
  };
}

/**
 * Mode lifestyle — Kling v2 image-to-video avec le personnage + prompt de
 * scène. Aucun audio (vidéo silencieuse). Le vendeur peut monter du son
 * en post-prod dans CapCut.
 */
async function generateLifestyle(
  input: UgcInput,
  emit: (u: Parameters<VideoProgressCallback>[0]) => Promise<void>,
): Promise<UgcResult> {
  if (!input.scenePrompt || input.scenePrompt.trim().length === 0) {
    const err = new Error('scenePrompt required for lifestyle') as Error & { statusCode?: number; publicMessage?: string };
    err.statusCode = 400;
    err.publicMessage = 'Un prompt de scène est obligatoire pour un UGC lifestyle.';
    throw err;
  }

  const duration = KLING_DURATIONS.includes(input.duration as (typeof KLING_DURATIONS)[number])
    ? (input.duration as number)
    : KLING_DEFAULT_DURATION;

  // Prompt Kling — combine le personnage + le produit + la scène demandée.
  // Kling parle mieux anglais que français, on préfixe donc en EN pour la
  // partie descriptive tout en laissant le vendeur écrire son prompt libre.
  const enrichedPrompt = `A person naturally interacting with ${input.product.name}${input.product.category ? ` (${input.product.category})` : ''}. ${input.scenePrompt.trim()}`;

  await emit({ step: 'analyze', status: 'running' });
  const avatarFalUrl = await resolveImageForFal(input.avatarUrl);
  await emit({ step: 'analyze', status: 'done' });

  await emit({ step: 'copy', status: 'done' }); // Pas d'étape copy pour Kling

  await emit({ step: 'images', status: 'running' });
  const out = await falQueueRequest<{
    video?: { url?: string };
  }>(
    KLING_MODEL,
    {
      prompt: enrichedPrompt,
      image_url: avatarFalUrl,
      duration: `${duration}`,
      // negative prompt Kling — évite les artefacts classiques ads
      negative_prompt: 'blurry, low quality, distorted, text overlay, watermark',
    },
    { maxWaitMs: 6 * 60_000 },
  );
  await emit({ step: 'images', status: 'done' });

  const falVideoUrl = out?.video?.url;
  if (!falVideoUrl) {
    const err = new Error('Kling returned no video URL') as Error & { statusCode?: number; publicMessage?: string };
    err.statusCode = 502;
    err.publicMessage = 'Le service UGC n\'a pas renvoyé de vidéo. Réessaie.';
    throw err;
  }

  await emit({ step: 'assemble', status: 'running' });
  let videoUrl = falVideoUrl;
  try {
    videoUrl = await persistRemoteVideo(falVideoUrl);
  } catch (persistErr) {
    logger.warn(
      { err: (persistErr as Error).message, falVideoUrl },
      '[ugc-lifestyle] persist failed — returning fal URL as fallback',
    );
  }

  return {
    videoUrl,
    // Kling v2 rend en 1024×576 (16:9). Frontend re-mesure via <video>.
    width: 1024,
    height: 576,
    durationSeconds: duration,
    mode: 'lifestyle',
    avatarUrl: input.avatarUrl,
    scenePrompt: input.scenePrompt,
    modelId: KLING_MODEL,
  };
}

/**
 * Point d'entrée unique — dispatch selon `input.mode`. Signature symétrique
 * à `generateVideo` pour que `runUgcPipeline` puisse le passer à
 * `buildProgressCb` comme n'importe quel autre pipeline.
 */
export async function generateUgcVideo(
  input: UgcInput,
  onProgress?: VideoProgressCallback,
): Promise<UgcResult> {
  const emit = async (u: Parameters<VideoProgressCallback>[0]) => {
    if (!onProgress) return;
    try { await onProgress(u); } catch (e) {
      logger.warn({ err: (e as Error).message, step: u.step }, '[ugc-video] onProgress cb threw');
    }
  };

  if (input.mode === 'talking-head') return generateTalkingHead(input, emit);
  if (input.mode === 'lifestyle') return generateLifestyle(input, emit);

  const err = new Error(`Unknown UGC mode: ${input.mode}`) as Error & { statusCode?: number; publicMessage?: string };
  err.statusCode = 400;
  err.publicMessage = 'Mode UGC inconnu.';
  throw err;
}
