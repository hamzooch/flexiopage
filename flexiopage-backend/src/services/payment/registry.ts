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
import { MockProvider } from './mock.service';
import type { Gateway } from './country-routing';

const cinetpay = new CinetPayProvider();
const flutterwave = new FlutterwaveProvider();
const mock = new MockProvider();

const PROVIDERS: Partial<Record<PaymentProvider, PaymentProviderImpl>> = {
  cinetpay,
  flutterwave,
  manual: mock,
};

export function getProviderById(id: PaymentProvider): PaymentProviderImpl | null {
  return PROVIDERS[id] || null;
}

/** Map a routing Gateway → the concrete provider, falling back to mock in dev. */
export function getProviderForGateway(gateway: Gateway): PaymentProviderImpl {
  if (gateway === 'cinetpay') return cinetpay.isConfigured() ? cinetpay : mock;
  if (gateway === 'flutterwave') return flutterwave.isConfigured() ? flutterwave : mock;
  return mock;
}

/**
 * Legacy single-provider pick (CinetPay first, else mock). Kept for the
 * existing /checkout/init digital flow which doesn't yet pass a gateway.
 */
export function pickActiveProvider(): PaymentProviderImpl {
  if (cinetpay.isConfigured()) return cinetpay;
  if (flutterwave.isConfigured()) return flutterwave;
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
  return !cinetpay.isConfigured() && !flutterwave.isConfigured();
}
