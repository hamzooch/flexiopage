/**
 * Metering du chatbot : facturation des messages AU-DELÀ de la limite incluse.
 *
 * Modèle (validé produit) :
 *   - Jusqu'à `config.messages_limit` messages/mois → inclus (gratuit).
 *   - Au-delà → CHAQUE message est prélevé du solde IA (tokens). Le vendeur est
 *     notifié une fois (par période) au passage en mode payant.
 *   - Quand le solde IA est épuisé → le message n'est pas traité, notif « solde
 *     épuisé » une fois par période. Le bot reprend dès recharge.
 *
 * La limite est réglée par l'owner (≤ `messages_limit_max`, plafond admin).
 * Le compteur mensuel réel = `BotUsage.messages_count` de la période courante.
 */
import { debit } from '../../../services/wallet.service';
import { notifyBotLimitReached, notifyBotBalanceEmpty } from '../../../services/notification.service';
import { logger } from '../../../lib/logger';
import { BotConfig, type IBotConfig } from '../models/BotConfig.model';

/** Coût en tokens IA d'un message en dépassement (configurable). */
export function overageTokenCost(): number {
  const n = Number(process.env.BOT_MESSAGE_OVERAGE_TOKENS);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export type MeterReason = 'included' | 'billed' | 'ai_balance_empty';

export interface MeterResult {
  /** True si le message doit être traité (répondu par Claude). */
  allowed: boolean;
  /** True si des tokens IA ont été prélevés pour ce message. */
  billed: boolean;
  reason: MeterReason;
  /** Tokens prélevés (0 si inclus ou refusé). */
  chargedTokens: number;
}

/**
 * Notifie au plus une fois par période, de façon atomique (anti-doublon même
 * en concurrence) : on ne notifie que si on a réussi à poser le marqueur
 * `field = period` (compare-and-set). La notif elle-même est best-effort.
 */
async function notifyOncePerPeriod(
  config: Pick<IBotConfig, '_id'>,
  field: 'over_limit_notified_period' | 'ai_empty_notified_period',
  period: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  const res = await BotConfig.updateOne(
    { _id: (config as { _id: unknown })._id, [field]: { $ne: period } },
    { $set: { [field]: period } },
  );
  if (res.modifiedCount !== 1) return; // déjà notifié cette période
  try {
    await fn();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[bot-metering] notif échouée (non-fatal)');
  }
}

/**
 * Décide si le message entrant est inclus, facturé, ou refusé (solde vide).
 * `usedBefore` = nombre de messages DÉJÀ traités cette période (BotUsage).
 * Effectue le prélèvement IA et les notifications le cas échéant.
 */
export async function enforceMessageLimit(args: {
  config: IBotConfig;
  storeOwnerId: string;
  storeId: string;
  period: string;
  usedBefore: number;
}): Promise<MeterResult> {
  const { config, storeOwnerId, storeId, period, usedBefore } = args;
  const limit = Math.max(0, config.messages_limit ?? 1000);

  // Le message entrant est le n°(usedBefore + 1). Inclus tant que usedBefore < limit.
  if (usedBefore < limit) {
    return { allowed: true, billed: false, reason: 'included', chargedTokens: 0 };
  }

  const cost = overageTokenCost();
  try {
    await debit({
      userId: storeOwnerId,
      amount: cost,
      bucket: 'ai',
      enforceBalance: true,
      kind: 'ai_generation',
      note: `Chatbot ${config.channel} — message au-delà de la limite (${limit})`,
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'insufficient_ai_balance') {
      await notifyOncePerPeriod(config, 'ai_empty_notified_period', period, () =>
        notifyBotBalanceEmpty({ userId: storeOwnerId, storeId, channel: config.channel }),
      );
      return { allowed: false, billed: false, reason: 'ai_balance_empty', chargedTokens: 0 };
    }
    throw err;
  }

  // Prélèvement OK → premier dépassement de la période : on prévient le vendeur.
  await notifyOncePerPeriod(config, 'over_limit_notified_period', period, () =>
    notifyBotLimitReached({ userId: storeOwnerId, storeId, channel: config.channel, limit }),
  );
  return { allowed: true, billed: true, reason: 'billed', chargedTokens: cost };
}
