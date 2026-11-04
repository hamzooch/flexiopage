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
import { getSettings, DEFAULT_AI_PRICING } from '../models/Settings.model';
import { credit, usdToTokens, usdToTokensRate } from './wallet.service';
import { createStripeCheckoutSession, isStripeEnabled } from './payment.service';
import { CinetPayProvider } from './payment/cinetpay.service';

/** Devises acceptées par l'API CinetPay. */
const CINETPAY_CURRENCIES = new Set(['XOF', 'XAF', 'GNF', 'CDF', 'USD']);
/** Pays pour lesquels le SDK a des identifiants. Hors zone, on encaisse via CI. */
const CINETPAY_COUNTRIES = new Set(['CI', 'BF', 'ML', 'SN', 'TG', 'GN', 'CM', 'BJ', 'CD', 'NE']);
const CFA_CURRENCIES = new Set(['XOF', 'XAF']);
const CINETPAY_MIN = 100;
const CINETPAY_MAX = 2_500_000;
/**
 * Barème du solde principal : 0,1 = 800 XOF = 3 TND,
 * donc 1 de solde = 8 000 XOF = 30 TND.
 */
const SOLDE_UNITS: Record<string, number> = { XOF: 8000, TND: 30 };

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
  usdAmount?: number;
  tokens?: number;
}

export interface CinetPayQuote {
  inputAmount: number;
  inputCurrency: string;
  chargeAmount: number;
  chargeCurrency: string;
  country: string;
  usdAmount: number;
  tokens?: number;
}

/**
 * Ce que le vendeur paie sur CinetPay, et ce que son solde reçoit.
 * Le montant saisi est dans la devise de sa boutique. Si CinetPay ne
 * l'accepte pas (ex. TND), on convertit en XOF. Le solde principal est
 * crédité en USD ; le solde IA reçoit les tokens correspondants.
 */
export async function quoteCinetPayTopUp(
  user: IUser,
  amount: number,
  bucket: TopUpBucket,
): Promise<CinetPayQuote> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide');
  if (!new CinetPayProvider().isConfigured()) {
    throw new Error('CinetPay n\'est pas activé sur la plateforme');
  }

  const inputCurrency = (await primaryCurrency(user)).toUpperCase();
  const rates = await fxRates();
  const unitsRaw = toSoldeUnits(amount, inputCurrency, rates);

  const chargeCurrency = CINETPAY_CURRENCIES.has(inputCurrency) ? inputCurrency : 'XOF';
  const chargeRaw = chargeCurrency === inputCurrency
    ? amount
    : fromSoldeUnits(unitsRaw, chargeCurrency, rates);
  const chargeAmount = roundCharge(chargeRaw, chargeCurrency);

  if (chargeAmount < CINETPAY_MIN) {
    throw new Error(`Le minimum CinetPay est ${CINETPAY_MIN} ${chargeCurrency}`);
  }
  if (chargeAmount > CINETPAY_MAX) {
    throw new Error(`Le maximum CinetPay est ${CINETPAY_MAX.toLocaleString('fr-FR')} ${chargeCurrency}`);
  }

  const usdAmount = Math.round(toSoldeUnits(chargeAmount, chargeCurrency, rates) * 100) / 100;
  if (usdAmount <= 0) throw new Error('Montant trop faible après conversion');

  const country = cinetpayCountry(await primaryCountry(user));
  const quote: CinetPayQuote = {
    inputAmount: amount,
    inputCurrency,
    chargeAmount,
    chargeCurrency,
    country,
    usdAmount,
  };
  if (bucket === 'ai') {
    const tokens = await usdToTokens(usdAmount);
    if (tokens <= 0) throw new Error('Montant trop faible pour créditer un token IA');
    quote.tokens = tokens;
  }
  return quote;
}

/**
 * Retourne la liste des gateways que le vendeur peut utiliser.
 * CinetPay est proposé à chaque vendeur dès que la plateforme est configurée.
 */
