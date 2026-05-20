/**
 * Backward-compatible shim. The payment provider logic moved to
 * `services/payment/` (one file per gateway + a registry). This module
 * re-exports the registry + types so existing importers
 * (public.routes, webhooks.routes) keep working unchanged.
 *
 * Prefer importing from `services/payment/registry` and
 * `services/payment/types` in new code.
 */
export type {
  Channel,
  InitPaymentArgs,
  InitPaymentResult,
  WebhookHandleResult,
  VerifyResult,
  PaymentProviderImpl,
} from './payment/types';

export {
  getProviderById,
  getProviderForGateway,
  pickActiveProvider,
  initOrderPayment,
  initOrderPaymentWith,
  isMockMode,
} from './payment/registry';
