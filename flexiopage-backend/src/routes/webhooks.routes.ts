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
import { Order, type PaymentProvider } from '../models/Order.model';
import { logPayment } from '../models/PaymentLog.model';
import { receiveTelegramWebhook } from '../controllers/telegram.controller';

const router = Router();

// Providers post form-urlencoded or JSON — accept both
router.use(express.urlencoded({ extended: true, limit: '1mb' }));
router.use(express.json({ limit: '1mb' }));

/**
 * Shared handler for gateway payment webhooks. Flow:
 *   1. provider.parseWebhook verifies the signature (when configured) AND
 *      re-checks the transaction server-side.
 *   2. Every delivery is logged to PaymentLog (audit + replay visibility).
 *   3. A forged payload (signatureValid === false) is rejected before any DB
 *      mutation.
 *   4. finalizePaidOrder is idempotent → a replayed "paid" webhook never
 *      double-credits the order.
 */
async function handlePaymentWebhook(
  providerId: PaymentProvider,
  req: Request,
  res: Response,
): Promise<void> {
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(500).json({ error: `${providerId} provider not registered` });
    return;
  }
  try {
    const result = await provider.parseWebhook(
      req.body || {},
      req.headers as Record<string, string | undefined>,
    );
    console.log(`[webhook ${providerId}]`, {
      status: result.status,
      orderId: result.orderId,
      sig: result.signatureValid,
    });

    await logPayment({
      orderId: result.orderId,
      gateway: providerId,
      reference: result.reference,
      event: 'webhook',
      status: result.status,
      signatureValid: result.signatureValid,
      rawPayload: result.raw,
      note: result.signatureValid === false ? 'signature_invalid_rejected' : undefined,
    });

    // Reject forged payloads before touching the order.
    if (result.signatureValid === false) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    if (result.status === 'paid' && result.orderId) {
      await finalizePaidOrder(result.orderId, {
        paymentReference: result.reference,
        paymentProvider: providerId,
        webhookData: result.raw,
      });
    } else if (result.status === 'failed' && result.orderId) {
      // Never downgrade an already-paid order.
      await Order.updateOne(
        { _id: result.orderId, paymentStatus: { $ne: 'paid' } },
        { $set: { paymentStatus: 'failed', paymentWebhookData: result.raw } },
      );
    }
    // Gateways expect HTTP 200 to mark the webhook delivered.
    res.status(200).send('OK');
  } catch (err) {
    console.error(`[webhook ${providerId}] error:`, (err as Error).message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/** POST /api/webhooks/cinetpay */
router.post('/cinetpay', (req, res) => handlePaymentWebhook('cinetpay', req, res));

/** POST /api/webhooks/flutterwave */
router.post('/flutterwave', (req, res) => handlePaymentWebhook('flutterwave', req, res));

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
 * Signature: `X-Flexiopage-Signature: <hex>` (HMAC-SHA256 of the JSON body
 * using FLEXIOPAGE_WEBHOOK_SECRET, or per-store override).
 * Legacy headers `X-Boutshop-Signature`, `X-Moga-Signature`, `X-Signature`
 * are also accepted to ease the rebrand transition.
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

// Bot Telegram vendeur — Telegram poste les updates ici (secret vérifié dans
// le controller via l'en-tête X-Telegram-Bot-Api-Secret-Token).
router.post('/telegram', (req, res) => receiveTelegramWebhook(req, res));

export default router;