export async function availableGatewaysForUser(_user: IUser): Promise<TopUpGateway[]> {
  const gateways: TopUpGateway[] = [];
  if (new CinetPayProvider().isConfigured()) gateways.push('cinetpay');
  if (isStripeEnabled()) gateways.push('stripe');
  return gateways;
}

export async function initiateTopUp(args: InitiateTopUpArgs): Promise<InitiateTopUpResult> {
  const { user } = args;
  if (args.amount <= 0) throw new Error('Montant invalide');

  const currency = (args.currency || (await primaryCurrency(user)) || 'USD').toUpperCase();

  // Résolution du gateway. CinetPay d'abord : c'est le rail de recharge.
  let gateway: TopUpGateway;
  if (args.gateway === 'auto') {
    const available = await availableGatewaysForUser(user);
    if (available.length === 0) {
      throw new Error('Aucun gateway de paiement disponible pour ce compte');
    }
    gateway = available[0];
  } else {
    gateway = args.gateway;
  }

  const cinetpayQuote = gateway === 'cinetpay'
    ? await quoteCinetPayTopUp(user, args.amount, args.bucket)
    : null;

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
    amount: cinetpayQuote ? cinetpayQuote.chargeAmount : args.amount,
    currency: cinetpayQuote ? cinetpayQuote.chargeCurrency : currency,
    usdAmount: cinetpayQuote?.usdAmount,
    paymentCountry: cinetpayQuote?.country,
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
        amount: cinetpayQuote!.chargeAmount,
        currency: cinetpayQuote!.chargeCurrency,
        country: cinetpayQuote!.country,
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
    amount: cinetpayQuote ? cinetpayQuote.chargeAmount : args.amount,
    currency: cinetpayQuote ? cinetpayQuote.chargeCurrency : currency,
    usdAmount: cinetpayQuote?.usdAmount,
    tokens: cinetpayQuote?.tokens,
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

  // Les recharges CinetPay stockent l'équivalent USD. Les anciens top-ups
  // (sans usdAmount) restent crédités 1:1, comme avant.
  const usd = typeof topUp.usdAmount === 'number' && topUp.usdAmount > 0
    ? topUp.usdAmount
    : topUp.amount;
  let creditAmount = usd;
  let note = `Recharge solde · ${topUp.amount} ${topUp.currency}`;
  if (topUp.bucket === 'ai') {
    const tokens = await usdToTokens(usd);
    creditAmount = tokens;
    const rate = await usdToTokensRate();
    note = `Recharge solde IA · ${topUp.amount} ${topUp.currency} → ${tokens} tokens (ratio ${rate})`;
  } else if (typeof topUp.usdAmount === 'number' && topUp.usdAmount > 0) {
    note = `Recharge solde · ${topUp.amount} ${topUp.currency} → ${usd} USD`;
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

async function fxRates(): Promise<Record<string, number>> {
  const settings = await getSettings();
  return {
    ...DEFAULT_AI_PRICING.rates,
    ...(settings.aiPricing?.rates || {}),
  };
}

function toSoldeUnits(amount: number, currency: string, rates: Record<string, number>): number {
  const perUnit = SOLDE_UNITS[currency];
  if (perUnit) return amount / perUnit;
  if (currency === 'USD') return amount;
  return amount / rateOf(rates, currency);
}

function fromSoldeUnits(units: number, currency: string, rates: Record<string, number>): number {
  const perUnit = SOLDE_UNITS[currency];
  if (perUnit) return units * perUnit;
  if (currency === 'USD') return units;
  return units * rateOf(rates, currency);
}

function rateOf(rates: Record<string, number>, currency: string): number {
  if (currency === 'USD') return 1;
  const rate = Number(rates[currency]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Pas de taux de change pour ${currency}`);
  }
  return rate;
}

function roundCharge(amount: number, currency: string): number {
  if (CFA_CURRENCIES.has(currency)) return Math.round(amount / 5) * 5;
  return Math.round(amount);
}

function cinetpayCountry(storeCountry: string): string {
  const cc = storeCountry.toUpperCase();
  return CINETPAY_COUNTRIES.has(cc) ? cc : 'CI';
}
