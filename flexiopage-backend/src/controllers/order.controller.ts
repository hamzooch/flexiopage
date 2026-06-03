import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as orderService from '../services/order.service';
import { dispatchOrder } from '../services/delivery.service';
import { Order, CONFIRMATION_STATUSES, type ConfirmationStatus } from '../models/Order.model';
import { Product } from '../models/Product.model';
import { logActivity } from '../services/activity-log.service';

const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'manual'] as const;
const FULFILLMENT_STATUSES = ['unfulfilled', 'partial', 'fulfilled', 'cancelled'] as const;

/** True once the courier has progressed past the "draft" pending state.
 * We use this to block silent overrides — once a colis is rolling at the
 * provider, the seller has to acknowledge they're forcing the change. */
function isDispatchedAndMoving(order: { delivery?: { externalId?: string; externalStatus?: string } }): boolean {
  const d = order.delivery;
  if (!d?.externalId) return false;
  const movingStates = ['assigned', 'picked_up', 'in_transit', 'delivered', 'returned'];
  return movingStates.includes((d.externalStatus || '').toLowerCase());
}

export async function createOrder(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const storeId = store._id.toString();
  const body = req.body;
  if (!body.email?.trim() || !Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: 'Email and at least one item are required' });
    return;
  }
  if (typeof body.subtotal !== 'number' || body.subtotal < 0) {
    res.status(400).json({ error: 'Valid subtotal is required' });
    return;
  }
  const order = await orderService.createOrder({
    storeId,
    email: body.email.trim(),
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    shippingAddress: body.shippingAddress,
    items: body.items,
    subtotal: body.subtotal,
    shippingCost: body.shippingCost,
    tax: body.tax,
    discount: body.discount,
    couponCode: body.couponCode,
    paymentMethod: body.paymentMethod || 'manual',
    notes: body.notes,
  });
  res.status(201).json({ order });
}

export async function listOrders(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
  const skip = parseInt(req.query.skip as string, 10) || 0;
  const { orders, total } = await orderService.getOrdersByStore(store._id.toString(), { limit, skip });
  res.json({ orders, total, limit, skip });
}

export async function getOrder(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const order = await orderService.getOrderById(req.params.orderId, store._id.toString());
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order });
}

export async function updateOrderPaymentStatus(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const { paymentStatus, stripePaymentIntentId } = req.body;
  if (!['pending', 'paid', 'failed', 'refunded', 'manual'].includes(paymentStatus)) {
    res.status(400).json({ error: 'Invalid payment status' });
    return;
  }
  const updated = await orderService.updateOrderPayment(
    req.params.orderId,
    store._id.toString(),
    { paymentStatus, stripePaymentIntentId }
  );
  if (!updated) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order: updated });
}

export async function updateOrderFulfillment(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const { fulfillmentStatus, trackingNumber, trackingUrl } = req.body;
  if (!['unfulfilled', 'partial', 'fulfilled', 'cancelled'].includes(fulfillmentStatus)) {
    res.status(400).json({ error: 'Invalid fulfillment status' });
    return;
  }
  const updated = await orderService.updateOrderFulfillment(
    req.params.orderId,
    store._id.toString(),
    { fulfillmentStatus, trackingNumber, trackingUrl }
  );
  if (!updated) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order: updated });
}

/** POST /api/stores/:storeId/orders/:orderId/dispatch — manual dispatch (or retry). */
export async function dispatchOrderToCourier(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const order = await Order.findOne({ _id: req.params.orderId, storeId: store._id });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  // Allow retry: clear externalId so dispatchOrder doesn't no-op
  if (req.body?.retry === true && order.delivery) {
    order.delivery.externalId = undefined;
    await order.save();
  }
  const result = await dispatchOrder({ order, store });
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  // Re-fetch to return the persisted state
  const fresh = await Order.findById(order._id).lean();
  res.json({ ok: true, alreadyDispatched: result.alreadyDispatched, order: fresh });
}

