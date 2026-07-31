/**
 * Wallet top-up — logique unifiée pour recharger le solde vendeur via
 * Stripe (carte, worldwide) ou CinetPay (Mobile Money, pays CFA éligibles).
 *
 * Flow :
 *   1. initiateTopUp(user, amount, bucket, gateway?) →
 *      crée un WalletTopUp `pending`, appelle le gateway pour obtenir un
 *      checkoutUrl, sauvegarde la ref gateway, renvoie l'URL au frontend.
 *   2. Le vendeur paye sur la page hosted du gateway.
 *   3. Webhook (Stripe ou CinetPay) retrouve le WalletTopUp via gatewayTxId,
 *      appelle settleTopUp() → crédite le wallet via `credit()` (idempotent
 *      grâce à gatewayReference qui sert de paymentReference).
 */
import { randomUUID } from 'crypto';
import type { IUser } from '../models/User.model';
import { Store } from '../models/Store.model';
import { WalletTopUp, type TopUpBucket, type TopUpGateway } from '../models/WalletTopUp.model';
import { credit, usdToTokens, usdToTokensRate } from './wallet.service';
import { createStripeCheckoutSession, isStripeEnabled } from './payment.service';
import { CinetPayProvider } from './payment/cinetpay.service';

/** Pays où CinetPay est disponible pour les top-ups (Mobile Money CFA). */
const CINETPAY_ELIGIBLE = new Set(['CI', 'BF', 'SN', 'ML', 'BJ', 'TG', 'NE', 'CM']);

export type TopUpGatewayChoice = 'auto' | TopUpGateway;

export interface InitiateTopUpArgs {
  user: IUser;
  /** Montant en devise du wallet. */
  amount: number;
  bucket: TopUpBucket;
  /** Choix explicite du vendeur — 'auto' pour laisser le serveur décider. */
  gateway: TopUpGatewayChoice;
  /** Devise à utiliser (par défaut : devise du wallet primaire du vendeur). */
  currency?: string;
  /** Pays du vendeur (par défaut : settings de sa boutique primaire). */
  country?: string;
  /** URL frontend où rediriger le vendeur après paiement. */
  frontendBaseUrl: string;
}

export interface InitiateTopUpResult {
  topUpId: string;
  checkoutUrl: string;
  gateway: TopUpGateway;
  amount: number;
  currency: string;
}

/**
 * Retourne la liste des gateways que le vendeur peut utiliser. Toujours au
 * moins un — Stripe est le fallback universel (si configuré).
 */
export async function availableGatewaysForUser(user: IUser): Promise<TopUpGateway[]> {
  const country = await primaryCountry(user);
  const gateways: TopUpGateway[] = [];

  if (country && CINETPAY_ELIGIBLE.has(country.toUpperCase())) {
    if (new CinetPayProvider().isConfigured()) gateways.push('cinetpay');
  }
  if (isStripeEnabled()) gateways.push('stripe');

  return gateways;
}

