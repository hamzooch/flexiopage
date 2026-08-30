/**
 * Video generation for AI Studio — image-to-video via fal-ai Seedance.
 *
 * Pipeline :
 *   1. LLM (Claude via fal any-llm) écrit un prompt vidéo court en anglais
 *      (le modèle Seedance ne comprend pas l'arabe / le français aussi bien).
 *      Le prompt décrit un plan cinématique valorisant le produit :
 *      angle, lumière, mouvement, ambiance.
 *   2. Seedance Lite (image-to-video, 5s, 720p) anime la 1ʳᵉ photo produit
 *      selon ce prompt et rend un MP4 hébergé sur fal.media (24h TTL).
 *
 * Coût : facturé au wallet AI via le bucket `video` (voir Settings).
 * Retourne l'URL vidéo direct (fal.media) + les métadonnées de rendu ;
 * le frontend peut soit lire directement soit download pour persister.
 */
import { falQueueRequest, resolveImageForFal, runLLM } from './fal-landing.service';
import { persistRemoteVideo } from './storage.service';
import { addVoiceoverToVideo } from './voiceover.service';
import { logger } from '../lib/logger';

// Modèle Seedance Lite (i2v) — 5s en 720p pour ~$0.18. La Pro variant
// ($0.62) donne 1080p mais on garde Lite en défaut ; l'admin peut
// override via env pour tester la Pro sans redéployer.
const VIDEO_MODEL =
  process.env.FAL_VIDEO_MODEL || 'fal-ai/bytedance/seedance/v1/lite/image-to-video';

// Sensible defaults — 8s + 720p suffisent pour un usage ads storefront.
const DEFAULT_DURATION = 8;
const DEFAULT_RESOLUTION = '720p';
// Durées autorisées côté API — Seedance Lite/Pro plafonne à 12s
// (valeurs supportées : 2..12). On expose 5/8/12 aux vendeurs pour couvrir
// court/moyen/long sans surprises côté fal.
const ALLOWED_DURATIONS = [5, 8, 12] as const;

export interface VideoInput {
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
  /** Prompt vidéo custom si le vendeur veut piloter — sinon on demande au LLM. */
  customPrompt?: string;
  /** Durée souhaitée en secondes — 5, 8 ou 12 (limite Seedance). Défaut 8s. */
  duration?: number;
  /**
   * URL image alternative pour piloter Seedance (upload custom, URL externe,
   * scrape produit). Si fourni, remplace product.images[0]. Le brief produit
   * reste utilisé pour écrire le prompt LLM (ambiance, ton).
   */
  sourceImageUrl?: string;
  /**
   * Script de voix-off optionnel. Si présent, on ajoute une piste TTS après
   * le rendu Seedance (ElevenLabs multilingual v2 muxé par ffmpeg) et le
   * MP4 final est persisté avec l'audio. Le controller doit avoir déjà
   * facturé au tarif `video_with_voice` avant d'appeler generateVideo().
   */
  voiceoverScript?: string;
  /** Langue de la voix (fr / en / ar / ...) — ElevenLabs auto-détecte sinon. */
  voiceoverLanguage?: string;
}

export interface VideoResult {
  videoUrl: string;
  width: number;
  height: number;
  durationSeconds: number;
  prompt: string;
  modelId: string;
  /** True si un voice-over IA a été demandé ET intégré avec succès. False
   *  si non demandé, ou si demandé mais que le TTS/mux a échoué (dans ce
   *  cas le vendeur récupère la vidéo muette — refund manuel si besoin). */
  hasVoiceover?: boolean;
}

/**
 * Demande au LLM un prompt Seedance court, cinématique, en anglais.
 * Pas de JSON, pas de wrapping — on récupère le texte brut à passer tel
 * quel à Seedance.
 */
async function writeVideoPrompt(input: VideoInput, durationSec: number): Promise<string> {
  if (input.customPrompt && input.customPrompt.trim().length > 0) {
    return input.customPrompt.trim();
  }
  const desc = (input.product.description || '').slice(0, 400);
  const prompt = `You are writing a short cinematic video prompt for an AI image-to-video model.
Product: "${input.product.name}"
Store: "${input.storeName}"
${input.product.category ? `Category: ${input.product.category}` : ''}
${desc ? `Details: ${desc}` : ''}

Write ONE English prompt (max 40 words) describing a premium ${durationSec}-second product video: camera angle,
subtle motion (rotation, dolly, product highlight), lighting, mood. NO text overlay. NO people
holding the product. Focus on the product hero shot. Output the prompt text only, no quotes,
no preamble.`;
  const fallback = `Cinematic product hero shot of ${input.product.name}, slow rotation, soft studio lighting, premium mood, ${durationSec} seconds`;
  // Le prompt LLM est un « nice to have » : si any-llm échoue (422 modèle
  // retiré, quota, indispo), on part sur le prompt générique plutôt que de
  // faire échouer toute la génération (déjà facturée au vendeur).
  let raw: string;
  try {
    raw = (await runLLM(prompt)).trim();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[video-gen] LLM prompt failed — using fallback prompt');
    return fallback;
  }
  // Sécurité : coupe à 300 chars et retire les guillemets englobants s'il y en a.
  return raw.replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 300) || fallback;
}

/**
 * Callback optionnel pour émettre les transitions d'étapes au consommateur
 * (typiquement `runVideoPipeline` qui persiste en DB pour piloter la
 * Timeline live côté frontend). Découplé de la DB pour rester testable /
 * utilisable dans un contexte non-job (script one-shot).
 */
