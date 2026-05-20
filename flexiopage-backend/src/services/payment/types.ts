/**
 * Shared payment-provider contracts. Every gateway (CinetPay, Flutterwave,
 * mock) implements `PaymentProviderImpl` so the registry can route by
 * country/method without knowing provider specifics.
 */
import type { IOrder, PaymentProvider } from '../../models/Order.model';

/** Provider UI channel hint. */
export type Channel = 'wave' | 'orange_money' | 'mtn_momo' | 'moov_money' | 'card' | 'all';

export interface InitPaymentArgs {
  order: IOrder;
  /** Buyer phone in international format (with +). */
  phone?: string;
  /** Hint to restrict the provider's UI to a specific channel (or 'all'). */
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
  /**
   * Signature verification outcome. `false` means the payload failed the
   * gateway's signature/HMAC check and MUST NOT mutate the order.
   * `undefined` means the provider relies on a server-side re-check instead
   * (e.g. CinetPay /payment/check) rather than a header signature.
   */
  signatureValid?: boolean;
}

export interface VerifyResult {
  status: 'paid' | 'failed' | 'pending';
  reference?: string;
  raw?: Record<string, unknown>;
}

export interface PaymentProviderImpl {
  id: PaymentProvider;
  isConfigured(): boolean;
  initPayment(args: InitPaymentArgs): Promise<InitPaymentResult>;
  parseWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined>,
    rawBody?: string,
  ): Promise<WebhookHandleResult>;
  /**
   * Authoritative server-to-server status check for an order (anti-fraud,
   * powers GET /api/payment/verify/:ref). Looks the transaction up at the
   * gateway by the order's reference — never trusts client-reported status.
   */
  verifyTransaction?(order: IOrder): Promise<VerifyResult>;
}
