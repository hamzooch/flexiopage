/**
 * Flutterwave — Card + Mobile Money across Nigeria, Ghana, Kenya, SA, etc.
 * Standard (hosted) checkout via REST, no SDK (consistent with CinetPay).
 * Docs: https://developer.flutterwave.com/docs/
 *
 * Env:
 *   FLW_SECRET_KEY    — Bearer token for all server calls (REQUIRED, server-only)
 *   FLW_PUBLIC_KEY    — informational (not used server-side for Standard flow)
 *   FLW_SECRET_HASH   — the value set in the FLW dashboard webhook settings;
 *                       inbound webhooks must echo it in the `verif-hash` header
 *   API_PUBLIC_URL    — (unused here; FLW posts webhooks to the dashboard URL)
 *   FRONTEND_URL      — used to build redirect_url
 *
 * Webhook security:
 *   1. `verif-hash` header must equal FLW_SECRET_HASH (timing-safe).
 *   2. Independent re-verification via /transactions/verify_by_reference, and
 *      we assert the gateway-reported status is "successful" before paying.
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

interface FlwVerifyData {
  status?: string;
  tx_ref?: string;
  flw_ref?: string;
  amount?: number;
  currency?: string;
  id?: number | string;
}

export class FlutterwaveProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'flutterwave';
  private base = 'https://api.flutterwave.com/v3';

  isConfigured(): boolean {
    return !!process.env.FLW_SECRET_KEY;
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const frontBase = firstUrl(process.env.FRONTEND_URL) || 'http://localhost:3000';
    const orderId = String(args.order._id);
    // tx_ref doubles as our lookup key — equals the order id so the webhook
    // and verify_by_reference both resolve straight back to the order.
    const txRef = orderId;
    const redirectUrl = args.returnUrl || `${frontBase}/thanks/${orderId}`;

    // Restrict to card or mobile money when the buyer picked a channel.
    const paymentOptions =
      args.channel === 'card' ? 'card'
      : args.channel && args.channel !== 'all' ? 'mobilemoneyghana,mpesa,mobilemoneyfranco,mobilemoneyuganda,mobilemoneyrwanda,mobilemoneyzambia'
      : 'card,mobilemoney,ussd,banktransfer';

    const body = {
      tx_ref: txRef,
      amount: Math.round(args.order.total),
      currency: args.order.currency,
      redirect_url: redirectUrl,
      payment_options: paymentOptions,
      customer: {
        email: args.order.email,
        name: args.order.customerName || 'Client',
        phonenumber: args.phone || args.order.paymentPhone || '',
      },
      customizations: {
        title: `Commande ${args.order.orderNumber}`,
        description: `Paiement de la commande ${args.order.orderNumber}`,
      },
      meta: { orderId },
    };

    const res = await fetch(`${this.base}/payments`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { status?: string; message?: string; data?: { link?: string } };
    if (!res.ok || json.status !== 'success' || !json.data?.link) {
      throw new Error(`Flutterwave init failed: ${json.message || res.status}`);
    }
    return { checkoutUrl: json.data.link, reference: txRef, provider: 'flutterwave' };
  }

  /** verif-hash header must match FLW_SECRET_HASH. */
  private verifyHash(headers: Record<string, string | undefined>): boolean | undefined {
    const secret = process.env.FLW_SECRET_HASH;
    const hash = headers['verif-hash'] || headers['Verif-Hash'];
    if (!secret) return undefined; // not configured → fall back to re-verify
    if (!hash) return false;
    try {
      const a = Buffer.from(String(hash));
      const b = Buffer.from(secret);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /** Authoritative status by tx_ref (= order id). */
  private async verifyByReference(txRef: string): Promise<{ ok: boolean; data?: FlwVerifyData }> {
    if (!this.isConfigured()) return { ok: false };
    const url = `${this.base}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    const json = (await res.json()) as { status?: string; data?: FlwVerifyData };
    return { ok: json.status === 'success', data: json.data };
  }

  async parseWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined> = {},
  ): Promise<WebhookHandleResult> {
    const signatureValid = this.verifyHash(headers);
    const data = (payload.data as Record<string, unknown>) || {};
    const txRef = String(data.tx_ref || payload.tx_ref || '');
    const reference = String(data.flw_ref || data.id || txRef);

    if (signatureValid === false) {
      return { status: 'failed', orderId: txRef, reference, raw: payload, signatureValid: false };
    }

    // Re-verify with Flutterwave regardless of the webhook's claimed status.
    try {
      const check = await this.verifyByReference(txRef);
      const verified = check.ok && String(check.data?.status).toLowerCase() === 'successful';
      const failed = String(check.data?.status).toLowerCase() === 'failed';
      return {
        status: verified ? 'paid' : failed ? 'failed' : 'pending',
        orderId: txRef,
        reference: String(check.data?.flw_ref || reference),
        raw: { ...payload, _verify: check.data || null },
        signatureValid,
      };
    } catch {
      const claimed = String(data.status || '').toLowerCase();
      return {
        status: claimed === 'successful' ? 'pending' : 'pending', // never trust the claim alone
        orderId: txRef,
        reference,
        raw: payload,
        signatureValid,
      };
    }
  }

  async verifyTransaction(order: IOrder): Promise<VerifyResult> {
    const txRef = String(order._id);
    const check = await this.verifyByReference(txRef);
    const status = String(check.data?.status || '').toLowerCase();
    return {
      status: check.ok && status === 'successful' ? 'paid' : status === 'failed' ? 'failed' : 'pending',
      reference: String(check.data?.flw_ref || order.paymentReference || txRef),
      raw: (check.data as Record<string, unknown>) || undefined,
    };
  }
}

function firstUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.split(',')[0].trim().replace(/\/$/, '') || undefined;
}
