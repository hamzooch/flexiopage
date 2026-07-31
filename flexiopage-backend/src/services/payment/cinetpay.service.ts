/**
 * CinetPay v1 provider, backed by the official `cinetpay-js` SDK.
 * Docs: https://github.com/cinetpay/cinetpay-js
 *
 * The SDK auto-detects sandbox vs prod from the API key prefix:
 *   - `sk_test_...` → https://api.cinetpay.net (sandbox)
 *   - `sk_live_...` → https://api.cinetpay.co  (prod)
 * so there's no host env var to set — swap the credentials and the SDK
 * routes to the right environment.
 *
 * Env (required):
 *   CINETPAY_API_KEY       — `account_key` from Dashboard → API & sécurité.
 *   CINETPAY_API_PASSWORD  — "Mot de passe API" from the same page.
 *
 * Env (optional):
 *   CINETPAY_NOTIFY_URL    — defaults to API_PUBLIC_URL/api/webhooks/cinetpay
 *   API_PUBLIC_URL         — used to build notify_url
 *   FRONTEND_URL           — used to build success_url + failed_url
 *
 * NB: v1 API has no `site_id` — each `account_key` IS the site identity.
 * (SITE_ID was a v2 guichet concept — no longer used.)
 *
 * Country routing: the SDK's credentials map is keyed by ISO country code.
 * We build the map lazily on first use, pulling credentials from env. Adding
 * a second country (e.g. SN) just means adding CINETPAY_API_KEY_SN / etc.
 * without a code change.
 *
 * Verification model:
 *   - Webhooks carry a `notify_token` we should have stored at init time,
 *     but our provider layer is stateless so we rely on the SDK's
 *     `payment.getStatus()` re-check as the authoritative anti-fraud gate.
 *   - `parseWebhook` therefore extracts the transaction id, calls getStatus,
 *     and only reports `paid` when the SDK returns SUCCESS.
 */
import {
  CinetPayClient,
  parseNotification,
  ApiError,
  type CountryCode,
  type CountryCredentials,
  type PaymentRequest,
  type Channel as SdkChannel,
} from 'cinetpay-js';
import type { IOrder, PaymentProvider } from '../../models/Order.model';
import { logPayment } from '../../models/PaymentLog.model';
import type {
  InitPaymentArgs,
  InitPaymentResult,
  PaymentProviderImpl,
  VerifyResult,
  WebhookHandleResult,
} from './types';

/** Map our internal tri-state to what the storefront cares about. */
function mapStatus(s: string | undefined): 'paid' | 'failed' | 'pending' {
  const up = String(s || '').toUpperCase();
  if (up === 'SUCCESS') return 'paid';
  if (up === 'FAILED') return 'failed';
  return 'pending'; // INITIATED / PENDING / unknown
}

/** SDK constraint — merchantTransactionId capped at 30 chars. MongoDB
 *  ObjectIds are 24 so they fit; longer IDs get truncated defensively. */
function truncateMerchantTxId(id: string): string {
  return id.length <= 30 ? id : id.slice(0, 30);
}

/** Split a full name into first + last, both min 2 chars per SDK validation. */
function splitCustomerName(rawName: string | undefined): { first: string; last: string } {
  const parts = (rawName || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] && parts[0].length >= 2 ? parts[0] : 'Client';
  const rest = parts.slice(1).join(' ');
  const last = rest.length >= 2 ? rest : 'FlexioPage';
  return { first, last };
}

