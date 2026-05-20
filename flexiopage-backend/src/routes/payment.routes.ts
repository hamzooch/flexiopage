/**
 * Online payment API (no auth — called from the storefront checkout).
 *
 *   POST /api/payment/initiate         → create order + hosted-checkout URL
 *   GET  /api/payment/verify/:ref      → authoritative server-side status check
 *
 * COD is NOT handled here — it goes through POST /api/public/checkout/cod.
 *
 * Security:
 *   - The client-sent amount is IGNORED. The order total is recomputed
 *     server-side from the product price × quantity.
 *   - The (country, storeType, gateway, method) combination is validated
 *     against the business matrix before any gateway call.
 *   - Verification never trusts a client-reported status — it re-queries the
 *     gateway and only then finalizes the order.
 */
import { Router, Request, Response } from 'express';
import * as storeService from '../services/store.service';
import * as productService from '../services/product.service';
import * as orderService from '../services/order.service';
import { Order } from '../models/Order.model';
import { logPayment } from '../models/PaymentLog.model';
import { initOrderPaymentWith, getProviderById, isMockMode } from '../services/payment/registry';
import {
  getAvailableMethods,
  isMethodAllowed,
  type Gateway,
  type PaymentMethodId,
  type StoreType,
} from '../services/payment/country-routing';
import type { Channel } from '../services/payment/types';
import { finalizePaidOrder } from '../services/order-finalize.service';
import mongoose from 'mongoose';

const router = Router();

function methodToChannel(method: PaymentMethodId): Channel {
  return method === 'card' ? 'card' : 'all';
}

/**
 * GET /api/payment/methods?storeSlug=&country=
 * Helper the storefront can call to render the selector. Mirrors the
 * server-side matrix so the UI never offers a method the API would reject.
 */
router.get('/methods', async (req: Request, res: Response): Promise<void> => {
  const storeSlug = String(req.query.storeSlug || '');
  const country = String(req.query.country || req.headers['cf-ipcountry'] || '').toUpperCase();
  if (!storeSlug) {
    res.status(400).json({ error: 'storeSlug required' });
    return;
  }
  const store = await storeService.getStoreBySlug(storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const storeType = (store.storeType === 'digital' ? 'digital' : 'physical') as StoreType;
  res.json({
    storeType,
    country,
    methods: getAvailableMethods(country, storeType),
  });
});

/** POST /api/payment/initiate */
router.post('/initiate', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    storeSlug?: string;
    productSlug?: string;
    quantity?: number;
    email?: string;
    customerName?: string;
    phone?: string;
    country?: string;
    gateway?: Gateway;
    method?: PaymentMethodId;
    shippingAddress?: {
      line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string;
    };
  };

  // Country: trust the explicit field, else fall back to Cloudflare's header.
  const country = String(body.country || req.headers['cf-ipcountry'] || '').toUpperCase();

  if (!body.storeSlug || !body.productSlug || !body.email || !body.gateway || !body.method) {
    res.status(400).json({ error: 'storeSlug, productSlug, email, gateway, method required' });
    return;
  }
  if (body.gateway === 'cod' || body.method === 'cod') {
    res.status(400).json({ error: 'Use POST /api/public/checkout/cod for cash on delivery.', code: 'use_cod_endpoint' });
    return;
  }

  const store = await storeService.getStoreBySlug(body.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const storeType = (store.storeType === 'digital' ? 'digital' : 'physical') as StoreType;

  // Matrix guard — reject spoofed client choices before touching a gateway.
  if (!isMethodAllowed(country, storeType, body.gateway, body.method)) {
    res.status(400).json({
      error: 'Payment method not available for this country/store.',
      code: 'method_not_allowed',
      available: getAvailableMethods(country, storeType),
    });
    return;
  }

  const product = await productService.getProductBySlug(store._id.toString(), body.productSlug);
  if (!product || !product.isPublished) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  // Recompute amount server-side — never trust a client-sent total.
  const quantity = Math.max(1, Math.min(body.quantity || 1, 99));
  const subtotal = product.price * quantity;
  const currency = store.settings?.currency || 'USD';

  let order;
  try {
    order = await orderService.createOrder({
      storeId: store._id.toString(),
      email: body.email.trim().toLowerCase(),
      customerName: body.customerName?.trim() || undefined,
      customerPhone: body.phone?.trim() || undefined,
      shippingAddress: storeType === 'physical' ? body.shippingAddress : undefined,
      items: [{ productId: product._id.toString(), name: product.name, quantity, price: product.price }],
      subtotal,
      shippingCost: 0,
      tax: 0,
      discount: 0,
      currency,
      paymentMethod: body.method === 'card' ? 'card' : 'mobile_money',
    });
  } catch (err) {
    res.status(500).json({ error: 'Order creation failed: ' + (err as Error).message });
    return;
  }

  if (body.phone) {
    order.paymentPhone = body.phone.trim();
    await order.save();
  }

  try {
    const init = await initOrderPaymentWith(order, body.gateway, {
      phone: body.phone,
      channel: methodToChannel(body.method),
    });
    order.paymentReference = init.reference;
    order.paymentProvider = init.provider;
    await order.save();

    await logPayment({
      orderId: order._id,
      storeId: store._id,
      gateway: init.provider,
      reference: init.reference,
      event: 'initiate',
      status: 'pending',
    });

    res.json({
      paymentUrl: init.checkoutUrl,
      transactionRef: init.reference,
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      provider: init.provider,
      mockMode: isMockMode(),
    });
  } catch (err) {
    res.status(502).json({ error: 'Payment init failed: ' + (err as Error).message });
  }
});

/** GET /api/payment/verify/:ref — re-check status with the gateway. */
router.get('/verify/:ref', async (req: Request, res: Response): Promise<void> => {
  const ref = String(req.params.ref || '');
  if (!ref) {
    res.status(400).json({ error: 'ref required' });
    return;
  }

  // ref may be the order id or the provider reference.
  const or: Record<string, unknown>[] = [{ paymentReference: ref }];
  if (mongoose.isValidObjectId(ref)) or.push({ _id: ref });
  const order = await Order.findOne({ $or: or });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const provider = order.paymentProvider ? getProviderById(order.paymentProvider) : null;
  if (!provider || !provider.verifyTransaction) {
    res.json({
      status: order.paymentStatus,
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      note: 'no_server_verification_available',
    });
    return;
  }

  try {
    const result = await provider.verifyTransaction(order);
    await logPayment({
      orderId: order._id,
      storeId: order.storeId,
      gateway: order.paymentProvider || 'manual',
      reference: result.reference || order.paymentReference,
      event: 'verify',
      status: result.status,
      rawPayload: result.raw,
    });

    if (result.status === 'paid') {
      // Idempotent — only finalizes once.
      await finalizePaidOrder(order._id.toString(), {
        paymentReference: result.reference,
        paymentProvider: order.paymentProvider,
        webhookData: result.raw,
      });
    } else if (result.status === 'failed' && order.paymentStatus !== 'paid') {
      await Order.findByIdAndUpdate(order._id, { $set: { paymentStatus: 'failed' } });
    }

    const fresh = await Order.findById(order._id).select('paymentStatus orderNumber').lean();
    res.json({
      status: result.status,
      orderId: order._id.toString(),
      orderNumber: fresh?.orderNumber,
      paymentStatus: fresh?.paymentStatus,
    });
  } catch (err) {
    res.status(502).json({ error: 'Verification failed: ' + (err as Error).message });
  }
});

export default router;
