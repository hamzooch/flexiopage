/**
 * Seller earnings — credits a seller's payout balance after an online order
 * is paid, minus the platform commission.
 *
 * Call site: order-finalize.service.ts (finalizePaidOrder), only when the
 * order's paymentProvider is an online gateway (never COD/manual — vendors
 * pocket the cash directly for those).
 *
 * Idempotent: won't double-credit if the same order is finalized twice.
 * We check the wallet transaction ledger for a matching `sale_credit` on the
 * same orderId before crediting.
 */
import { randomUUID } from 'crypto';
import type { IOrder } from '../models/Order.model';
import { Store } from '../models/Store.model';
import { Wallet } from '../models/Wallet.model';
import { Product } from '../models/Product.model';
import { getSettings, type IPlatformSettings } from '../models/Settings.model';

/** Online providers that route money through the platform's Moneroo account. */
const PLATFORM_HELD_PROVIDERS = new Set(['cinetpay', 'flutterwave', 'stripe']);

export function isOnlineProvider(provider: string | undefined | null): boolean {
  if (!provider) return false;
  const normalized = String(provider).normalize('NFC').toLowerCase();
  if (PLATFORM_HELD_PROVIDERS.has(normalized)) return true;
  // Match "moneróo" tolerantly — same Unicode-normalization concern as in
  // registry.getProviderForGateway. Any provider id starting with "moner"
  // is Moneroo (there is no other family of providers we integrate that
  // shares that prefix).
  return normalized.startsWith('moner');
}

/**
 * Credit the seller's payout balance for a paid online order.
 * Returns the credited amount (0 if skipped/idempotent).
 */
export async function creditSellerForPaidOrder(order: IOrder): Promise<number> {
  if (!isOnlineProvider(order.paymentProvider)) return 0;

  const store = await Store.findById(order.storeId).select('ownerId').lean();
  if (!store?.ownerId) return 0;

  const wallet = await Wallet.findOne({ userId: store.ownerId });
  // No wallet yet — create one. Uses the order currency for consistency.
  const targetWallet =
    wallet ||
    (await Wallet.create({
      userId: store.ownerId,
      currency: order.currency,
      balance: 0,
      aiBalance: 0,
      payoutBalance: 0,
      aiBalanceUnit: 'tokens',
      transactions: [],
    }));

  // Idempotence: already credited?
  const existing = targetWallet.transactions.find(
    (tx) => tx.kind === 'sale_credit' && tx.orderId?.toString() === order._id.toString(),
  );
  if (existing) return 0;

  const settings = await getSettings();
  const orderType = await inferOrderType(order);
  const rate = commissionRateForOrderType(settings.platform, orderType);
  const commission = Math.round(order.total * rate);
  const netAmount = Math.max(0, order.total - commission);

  targetWallet.payoutBalance = (targetWallet.payoutBalance || 0) + netAmount;
  targetWallet.transactions.push({
    id: randomUUID(),
    kind: 'sale_credit',
    bucket: 'payout',
    amount: netAmount,
    balanceAfter: targetWallet.payoutBalance,
    orderId: order._id,
    orderNumber: order.orderNumber,
    note: `Vente ${orderType} · commission ${(rate * 100).toFixed(1)}% (${commission} ${order.currency})`,
    createdAt: new Date(),
  });
  await targetWallet.save();

  return netAmount;
}

/**
 * Détermine le type "commercial" d'une commande à partir de son premier item :
 * digital ou physical. Utilisé pour piocher le bon taux de commission.
 * Fallback digital (majoritaire sur la plateforme).
 */
async function inferOrderType(order: IOrder): Promise<'digital' | 'physical'> {
  const firstItem = order.items?.[0];
  if (!firstItem?.productId) return 'digital';
  const product = await Product.findById(firstItem.productId).select('type').lean();
  return product?.type === 'physical' ? 'physical' : 'digital';
}

/**
 * Résout le taux de commission selon le type de commande. On lit d'abord le
 * taux type-spécifique, on retombe sur `commissionRate` legacy pour les
 * Settings qui n'ont pas été migrés, et enfin sur 15% dur.
 */
export function commissionRateForOrderType(
  platform: IPlatformSettings | undefined,
  orderType: 'digital' | 'physical',
): number {
  const raw =
    orderType === 'digital'
      ? platform?.commissionRateDigital ?? platform?.commissionRate
      : platform?.commissionRatePhysical ?? platform?.commissionRate;
  const rate = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0.15;
  return Math.max(0, Math.min(1, rate));
}
