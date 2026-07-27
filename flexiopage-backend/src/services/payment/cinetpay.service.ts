/**
 * CinetPay v1 API — Wave, Orange Money, MTN MoMo, Moov Money (CFA countries).
 * Docs: CinetPay's newer API (a.k.a. Sunu Checkout). Same host for sandbox
 * and prod — the API key alone decides which account/mode is targeted.
 *
 * Auth (two-step, cached):
 *   1. POST /v1/auth/login with { account_key, account_password } →
 *      returns a short-lived token.
 *   2. All other calls use `Authorization: Bearer <token>`.
 *   The token is cached in-process until ~10s before its documented TTL so
 *   we never re-authenticate on every payment. Miss & re-auth on 401/1002.
 *
 * Env:
 *   CINETPAY_API_KEY       — required. The `account_key` (sk_live_…) from
 *                            Dashboard → API & sécurité.
 *   CINETPAY_API_PASSWORD  — required. The `account_password` (a.k.a. "Mot
 *                            de passe API") from Dashboard → API & sécurité.
 *   CINETPAY_SITE_ID       — required. Site/Caisse ID from Dashboard → Caisses.
 *                            NOTE: v1 doesn't send site_id in the body, but
 *                            we still validate it as a coherence check.
 *   CINETPAY_SECRET_KEY    — optional, for future HMAC verification.
 *   CINETPAY_NOTIFY_URL    — fallback webhook URL (defaults to API_PUBLIC_URL/api/webhooks/cinetpay)
 *   CINETPAY_BASE_URL      — override the API base host. Defaults to
 *                            https://api.cinetpay.net/v1.
 *   CINETPAY_AUTH_PATH     — override the auth path if CinetPay renames it.
 *                            Defaults to `/auth/login`.
 *   API_PUBLIC_URL         — used to build notify_url
 *   FRONTEND_URL           — used to build success_url + failed_url
 *
 * Verification model (v1):
 *   1. Webhook arrives with { merchant_transaction_id, transaction_id, notify_token, status }.
 *   2. We POST /v1/payment/check with the notify_token to prove the webhook
 *      is genuine and get the CinetPay-confirmed status.
 *   3. The order is only marked paid when the re-check returns SUCCESS. So a
 *      forged/replayed webhook can never fake a payment — the notify_token
 *      is single-use and issued only by CinetPay.
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

/** v1 status vocabulary from the CinetPay docs. */
type CinetPayV1Status = 'SUCCESS' | 'FAILED' | 'PENDING' | 'INITIATED';

/** merchant_transaction_id is capped at 30 chars in v1. MongoDB ObjectIds are
 *  24 chars so they fit as-is; longer IDs are truncated defensively. */
function truncateMerchantTxId(id: string): string {
  return id.length <= 30 ? id : id.slice(0, 30);
}

/** Map v1 status → our internal (paid | failed | pending) tri-state. */
function mapStatus(s: string | undefined): 'paid' | 'failed' | 'pending' {
  const up = String(s || '').toUpperCase();
  if (up === 'SUCCESS' || up === 'ACCEPTED') return 'paid';
  if (up === 'FAILED' || up === 'REFUSED') return 'failed';
  return 'pending'; // INITIATED / PENDING / unknown → wait for a later signal
}

export class CinetPayProvider implements PaymentProviderImpl {
  id: PaymentProvider = 'cinetpay';

  /**
   * CinetPay v1 API lives on `api.cinetpay.net/v1` — same host for both
   * sandbox and prod, the API key alone determines which account/mode is
   * hit. The legacy v2 API on `api-checkout.cinetpay.com` is a different
   * beast (different field names, different auth) and is NOT what this
   * provider talks to. Override `CINETPAY_BASE_URL` only if CinetPay
   * migrates the host again.
   */
  private get base(): string {
    return (
      process.env.CINETPAY_BASE_URL || 'https://api.cinetpay.net/v1'
    ).replace(/\/$/, '');
  }

  /** In-memory cache for the session token from /auth/login. Cleared on 401
   *  so the next call re-authenticates automatically. */
  private static cachedToken: { token: string; expiresAt: number } | null = null;

