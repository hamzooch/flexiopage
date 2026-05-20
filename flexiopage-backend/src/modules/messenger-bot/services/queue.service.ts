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
/** Adaptateur d'ajout BullMQ injecté par queue/bull.ts quand Redis est dispo. */
type BullAdder = (job: IncomingMessageJob) => Promise<void>;

class MessageQueue {
  private processor: Processor | null = null;
  private bullAdder: BullAdder | null = null;

  /** Le worker in-process enregistre son processeur ici (repli sans Redis). */
  registerProcessor(fn: Processor): void {
    this.processor = fn;
  }

  /** queue/bull.ts injecte l'ajout BullMQ ici quand Redis est configuré. */
  useBullQueue(adder: BullAdder): void {
    this.bullAdder = adder;
  }

  /** Met un message entrant en file. Best-effort, ne bloque jamais le webhook. */
  async enqueue(job: IncomingMessageJob): Promise<void> {
    // 1) BullMQ si dispo (durable, hors-process).
    if (this.bullAdder) {
      try {
        await this.bullAdder(job);
        return;
      } catch (err) {
        logger.error({ err: (err as Error).message }, '[messenger-bot] enqueue BullMQ échec — repli in-process');
      }
    }
    // 2) Repli in-process.
    if (!this.processor) {
      logger.info(
        { conversationId: job.conversationId, pageId: job.pageId },
        '[messenger-bot] message reçu mais aucun worker disponible',
      );
      return;
    }
    void this.processor(job).catch((err) =>
      logger.error({ err: (err as Error).message, conversationId: job.conversationId }, '[messenger-bot] traitement message échec'),
    );
  }
}

export const messageQueue = new MessageQueue();