/**
 * PATCH /api/stores/:storeId/orders/:orderId/manual-status
 *
 * Seller-facing endpoint to override an order's payment + fulfillment status
 * BEFORE it's been picked up by a logistics provider. Three things happen
 * beyond a plain status write:
 *
 *   1. Guard — if the colis is already moving at the provider (assigned /
 *      picked_up / in_transit / delivered / returned), we refuse unless the
 *      caller sets `force: true`. Avoids silently desynchronising the seller's
 *      view from the courier's reality.
 *   2. Restock — when cancelling, we $inc inventory back for each line item
 *      that still tracks stock. Idempotent via `inventoryRestored` so a
 *      double-cancel doesn't double-credit.
 *   3. Audit — every change is appended to `statusHistory` so the seller can
 *      review who changed what and when from the order detail page.
 *
 * Body: { paymentStatus?, fulfillmentStatus?, reason?, force?: boolean }
 */
export async function manualStatusOverride(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const userId = req.user?._id as { toString(): string } | undefined;
  const { paymentStatus, fulfillmentStatus, reason, force } = req.body as {
    paymentStatus?: typeof PAYMENT_STATUSES[number];
    fulfillmentStatus?: typeof FULFILLMENT_STATUSES[number];
    reason?: string;
    force?: boolean;
  };

  if (!paymentStatus && !fulfillmentStatus) {
    res.status(400).json({ error: 'At least one of paymentStatus / fulfillmentStatus is required' });
    return;
  }
  if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) {
    res.status(400).json({ error: 'Invalid paymentStatus' });
    return;
  }
  if (fulfillmentStatus && !FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
    res.status(400).json({ error: 'Invalid fulfillmentStatus' });
    return;
  }

  const order = await Order.findOne({ _id: req.params.orderId, storeId: store._id });
  if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

  // Guard: respect the courier's state machine unless the seller forces it.
  if (isDispatchedAndMoving(order) && !force) {
    res.status(409).json({
      error: 'order_dispatched',
      message: `La commande est déjà chez ${order.delivery?.provider || 'le transporteur'} (statut : ${order.delivery?.externalStatus}). Active "force" pour outrepasser.`,
      delivery: order.delivery,
    });
    return;
  }

  const before = {
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
  };

  if (paymentStatus) order.paymentStatus = paymentStatus;
  if (fulfillmentStatus) order.fulfillmentStatus = fulfillmentStatus;

  // Restock on transition INTO cancelled (idempotent). We only credit items
  // whose product still has trackInventory turned on — sellers can disable
  // tracking later and we shouldn't push their counts into the negative.
  let restockedItems = 0;
  if (fulfillmentStatus === 'cancelled' && before.fulfillmentStatus !== 'cancelled' && !order.inventoryRestored) {
    const productIds = order.items.map((i) => i.productId).filter(Boolean);
    const tracked = await Product.find({ _id: { $in: productIds }, trackInventory: true })
      .select('_id')
      .lean();
    const trackedSet = new Set(tracked.map((p) => p._id.toString()));
    await Promise.all(
      order.items
        .filter((i) => trackedSet.has(i.productId.toString()))
        .map((i) =>
          Product.updateOne({ _id: i.productId }, { $inc: { stock: i.quantity } }).then(() => {
            restockedItems += 1;
          })
        )
    );
    order.inventoryRestored = true;
    if (reason) order.cancelReason = reason.trim().slice(0, 500);
  }

  // Append to the audit trail.
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    at: new Date(),
    by: userId as unknown as undefined,
    paymentStatus: paymentStatus,
    fulfillmentStatus: fulfillmentStatus,
    note: reason?.trim().slice(0, 500),
  });

  await order.save();

  void logActivity({
    type: 'order.status_changed',
    message: `Statut commande ${order.orderNumber} : ${before.fulfillmentStatus}→${order.fulfillmentStatus}, paiement ${before.paymentStatus}→${order.paymentStatus}`,
    storeId: store._id,
    userId: store.ownerId,
    metadata: { orderId: order._id.toString(), reason: reason || null, forced: !!force, restockedItems },
  });

  res.json({ order, restockedItems });
}

