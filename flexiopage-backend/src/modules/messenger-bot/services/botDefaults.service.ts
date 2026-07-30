/**
 * Défauts globaux appliqués aux nouvelles BotConfig + reset mensuel paresseux.
 *
 * Les défauts (`conversations_limit`, `messages_limit_max`) viennent de
 * `Settings.platform.defaultBot*` — configurables depuis /admin/store-limits.
 * Les valeurs par défaut du schéma Mongoose (50, 1000) restent le filet de
 * sécurité si la lecture Settings échoue.
 *
 * Le reset mensuel est paresseux (sans cron) : on remet
 * `conversations_used_this_month` à 0 au premier webhook du mois si
 * `month_reset_date` est dans un mois passé (ou absent). Les périodes de
 * dédup de notif sont réinitialisées implicitement — elles sont keyées par
 * "YYYY-MM" et changent quand on change de mois.
 */
import { BotConfig, type IBotConfig } from '../models/BotConfig.model';
import { Store } from '../../../models/Store.model';
import { getSettings, DEFAULT_PLATFORM_SETTINGS } from '../../../models/Settings.model';
import { logger } from '../../../lib/logger';
import { notifyBotConvWarning, notifyBotConvCapped } from '../../../services/notification.service';

/** Seuil de warning "approche de la limite" (fraction du quota). */
const WARN_THRESHOLD = 0.8;

/** Champs `$setOnInsert` pour un upsert de BotConfig — applique les défauts admin. */
export async function botConfigInsertDefaults(): Promise<Record<string, number>> {
  try {
    const s = await getSettings();
    return {
      conversations_limit: s.platform?.defaultBotConversationsLimit ?? DEFAULT_PLATFORM_SETTINGS.defaultBotConversationsLimit,
      messages_limit_max: s.platform?.defaultBotMessagesLimitMax ?? DEFAULT_PLATFORM_SETTINGS.defaultBotMessagesLimitMax,
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[bot-defaults] getSettings failed — using hardcoded fallback');
    return {
      conversations_limit: DEFAULT_PLATFORM_SETTINGS.defaultBotConversationsLimit,
      messages_limit_max: DEFAULT_PLATFORM_SETTINGS.defaultBotMessagesLimitMax,
    };
  }
}

/** Retourne "YYYY-MM" pour la date donnée en UTC. */
export function periodKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Reset paresseux du compteur mensuel : si `month_reset_date` est dans un mois
 * passé (ou absent), on remet `conversations_used_this_month` à 0 et on pose
 * `month_reset_date` au 1er du mois suivant. Idempotent, compare-and-set.
 * Retourne la config à jour (in-place).
 */
export async function ensureCurrentMonth(config: IBotConfig): Promise<IBotConfig> {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const resetDate = config.month_reset_date ? new Date(config.month_reset_date) : null;

  // Si la borne de reset existe et est encore dans le futur, on est dans le bon mois.
  if (resetDate && resetDate > now) return config;

  // Compare-and-set : ne reset que si personne n'a déjà fait le reset ce mois.
  const res = await BotConfig.updateOne(
    { _id: config._id, $or: [{ month_reset_date: { $lt: startOfMonth } }, { month_reset_date: null }, { month_reset_date: { $exists: false } }] },
    { $set: { conversations_used_this_month: 0, month_reset_date: nextMonth } },
  );
  if (res.modifiedCount === 1) {
    config.conversations_used_this_month = 0;
    config.month_reset_date = nextMonth;
  }
  return config;
}

/**
 * À appeler juste APRÈS avoir incrémenté `conversations_used_this_month` sur
 * une nouvelle conversation. Notifie une fois par période au passage de 80%
 * (warning) et 100% (capped). Non-bloquant.
 *
 * `used` = valeur du compteur APRÈS incrément.
 */
export async function maybeNotifyConvThreshold(args: {
  config: IBotConfig;
  used: number;
}): Promise<void> {
  const { config, used } = args;
  const limit = config.conversations_limit;
  if (!Number.isFinite(limit) || limit <= 0) return;
  const period = periodKey();
  const atCap = used >= limit;
  const atWarn = used >= Math.floor(limit * WARN_THRESHOLD);
  if (!atCap && !atWarn) return;

  // Résout l'owner de la boutique une seule fois (petit lookup indexé).
  const store = await Store.findById(config.vendor_id).select('ownerId').lean();
  const ownerId = store?.ownerId ? String(store.ownerId) : null;
  if (!ownerId) return; // boutique orpheline — rien à notifier

  // 100% : le bot est coupé — notif prioritaire.
  if (atCap) {
    const res = await BotConfig.updateOne(
      { _id: config._id, conversations_cap_notified_period: { $ne: period } },
      { $set: { conversations_cap_notified_period: period } },
    );
    if (res.modifiedCount === 1) {
      try {
        await notifyBotConvCapped({
          userId: ownerId,
          storeId: String(config.vendor_id),
          channel: config.channel,
          limit,
        });
      } catch (err) {
        logger.warn({ err: (err as Error).message }, '[bot-defaults] notif capped échouée');
      }
    }
    return; // pas besoin de dédup warning si on est déjà au cap
  }

  // 80% : warning proactif.
  const res = await BotConfig.updateOne(
    { _id: config._id, conversations_warn_notified_period: { $ne: period } },
    { $set: { conversations_warn_notified_period: period } },
  );
  if (res.modifiedCount === 1) {
    try {
      await notifyBotConvWarning({
        userId: ownerId,
        storeId: String(config.vendor_id),
        channel: config.channel,
        used,
        limit,
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[bot-defaults] notif warning échouée');
    }
  }
}
