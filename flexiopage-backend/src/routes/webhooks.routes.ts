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
import { WalletTopUp } from '../models/WalletTopUp.model';
import { settleTopUp, markTopUpFailed } from '../services/topup.service';
import { getStripeWebhookSecret } from '../services/payment.service';

const router = Router();

// Providers post form-urlencoded or JSON — accept both.
// EXCEPTION: /stripe needs the raw body pour la vérif de signature Stripe.
// On skip les body parsers uniquement pour ce path — sinon req.body serait
// déjà parsé et Stripe.webhooks.constructEvent échouerait.
router.use((req, res, next) => {
  if (req.path === '/stripe') return next();
  return express.urlencoded({ extended: true, limit: '1mb' })(req, res, next);
});
router.use((req, res, next) => {
  if (req.path === '/stripe') return next();
  return express.json({ limit: '1mb' })(req, res, next);
});

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
/**
 * Détecte si le webhook CinetPay correspond à un top-up wallet vendeur (vs
 * un ordre client). Notre convention : les top-ups ont un merchantTxId qui
 * commence par `tu_`. On retrouve le WalletTopUp par gatewayReference et on
 * appelle settleTopUp(). Renvoie true si le webhook a été traité comme un
 * top-up (le handler générique n'a plus rien à faire).
 */
async function tryHandleTopUpWebhook(
  providerId: PaymentProvider,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (providerId !== 'cinetpay') return false;
  const merchantTxId =
    (typeof payload.cpm_trans_id === 'string' && payload.cpm_trans_id) ||
    (typeof payload.merchantTransactionId === 'string' && payload.merchantTransactionId) ||
    '';
  if (!merchantTxId || !String(merchantTxId).startsWith('tu_')) return false;

  const topUp = await WalletTopUp.findOne({ gatewayReference: merchantTxId });
  if (!topUp) return false; // Pas notre top-up, laisser le handler générique se planter proprement.

  // Re-check autoritatif : on ne fait confiance qu'au getStatus() du gateway.
  // Ici on délègue à verifyTopUpTransaction qui a déjà cette logique.
  const { CinetPayProvider } = await import('../services/payment/cinetpay.service');
  const status = await new CinetPayProvider().verifyTopUpTransaction({
    merchantReference: topUp.gatewayReference,
    country: (payload.cpm_country as string) || 'CI',
  });
  if (status === 'paid') {
    await settleTopUp(String(topUp._id));
  } else if (status === 'failed') {
    await markTopUpFailed(String(topUp._id), 'gateway returned failed');
  }
  return true;
}

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
    // Court-circuit top-up : évite de faire chercher un ordre inexistant.
    if (await tryHandleTopUpWebhook(providerId, req.body || {})) {
      res.status(200).send('OK');
      return;
    }
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

/**
 * POST /api/webhooks/stripe
 *
 * Uniquement utilisé pour les top-ups wallet (Stripe Checkout hosted).
 * Nécessite le raw body pour vérifier la signature — d'où le middleware
 * `express.raw()` ciblé, monté AVANT les express.json/urlencoded plus haut
 * dans le fichier via une seconde route dédiée.
 *
 * Env : STRIPE_WEBHOOK_SECRET obligatoire (dashboard → Développeurs → Webhooks).
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req: Request, res: Response): Promise<void> => {
    const secret = getStripeWebhookSecret();
    if (!secret) {
      res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET missing' });
      return;
    }
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
      res.status(400).json({ error: 'Missing stripe-signature' });
      return;
    }

    let event: { type: string; data: { object: Record<string, unknown> } };
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret) as unknown as typeof event;
    } catch (err) {
      console.warn('[webhook stripe] signature check failed:', (err as Error).message);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    // On ne traite QUE les events top-up. Les payments d'ordre client passent
    // par les gateways régionaux (Moneróo/CinetPay/Flutterwave).
    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as {
          id?: string;
          client_reference_id?: string;
          metadata?: { topUpId?: string };
          payment_status?: string;
        };
        const topUpId = session.metadata?.topUpId;
        if (topUpId && session.payment_status === 'paid') {
          await settleTopUp(topUpId);
        }
      } else if (
        event.type === 'checkout.session.expired' ||
        event.type === 'checkout.session.async_payment_failed'
      ) {
        const session = event.data.object as { metadata?: { topUpId?: string } };
        const topUpId = session.metadata?.topUpId;
        if (topUpId) await markTopUpFailed(topUpId, event.type);
      }
      res.status(200).send('OK');
    } catch (err) {
      console.error('[webhook stripe] processing error:', (err as Error).message);
      res.status(500).json({ error: 'Processing failed' });
    }
  },
);

/** POST /api/webhooks/flutterwave */
router.post('/flutterwave', (req, res) => handlePaymentWebhook('flutterwave', req, res));

/** POST /api/webhooks/moneroo */
router.post('/moneroo', (req, res) => handlePaymentWebhook('moneróo', req, res));

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