/**
 * PATCH /api/stores/:storeId/orders/:orderId/confirmation
 *
 * Update the COD call-confirmation status. Used by the seller (or a
 * tele-confirm agent) after they pick up the phone to call the buyer:
 *
 *   confirmed → buyer confirmed → ready to dispatch
 *   no_answer → didn't pick up → try again later
 *   callback  → buyer asked to be called at a specific time (callbackAt)
 *   declined  → buyer cancelled → we ALSO cancel the order + restock
 *   pending   → reset (rarely used)
 *
 * Body: { confirmationStatus, note?, callbackAt? }
 *
 * Side effects:
 *   - "declined" auto-cancels the order (fulfillmentStatus='cancelled' +
 *     restock + cancelReason="Refusé à la confirmation")
 *   - every change appends to statusHistory for the audit trail
 */
export async function updateConfirmationStatus(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const userId = req.user?._id as { toString(): string } | undefined;
  const { confirmationStatus, note, callbackAt } = req.body as {
    confirmationStatus?: ConfirmationStatus;
    note?: string;
    callbackAt?: string;
  };

  if (!confirmationStatus || !CONFIRMATION_STATUSES.includes(confirmationStatus)) {
    res.status(400).json({
      error: 'Invalid confirmationStatus',
      allowed: CONFIRMATION_STATUSES,
    });
    return;
  }

  const order = await Order.findOne({ _id: req.params.orderId, storeId: store._id });
  if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

  const previous = order.confirmationStatus || 'pending';
  order.confirmationStatus = confirmationStatus;
  order.confirmedAt = new Date();
  if (typeof note === 'string') order.confirmationNote = note.trim().slice(0, 500) || undefined;

  // callbackAt only makes sense for the callback bucket. Allow ISO strings
  // and JS Date — anything unparseable is silently dropped (UX over hard fail).
  if (confirmationStatus === 'callback') {
    if (callbackAt) {
      const d = new Date(callbackAt);
      if (!Number.isNaN(d.getTime())) order.callbackAt = d;
    }
  } else {
    // Leaving the callback bucket clears the schedule so it can't haunt
    // future filters / reminders.
    order.callbackAt = undefined;
  }

  // "declined" === buyer refused the order during the call → cancel the order
  // and restock (idempotent via inventoryRestored, same path as manual cancel).
  let restockedItems = 0;
  if (confirmationStatus === 'declined' && order.fulfillmentStatus !== 'cancelled') {
    order.fulfillmentStatus = 'cancelled';
    if (!order.inventoryRestored) {
      const productIds = order.items.map((i) => i.productId).filter(Boolean);
      const tracked = await Product.find({ _id: { $in: productIds }, trackInventory: true })
        .select('_id')
        .lean();
      const trackedSet = new Set(tracked.map((p) => p._id.toString()));
      await Promise.all(
        order.items
          .filter((i) => trackedSet.has(i.productId.toString()))
          .map((i) =>
            Product.updateOne({ _id: i.productId }, { $inc: { stock: i.quantity } }).then(() => {
              restockedItems += 1;
            })
          )
      );
      order.inventoryRestored = true;
      order.cancelReason = (note?.trim() || 'Refusé à la confirmation').slice(0, 500);
    }
  }

  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    at: new Date(),
    by: userId as unknown as undefined,
    confirmationStatus,
    fulfillmentStatus: confirmationStatus === 'declined' ? 'cancelled' : undefined,
    note: note?.trim().slice(0, 500),
  });

  await order.save();

  void logActivity({
    type: 'order.confirmation_updated',
    message: `Confirmation commande ${order.orderNumber} : ${previous} → ${confirmationStatus}`,
    storeId: store._id,
    userId: store.ownerId,
    metadata: {
      orderId: order._id.toString(),
      from: previous,
      to: confirmationStatus,
      note: note || null,
      restockedItems,
    },
  });

  res.json({ order, restockedItems });
}
