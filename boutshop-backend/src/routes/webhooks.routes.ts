/**
 * Payment-provider webhooks. No auth: providers post here directly.
 * The body is form-encoded for CinetPay; we read it via express.urlencoded
 * on this router only (the rest of the app uses JSON).
 */
import { Router, Request, Response } from 'express';
import express from 'express';
import { getProviderById } from '../services/mobile-money.service';
import { finalizePaidOrder } from '../services/order-finalize.service';
import { applyDeliveryWebhook } from '../services/delivery.service';
import { Order } from '../models/Order.model';

const router = Router();

// Providers post form-urlencoded or JSON — accept both
router.use(express.urlencoded({ extended: true, limit: '1mb' }));
router.use(express.json({ limit: '1mb' }));

/** POST /api/webhooks/cinetpay */
router.post('/cinetpay', async (req: Request, res: Response): Promise<void> => {
  const provider = getProviderById('cinetpay');
  if (!provider) {
    res.status(500).json({ error: 'CinetPay provider not registered' });
    return;
  }
  try {
    const result = await provider.parseWebhook(req.body || {}, req.headers as Record<string, string | undefined>);
    console.log('[webhook cinetpay]', { status: result.status, orderId: result.orderId });
    if (result.status === 'paid' && result.orderId) {
      await finalizePaidOrder(result.orderId, {
        paymentReference: result.reference,
        paymentProvider: 'cinetpay',
        webhookData: result.raw,
      });
    } else if (result.status === 'failed' && result.orderId) {
      await Order.findByIdAndUpdate(result.orderId, {
        $set: { paymentStatus: 'failed', paymentWebhookData: result.raw },
      });
    }
    // CinetPay expects HTTP 200 to mark the webhook delivered.
    res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook cinetpay] error:', (err as Error).message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/webhooks/mock — used by the dev mock flow (?simulate=1 page).
 * Marks an order as paid without going through any real provider, so devs
 * can demo the entire customer experience locally.
 */
router.post('/mock', async (req: Request, res: Response): Promise<void> => {
  const orderId = String((req.body as { orderId?: string }).orderId || '');
  if (!orderId) {
    res.status(400).json({ error: 'orderId required' });
    return;
  }
  // Optional safety: only allow in non-prod or when CinetPay is unconfigured
  const isProdProvider = !!process.env.CINETPAY_API_KEY;
  if (process.env.NODE_ENV === 'production' && isProdProvider) {
    res.status(403).json({ error: 'Mock webhook disabled in prod' });
    return;
  }
  try {
    const result = await finalizePaidOrder(orderId, {
      paymentReference: `MOCK-${Date.now()}`,
      paymentProvider: 'manual',
      webhookData: { simulated: true },
    });
    res.json({ ok: true, alreadyDone: result.alreadyDone });
  } catch (err) {
    console.error('[webhook mock] error:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/webhooks/mogadelivery
 *
 * MogaDelivery posts here when a delivery's status changes (assigned,
 * picked_up, in_transit, delivered, returned, cancelled, failed).
 * Signature: `X-Boutshop-Signature: <hex>` (HMAC-SHA256 of the JSON body
 * using BOUTSHOP_WEBHOOK_SECRET, or per-store override).
 * Legacy headers `X-Moga-Signature` / `X-Signature` are also accepted.
 */
router.post('/mogadelivery', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await applyDeliveryWebhook({
      payload: (req.body as Record<string, unknown>) || {},
      headers: req.headers as Record<string, string | undefined>,
      provider: 'mogadelivery',
    });
    if (!result.ok) {
      console.warn('[webhook mogadelivery] reject:', result.error);
      res.status(400).json({ error: result.error });
      return;
    }
    console.log(`[webhook mogadelivery] order ${result.orderId} → ${result.status}`);
    // mogadelivery expects a 200 to mark the webhook delivered
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook mogadelivery] error:', (err as Error).message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
