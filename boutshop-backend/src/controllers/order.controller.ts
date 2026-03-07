import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as orderService from '../services/order.service';
import { dispatchOrder } from '../services/delivery.service';
import { Order } from '../models/Order.model';
import { Store } from '../models/Store.model';

export async function createOrder(req: AuthRequest, res: Response): Promise<void> {
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
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
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
  const skip = parseInt(req.query.skip as string, 10) || 0;
  const orders = await orderService.getOrdersByStore(store._id.toString(), { limit, skip });
  res.json({ orders });
}

export async function getOrder(req: AuthRequest, res: Response): Promise<void> {
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
  const order = await orderService.getOrderById(req.params.orderId, store._id.toString());
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order });
}

export async function updateOrderPaymentStatus(req: AuthRequest, res: Response): Promise<void> {
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
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
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
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
  const storeReq = req as AuthRequest & { store: { _id: unknown } };
  const order = await Order.findOne({ _id: req.params.orderId, storeId: storeReq.store._id });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  // Allow retry: clear externalId so dispatchOrder doesn't no-op
  if (req.body?.retry === true && order.delivery) {
    order.delivery.externalId = undefined;
    await order.save();
  }
  const store = await Store.findById(storeReq.store._id);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
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
