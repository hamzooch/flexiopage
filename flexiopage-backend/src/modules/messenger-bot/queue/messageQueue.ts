/**
 * Mise en place BullMQ (Queue + Worker) pour le traitement des messages.
 * Activée uniquement si REDIS_URL est défini ; sinon le module utilise le
 * traitement in-process (registerMessageWorker).
 */
import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '../../../lib/logger';
import { getRedisConnection } from './connection';
import { messageQueue, type IncomingMessageJob } from '../services/queue.service';
import { processIncomingMessage } from '../workers/messageWorker';

const QUEUE_NAME = 'messenger-incoming';

let queue: Queue | null = null;
let worker: Worker | null = null;

/**
 * Initialise BullMQ si Redis est dispo. Retourne true si BullMQ est actif,
 * false si on reste en in-process.
 */
export function initMessengerQueue(): boolean {
  const connection = getRedisConnection();
  if (!connection) return false;

  queue = new Queue(QUEUE_NAME, { connection });

  // L'enqueue du webhook passera désormais par BullMQ.
  messageQueue.useBullQueue(async (job: IncomingMessageJob) => {
    await queue!.add('incoming', job, {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  });

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job<IncomingMessageJob>) => { await processIncomingMessage(job.data); },
    { connection, concurrency: 5 },
  );
  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, '[messenger-bot] BullMQ job échec'),
  );

  logger.info('[messenger-bot] BullMQ actif (Redis)');
  return true;
}

export async function shutdownMessengerQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
}
