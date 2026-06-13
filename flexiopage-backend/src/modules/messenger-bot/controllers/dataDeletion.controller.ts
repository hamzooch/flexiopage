/**
 * Meta Data Deletion Callback.
 *
 *   POST /api/messenger-bot/data-deletion            (public, signé par Meta)
 *   GET  /api/messenger-bot/data-deletion/status/:code (page de statut HTML)
 *
 * Meta envoie un `signed_request` (base64url `payload.sig`, HMAC-SHA256 du
 * payload avec l'App Secret) quand un utilisateur retire l'app. On valide la
 * signature, on lance la suppression en arrière-plan et on répond < 5s avec
 * une URL de statut + un code de confirmation.
 */
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../../../lib/logger';
import { Conversation } from '../models/Conversation.model';
import { Message } from '../models/Message.model';
import { Order } from '../../../models/Order.model';
import { DataDeletionRequest } from '../models/DataDeletionRequest.model';

const CONTACT_EMAIL = 'support@flexiopage.com';

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const final = pad ? padded + '='.repeat(4 - pad) : padded;
  return Buffer.from(final, 'base64');
}

interface SignedPayload { algorithm?: string; user_id?: string; issued_at?: number }

/** Valide + décode un signed_request Meta. Retourne null si invalide. */
function parseSignedRequest(signedRequest: string, secret: string): SignedPayload | null {
  const [encodedSig, payload] = signedRequest.split('.');
  if (!encodedSig || !payload) return null;
  let data: SignedPayload;
  try {
    data = JSON.parse(base64UrlDecode(payload).toString('utf-8'));
  } catch {
    return null;
  }
  if ((data.algorithm || '').toUpperCase() !== 'HMAC-SHA256') return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const received = base64UrlDecode(encodedSig);
  if (expected.length !== received.length) return null;
  return crypto.timingSafeEqual(expected, received) ? data : null;
}

function genCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

function apiBase(): string {
  return (process.env.API_PUBLIC_URL || 'http://localhost:5051').replace(/\/$/, '');
}

export async function receiveDeletion(req: Request, res: Response): Promise<void> {
  const signedRequest = (req.body as { signed_request?: string }).signed_request;
  if (!signedRequest) {
    res.status(400).json({ error: 'Missing signed_request parameter' });
    return;
  }
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret) {
    logger.error('[messenger-bot] data-deletion: FACEBOOK_APP_SECRET non configuré');
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  const data = parseSignedRequest(signedRequest, secret);
  if (!data || !data.user_id) {
    res.status(401).json({ error: 'Invalid signed request' });
    return;
  }

  const psid = data.user_id;
  const confirmationCode = genCode();

  // Suppression détachée — on doit répondre à Meta en < 5s.
  void deleteUserData(psid, confirmationCode).catch((err) =>
    logger.error({ err: (err as Error).message, psid }, '[messenger-bot] data-deletion background échec'),
  );

  res.status(200).json({
    url: `${apiBase()}/api/messenger-bot/data-deletion/status/${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}

export async function deletionStatus(req: Request, res: Response): Promise<void> {
  const code = String(req.params.code || '');
  const reqDoc = await DataDeletionRequest.findOne({ confirmation_code: code }).lean();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!reqDoc) {
    res.status(404).send(`<!doctype html><html lang="fr"><meta charset="utf-8"><body style="font-family:system-ui;max-width:600px;margin:60px auto;padding:24px">
      <h1>Demande introuvable</h1><p>Le code de confirmation est invalide ou expiré.</p></body></html>`);
    return;
  }

  const done = reqDoc.status === 'completed';
  const failed = reqDoc.status === 'failed';
  const statusLabel = done ? '✅ Suppression terminée' : failed ? '❌ Échec — traitement manuel' : '⏳ En cours de traitement';
  const statusColor = done ? '#00875a' : failed ? '#b42318' : '#b88700';
  const body = done
    ? `Toutes les données associées ont été supprimées le ${new Date(reqDoc.completed_at || Date.now()).toLocaleDateString('fr-FR')}.`
    : failed
      ? `Une erreur est survenue. Notre équipe traitera ta demande manuellement sous 30 jours.`
      : `Demande reçue le ${new Date(reqDoc.created_at).toLocaleDateString('fr-FR')}. Traitement sous 30 jours maximum.`;

  res.status(200).send(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Statut de la suppression — FlexioPage</title></head>
  <body style="font-family:-apple-system,system-ui,sans-serif;margin:0;background:#f5f6f8;padding:40px 16px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 10px 40px rgba(0,0,0,.08)">
      <h1 style="margin:0 0 8px;font-size:22px">🛡️ Statut de votre demande</h1>
      <p style="color:#555;margin:0 0 16px">Code de confirmation : <code style="background:#f1f1f4;padding:3px 7px;border-radius:5px">${code}</code></p>
      <div style="display:inline-block;padding:6px 14px;border-radius:100px;font-weight:600;background:#fff;border:1px solid ${statusColor};color:${statusColor}">${statusLabel}</div>
      <p style="margin:18px 0;color:#1a1d29">${body}</p>
      <hr style="border:none;border-top:1px solid #e4e7ec;margin:24px 0">
      <p style="font-size:13px;color:#667085">Une question ? <a href="mailto:${CONTACT_EMAIL}" style="color:#0078D4">${CONTACT_EMAIL}</a></p>
    </div>
  </body></html>`);
}

/** Supprime/anonymise toutes les données liées à un PSID Messenger. */
export async function deleteUserData(psid: string, confirmationCode: string): Promise<void> {
  logger.info({ psid }, '[messenger-bot] data-deletion: début');
  try {
    const conversations = await Conversation.find({ customer_psid: psid }).select('_id order_id').lean();
    const conversationIds = conversations.map((c) => c._id);
    const orderIds = conversations.map((c) => c.order_id).filter(Boolean);

    // Compter AVANT de supprimer.
    const messagesCount = await Message.countDocuments({ conversation_id: { $in: conversationIds } });

    await Message.deleteMany({ conversation_id: { $in: conversationIds } });
    await Conversation.deleteMany({ customer_psid: psid });

    // Les commandes sont conservées (obligations comptables) mais anonymisées.
    let ordersAnonymized = 0;
    if (orderIds.length) {
      const r = await Order.updateMany(
        { _id: { $in: orderIds } },
        {
          $set: {
            customerName: '[supprimé]',
            customerPhone: '[supprimé]',
            email: 'deleted@flexiopage.local',
            'shippingAddress.line1': '[supprimé]',
            'shippingAddress.line2': '[supprimé]',
          },
        },
      );
      ordersAnonymized = r.modifiedCount || 0;
    }

    await DataDeletionRequest.create({
      psid,
      confirmation_code: confirmationCode,
      status: 'completed',
      conversations_deleted: conversations.length,
      messages_deleted: messagesCount,
      orders_anonymized: ordersAnonymized,
      completed_at: new Date(),
    });
    logger.info({ psid, conversations: conversations.length, messages: messagesCount }, '[messenger-bot] data-deletion: terminé');
  } catch (error) {
    await DataDeletionRequest.create({
      psid,
      confirmation_code: confirmationCode,
      status: 'failed',
      error: (error as Error).message,
    });
    throw error;
  }
}
