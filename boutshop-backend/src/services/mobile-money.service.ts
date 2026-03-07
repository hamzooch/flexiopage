/**
 * Mobile-money / pan-African payments — abstracts aggregators behind a single
 * interface. Default provider: CinetPay (Wave, Orange Money, MTN MoMo, Moov +
 * Visa cards). Add more providers by implementing the PaymentProviderImpl
 * interface and registering them below.
 *
 * Env vars:
 *   CINETPAY_API_KEY
 *   CINETPAY_SITE_ID
 *   CINETPAY_NOTIFY_URL          — fallback webhook URL (defaults to API_PUBLIC_URL/api/webhooks/cinetpay)
 *   API_PUBLIC_URL               — used to build notify_url
 *   FRONTEND_URL                 — used to build return_url after checkout
 *
 * If CINETPAY_API_KEY is missing, a Mock provider takes over so devs can
 * test the full flow locally without registering with the aggregator.
 */
import crypto from 'crypto';
import type { IOrder, PaymentProvider } from '../models/Order.model';

export type Channel = 'wave' | 'orange_money' | 'mtn_momo' | 'moov_money' | 'card' | 'all';

export interface InitPaymentArgs {
  order: IOrder;
  /** Buyer phone in international format (with +). */
  phone?: string;
  /** Hint to restrict provider's UI to a specific channel (or 'all'). */
  channel?: Channel;
  /** Where the user should land after checkout. */
  returnUrl?: string;
}

export interface InitPaymentResult {
  /** Hosted checkout URL the buyer is redirected to. */
  checkoutUrl: string;
  /** Reference at the provider (transaction id / payment_token). */
  reference: string;
  /** The provider that handled the request. */
  provider: PaymentProvider;
}

export interface WebhookHandleResult {
  status: 'paid' | 'failed' | 'pending';
  /** Order id we should finalize (looked up from the webhook payload). */
  orderId?: string;
  reference?: string;
  raw?: Record<string, unknown>;
}

interface PaymentProviderImpl {
  id: PaymentProvider;
  isConfigured(): boolean;
  initPayment(args: InitPaymentArgs): Promise<InitPaymentResult>;
  parseWebhook(payload: Record<string, unknown>, headers: Record<string, string | undefined>): Promise<WebhookHandleResult>;
}

// ─────────────────────────────────────────────────────────────────────
// CinetPay — covers Wave, OM, MTN, Moov + Visa cards in 1 API
// Docs: https://docs.cinetpay.com/api/1.0-fr/
// ─────────────────────────────────────────────────────────────────────
class CinetPayProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'cinetpay';
  private base = 'https://api-checkout.cinetpay.com/v2';

  isConfigured(): boolean {
    return !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID);
  }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const apikey = process.env.CINETPAY_API_KEY!;
    const siteId = process.env.CINETPAY_SITE_ID!;
    const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5001').replace(/\/$/, '');
    const frontBase = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const notifyUrl = process.env.CINETPAY_NOTIFY_URL || `${apiBase}/api/webhooks/cinetpay`;
    const orderId = String(args.order._id);
    const returnUrl = args.returnUrl || `${frontBase}/thanks/${orderId}`;

    // Channel mapping — CinetPay accepts "ALL" / "MOBILE_MONEY" / "CREDIT_CARD" / "WALLET"
    const channel =
      args.channel === 'card' ? 'CREDIT_CARD' :
      args.channel && args.channel !== 'all' ? 'MOBILE_MONEY' :
      'ALL';

    // CinetPay constraint: XOF / XAF amounts must be a multiple of 5
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

  async parseWebhook(payload: Record<string, unknown>): Promise<WebhookHandleResult> {
    const transactionId = String(payload.cpm_trans_id || payload.transaction_id || '');
    const status = String(payload.cpm_trans_status || payload.status || '').toUpperCase();
    const reference = String(payload.cpm_payid || payload.payment_token || transactionId);

    // Recommended: re-hit /payment/check to confirm the transaction is genuine.
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
          status: verified ? 'paid' : status === 'ACCEPTED' ? 'paid' : status === 'REFUSED' ? 'failed' : 'pending',
          orderId: transactionId,
          reference,
          raw: { ...payload, _check: checkJson.data || null },
        };
      } catch {
        // fall through
      }
    }
    return {
      status: status === 'ACCEPTED' ? 'paid' : status === 'REFUSED' ? 'failed' : 'pending',
      orderId: transactionId,
      reference,
      raw: payload,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Mock provider — used in dev when no real keys are set. Lets the seller
// click "Simulate paid" on the thank-you page to manually finalize the
// order. So you can demo the entire flow without integrating yet.
// ─────────────────────────────────────────────────────────────────────
class MockProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'manual';
  isConfigured(): boolean { return true; }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const front = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    // Send the buyer to the thank-you page in simulator mode.
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
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Registry & routing
// ─────────────────────────────────────────────────────────────────────
const cinetpay = new CinetPayProvider();
const mock = new MockProvider();

const PROVIDERS: Partial<Record<PaymentProvider, PaymentProviderImpl>> = {
  cinetpay,
  manual: mock,
};

/** Active provider — CinetPay if configured, otherwise mock for dev. */
export function pickActiveProvider(): PaymentProviderImpl {
  if (cinetpay.isConfigured()) return cinetpay;
  return mock;
}

export function getProviderById(id: PaymentProvider): PaymentProviderImpl | null {
  return PROVIDERS[id] || null;
}

export async function initOrderPayment(
  order: IOrder,
  args: { phone?: string; channel?: Channel; returnUrl?: string } = {}
): Promise<InitPaymentResult> {
  return pickActiveProvider().initPayment({ order, ...args });
}

export function isMockMode(): boolean {
  return !cinetpay.isConfigured();
}