export type VideoProgressStep = 'analyze' | 'copy' | 'images' | 'assemble';
export type VideoProgressCallback = (u: {
  step: VideoProgressStep;
  status: 'running' | 'done' | 'failed';
  progress?: number;
}) => Promise<void>;

/**
 * Génère la vidéo. Le maxWaitMs est augmenté à 6 min car Seedance peut
 * mettre 60-120s selon la charge fal.
 *
 * `onProgress` est appelé à chaque transition d'étape — sert au job
 * pipeline à mettre à jour `job.steps.*` que le frontend poll pour
 * afficher la Timeline live. Best-effort : une exception dans le callback
 * ne fait pas échouer la génération (juste un log).
 */
export async function generateVideo(
  input: VideoInput,
  onProgress?: VideoProgressCallback,
): Promise<VideoResult> {
  const emit = async (u: Parameters<VideoProgressCallback>[0]) => {
    if (!onProgress) return;
    try { await onProgress(u); } catch (e) {
      logger.warn({ err: (e as Error).message, step: u.step }, '[video-gen] onProgress cb threw');
    }
  };
  // Priorité à la sourceImageUrl (upload custom / URL / scrape produit).
  // Sinon on retombe sur la 1ʳᵉ photo du produit — comportement historique.
  const cover = input.sourceImageUrl?.trim() || input.product.images?.[0];
  if (!cover) {
    const err = new Error('No source image available — cannot generate video') as Error & {
      statusCode?: number;
      publicMessage?: string;
    };
    err.statusCode = 400;
    err.publicMessage = 'Aucune image source. Choisis une photo produit ou fournis une image / un lien.';
    throw err;
  }

  // Whitelist stricte : durée doit être 5, 8 ou 12 — sinon fallback default.
  const duration = ALLOWED_DURATIONS.includes(input.duration as (typeof ALLOWED_DURATIONS)[number])
    ? (input.duration as number)
    : DEFAULT_DURATION;

  // Étape analyze : préparation de l'image (upload sur fal.storage si local).
  await emit({ step: 'analyze', status: 'running' });
  const imageUrl = await resolveImageForFal(cover);
  await emit({ step: 'analyze', status: 'done' });

  // Étape copy : écriture du prompt vidéo par le LLM (ou custom du vendeur).
  await emit({ step: 'copy', status: 'running' });
  const prompt = await writeVideoPrompt(input, duration);
  await emit({ step: 'copy', status: 'done' });

  // Étape images : rendu Seedance — LA plus longue (60-120s).
  await emit({ step: 'images', status: 'running' });

  // Rendu plus long → attente plus longue côté fal (facteur ~2× la durée demandée).
  const maxWaitMs = Math.max(6 * 60_000, duration * 30_000);

  const out = await falQueueRequest<{
    video?: { url?: string; content_type?: string; file_size?: number };
    seed?: number;
  }>(
    VIDEO_MODEL,
    {
      prompt,
      image_url: imageUrl,
      duration,
      resolution: DEFAULT_RESOLUTION,
    },
    { maxWaitMs },
  );

  const falVideoUrl = out?.video?.url;
  if (!falVideoUrl) {
    const err = new Error('Seedance returned no video URL') as Error & {
      statusCode?: number;
      publicMessage?: string;
    };
    err.statusCode = 502;
    err.publicMessage = 'Le service vidéo n\'a pas renvoyé de fichier. Réessaie.';
    throw err;
  }

  // Rendu Seedance terminé — étape assemble (voice-over éventuel + persist).
  await emit({ step: 'images', status: 'done' });
  await emit({ step: 'assemble', status: 'running' });

  // Voice-over optionnel : si un script est fourni, on ajoute une piste
  // TTS + mux ffmpeg AVANT de persister — comme ça on stocke directement
  // le MP4 final avec audio, une seule URL retournée au frontend.
  // Si le voice-over échoue (TTS down, ffmpeg crash), on log et on retombe
  // sur la vidéo muette persistée normalement — la facture est déjà passée,
  // vaut mieux livrer une vidéo sans voix qu'un échec total.
  const wantsVoice = !!input.voiceoverScript && input.voiceoverScript.trim().length > 0;
  let videoUrl = falVideoUrl;
  let voiceoverAdded = false;

  if (wantsVoice) {
    try {
      videoUrl = await addVoiceoverToVideo(falVideoUrl, {
        script: input.voiceoverScript!,
        language: input.voiceoverLanguage || input.language,
      });
      voiceoverAdded = true;
    } catch (voErr) {
      logger.warn(
        { err: (voErr as Error).message, falVideoUrl },
        '[video-gen] voice-over failed — falling back to silent video',
      );
    }
  }

  // Persistance seulement si le voice-over n'a pas déjà pris le relais
  // (addVoiceoverToVideo persiste lui-même via persistVideoBuffer).
  if (!voiceoverAdded) {
    try {
      videoUrl = await persistRemoteVideo(falVideoUrl);
    } catch (persistErr) {
      logger.warn(
        { err: (persistErr as Error).message, falVideoUrl },
        '[video-gen] persist to storage failed — returning fal URL as fallback',
      );
    }
  }

  // Résolution effective — Seedance Lite 720p vertical (portrait) par défaut.
  // On renvoie des dims indicatives ; le frontend peut les lire via metadata
  // du <video> tag une fois chargé s'il faut la précision.
  const width = DEFAULT_RESOLUTION === '720p' ? 720 : 1080;
  const height = Math.round(width * (16 / 9));

  return {
    videoUrl,
    width,
    height,
    durationSeconds: duration,
    prompt,
    modelId: VIDEO_MODEL,
    hasVoiceover: voiceoverAdded,
  };
}
