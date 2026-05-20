/**
 * CinetPay — Wave, Orange Money, MTN MoMo, Moov + Visa cards in one API.
 * Docs: https://docs.cinetpay.com/api/1.0-fr/
 *
 * Env:
 *   CINETPAY_API_KEY      — required to init payments
 *   CINETPAY_SITE_ID      — required
 *   CINETPAY_SECRET_KEY   — optional, enables `x-token` HMAC webhook verification
 *   CINETPAY_NOTIFY_URL   — fallback webhook URL (defaults to API_PUBLIC_URL/api/webhooks/cinetpay)
 *   API_PUBLIC_URL        — used to build notify_url
 *   FRONTEND_URL          — used to build return_url
 *
 * Webhook security (defense in depth):
 *   1. `x-token` HMAC-SHA256 over the canonical field concatenation, when
 *      CINETPAY_SECRET_KEY is set (timing-safe compare).
 *   2. Independent server-side re-check via /payment/check (always, when keys
 *      are configured). The order is only marked paid when the re-check says
 *      ACCEPTED — so even a forged/replayed webhook can't fake a payment.
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

/**
 * CinetPay's documented x-token field order. The HMAC is computed over the
 * concatenation of these POST fields (empty string when absent), keyed by the
 * site secret key.
 */
const X_TOKEN_FIELDS = [
  'cpm_site_id', 'cpm_trans_id', 'cpm_trans_date', 'cpm_amount', 'cpm_currency',
  'signature', 'payment_method', 'cel_phone_num', 'cpm_phone_prefixe',
  'cpm_language', 'cpm_version', 'cpm_payment_config', 'cpm_page_action',
  'cpm_custom', 'cpm_designation', 'cpm_error_message',
];

export class CinetPayProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'cinetpay';
  private base = 'https://api-checkout.cinetpay.com/v2';

  isConfigured(): boolean {
    return !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID);
  }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const apikey = process.env.CINETPAY_API_KEY!;
    const siteId = process.env.CINETPAY_SITE_ID!;
    const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5050').replace(/\/$/, '');
    const frontBase = firstUrl(process.env.FRONTEND_URL) || 'http://localhost:3000';
    const notifyUrl = process.env.CINETPAY_NOTIFY_URL || `${apiBase}/api/webhooks/cinetpay`;
    const orderId = String(args.order._id);
    const returnUrl = args.returnUrl || `${frontBase}/thanks/${orderId}`;

    const channel =
      args.channel === 'card' ? 'CREDIT_CARD' :
      args.channel && args.channel !== 'all' ? 'MOBILE_MONEY' :
      'ALL';

    // CinetPay constraint: XOF / XAF amounts must be a multiple of 5.
    const isCfa = ['XOF', 'XAF'].includes(args.order.currency);
    const amount = isCfa ? Math.round(args.order.total / 5) * 5 : Math.round(args.order.total);

    const body = {
      apikey,
      site_id: siteId,
      transaction_id: orderId,
      amount,
      currency: args.order.currency,
      description: `Order ${args.order.orderNumber}`,
      customer_name: args.order.customerName?.split(' ')[0] || 'Client',
      customer_surname: args.order.customerName?.split(' ').slice(1).join(' ') || '-',
      customer_email: args.order.email,
      customer_phone_number: args.phone || args.order.paymentPhone || '',
      customer_address: '-',
      customer_city: '-',
      customer_country: args.order.shippingAddress?.country || 'SN',
      customer_state: '-',
      customer_zip_code: '-',
      notify_url: notifyUrl,
      return_url: returnUrl,
      channels: channel,
      lang: 'fr',
      metadata: orderId,
    };

    const res = await fetch(`${this.base}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      code?: string;
      message?: string;
      data?: { payment_url?: string; payment_token?: string };
    };
    if (!res.ok || json.code !== '201' || !json.data?.payment_url) {
      throw new Error(`CinetPay init failed (${json.code}): ${json.message || 'unknown'}`);
    }
    return {
      checkoutUrl: json.data.payment_url,
      reference: json.data.payment_token || orderId,
      provider: 'cinetpay',
    };
  }

  /** Verify CinetPay's `x-token` HMAC header. Returns undefined when no secret
   *  is configured (so the caller falls back to the /payment/check re-verify). */
  private verifyXToken(
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): boolean | undefined {
    const secret = process.env.CINETPAY_SECRET_KEY;
    const token = headers['x-token'] || headers['X-Token'];
    if (!secret || !token) return undefined;
    const data = X_TOKEN_FIELDS.map((f) => String(payload[f] ?? '')).join('');
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(String(token), 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async parseWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined> = {},
  ): Promise<WebhookHandleResult> {
    const transactionId = String(payload.cpm_trans_id || payload.transaction_id || '');
    const status = String(payload.cpm_trans_status || payload.status || '').toUpperCase();
    const reference = String(payload.cpm_payid || payload.payment_token || transactionId);

    const signatureValid = this.verifyXToken(payload, headers);
    // If a secret is configured and the HMAC explicitly fails, reject early —
    // never re-check or mutate the order on a forged payload.
    if (signatureValid === false) {
      return { status: 'failed', orderId: transactionId, reference, raw: payload, signatureValid: false };
    }

    // Independent server-side re-verification (the real anti-fraud gate).
    if (this.isConfigured() && transactionId) {
      const apikey = process.env.CINETPAY_API_KEY!;
      const siteId = process.env.CINETPAY_SITE_ID!;
      try {
        const checkRes = await fetch(`${this.base}/payment/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apikey, site_id: siteId, transaction_id: transactionId }),
        });
        const checkJson = (await checkRes.json()) as {
          code?: string;
          data?: { status?: string; payment_method?: string; operator_id?: string };
        };
        const verified = checkJson.code === '00' && checkJson.data?.status === 'ACCEPTED';
        return {
          status: verified ? 'paid' : status === 'REFUSED' ? 'failed' : 'pending',
          orderId: transactionId,
          reference,
          raw: { ...payload, _check: checkJson.data || null },
          signatureValid,
        };
      } catch {
        // fall through to header-based status
      }
    }
    return {
      status: status === 'ACCEPTED' ? 'paid' : status === 'REFUSED' ? 'failed' : 'pending',
      orderId: transactionId,
      reference,
      raw: payload,
      signatureValid,
    };
  }

  async verifyTransaction(order: IOrder): Promise<VerifyResult> {
    if (!this.isConfigured()) return { status: 'pending' };
    const apikey = process.env.CINETPAY_API_KEY!;
    const siteId = process.env.CINETPAY_SITE_ID!;
    const transactionId = String(order._id);
    const res = await fetch(`${this.base}/payment/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey, site_id: siteId, transaction_id: transactionId }),
    });
    const json = (await res.json()) as {
      code?: string;
      data?: { status?: string; operator_id?: string; payment_method?: string };
    };
    const accepted = json.code === '00' && json.data?.status === 'ACCEPTED';
    const refused = json.data?.status === 'REFUSED';
    return {
      status: accepted ? 'paid' : refused ? 'failed' : 'pending',
      reference: order.paymentReference || transactionId,
      raw: (json.data as Record<string, unknown>) || undefined,
    };
  }
}

/** FRONTEND_URL may be a comma-separated list (dev) — take the first entry. */
function firstUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.split(',')[0].trim().replace(/\/$/, '') || undefined;
}
