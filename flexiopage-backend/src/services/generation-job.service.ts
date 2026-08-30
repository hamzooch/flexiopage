/**
 * GenerationJob orchestration. The HTTP route returns immediately with a
 * jobId; this module runs the AI pipeline in the background and updates
 * the job document at each step so the frontend can poll progress.
 */
import { GenerationJob, type IGenerationJob, type JobStep, type JobStatus } from '../models/GenerationJob.model';
import { AiGeneration } from '../models/AiGeneration.model';
import {
  generateLandingFromProduct,
  generateLandingFromImage,
  type ProductInput,
  type GenerationContext,
} from './fal-landing.service';
import { generateVideo, type VideoInput } from './video-generation.service';
import { generateUgcVideo, type UgcInput } from './ugc-video.service';
import { refundAiGeneration } from './wallet.service';
import { logger } from '../lib/logger';

export interface ProgressUpdate {
  step: JobStep;
  status: 'running' | 'done' | 'failed';
  progress?: number;
}

export type ProgressCallback = (u: ProgressUpdate) => Promise<void>;

/** Approx % per step — gives a smooth progress bar even though steps vary. */
const STEP_PROGRESS: Record<JobStep, { running: number; done: number }> = {
  analyze:  { running: 5,  done: 18 },
  copy:     { running: 22, done: 50 },
  images:   { running: 55, done: 90 },
  assemble: { running: 92, done: 100 },
};

export async function createJob(args: {
  storeId: string;
  ownerId: string;
  kind: 'landing-from-product' | 'landing-from-image' | 'video';
  input?: Record<string, unknown>;
}): Promise<IGenerationJob> {
  return GenerationJob.create({
    storeId: args.storeId,
    ownerId: args.ownerId,
    kind: args.kind,
    status: 'pending' as JobStatus,
    progress: 0,
    currentStep: 'analyze',
    steps: { analyze: 'pending', copy: 'pending', images: 'pending', assemble: 'pending' },
    input: args.input,
  });
}

export async function getJob(jobId: string, ownerId: string): Promise<IGenerationJob | null> {
  return GenerationJob.findOne({ _id: jobId, ownerId }).lean<IGenerationJob>();
}

async function update(jobId: string, patch: Record<string, unknown>): Promise<void> {
  await GenerationJob.updateOne({ _id: jobId }, { $set: patch });
}

function buildProgressCb(jobId: string): ProgressCallback {
  return async ({ step, status, progress }) => {
    const stepProgress = STEP_PROGRESS[step];
    const computed = progress ?? (status === 'done' ? stepProgress.done : stepProgress.running);
    await update(jobId, {
      currentStep: step,
      progress: computed,
      [`steps.${step}`]: status,
      status: 'running' as JobStatus,
    });
  };
}

/**
 * Génère la vidéo Seedance en tâche de fond. Le rendu prend 1 à 6 min : en
 * synchrone, le reverse proxy (nginx) coupait la connexion avant la réponse
 * → 502 côté vendeur alors que la vidéo (déjà facturée) finissait dans le
 * vide. Le job + polling supprime toute requête HTTP longue.
 * Progression grossière (pas de hook interne dans generateVideo) : les
 * paliers correspondent aux étapes réelles prompt → rendu → persistance.
 */
export async function runVideoPipeline(jobId: string, input: VideoInput): Promise<void> {
  const onProgress = buildProgressCb(jobId);
  try {
    await update(jobId, {
      status: 'running',
      startedAt: new Date(),
      currentStep: 'analyze',
      'steps.analyze': 'running',
      progress: 5,
    });
    // Callback pilote la Timeline live côté frontend — chaque transition
    // (analyze→copy→images→assemble) push un update et le polling l'affiche
    // en temps réel (au lieu d'un spinner statique de 90 à 150s).
    const result = await generateVideo(input, onProgress);
    await update(jobId, {
      status: 'succeeded',
      progress: 100,
      currentStep: 'assemble',
      'steps.analyze': 'done',
      'steps.copy': 'done',
      'steps.images': 'done',
      'steps.assemble': 'done',
      result,
      finishedAt: new Date(),
    });
    // Historique — jamais bloquant. On récupère storeId/ownerId/productId
    // depuis le job (l'input pipeline ne les porte pas nativement).
    const jobDoc = await GenerationJob.findById(jobId).lean<IGenerationJob>();
    if (jobDoc) {
      const productId = (jobDoc.input as { productId?: string } | undefined)?.productId;
      AiGeneration.create({
        storeId: jobDoc.storeId,
        ownerId: jobDoc.ownerId,
        productId,
        kind: 'video',
        result: result as unknown as Record<string, unknown>,
        preview: {
          thumbnailUrl: input.product.images?.[0],
          title: input.product.name,
          subtitle: `${result.durationSeconds}s`,
        },
      }).catch((e) => logger.warn({ err: e.message }, '[ai-gen] failed to persist video'));
    }
  } catch (err) {
    const e = err as Error & { publicMessage?: string };
    console.error(`[video job ${jobId}] failed:`, e.message);
    await update(jobId, {
      status: 'failed',
      error: e.publicMessage || e.message || 'Génération vidéo échouée',
      'steps.images': 'failed',
      finishedAt: new Date(),
    });
    // Refund : le contrôleur a débité `chargeAmount` tokens AVANT ce pipeline
    // fire-and-forget. Sans refund ici, le vendeur paie une vidéo qu'il n'a
    // jamais reçue. paymentReference = jobId → une reprise du même job
    // n'accumule pas de crédits (idempotent côté wallet.credit).
    try {
      const jobDoc = await GenerationJob.findById(jobId).lean<IGenerationJob>();
      if (jobDoc) {
        const chargeAmount = Number((jobDoc.input as { chargeAmount?: number } | undefined)?.chargeAmount || 0);
        if (chargeAmount > 0) {
          await refundAiGeneration({
            userId: jobDoc.ownerId.toString(),
            amount: chargeAmount,
            refundKey: jobId,
            note: `Refund vidéo échouée · ${(e.message || 'unknown').slice(0, 120)}`,
          });
          logger.info({ jobId, amount: chargeAmount }, '[ai-refund] video refund applied');
        }
      }
    } catch (refundErr) {
      logger.error({ err: refundErr, jobId }, '[ai-refund] video refund failed');
    }
  }
}

