/**
 * Confirmation d'appel (COD) partagée par le dashboard et le bot Telegram.
 * « Refusé » annule la commande et remet le stock. « Confirmé » prévient
 * le client par WhatsApp si les notifications sont actives.
 */
import mongoose from 'mongoose';
import { Order, type ConfirmationStatus, type CancelReasonCode, CANCEL_REASON_CODES } from '../models/Order.model';
import { Product } from '../models/Product.model';
import { logActivity } from './activity-log.service';

export async function applyConfirmationStatus(args: {
  orderId: string;
  storeId: string;
  userId?: string;
  confirmationStatus: ConfirmationStatus;
  note?: string;
  callbackAt?: string;
  cancelReasonCode?: CancelReasonCode;
}): Promise<{ order: InstanceType<typeof Order>; restockedItems: number } | { error: string; status: number }> {
  if (!mongoose.isValidObjectId(args.orderId)) return { error: 'Order not found', status: 404 };
  const order = await Order.findOne({ _id: args.orderId, storeId: args.storeId });
  if (!order) return { error: 'Order not found', status: 404 };

  const previous = order.confirmationStatus || 'pending';
  order.confirmationStatus = args.confirmationStatus;
  order.confirmedAt = new Date();
  if (typeof args.note === 'string') order.confirmationNote = args.note.trim().slice(0, 500) || undefined;

  if (args.confirmationStatus === 'callback') {
    if (args.callbackAt) {
      const d = new Date(args.callbackAt);
      if (!Number.isNaN(d.getTime())) order.callbackAt = d;
    }
  } else {
    order.callbackAt = undefined;
  }

  let restockedItems = 0;
  if (args.confirmationStatus === 'declined' && order.fulfillmentStatus !== 'cancelled') {
    order.fulfillmentStatus = 'cancelled';
    if (!order.inventoryRestored) {
      const productIds = order.items.map((i) => i.productId).filter(Boolean);
      const tracked = await Product.find({ _id: { $in: productIds }, trackInventory: true }).select('_id').lean();
      const trackedSet = new Set(tracked.map((p) => p._id.toString()));
      await Promise.all(
        order.items
          .filter((i) => trackedSet.has(i.productId.toString()))
          .map((i) =>
            Product.updateOne({ _id: i.productId }, { $inc: { stock: i.quantity } }).then(() => {
              restockedItems += 1;
            }),
          ),
      );
      order.inventoryRestored = true;
      order.cancelReason = (args.note?.trim() || 'Refusé à la confirmation').slice(0, 500);
      if (args.cancelReasonCode && CANCEL_REASON_CODES.includes(args.cancelReasonCode)) {
        order.cancelReasonCode = args.cancelReasonCode;
      }
    }
  }

  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    at: new Date(),
    by: args.userId as unknown as mongoose.Types.ObjectId,
    confirmationStatus: args.confirmationStatus,
    fulfillmentStatus: args.confirmationStatus === 'declined' ? 'cancelled' : undefined,
    note: args.note?.trim().slice(0, 500),
  });

  await order.save();

  void logActivity({
    type: 'order.confirmation_updated',
    message: `Confirmation commande ${order.orderNumber} : ${previous} → ${args.confirmationStatus}`,
    storeId: order.storeId,
    userId: args.userId,
    metadata: {
      orderId: order._id.toString(),
      from: previous,
      to: args.confirmationStatus,
      note: args.note || null,
      restockedItems,
    },
  });

  if (args.confirmationStatus === 'confirmed' && previous !== 'confirmed') {
    void import('./clientNotifications.service').then(({ sendClientNotification }) =>
      sendClientNotification({ orderId: order._id, trigger: 'confirmed' }),
    ).catch(() => {});
  }

  return { order, restockedItems };
}

/** Expédie une commande sans livreur externe. Le livreur garde la main sinon. */
export async function markOrderShipped(args: {
  orderId: string;
  storeId: string;
  userId?: string;
}): Promise<{ orderNumber: string } | { error: string }> {
  if (!mongoose.isValidObjectId(args.orderId)) return { error: 'Commande introuvable.' };
  const order = await Order.findOne({ _id: args.orderId, storeId: args.storeId });
  if (!order) return { error: 'Commande introuvable.' };
  if (order.fulfillmentStatus === 'cancelled' || order.confirmationStatus === 'declined') {
    return { error: 'Cette commande est annulée.' };
  }
  if (order.delivery?.externalId) {
    return { error: 'Le livreur met déjà cette commande à jour.' };
  }
  if ((order.confirmationStatus || 'pending') !== 'confirmed') {
    return { error: 'Confirme d’abord la commande.' };
  }
  if (order.fulfillmentStatus === 'fulfilled') return { orderNumber: order.orderNumber };
  order.fulfillmentStatus = 'fulfilled';
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    at: new Date(),
    by: args.userId as unknown as mongoose.Types.ObjectId,
    fulfillmentStatus: 'fulfilled',
    note: 'Expédiée depuis Telegram',
  });
  await order.save();
  void import('./clientNotifications.service').then(({ sendClientNotification }) =>
    sendClientNotification({ orderId: order._id, trigger: 'dispatched' }),
  ).catch(() => {});
  return { orderNumber: order.orderNumber };
}
