/**
 * Moneróo — Multiple payment providers (Wave, MTN, Moov, Orange Money, cards) in Africa.
 * Docs: https://docs.moneroo.io/payments/initialize-payment
 *
 * Env (accepts both ASCII and accented names for robustness — most shells
 * mangle "ó" in .env files or when exporting, so MONEROO_* is the recommended
 * canonical form and MONERÓO_* is kept as a legacy alias):
 *   MONEROO_API_KEY       — required to init payments (Bearer token)
 *   MONEROO_NOTIFY_URL    — fallback webhook URL (defaults to API_PUBLIC_URL/api/webhooks/moneroo)
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

/** Read the Moneroo API key from env, tolerating both ASCII and accented names. */
function moneRooApiKey(): string | undefined {
  return process.env.MONEROO_API_KEY || process.env.MONERÓO_API_KEY;
}

function moneRooNotifyUrl(): string | undefined {
  return process.env.MONEROO_NOTIFY_URL || process.env.MONERÓO_NOTIFY_URL;
}

export class MoneróoProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'moneróo';
  private base = 'https://api.moneroo.io/v1';

  isConfigured(): boolean {
    return !!moneRooApiKey();
  }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const apiKey = moneRooApiKey()!;
    const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5051').replace(/\/$/, '');
    const frontBase = firstUrl(process.env.FRONTEND_URL) || 'http://localhost:3000';
    const notifyUrl = moneRooNotifyUrl() || `${apiBase}/api/webhooks/moneroo`;
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
    // orderId is OUR Mongo ObjectId, passed to Moneróo via metadata.order_id at init.
    // transaction_id is Moneróo's own reference — never a valid ObjectId.
    const orderId = String(metadata?.order_id || '');
    const paymentId = String(payload.payment_id || payload.transaction_id || '');
    const status = String(payload.status || '').toLowerCase();

    // Map Moneróo status to our standard format
    let mappedStatus: 'paid' | 'failed' | 'pending' = 'pending';
    if (status === 'success') mappedStatus = 'paid';
    else if (status === 'failed') mappedStatus = 'failed';

    return {
      status: mappedStatus,
      orderId,
      reference: paymentId,
      raw: payload,
      signatureValid: undefined, // Moneróo doesn't use HMAC header — relies on return_url params
    };
  }

  async verifyTransaction(order: IOrder): Promise<VerifyResult> {
    if (!this.isConfigured()) return { status: 'pending' };
    if (!order.paymentReference) {
      return { status: 'pending', reference: String(order._id) };
    }

    try {
      const apiKey = moneRooApiKey()!;
      const paymentId = order.paymentReference;

      const res = await fetch(`${this.base}/payments/${paymentId}/verify`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const json = (await res.json()) as {
        message?: string;
        data?: {
          id?: string;
          status?: string;
          amount?: number;
          currency?: string;
        };
        error?: string;
      };

      if (!res.ok || !json.data) {
        console.warn(`Moneróo verify failed for ${paymentId}: ${json.error || json.message}`);
        return { status: 'pending', reference: paymentId, raw: json };
      }

      const apiStatus = String(json.data.status || '').toLowerCase();
      let mappedStatus: 'paid' | 'failed' | 'pending' = 'pending';

      if (apiStatus === 'success') mappedStatus = 'paid';
      else if (apiStatus === 'failed') mappedStatus = 'failed';

      return {
        status: mappedStatus,
        reference: json.data.id || paymentId,
        raw: json.data,
      };
    } catch (err) {
      console.error(`Moneróo verifyTransaction error for ${order._id}:`, err);
      return { status: 'pending', reference: order.paymentReference };
    }
  }
}

function firstUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.split(',')[0].trim().replace(/\/$/, '') || undefined;
}
