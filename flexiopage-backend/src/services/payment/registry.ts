/**
 * Payment provider registry + routing.
 *
 * Providers self-report `isConfigured()`. In dev, when no real gateway keys
 * are set, the Mock provider takes over so the full checkout → webhook →
 * finalize flow can be demoed locally.
 */
import type { IOrder, PaymentProvider } from '../../models/Order.model';
import type { Channel, InitPaymentResult, PaymentProviderImpl } from './types';
import { CinetPayProvider } from './cinetpay.service';
import { FlutterwaveProvider } from './flutterwave.service';
import { MoneróoProvider } from './moneróo.service';
import { MockProvider } from './mock.service';
import type { Gateway } from './country-routing';

const cinetpay = new CinetPayProvider();
const flutterwave = new FlutterwaveProvider();
const moneróo = new MoneróoProvider();
const mock = new MockProvider();

const PROVIDERS: Partial<Record<PaymentProvider, PaymentProviderImpl>> = {
  cinetpay,
  flutterwave,
  moneróo,
  manual: mock,
};

export function getProviderById(id: PaymentProvider): PaymentProviderImpl | null {
  return PROVIDERS[id] || null;
}

/**
 * Map a routing Gateway → the concrete provider, falling back to mock in dev.
 *
 * The `moneróo` literal is normalized before comparison because the accented
 * "ó" can be encoded as either a precomposed codepoint (NFC, U+00F3) or as
 * "o + combining acute accent" (NFD). JSON parsers, shells, and TypeScript
 * compilers don't always agree on the form, so a bare `=== 'moneróo'` check
 * silently misses the string coming off the wire even though it looks
 * identical in the debugger. Matching by an ASCII prefix sidesteps this
 * entirely.
 */
function normalizeGateway(gateway: Gateway): string {
  return String(gateway).normalize('NFC').toLowerCase();
}

export function getProviderForGateway(gateway: Gateway): PaymentProviderImpl {
  const g = normalizeGateway(gateway);
  if (g === 'cinetpay') return cinetpay.isConfigured() ? cinetpay : mock;
  if (g === 'flutterwave') return flutterwave.isConfigured() ? flutterwave : mock;
  if (g.startsWith('moner')) return moneróo.isConfigured() ? moneróo : mock;
  return mock;
}

/**
 * Legacy single-provider pick (CinetPay first, else mock). Kept for the
 * existing /checkout/init digital flow which doesn't yet pass a gateway.
 */
export function pickActiveProvider(): PaymentProviderImpl {
  if (cinetpay.isConfigured()) return cinetpay;
  if (flutterwave.isConfigured()) return flutterwave;
  if (moneróo.isConfigured()) return moneróo;
  return mock;
}

export async function initOrderPayment(
  order: IOrder,
  args: { phone?: string; channel?: Channel; returnUrl?: string } = {},
): Promise<InitPaymentResult> {
  return pickActiveProvider().initPayment({ order, ...args });
}

/** Init with an explicitly chosen gateway (used by /api/payment/initiate). */
export async function initOrderPaymentWith(
  order: IOrder,
  gateway: Gateway,
  args: { phone?: string; channel?: Channel; returnUrl?: string } = {},
): Promise<InitPaymentResult> {
  return getProviderForGateway(gateway).initPayment({ order, ...args });
}

/** True when no real gateway is configured (dev simulator mode). */
export function isMockMode(): boolean {
  return !cinetpay.isConfigured() && !flutterwave.isConfigured() && !moneróo.isConfigured();
}
