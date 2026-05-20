/**
 * Mock provider — used in dev when no real keys are set. Sends the buyer to
 * the thank-you page in simulator mode so the full flow can be demoed locally
 * without registering with any aggregator.
 */
import crypto from 'crypto';
import type { IOrder, PaymentProvider } from '../../models/Order.model';
import type {
  InitPaymentArgs,
  InitPaymentResult,
  PaymentProviderImpl,
  VerifyResult,
  WebhookHandleResult,
} from './types';

export class MockProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'manual';
  isConfigured(): boolean { return true; }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const front = firstUrl(process.env.FRONTEND_URL) || 'http://localhost:3000';
    const checkoutUrl = `${front}/thanks/${args.order._id}?simulate=1`;
    return {
      checkoutUrl,
      reference: `MOCK-${crypto.randomBytes(6).toString('hex')}`,
      provider: 'manual',
    };
  }

  async parseWebhook(payload: Record<string, unknown>): Promise<WebhookHandleResult> {
    const orderId = String(payload.orderId || '');
    return {
      status: 'paid',
      orderId,
      reference: String(payload.reference || `MOCK-${Date.now()}`),
      raw: payload,
      signatureValid: true,
    };
  }

  async verifyTransaction(order: IOrder): Promise<VerifyResult> {
    // In mock mode, mirror whatever the order already holds.
    return { status: order.paymentStatus === 'paid' ? 'paid' : 'pending', reference: order.paymentReference };
  }
}

function firstUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.split(',')[0].trim().replace(/\/$/, '') || undefined;
}