/**
 * Pipeline UGC vidéo (talking-head Hedra ou lifestyle Kling). Mêmes patterns
 * que `runVideoPipeline` : Timeline live via onProgress, refund idempotent
 * sur échec (input.chargeAmount stocké au moment de la facturation).
 */
export async function runUgcVideoPipeline(jobId: string, input: UgcInput): Promise<void> {
  const onProgress = buildProgressCb(jobId);
  try {
    await update(jobId, {
      status: 'running',
      startedAt: new Date(),
      currentStep: 'analyze',
      'steps.analyze': 'running',
      progress: 5,
    });
    const result = await generateUgcVideo(input, onProgress);
    await update(jobId, {
      status: 'succeeded',
      progress: 100,
      currentStep: 'assemble',
      'steps.analyze': 'done',
      'steps.copy': 'done',
      'steps.images': 'done',
      'steps.assemble': 'done',
      result,
      finishedAt: new Date(),
    });
    // Historique — même record que vidéo classique, avec mode UGC dans le
    // preview subtitle pour le distinguer dans le panneau Récentes.
    const jobDoc = await GenerationJob.findById(jobId).lean<IGenerationJob>();
    if (jobDoc) {
      const productId = (jobDoc.input as { productId?: string } | undefined)?.productId;
      AiGeneration.create({
        storeId: jobDoc.storeId,
        ownerId: jobDoc.ownerId,
        productId,
        kind: 'video',
        result: result as unknown as Record<string, unknown>,
        preview: {
          thumbnailUrl: input.avatarUrl,
          title: input.product.name,
          subtitle: `UGC ${result.mode} · ${result.durationSeconds}s`,
        },
      }).catch((e) => logger.warn({ err: e.message }, '[ai-gen] failed to persist ugc video'));
    }
  } catch (err) {
    const e = err as Error & { publicMessage?: string };
    console.error(`[ugc job ${jobId}] failed:`, e.message);
    await update(jobId, {
      status: 'failed',
      error: e.publicMessage || e.message || 'Génération UGC échouée',
      'steps.images': 'failed',
      finishedAt: new Date(),
    });
    try {
      const jobDoc = await GenerationJob.findById(jobId).lean<IGenerationJob>();
      if (jobDoc) {
        const chargeAmount = Number((jobDoc.input as { chargeAmount?: number } | undefined)?.chargeAmount || 0);
        if (chargeAmount > 0) {
          await refundAiGeneration({
            userId: jobDoc.ownerId.toString(),
            amount: chargeAmount,
            refundKey: jobId,
            note: `Refund UGC échouée · ${(e.message || 'unknown').slice(0, 120)}`,
          });
          logger.info({ jobId, amount: chargeAmount }, '[ai-refund] ugc refund applied');
        }
      }
    } catch (refundErr) {
      logger.error({ err: refundErr, jobId }, '[ai-refund] ugc refund failed');
    }
  }
}

/**
 * Run the landing pipeline asynchronously, updating the job at each step.
 * Errors are caught and stored on the job — the function never rejects.
 */
export async function runLandingPipeline(
  jobId: string,
  args: {
    kind: 'landing-from-product' | 'landing-from-image';
    storeName: string;
    product?: ProductInput;
    imageUrl?: string;
    tone?: 'professional' | 'friendly' | 'minimal';
    context?: GenerationContext;
  }
): Promise<void> {
  const onProgress = buildProgressCb(jobId);
  try {
    await update(jobId, { status: 'running', startedAt: new Date() });

    const result =
      args.kind === 'landing-from-product' && args.product
        ? await generateLandingFromProduct(args.storeName, args.product, args.tone, args.context, onProgress)
        : await generateLandingFromImage(args.storeName, args.imageUrl || '', args.product, args.tone, args.context, onProgress);

    await update(jobId, {
      status: 'succeeded',
      progress: 100,
      currentStep: 'assemble',
      'steps.assemble': 'done',
      result,
      finishedAt: new Date(),
    });
  } catch (err) {
    const e = err as Error;
    console.error(`[job ${jobId}] failed:`, e.message);
    await update(jobId, {
      status: 'failed',
      error: e.message || 'Unknown error',
      [`steps.${(await GenerationJob.findById(jobId).select('currentStep').lean())?.currentStep || 'analyze'}`]: 'failed',
      finishedAt: new Date(),
    });
  }
}