export class CinetPayProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'cinetpay';

  /** SDK client cached across calls — new-ing it up on every payment would
   *  wipe the token cache and force a fresh /auth/login round-trip. */
  private static sdkClient: CinetPayClient | null = null;

  isConfigured(): boolean {
    return !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_API_PASSWORD);
  }

  /**
   * Build the SDK client with credentials for every country we support.
   * Extra countries can be enabled by setting `CINETPAY_API_KEY_<CC>` and
   * `CINETPAY_API_PASSWORD_<CC>` in env — falling back to the default
   * `CINETPAY_API_KEY` / `CINETPAY_API_PASSWORD` when the country-specific
   * pair is missing keeps single-country sellers working out of the box.
   */
  private getClient(): CinetPayClient {
    if (CinetPayProvider.sdkClient) return CinetPayProvider.sdkClient;

    const defaultKey = process.env.CINETPAY_API_KEY;
    const defaultPassword = process.env.CINETPAY_API_PASSWORD;
    if (!defaultKey || !defaultPassword) {
      throw new Error(
        'CinetPay: CINETPAY_API_KEY and CINETPAY_API_PASSWORD are required.',
      );
    }

    // Countries supported by CinetPay (see SDK's COUNTRY_CODES).
    const countries: CountryCode[] = ['CI', 'BF', 'ML', 'SN', 'TG', 'GN', 'CM', 'BJ', 'CD', 'NE'];
    const credentials: Partial<Record<CountryCode, CountryCredentials>> = {};
    for (const cc of countries) {
      const apiKey = process.env[`CINETPAY_API_KEY_${cc}`] || defaultKey;
      const apiPassword = process.env[`CINETPAY_API_PASSWORD_${cc}`] || defaultPassword;
      credentials[cc] = { apiKey, apiPassword };
    }

    // Optional override — force a specific host (usually sandbox
    // `https://api.cinetpay.net`) even with a live-prefixed key. The SDK
    // auto-detects sandbox vs prod from the sk_test_/sk_live_ prefix; this
    // env var lets a support agent hand out live-looking credentials that
    // must still be validated against the sandbox host before switching.
    const baseUrlOverride = process.env.CINETPAY_BASE_URL?.trim();

    CinetPayProvider.sdkClient = new CinetPayClient({
      credentials: credentials as Record<CountryCode, CountryCredentials>,
      ...(baseUrlOverride ? { baseUrl: baseUrlOverride } : {}),
      // debug logs go through console.log with a [cinetpay] prefix — useful
      // during validation, silence in prod by flipping to false.
      debug: process.env.CINETPAY_DEBUG === '1',
    });
    return CinetPayProvider.sdkClient;
  }

  /**
   * Initie un paiement CinetPay pour une recharge wallet vendeur (top-up).
   * Différent de `initPayment` qui prend un IOrder : ici on n'a pas de
   * commande, juste un montant + les infos du vendeur.
   *
   * `merchantReference` = notre WalletTopUp.gatewayReference (≤30 chars).
   * Renvoie `{ checkoutUrl, transactionId }` — l'appelant persiste ces valeurs
   * dans le doc WalletTopUp. Le webhook retrouve le top-up via transactionId.
   */
  async initTopUpPayment(args: {
    merchantReference: string;
    amount: number;
    currency: string;
    country: string;
    vendorEmail: string;
    vendorName?: string;
    vendorPhone?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string; transactionId: string }> {
    const client = this.getClient();
    const country = (args.country || 'CI').toUpperCase() as CountryCode;
    const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5051').replace(/\/$/, '');
    const notifyUrl = process.env.CINETPAY_NOTIFY_URL || `${apiBase}/api/webhooks/cinetpay`;

    // XOF/XAF doivent être multiples de 5.
    const isCfa = ['XOF', 'XAF'].includes(args.currency.toUpperCase());
    const amount = isCfa ? Math.round(args.amount / 5) * 5 : Math.round(args.amount);
    const { first, last } = splitCustomerName(args.vendorName);

    const request: PaymentRequest = {
      currency: args.currency.toUpperCase() as PaymentRequest['currency'],
      merchantTransactionId: truncateMerchantTxId(args.merchantReference),
      amount,
      lang: 'fr',
      designation: `Recharge solde FlexioPage`.slice(0, 120),
      clientEmail: args.vendorEmail,
      clientFirstName: first,
      clientLastName: last,
      clientPhoneNumber: args.vendorPhone,
      successUrl: args.successUrl.slice(0, 120),
      failedUrl: args.cancelUrl.slice(0, 120),
      notifyUrl: notifyUrl.slice(0, 120),
      channel: 'PUSH' as SdkChannel,
    };

    const payment = await client.payment.initialize(request, country);
    return {
      checkoutUrl: payment.paymentUrl,
      transactionId: payment.transactionId || payment.paymentToken || request.merchantTransactionId,
    };
  }

  /**
   * Vérifie l'état d'un top-up CinetPay en appelant `payment.getStatus()`.
   * Utilisé par le webhook et par l'endpoint de polling côté frontend.
   */
  async verifyTopUpTransaction(args: {
    merchantReference: string;
    country: string;
  }): Promise<'paid' | 'failed' | 'pending'> {
    const client = this.getClient();
    const country = (args.country || 'CI').toUpperCase() as CountryCode;
    try {
      const status = await client.payment.getStatus(args.merchantReference, country);
      return mapStatus((status as { status?: string }).status);
    } catch {
      return 'pending';
    }
  }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const client = this.getClient();
    const country = (args.order.shippingAddress?.country || 'CI').toUpperCase() as CountryCode;

    const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5051').replace(/\/$/, '');
    const frontBase = firstUrl(process.env.FRONTEND_URL) || 'http://localhost:3000';
    const notifyUrl = process.env.CINETPAY_NOTIFY_URL || `${apiBase}/api/webhooks/cinetpay`;
    const orderId = truncateMerchantTxId(String(args.order._id));
    const successUrl = args.returnUrl || `${frontBase}/thanks/${orderId}`;
    const failedUrl = `${frontBase}/thanks/${orderId}?failed=1`;

    // CinetPay constraint: XOF/XAF amounts must be a multiple of 5.
    const isCfa = ['XOF', 'XAF'].includes(args.order.currency);
    const amount = isCfa ? Math.round(args.order.total / 5) * 5 : Math.round(args.order.total);

    const { first, last } = splitCustomerName(args.order.customerName);

    const request: PaymentRequest = {
      currency: args.order.currency as PaymentRequest['currency'],
      merchantTransactionId: orderId,
      amount,
      lang: 'fr',
      designation: `Order ${args.order.orderNumber}`.slice(0, 120),
      clientEmail: args.order.email,
      clientFirstName: first,
      clientLastName: last,
      clientPhoneNumber: args.phone || args.order.paymentPhone || undefined,
      successUrl: successUrl.slice(0, 120),
      failedUrl: failedUrl.slice(0, 120),
      notifyUrl: notifyUrl.slice(0, 120),
      channel: channelForRequest(args.channel),
    };

    try {
      const payment = await client.payment.initialize(request, country);
      return {
        checkoutUrl: payment.paymentUrl,
        // Prefer the CinetPay-side id so verifyTransaction re-checks the
        // exact same tx later, not our best-effort merchant id.
        reference: payment.transactionId || payment.paymentToken || orderId,
        provider: 'cinetpay',
      };
    } catch (err) {
      // Persist the failure so the admin CinetPay log page shows exactly
      // what CinetPay rejected — auth 422, IP not whitelisted, invalid
      // payload, etc. Success is already logged by the caller.
      const apiCode = err instanceof ApiError ? err.apiCode : undefined;
      const apiStatus = err instanceof ApiError ? err.apiStatus : undefined;
      const description = err instanceof ApiError ? err.description : undefined;
      const errorMessage =
        err instanceof ApiError
          ? `CinetPay init failed (${apiCode} ${apiStatus}): ${description || err.message}`
          : (err as Error).message;
      await logPayment({
        orderId: String(args.order._id),
        storeId: args.order.storeId ? String(args.order.storeId) : undefined,
        gateway: 'cinetpay',
        reference: orderId,
        event: 'initiate',
        status: 'failed',
        note: errorMessage,
        rawPayload: {
          apiCode,
          apiStatus,
          description,
          message: (err as Error).message,
          country,
          amount: request.amount,
          currency: request.currency,
          merchantTxId: orderId,
          notifyUrl,
        },
      });
      if (err instanceof ApiError) {
        throw new Error(errorMessage);
      }
      throw err;
    }
  }

  /**
   * Parse the CinetPay webhook + do the authoritative getStatus re-check.
   * A forged/replayed webhook can never fake a payment — only the SDK's
   * `payment.getStatus()` result decides `paid`.
   */
  async parseWebhook(
    payload: Record<string, unknown>,
    _headers: Record<string, string | undefined> = {},
  ): Promise<WebhookHandleResult> {
    let extracted: {
      transactionId?: string;
      merchantTransactionId?: string;
      notifyToken?: string;
    };
    try {
      const parsed = parseNotification(payload);
      extracted = {
        transactionId: parsed.transactionId,
        merchantTransactionId: parsed.merchantTransactionId,
        notifyToken: parsed.notifyToken,
      };
    } catch {
      // Fallback for slightly different webhook shapes — grab what we can
      // from raw fields so we still hit getStatus with a usable id.
      extracted = {
        transactionId: String(payload.transaction_id || payload.transactionId || '') || undefined,
        merchantTransactionId:
          String(payload.merchant_transaction_id || payload.merchantTransactionId || '') || undefined,
        notifyToken: String(payload.notify_token || payload.notifyToken || '') || undefined,
      };
    }
    const { transactionId, merchantTransactionId } = extracted;
    const idToCheck = transactionId || merchantTransactionId;

    if (this.isConfigured() && idToCheck) {
      try {
        const client = this.getClient();
        // Country comes from the payload if the seller stored a country hint,
        // otherwise CI is the only country configured on FlexioPage today.
        const country = ((payload.country as string) || 'CI').toUpperCase() as CountryCode;
        const status = await client.payment.getStatus(idToCheck, country);
        return {
          status: mapStatus(status.status),
          orderId: merchantTransactionId,
          reference: transactionId,
          raw: { ...payload, _check: status },
          signatureValid: undefined,
        };
      } catch {
        // fall through — /getStatus itself failed, we return pending so the
        // caller retries via the manual verify endpoint later.
      }
    }
    return {
      status: 'pending',
      orderId: merchantTransactionId,
      reference: transactionId,
      raw: payload,
      signatureValid: undefined,
    };
  }

  async verifyTransaction(order: IOrder): Promise<VerifyResult> {
    if (!this.isConfigured()) return { status: 'pending' };
    const idToCheck = order.paymentReference || truncateMerchantTxId(String(order._id));
    const country = (order.shippingAddress?.country || 'CI').toUpperCase() as CountryCode;
    try {
      const client = this.getClient();
      const status = await client.payment.getStatus(idToCheck, country);
      return {
        status: mapStatus(status.status),
        reference: order.paymentReference || idToCheck,
        raw: status as unknown as Record<string, unknown>,
      };
    } catch {
      return { status: 'pending' };
    }
  }

  /**
   * Read the merchant account balance from CinetPay's /v1/balance endpoint.
   * Best-effort — returns null if the SDK isn't configured, the country is
   * missing from the credentials map, or CinetPay is unreachable. Callers
   * treat null as "unknown" and render "—" rather than blocking the page.
   */
  async getBalance(country: CountryCode = 'CI'): Promise<{ available: number; currency: string } | null> {
    if (!this.isConfigured()) return null;
    try {
      const client = this.getClient();
      const balance = await client.balance.get(country);
      return {
        available: Number(balance.availableBalance) || 0,
        currency: String(balance.currency),
      };
    } catch {
      return null;
    }
  }
}

/** Map our internal channel hint to the SDK's CHANNELS enum. */
function channelForRequest(channel: InitPaymentArgs['channel']): SdkChannel {
  // 'PUSH' is the default gateway experience (mobile-money notification flow).
  // 'OTP' and 'QRCODE' are reserved for the direct-pay flow which we don't
  // expose from FlexioPage yet.
  return 'PUSH' as SdkChannel;
  // Note: paymentMethod (OM_CI, WAVE_SN, etc.) would be a follow-up when a
  // seller wants to force a single provider. Today `channel` alone drives
  // the picker.
  void channel;
}

/** FRONTEND_URL may be a comma-separated list (dev) — take the first entry. */
function firstUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.split(',')[0].trim().replace(/\/$/, '') || undefined;
}
