/**
 * Payment service - Stripe integration ready.
 * Set STRIPE_SECRET_KEY to enable Stripe; otherwise manual payments only.
 */

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
let stripe: typeof import('stripe') | null = null;

async function getStripe(): Promise<typeof import('stripe') | null> {
  if (!STRIPE_SECRET) return null;
  if (!stripe) {
    try {
      const Stripe = (await import('stripe')).default;
      stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-11-20.acacia' });
    } catch {
      return null;
    }
  }
  return stripe;
}

export interface CreatePaymentIntentInput {
  amount: number; // cents
  currency: string;
  orderId: string;
  storeId: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

/** Create Stripe PaymentIntent for client-side confirmation. Returns clientSecret or null if Stripe not configured. */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput
): Promise<{ clientSecret: string; paymentIntentId: string } | null> {
  const s = await getStripe();
  if (!s) return null;

  const paymentIntent = await s.paymentIntents.create({
    amount: Math.round(input.amount),
    currency: input.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      orderId: input.orderId,
      storeId: input.storeId,
      ...input.metadata,
    },
    receipt_email: input.customerEmail,
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

/** Verify Stripe webhook signature (use in webhook route). */
export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

export function isStripeEnabled(): boolean {
  return !!STRIPE_SECRET;
}