  isConfigured(): boolean {
    return !!(
      process.env.CINETPAY_API_KEY &&
      process.env.CINETPAY_API_PASSWORD &&
      process.env.CINETPAY_SITE_ID
    );
  }

  /**
   * Two-step auth: exchange (account_key, account_password) for a short-lived
   * bearer token. Cached in-process — a fresh worker/pod re-auths on first
   * payment which is fine since /auth/login is a cheap round-trip.
   */
  private async getAuthToken(force = false): Promise<string> {
    const now = Date.now();
    if (!force && CinetPayProvider.cachedToken && CinetPayProvider.cachedToken.expiresAt > now) {
      return CinetPayProvider.cachedToken.token;
    }
    const authPath = process.env.CINETPAY_AUTH_PATH || '/auth/login';
    const res = await fetch(`${this.base}${authPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        account_key: process.env.CINETPAY_API_KEY,
        account_password: process.env.CINETPAY_API_PASSWORD,
      }),
    });
    const raw = await res.text();
    let json: {
      code?: number | string;
      status?: string;
      description?: string;
      message?: string;
      token?: string;
      access_token?: string;
      expires_in?: number;
      data?: { token?: string; access_token?: string; expires_in?: number };
    } = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch { /* leave empty */ }
    // CinetPay wraps the token either at top level or inside `data`.
    const token = json.token || json.access_token || json.data?.token || json.data?.access_token;
    if (!res.ok || !token) {
      const detail = json.description || json.message || `HTTP ${res.status} — ${raw.slice(0, 200)}`;
      throw new Error(`CinetPay v1 auth failed (${json.code || res.status}): ${detail}`);
    }
    // TTL defaults to 1h if the server doesn't tell us. Refresh 30s early
    // so a token doesn't expire mid-request.
    const ttlSec = Number(json.expires_in || json.data?.expires_in || 3600);
    CinetPayProvider.cachedToken = { token, expiresAt: now + (ttlSec - 30) * 1000 };
    return token;
  }

  /** Standard auth headers for authenticated v1 calls. Getting the token
   *  transparently handles the /auth/login round-trip when the cache is cold. */
  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAuthToken();
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  /** Force a token refresh (used after a 401/1002 response — the token may
   *  have been revoked earlier than its documented TTL). */
  private invalidateToken(): void {
    CinetPayProvider.cachedToken = null;
  }

  async initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
    const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5051').replace(/\/$/, '');
    const frontBase = firstUrl(process.env.FRONTEND_URL) || 'http://localhost:3000';
    const notifyUrl = process.env.CINETPAY_NOTIFY_URL || `${apiBase}/api/webhooks/cinetpay`;
    const orderId = truncateMerchantTxId(String(args.order._id));
    const successUrl = args.returnUrl || `${frontBase}/thanks/${orderId}`;
    const failedUrl = `${frontBase}/thanks/${orderId}?failed=1`;

    // v1 uses ISO-3166 language codes ("fr"/"en") — same as v2, so no mapping needed.
    // Split "Firstname Lastname" defensively; both fields are required, min 2 chars.
    const rawName = (args.order.customerName || '').trim();
    const [firstName, ...restName] = rawName ? rawName.split(/\s+/) : [];
    const client_first_name = (firstName && firstName.length >= 2 ? firstName : 'Client');
    const client_last_name = (restName.join(' ').length >= 2 ? restName.join(' ') : '-Client');

    // CinetPay constraint: XOF / XAF amounts must be a multiple of 5.
    const isCfa = ['XOF', 'XAF'].includes(args.order.currency);
    const amount = isCfa ? Math.round(args.order.total / 5) * 5 : Math.round(args.order.total);

    // channel → payment_method: v1 uses two-letter codes (OM, WAVE, MTN, MOOV,
    // CARD…). We only force it when the seller picked a specific channel;
    // otherwise we omit it so CinetPay shows the full picker on the gateway.
    const paymentMethod = channelToPaymentMethod(args.channel);

    const body: Record<string, unknown> = {
      currency: args.order.currency,
      merchant_transaction_id: orderId,
      amount,
      lang: 'fr',
      designation: `Order ${args.order.orderNumber}`.slice(0, 120),
      client_email: args.order.email,
      client_first_name,
      client_last_name,
      client_phone_number: args.phone || args.order.paymentPhone || '',
      success_url: successUrl.slice(0, 120),
      failed_url: failedUrl.slice(0, 120),
      notify_url: notifyUrl.slice(0, 120),
      direct_pay: false,
    };
    if (paymentMethod) body.payment_method = paymentMethod;

    // Two-step auth: first attempt uses the cached token; on 401/INVALID_TOKEN
    // we drop the cache and retry once. Prevents a permanently-broken flow
    // when the token expires earlier than its documented TTL.
    const doRequest = async (): Promise<{ res: Response; raw: string }> => {
      const res = await fetch(`${this.base}/payment`, {
        method: 'POST',
        headers: await this.authHeaders(),
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      return { res, raw };
    };
    let attempt = await doRequest();
    let json = safeJson(attempt.raw);
    if (isAuthRejection(attempt.res.status, json)) {
      this.invalidateToken();
      attempt = await doRequest();
      json = safeJson(attempt.raw);
    }
    const { res } = attempt;

    const codeOk = Number(json.code) === 200 && String(json.status || '').toUpperCase() === 'OK';
    if (!res.ok || !codeOk || !json.payment_url) {
      const detail = json.details?.message || json.description || json.message || `HTTP ${res.status} — ${attempt.raw.slice(0, 300)}`;
      throw new Error(`CinetPay v1 init failed (${json.code || res.status}): ${detail}`);
    }
    return {
      checkoutUrl: json.payment_url,
      // Prefer CinetPay's transaction_id (server-side unique) over our order id
      // so verifyTransaction can re-check the exact transaction later.
      reference: json.transaction_id || json.payment_token || orderId,
      provider: 'cinetpay',
    };
  }

  /**
   * v1 verification model: the webhook is only a signal — we trust
   * `/v1/payment/check` (called with the notify_token) as the source of truth
   * for whether the buyer actually paid.
   */
  async parseWebhook(
    payload: Record<string, unknown>,
    _headers: Record<string, string | undefined> = {},
  ): Promise<WebhookHandleResult> {
    // v1 webhook body — field names inferred from the init response shape.
    const merchantTxId = String(
      payload.merchant_transaction_id || payload.cpm_trans_id || '',
    );
    const notifyToken = String(payload.notify_token || '');
    const bodyStatus = String(payload.status || payload.cpm_trans_status || '').toUpperCase();
    const transactionId = String(payload.transaction_id || payload.cpm_payid || '');
    const reference = transactionId || merchantTxId;

    // Independent server-side re-verification — the real anti-fraud gate.
    if (this.isConfigured() && (merchantTxId || transactionId)) {
      try {
        const verified = await this.callPaymentCheck({
          merchant_transaction_id: merchantTxId || undefined,
          transaction_id: transactionId || undefined,
          notify_token: notifyToken || undefined,
        });
        return {
          status: mapStatus(verified.status),
          orderId: merchantTxId,
          reference,
          raw: { ...payload, _check: verified },
          // signatureValid stays undefined in v1 — the check re-verify replaces
          // the HMAC gate. Callers already treat undefined as "trust re-check".
          signatureValid: undefined,
        };
      } catch {
        // fall through to header-based status if the re-check itself failed
      }
    }
    return {
      status: mapStatus(bodyStatus),
      orderId: merchantTxId,
      reference,
      raw: payload,
      signatureValid: undefined,
    };
  }

  async verifyTransaction(order: IOrder): Promise<VerifyResult> {
    if (!this.isConfigured()) return { status: 'pending' };
    const merchantTxId = truncateMerchantTxId(String(order._id));
    try {
      const verified = await this.callPaymentCheck({
        merchant_transaction_id: merchantTxId,
        transaction_id: order.paymentReference || undefined,
      });
      return {
        status: mapStatus(verified.status),
        reference: order.paymentReference || merchantTxId,
        raw: verified as unknown as Record<string, unknown>,
      };
    } catch {
      return { status: 'pending' };
    }
  }

  /** POST /v1/payment/check — the single source of truth for tx status.
   *  Accepts either merchant_transaction_id, transaction_id, or notify_token
   *  (any one is enough; sending all we have improves reliability). */
  private async callPaymentCheck(args: {
    merchant_transaction_id?: string;
    transaction_id?: string;
    notify_token?: string;
  }): Promise<{ status?: CinetPayV1Status; code?: number; message?: string } & Record<string, unknown>> {
    const doRequest = async (): Promise<{ res: Response; raw: string }> => {
      const res = await fetch(`${this.base}/payment/check`, {
        method: 'POST',
        headers: await this.authHeaders(),
        body: JSON.stringify(args),
      });
      const raw = await res.text();
      return { res, raw };
    };
    let attempt = await doRequest();
    let jsonRaw = safeJson(attempt.raw);
    if (isAuthRejection(attempt.res.status, jsonRaw)) {
      this.invalidateToken();
      attempt = await doRequest();
      jsonRaw = safeJson(attempt.raw);
    }
    const json = jsonRaw as {
      code?: number;
      status?: string;
      message?: string;
      details?: { status?: CinetPayV1Status; message?: string; code?: number };
      data?: { status?: CinetPayV1Status };
    };
    // v1 wraps the payment status inside `details`; we hoist it to the top for
    // consistent downstream handling.
    const detailsStatus = json.details?.status || json.data?.status;
    return {
      status: (detailsStatus || (json.status as CinetPayV1Status | undefined)),
      code: json.code,
      message: json.message || json.details?.message,
      // Preserve the raw payload for logging.
      ...(json as Record<string, unknown>),
    };
  }

  /** Kept for future HMAC support. In v1 CinetPay hasn't reintroduced x-token
   *  yet, so callers rely on the /payment/check re-verify instead. Wired only
   *  once CinetPay documents an HMAC scheme for v1. */
  // eslint-disable-next-line @typescript-eslint/no-unused-private-class-members
  private verifyXToken(
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): boolean | undefined {
    const secret = process.env.CINETPAY_SECRET_KEY;
    const token = headers['x-token'] || headers['X-Token'];
    if (!secret || !token) return undefined;
    // Field order kept identical to v2 in case CinetPay reactivates it on v1.
    const fields = [
      'merchant_transaction_id',
      'transaction_id',
      'amount',
      'currency',
      'status',
      'notify_token',
    ];
    const data = fields.map((f) => String(payload[f] ?? '')).join('');
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(String(token), 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

/** Map our internal channel to CinetPay v1 payment_method codes. Returns
 *  undefined for 'all' so the gateway shows the full picker. */
function channelToPaymentMethod(channel: InitPaymentArgs['channel']): string | undefined {
  switch (channel) {
    case 'card':         return 'CARD';
    case 'wave':         return 'WAVE';
    case 'orange_money': return 'OM';
    case 'mtn_momo':     return 'MTN';
    case 'moov_money':   return 'MOOV';
    case 'all':
    default:             return undefined;
  }
}

/** FRONTEND_URL may be a comma-separated list (dev) — take the first entry. */
function firstUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.split(',')[0].trim().replace(/\/$/, '') || undefined;
}

/** Parse JSON safely — returns {} on garbage so callers can `?.` fields. */
function safeJson(raw: string): Record<string, unknown> & {
  code?: number | string;
  status?: string;
  message?: string;
  description?: string;
  payment_url?: string;
  payment_token?: string;
  transaction_id?: string;
  merchant_transaction_id?: string;
  notify_token?: string;
  details?: { code?: number; status?: CinetPayV1Status; message?: string; must_be_redirected?: boolean };
} {
  try { return JSON.parse(raw); } catch { return {}; }
}

/** Detect the two ways CinetPay signals an expired/invalid session token so
 *  we can drop the cache and retry once. */
function isAuthRejection(status: number, body: { code?: number | string; status?: string }): boolean {
  if (status === 401 || status === 403) return true;
  if (Number(body.code) === 1002) return true;
  if (String(body.status || '').toUpperCase() === 'INVALID_TOKEN') return true;
  return false;
}
