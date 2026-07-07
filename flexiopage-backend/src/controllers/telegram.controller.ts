import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { isTelegramConfigured, TELEGRAM_WEBHOOK_SECRET } from '../config/telegram';
import { createLinkDeepLink, handleUpdate } from '../services/telegram.service';

/** État de la liaison Telegram du vendeur courant. */
export async function getTelegramStatus(req: AuthRequest, res: Response): Promise<void> {
  const u = req.user!;
  res.json({
    configured: isTelegramConfigured(),
    linked: !!u.telegram?.chatId && u.telegram?.enabled !== false,
    username: u.telegram?.username || null,
  });
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
