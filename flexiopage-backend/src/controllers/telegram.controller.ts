import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { isTelegramConfigured, TELEGRAM_WEBHOOK_SECRET } from '../config/telegram';
import { createLinkDeepLink, handleUpdate, sendTestMessage } from '../services/telegram.service';

/** État de la liaison Telegram du vendeur courant. */
export async function getTelegramStatus(req: AuthRequest, res: Response): Promise<void> {
  const u = req.user!;
  const tg = u.telegram;
  const hasChat = !!tg?.chatId;
  res.json({
    configured: isTelegramConfigured(),
    linked: hasChat && tg?.enabled !== false,
    paused: hasChat && tg?.enabled === false,
    username: tg?.username || null,
    firstName: tg?.firstName || null,
    linkedAt: tg?.linkedAt || null,
  });
}

/** Pause / reprend les notifications Telegram sans délier le compte. */
export async function setTelegramPreferences(req: AuthRequest, res: Response): Promise<void> {
  const body = (req.body || {}) as { enabled?: boolean };
  if (typeof body.enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled (boolean) requis' });
    return;
  }
  const u = await User.findById(req.user!._id).select('telegram').lean();
  if (!u?.telegram?.chatId) {
    res.status(409).json({ error: 'Aucun compte Telegram lié.' });
    return;
  }
  await User.updateOne({ _id: req.user!._id }, { $set: { 'telegram.enabled': body.enabled } });
  res.json({ ok: true, enabled: body.enabled });
}

/** Envoi d'un message de test (bouton "Tester" du dashboard). */
export async function testTelegram(req: AuthRequest, res: Response): Promise<void> {
  const result = await sendTestMessage(req.user!._id);
  if (!result.ok) {
    const status = result.reason === 'not_configured' ? 503 : result.reason === 'not_linked' || result.reason === 'disabled' ? 409 : 502;
    res.status(status).json({ ok: false, reason: result.reason });
    return;
  }
  res.json({ ok: true });
}

/** Génère le deep-link de liaison à ouvrir dans Telegram. */
export async function startTelegramLink(req: AuthRequest, res: Response): Promise<void> {
  if (!isTelegramConfigured()) {
    res.status(503).json({ error: 'Bot Telegram non configuré côté serveur.' });
    return;
  }
  const { deepLink } = await createLinkDeepLink(req.user!._id);
  res.json({ deepLink });
}

/** Délie complètement le compte Telegram du vendeur. */
export async function unlinkTelegram(req: AuthRequest, res: Response): Promise<void> {
  await User.updateOne(
    { _id: req.user!._id },
    { $unset: { telegram: '', telegramLinkToken: '', telegramLinkTokenExpiresAt: '' } },
  );
  res.json({ ok: true });
}

/**
 * Webhook Telegram (non authentifié — Telegram poste ici). On vérifie le
 * secret via l'en-tête `X-Telegram-Bot-Api-Secret-Token`, on ACK vite (200),
 * puis on traite l'update en arrière-plan.
 */
export async function receiveTelegramWebhook(req: Request, res: Response): Promise<void> {
  if (TELEGRAM_WEBHOOK_SECRET) {
    const got = req.header('X-Telegram-Bot-Api-Secret-Token');
    if (got !== TELEGRAM_WEBHOOK_SECRET) {
      res.sendStatus(401);
      return;
    }
  }
  res.sendStatus(200); // ACK immédiat — Telegram réémet si on tarde
  try {
    await handleUpdate(req.body);
  } catch (err) {
    console.warn('[telegram] webhook handling error:', err);
  }
}
