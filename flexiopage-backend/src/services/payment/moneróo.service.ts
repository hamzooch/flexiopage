/**
 * Moneróo — Multiple payment providers (Wave, MTN, Moov, Orange Money, cards) in Africa.
 * Docs: https://docs.moneroo.io/payments/initialize-payment
 *
 * Env:
 *   MONERÓO_API_KEY       — required to init payments (Bearer token)
 *   MONERÓO_NOTIFY_URL    — fallback webhook URL (defaults to API_PUBLIC_URL/api/webhooks/moneróo)
 *   API_PUBLIC_URL        — used to build notify_url
 *   FRONTEND_URL          — used to build return_url
 *
 * Webhook security:
 *   1. Server-side re-check via Moneróo query params on return (optional later).
 *   2. Webhook payload contains transactionId, customer email, amount for verification.
 */
import type { IOrder, PaymentProvider } from '../../models/Order.model';
import type {
  InitPaymentArgs,
  InitPaymentResult,
  PaymentProviderImpl,
  VerifyResult,
  WebhookHandleResult,
} from './types';

export class MoneróoProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'moneróo';
  private base = 'https://api.moneroo.io/v1';

  isConfigured(): boolean {
    return !!process.env.MONERÓO_API_KEY;
  }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const apiKey = process.env.MONERÓO_API_KEY!;
    const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5051').replace(/\/$/, '');
    const frontBase = firstUrl(process.env.FRONTEND_URL) || 'http://localhost:3000';
    const notifyUrl = process.env.MONERÓO_NOTIFY_URL || `${apiBase}/api/webhooks/moneróo`;
    const orderId = String(args.order._id);
    const returnUrl = args.returnUrl || `${frontBase}/thanks/${orderId}`;

    const [firstName = 'Client', ...lastNameParts] = args.order.customerName?.split(' ') || [];
    const lastName = lastNameParts.join(' ') || '-';

    const body = {
      amount: Math.round(args.order.total * 100), // Moneróo expects cents
      currency: args.order.currency || 'XOF',
      description: `Order ${args.order.orderNumber}`,
      return_url: returnUrl,
      customer: {
        email: args.order.email,
        first_name: firstName,
        last_name: lastName,
        phone: args.phone || args.order.paymentPhone,
        address: args.order.shippingAddress?.line1 || '-',
        city: args.order.shippingAddress?.city || '-',
        country: args.order.shippingAddress?.country || 'SN',
      },
      metadata: {
        order_id: orderId,
        order_number: args.order.orderNumber,
      },
      // Restrict to specific country if provided
      ...(args.order.shippingAddress?.country && {
        restrict_country_code: args.order.shippingAddress.country,
      }),
    };

    const res = await fetch(`${this.base}/payments/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as {
      message?: string;
      data?: { id?: string; checkout_url?: string };
      error?: string;
    };

    if (!res.ok || !json.data?.checkout_url) {
      throw new Error(
        `Moneróo init failed (${res.status}): ${json.error || json.message || 'unknown'}`
      );
    }

    return {
      checkoutUrl: json.data.checkout_url,
      reference: json.data.id || orderId,
      provider: 'moneróo',
    };
  }

  async parseWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined> = {},
  ): Promise<WebhookHandleResult> {
    // Moneróo webhook payload structure (from docs):
    // {
    //   "transaction_id": "...",
    //   "payment_id": "...",
    //   "status": "success" | "failed" | "pending",
    //   "amount": 100,
    //   "currency": "XOF",
    //   "customer": { "email": "...", "phone": "..." },
    //   "metadata": { "order_id": "..." },
    //   "timestamp": "2026-..."
    // }

    const metadata = payload.metadata as Record<string, unknown> | undefined;
    const transactionId = String(payload.transaction_id || metadata?.order_id || '');
    const paymentId = String(payload.payment_id || payload.transaction_id || '');
    const status = String(payload.status || '').toLowerCase();

    // Map Moneróo status to our standard format
    let mappedStatus: 'paid' | 'failed' | 'pending' = 'pending';
    if (status === 'success') mappedStatus = 'paid';
    else if (status === 'failed') mappedStatus = 'failed';

    return {
      status: mappedStatus,
      orderId: transactionId,
      reference: paymentId,
      raw: payload,
      signatureValid: undefined, // Moneróo doesn't use HMAC header — relies on return_url params
    };
  }

  async verifyTransaction(order: IOrder): Promise<VerifyResult> {
    // For now, just return pending. Moneróo doesn't have a transaction status check API in the free tier.
    // Real implementation would call a status endpoint if available.
    if (!this.isConfigured()) return { status: 'pending' };
    const status = (order.paymentStatus === 'pending' || order.paymentStatus === 'paid' || order.paymentStatus === 'failed')
      ? order.paymentStatus
      : 'pending';
    return {
      status,
      reference: order.paymentReference || String(order._id),
    };
  }
}

function firstUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.split(',')[0].trim().replace(/\/$/, '') || undefined;
}
