/**
 * Alerte owner dès qu'une commande client passe en paiement échoué.
 *
 * Un seul email par commande : un webhook rejoué ne renvoie rien.
 * Le destinataire est ADMIN_ALERT_EMAIL, sinon l'owner par défaut.
 * L'envoi ne bloque jamais le webhook — un échec Resend est seulement loggé.
 */
import mongoose from 'mongoose';
import { Order } from '../models/Order.model';
import { Store } from '../models/Store.model';
import { logger } from '../lib/logger';
import { sendEmail } from './email.service';
import { platformAlertEmail } from './platform-alert.service';

function firstUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.split(',')[0].trim().replace(/\/$/, '') || undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Motif renvoyé par la passerelle (CinetPay `_check`, ou le payload brut). */
function gatewayReason(raw?: Record<string, unknown>): string | undefined {
  if (!raw) return undefined;
  const nested = raw._check;
  const check = nested && typeof nested === 'object' ? nested as Record<string, unknown> : raw;
  const status = typeof check.status === 'string' ? check.status : '';
  const code = check.code != null && check.code !== '' ? `code ${check.code}` : '';
  const message = [check.message, check.description]
    .find((part) => typeof part === 'string' && part.trim()) as string | undefined;
  const line = [status, code, message].filter(Boolean).join(' · ');
  return line || undefined;
}

/**
 * Passe la commande en `failed` sans jamais rétrograder un paiement déjà reçu.
 * Envoie l'email owner seulement au premier passage (pending/abandoned → failed).
 */
export async function markOrderPaymentFailed(
  orderId: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  if (!orderId || !mongoose.isValidObjectId(orderId)) return;

  const update: Record<string, unknown> = { paymentStatus: 'failed' };
  if (raw) update.paymentWebhookData = raw;

  const previous = await Order.findOneAndUpdate(
    { _id: orderId, paymentStatus: { $ne: 'paid' } },
    { $set: update },
    {
      returnDocument: 'before',
      projection: 'paymentStatus orderNumber total currency customerName email storeId paymentProvider paymentReference',
    },
  ).lean();

  if (!previous || previous.paymentStatus === 'failed') return;

  try {
    const store = previous.storeId
      ? await Store.findById(previous.storeId).select('name slug').lean()
      : null;
    const reason = gatewayReason(raw);
    const amount = `${previous.total} ${previous.currency}`;
    const front = firstUrl(process.env.FRONTEND_URL);
    const orderUrl = front ? `${front}/dashboard/orders/${orderId}` : '';
    const to = platformAlertEmail();
    const lines = [
      'Un paiement client est passé en échec.',
      '',
      `Commande : #${previous.orderNumber}`,
      `Montant : ${amount}`,
      `Boutique : ${store?.name || '—'}${store?.slug ? ` (${store.slug})` : ''}`,
      `Client : ${previous.customerName || '—'}${previous.email ? ` · ${previous.email}` : ''}`,
      `Passerelle : ${previous.paymentProvider || '—'}`,
      ...(previous.paymentReference ? [`Référence : ${previous.paymentReference}`] : []),
      ...(reason ? [`Motif passerelle : ${reason}`] : []),
      `Quand : ${new Date().toISOString()}`,
      ...(orderUrl ? ['', `Ouvrir : ${orderUrl}`] : []),
    ];
    const text = lines.join('\n');
    const result = await sendEmail({
      to,
      subject: `[FlexioPage] Paiement échoué — #${previous.orderNumber} · ${amount}`.slice(0, 140),
      text,
      html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5;background:#f7f7f7;padding:16px;border-radius:8px;">${escapeHtml(text)}</pre>`,
    });
    if (!result.ok) {
      logger.error({ error: result.error, orderId, to }, '[payment-failed] email owner non envoyé');
      return;
    }
    logger.info({ orderId, orderNumber: previous.orderNumber, to, mock: result.id === 'mock' }, '[payment-failed] email owner envoyé');
  } catch (err) {
    logger.error({ err, orderId }, '[payment-failed] email owner non envoyé');
  }
}
