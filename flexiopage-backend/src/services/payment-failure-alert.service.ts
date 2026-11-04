/**
 * Un paiement en ligne que le client n'a pas terminé (annulation, solde
 * insuffisant, code non saisi) n'est pas une panne : c'est une commande
 * abandonnée. On ne rétrograde jamais un paiement déjà reçu.
 */
import mongoose from 'mongoose';
import { Order } from '../models/Order.model';
import { logger } from '../lib/logger';

/**
 * La passerelle a refusé ou le client a quitté le paiement. On range ça
 * avec les abandons. `paid`, `refunded` et `manual` ne bougent pas.
 */
export async function markOrderPaymentFailed(
  orderId: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  if (!orderId || !mongoose.isValidObjectId(orderId)) return;

  const update: Record<string, unknown> = { paymentStatus: 'abandoned' };
  if (raw) update.paymentWebhookData = raw;

  const previous = await Order.findOneAndUpdate(
    { _id: orderId, paymentStatus: { $nin: ['paid', 'refunded', 'manual', 'abandoned'] } },
    { $set: update },
    {
      returnDocument: 'before',
      projection: 'paymentStatus orderNumber',
    },
  ).lean();

  if (!previous) return;
  logger.info(
    { orderId, orderNumber: previous.orderNumber, from: previous.paymentStatus },
    '[payment] checkout non abouti → abandoned',
  );
}
