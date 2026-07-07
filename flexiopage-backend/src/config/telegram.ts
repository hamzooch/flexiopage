/**
 * Configuration du bot Telegram vendeur (notifications côté vendeur).
 *
 * UN seul bot plateforme (@<TELEGRAM_BOT_USERNAME>) auquel chaque vendeur lie
 * son compte via un deep-link `/start <token>`. Gratuit (API Bot Telegram sans
 * coût par message). Env requis en prod :
 *   TELEGRAM_BOT_TOKEN     — jeton fourni par @BotFather
 *   TELEGRAM_BOT_USERNAME  — username du bot (sans @), pour le deep-link
 *   TELEGRAM_WEBHOOK_SECRET — secret vérifié sur l'en-tête du webhook (recommandé)
 */

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
export const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

/** URL de base de l'API Bot Telegram (vide si non configuré). */
export const TELEGRAM_API = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : '';

/** True quand le bot est utilisable (token + username présents). */
export function isTelegramConfigured(): boolean {
  return !!TELEGRAM_BOT_TOKEN && !!TELEGRAM_BOT_USERNAME;
}