export async function initiateTopUp(args: InitiateTopUpArgs): Promise<InitiateTopUpResult> {
  const { user } = args;
  if (args.amount <= 0) throw new Error('Montant invalide');

  const currency = (args.currency || (await primaryCurrency(user)) || 'USD').toUpperCase();
  const country = (args.country || (await primaryCountry(user)) || '').toUpperCase();

  // Résolution du gateway.
  let gateway: TopUpGateway;
  if (args.gateway === 'auto') {
    const available = await availableGatewaysForUser(user);
    if (available.length === 0) {
      throw new Error('Aucun gateway de paiement disponible pour ce compte');
    }
    // Préférer CinetPay en zone CFA (paiement local moins de friction).
    gateway = available[0];
  } else {
    gateway = args.gateway;
  }

  // Garde-fou : le vendeur ne peut pas forcer CinetPay hors zone éligible.
  if (gateway === 'cinetpay') {
    if (!CINETPAY_ELIGIBLE.has(country)) {
      throw new Error(`CinetPay n'est pas disponible dans votre pays (${country || '?'})`);
    }
    if (!new CinetPayProvider().isConfigured()) {
      throw new Error('CinetPay n\'est pas configuré côté plateforme');
    }
  }
  if (gateway === 'stripe' && !isStripeEnabled()) {
    throw new Error('Stripe n\'est pas configuré côté plateforme');
  }

  // Reference unique — sert d'idempotence côté wallet ET d'id de recherche
  // dans les webhooks. Max 30 chars pour compat CinetPay.
  const gatewayReference = `tu_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

  // On crée d'abord le doc pending, PUIS on appelle le gateway (si l'appel
  // échoue on peut remonter l'info sans laisser un doc orphelin — on garde
  // le pending qui expirera via TTL).
  const topUp = await WalletTopUp.create({
    userId: user._id,
    amount: args.amount,
    currency,
    bucket: args.bucket,
    gateway,
    gatewayReference,
    status: 'pending',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  });

  const frontBase = args.frontendBaseUrl.replace(/\/$/, '');
  const successUrl = `${frontBase}/dashboard/wallet?topup=success&id=${topUp._id}`;
  const cancelUrl = `${frontBase}/dashboard/wallet?topup=cancel&id=${topUp._id}`;

  try {
    if (gateway === 'stripe') {
      const session = await createStripeCheckoutSession({
        amount: args.amount,
        currency,
        clientReference: gatewayReference,
        productName: `Recharge solde FlexioPage (${args.bucket === 'ai' ? 'IA' : 'principal'})`,
        customerEmail: user.email,
        successUrl,
        cancelUrl,
        metadata: {
          userId: String(user._id),
          bucket: args.bucket,
          topUpId: String(topUp._id),
        },
      });
      if (!session) throw new Error('Stripe non initialisé');
      topUp.gatewayTxId = session.sessionId;
      topUp.checkoutUrl = session.checkoutUrl;
    } else {
      // cinetpay
      const result = await new CinetPayProvider().initTopUpPayment({
        merchantReference: gatewayReference,
        amount: args.amount,
        currency,
        country,
        vendorEmail: user.email,
        vendorName: user.name,
        successUrl,
        cancelUrl,
      });
      topUp.gatewayTxId = result.transactionId;
      topUp.checkoutUrl = result.checkoutUrl;
    }
    await topUp.save();
  } catch (err) {
    topUp.status = 'failed';
    topUp.failureReason = (err as Error).message || 'gateway init failed';
    await topUp.save().catch(() => undefined);
    throw err;
  }

  return {
    topUpId: String(topUp._id),
    checkoutUrl: topUp.checkoutUrl!,
    gateway,
    amount: args.amount,
    currency,
  };
}

/**
 * Passe un top-up de `pending` → `paid` et crédite le wallet vendeur.
 * Idempotent : appelée plusieurs fois (webhook retry, polling manuel), ne
 * crédite qu'une seule fois grâce à `paymentReference = gatewayReference`.
 *
 * Renvoie true si un crédit vient d'avoir lieu, false si déjà réglé (no-op).
 */
export async function settleTopUp(topUpId: string): Promise<boolean> {
  const topUp = await WalletTopUp.findById(topUpId);
  if (!topUp) return false;
  if (topUp.status === 'paid') return false;

  // Pour bucket AI : convertit le montant (en USD/devise) en tokens selon
  // le ratio configuré. Le bucket main est crédité 1:1.
  let creditAmount = topUp.amount;
  let note = 'Recharge';
  if (topUp.bucket === 'ai') {
    const tokens = await usdToTokens(topUp.amount);
    creditAmount = tokens;
    const rate = await usdToTokensRate();
    note = `Recharge solde IA · ${topUp.amount} ${topUp.currency} → ${tokens} tokens (ratio ${rate})`;
  }

  await credit({
    userId: String(topUp.userId),
    amount: creditAmount,
    bucket: topUp.bucket,
    kind: topUp.bucket === 'ai' ? 'top_up_ai' : 'top_up',
    paymentReference: topUp.gatewayReference, // dedup key
    note: `${note} · ${topUp.gateway}`,
  });

  topUp.status = 'paid';
  topUp.paidAt = new Date();
  await topUp.save();
  return true;
}

/** Marque un top-up en failed (webhook d'échec ou expiration). */
export async function markTopUpFailed(topUpId: string, reason?: string): Promise<void> {
  await WalletTopUp.updateOne(
    { _id: topUpId, status: 'pending' },
    { $set: { status: 'failed', failureReason: reason?.slice(0, 500) } },
  );
}

// ── Helpers de contexte vendeur ────────────────────────────────────────

async function primaryStore(user: IUser) {
  return Store.findOne({ ownerId: user._id }).sort({ createdAt: 1 }).lean();
}

async function primaryCountry(user: IUser): Promise<string> {
  const store = await primaryStore(user);
  return (store?.settings?.country || '').toUpperCase();
}

async function primaryCurrency(user: IUser): Promise<string> {
  const store = await primaryStore(user);
  return (store?.settings?.currency || 'USD').toUpperCase();
}
