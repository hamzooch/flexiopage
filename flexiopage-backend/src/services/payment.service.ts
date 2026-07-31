/**
 * Payment service - Stripe integration ready.
 * Set STRIPE_SECRET_KEY to enable Stripe; otherwise manual payments only.
 */
import type StripeNS from 'stripe';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
let stripe: StripeNS | null = null;

async function getStripe(): Promise<StripeNS | null> {
  if (!STRIPE_SECRET) return null;
  if (!stripe) {
    try {
      const Stripe = (await import('stripe')).default;
      // apiVersion left undefined → uses the account default; avoids tight coupling
      // to a single Stripe API version (otherwise TS pins us to a stale literal).
      stripe = new Stripe(STRIPE_SECRET);
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

export interface CreateCheckoutSessionInput {
  /** Montant en devise DE FACTURATION (ex: USD, EUR, XOF). Sera converti en
   *  la plus petite unité selon la devise (ex: cents pour USD/EUR).
   *  Pour XOF/XAF (zero-decimal), on envoie tel quel. */
  amount: number;
  currency: string;
  /** Notre reference locale (WalletTopUp.gatewayReference) — mise en metadata. */
  clientReference: string;
  /** Titre affiché sur la page Stripe (ex: "Recharge solde FlexioPage"). */
  productName: string;
  /** Email vendeur pour pré-remplir + envoyer le reçu Stripe. */
  customerEmail?: string;
  /** Où rediriger le vendeur après paiement (succès/annulation). */
  successUrl: string;
  cancelUrl: string;
  /** Metadata additionnelle passée à Stripe (userId, bucket, etc.). */
  metadata?: Record<string, string>;
}

/**
 * Currencies where the amount IS the smallest unit (no cents). Stripe's list :
 * https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG',
  'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

function toStripeAmount(amount: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return Math.round(amount);
  return Math.round(amount * 100);
}

/**
 * Crée une Stripe Checkout Session hosted (redirect vers page Stripe).
 * Renvoie l'URL de checkout à donner au vendeur, ou null si Stripe non configuré.
 * Utilisé par le flow top-up wallet.
 */
export async function createStripeCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<{ sessionId: string; checkoutUrl: string } | null> {
  const s = await getStripe();
  if (!s) return null;

  const session = await s.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: input.currency.toLowerCase(),
          product_data: { name: input.productName },
          unit_amount: toStripeAmount(input.amount, input.currency),
        },
        quantity: 1,
      },
    ],
    client_reference_id: input.clientReference,
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      clientReference: input.clientReference,
      ...input.metadata,
    },
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url || '',
  };
}
