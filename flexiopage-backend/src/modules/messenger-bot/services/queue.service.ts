/**
 * Abstraction de file pour le traitement ASYNC des messages entrants.
 *
 * ⚠️ Implémentation de TRANSITION : le webhook doit répondre à Meta en < ~20s,
 * donc on met le message en file et on répond 200 tout de suite. La version
 * BullMQ + Redis + worker sera branchée à la prochaine session (OAuth + queue).
 * Ici, `enqueue` délègue à un processeur enregistré (ou logge si aucun), ce qui
 * permet de tester le pipeline sans Redis. L'interface ne changera pas quand on
 * passera à BullMQ.
 */
import { logger } from '../../../lib/logger';

export interface IncomingMessageJob {
  botConfigId: string;
  conversationId: string;
  vendorId: string;
  pageId: string;
  customerPsid: string;
  text: string;
  messengerMessageId?: string;
}

type Processor = (job: IncomingMessageJob) => Promise<void>;

class MessageQueue {
  private processor: Processor | null = null;

  /** Le worker enregistre son processeur ici (remplacé par BullMQ ensuite). */
  registerProcessor(fn: Processor): void {
    this.processor = fn;
  }

  /** Met un message entrant en file. Best-effort, ne bloque jamais le webhook. */
  async enqueue(job: IncomingMessageJob): Promise<void> {
    if (!this.processor) {
      logger.info(
        { conversationId: job.conversationId, pageId: job.pageId },
        '[messenger-bot] message en file (aucun worker enregistré — TODO BullMQ)',
      );
      return;
    }
    // Exécution détachée : on ne bloque pas la réponse 200 à Meta.
    void this.processor(job).catch((err) =>
      logger.error({ err: (err as Error).message, conversationId: job.conversationId }, '[messenger-bot] traitement message échec'),
    );
  }
}

export const messageQueue = new MessageQueue();
