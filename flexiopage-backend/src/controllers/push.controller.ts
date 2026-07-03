import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { PUSH_SOUNDS, DEFAULT_PUSH_SOUND, isExpoPushToken } from '../services/push.service';

/** GET /api/push/sounds — catalogue des sons proposés + défaut + choix courant. */
export async function getSounds(req: AuthRequest, res: Response): Promise<void> {
  const user = await User.findById(req.user!._id).select('pushSoundPreference').lean();
  res.json({
    sounds: PUSH_SOUNDS.map((s) => ({ key: s.key, label: s.label })),
    default: DEFAULT_PUSH_SOUND,
    selected: user?.pushSoundPreference || DEFAULT_PUSH_SOUND,
  });
}

/** POST /api/push/register — body { token, sound? } : enregistre le token de
 *  l'appareil (multi-device, dédupliqué) et, si fourni, le son préféré. */
export async function registerToken(req: AuthRequest, res: Response): Promise<void> {
  const { token, sound } = (req.body || {}) as { token?: unknown; sound?: unknown };
  if (!isExpoPushToken(token)) {
    res.status(400).json({ error: 'ExpoPushToken invalide.' });
    return;
  }
  const update: Record<string, unknown> = { $addToSet: { expoPushTokens: token.trim() } };
  if (typeof sound === 'string' && PUSH_SOUNDS.some((s) => s.key === sound)) {
    update.$set = { pushSoundPreference: sound };
  }
  await User.updateOne({ _id: req.user!._id }, update);
  res.json({ ok: true });
}

/** POST /api/push/unregister — body { token } : retire ce token (logout / device). */
export async function unregisterToken(req: AuthRequest, res: Response): Promise<void> {
  const { token } = (req.body || {}) as { token?: unknown };
  if (typeof token !== 'string' || !token.trim()) {
    res.status(400).json({ error: 'token requis.' });
    return;
  }
  await User.updateOne({ _id: req.user!._id }, { $pull: { expoPushTokens: token.trim() } });
  res.json({ ok: true });
}

/** POST /api/push/test — envoie une notification de test aux appareils du
 *  vendeur (pour valider token + FCM + son sans passer de commande). */
export async function sendTest(req: AuthRequest, res: Response): Promise<void> {
  const { sendToUser } = await import('../services/push.service');
  const result = await sendToUser(req.user!._id, {
    title: 'Test FlexioPage 🔔',
    body: 'Si tu entends le son, tout est bien configuré 🤑',
    link: '/dashboard/orders',
    data: { type: 'test' },
  });
  // Diagnostic explicite pour le vendeur.
  let diagnostic: string;
  if (result.tokens === 0) {
    diagnostic = 'no_device';
  } else if (result.errors.length) {
    diagnostic = 'expo_error';
  } else if (result.sent > 0) {
    diagnostic = 'ok';
  } else {
    diagnostic = 'unknown';
  }
  res.json({ ok: true, diagnostic, ...result });
}

/** PATCH /api/push/sound — body { sound } : change le son de notification. */
export async function setSound(req: AuthRequest, res: Response): Promise<void> {
  const { sound } = (req.body || {}) as { sound?: unknown };
  if (typeof sound !== 'string' || !PUSH_SOUNDS.some((s) => s.key === sound)) {
    res.status(400).json({ error: 'Son inconnu.', allowed: PUSH_SOUNDS.map((s) => s.key) });
    return;
  }
  await User.updateOne({ _id: req.user!._id }, { $set: { pushSoundPreference: sound } });
  res.json({ ok: true, sound });
}
