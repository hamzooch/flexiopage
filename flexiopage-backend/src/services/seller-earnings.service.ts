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
import { MarketplaceProduct } from '../models/MarketplaceProduct.model';
import { VendorAcquisition } from '../models/VendorAcquisition.model';
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

  // ── Débit marketplace (1re vente d'un produit acquis depuis le catalogue) ──
  // On règle la dette wholesale des acquisitions encore `active` touchées
  // par cette commande. Mêmes garanties d'idempotence : `sale_credit` bloque
  // les double-crédits ; le passage `active → settled` bloque les double-débits
  // wholesale même si `settleMarketplaceDebits` était re-appelé.
  await settleMarketplaceDebits(order, targetWallet);

  await targetWallet.save();

  return netAmount;
}

/**
 * Parcourt les items de la commande, débite `wholesaleOwed` pour chaque
 * VendorAcquisition encore `active`, et passe l'acquisition en `settled`.
 *
 * Convention "dette par acquisition, pas par unité" : plusieurs quantités
 * du même produit dans la même commande = UN seul débit. Même chose si le
 * client rachète le produit 5 fois plus tard : la 1re vente déclenche le
 * wholesale une bonne fois.
 *
 * Muté in-place sur `wallet` (le save() est fait par l'appelant après le
 * sale_credit pour tout committer en une seule écriture). Le wallet peut
 * passer en négatif — dette autorisée, remboursée sur ventes suivantes.
 */
async function settleMarketplaceDebits(
  order: IOrder,
  wallet: InstanceType<typeof Wallet>,
): Promise<void> {
  // Dédup par acquisitionId (une commande peut contenir plusieurs lignes
  // pour le même produit ; on ne débite qu'une fois par acquisition).
  const productIds = Array.from(
    new Set(order.items?.map((it) => it.productId?.toString()).filter(Boolean) as string[]),
  );
  if (productIds.length === 0) return;

  const marketplaceProducts = await Product.find({
    _id: { $in: productIds },
    sourceAcquisitionId: { $exists: true, $ne: null },
  })
    .select('sourceAcquisitionId sourceMarketplaceId name')
    .lean();
  if (marketplaceProducts.length === 0) return;

  for (const product of marketplaceProducts) {
    // findOneAndUpdate atomique : passe active→settled uniquement si encore
    // active. Empêche le double-débit même en cas de rejoue concurrent du
    // hook (webhook + retry manuel par exemple).
    const acquisition = await VendorAcquisition.findOneAndUpdate(
      { _id: product.sourceAcquisitionId, status: 'active' },
      {
        $set: {
          status: 'settled',
          firstSaleAt: new Date(),
          settledAt: new Date(),
          settledByOrderId: order._id,
        },
      },
      { new: true },
    );

    // Déjà réglée (settled ou refunded) ou introuvable → on skip mais on
    // incrémente quand même le compteur "totalSales" du catalogue.
    if (acquisition) {
      wallet.payoutBalance = (wallet.payoutBalance || 0) - acquisition.wholesaleOwed;
      wallet.transactions.push({
        id: randomUUID(),
        kind: 'marketplace_debit',
        bucket: 'payout',
        amount: -acquisition.wholesaleOwed,
        balanceAfter: wallet.payoutBalance,
        orderId: order._id,
        orderNumber: order.orderNumber,
        note: `Marketplace: achat produit « ${product.name} » (${acquisition.wholesaleOwed} ${order.currency})`,
        createdAt: new Date(),
      });
    }

    if (product.sourceMarketplaceId) {
      // Compteur ventes catalogue — best-effort, ne bloque pas le débit.
      await MarketplaceProduct.updateOne(
        { _id: product.sourceMarketplaceId },
        { $inc: { 'stats.totalSales': 1 } },
      ).catch(() => undefined);
    }
  }
}

/**
 * Reverse les débits marketplace déclenchés par cette commande — appelé quand
 * paymentStatus passe à `refunded`. Pour chaque VendorAcquisition marquée
 * `settled` par cet order :
 *   1. Recrédite `wholesaleOwed` sur le payoutBalance du vendeur
 *   2. Enregistre une transaction `marketplace_debit_refund`
 *   3. Repasse l'acquisition en `active` (prochaine vente re-déclenchera le débit)
 *
 * Idempotent : on filtre sur `settledByOrderId === order._id && status === 'settled'`
 * de manière atomique — un 2e appel ne trouvera rien à faire.
 */
export async function reverseMarketplaceDebitsForRefund(order: IOrder): Promise<number> {
  const store = await Store.findById(order.storeId).select('ownerId').lean();
  if (!store?.ownerId) return 0;

  // Toutes les acquisitions settled par CETTE commande. On les repasse en
  // active atomiquement pour éviter le double-refund si le hook rejoue.
  const acquisitions = await VendorAcquisition.find({
    settledByOrderId: order._id,
    status: 'settled',
  });
  if (acquisitions.length === 0) return 0;

  const wallet = await Wallet.findOne({ userId: store.ownerId });
  if (!wallet) return 0;

  let totalRefunded = 0;
  for (const acq of acquisitions) {
    // Atomic guard : ne recrédite QUE si on est encore settled+même order.
    const claimed = await VendorAcquisition.findOneAndUpdate(
      { _id: acq._id, status: 'settled', settledByOrderId: order._id },
      {
        $set: { status: 'active' },
        $unset: { firstSaleAt: '', settledAt: '', settledByOrderId: '' },
      },
      { new: true },
    );
    if (!claimed) continue;

    wallet.payoutBalance = (wallet.payoutBalance || 0) + acq.wholesaleOwed;
    wallet.transactions.push({
      id: randomUUID(),
      kind: 'marketplace_debit_refund',
      bucket: 'payout',
      amount: acq.wholesaleOwed,
      balanceAfter: wallet.payoutBalance,
      orderId: order._id,
      orderNumber: order.orderNumber,
      note: `Marketplace: remboursement wholesale (commande ${order.orderNumber} refundée)`,
      createdAt: new Date(),
    });
    totalRefunded += acq.wholesaleOwed;
  }

  if (totalRefunded > 0) {
    await wallet.save();
  }
  return totalRefunded;
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
