/**
 * Frais du solde principal — par palier de chiffre d'affaires, pas à la commande.
 *
 * Après 2 000 000 XOF de CA (équivalent 10 000 TND), on retire 0,1 du solde
 * principal — pas du solde IA. Un solde de 3 devient 2,9. Ce 0,1 vaut 800 CFA,
 * ou 3 dinars tunisiens. Le palier suivant retire encore 800 CFA.
 * Une commande ne compte qu'une fois.
 */
import mongoose from 'mongoose';
import { Order } from '../models/Order.model';
import { Store } from '../models/Store.model';
import { getSettings, DEFAULT_PLATFORM_SETTINGS } from '../models/Settings.model';
import { debit } from './wallet.service';
import { logger } from '../lib/logger';

export async function recordPhysicalRevenue(orderId: string): Promise<void> {
  if (!mongoose.isValidObjectId(orderId)) return;

  const order = await Order.findOneAndUpdate(
    { _id: orderId, paymentStatus: 'paid', billingCounted: { $ne: true } },
    { $set: { billingCounted: true } },
    { new: true },
  ).select('storeId total currency');
  if (!order) return;

  const store = await Store.findById(order.storeId).select('ownerId settings.currency');
  if (!store || !store.ownerId) return;

  const amount = Number(order.total) || 0;
  if (amount <= 0) return;

  const currency = String(order.currency || store.settings?.currency || 'XOF').toUpperCase();

  await Store.updateOne({ _id: store._id }, [
    {
      $set: {
        'physicalBilling.deliveredRevenue': {
          $add: [{ $ifNull: ['$physicalBilling.deliveredRevenue', 0] }, amount],
        },
        'physicalBilling.tranchesBilled': { $ifNull: ['$physicalBilling.tranchesBilled', 0] },
        'physicalBilling.currency': currency,
      },
    },
  ]);

  const fresh = await Store.findById(store._id).select('physicalBilling ownerId');
  const revenue = fresh?.physicalBilling?.deliveredRevenue || 0;
  const billed = fresh?.physicalBilling?.tranchesBilled || 0;

  const settings = await getSettings();
  const thresholds = {
    ...(DEFAULT_PLATFORM_SETTINGS.physicalRevenueThresholds || {}),
    ...(settings.platform?.physicalRevenueThresholds || {}),
  };
  const threshold = Number(thresholds[currency]) || 0;
  const debitEach = typeof settings.platform?.physicalBalanceDebit === 'number'
    ? settings.platform.physicalBalanceDebit
    : 0.1;
  if (threshold <= 0 || debitEach <= 0) return;

  const due = Math.floor(revenue / threshold);
  if (due <= billed) return;

  const won = await Store.findOneAndUpdate(
    { _id: store._id, 'physicalBilling.tranchesBilled': billed },
    { $set: { 'physicalBilling.tranchesBilled': due } },
    { new: false },
  );
  if (!won) return;

  const tranches = due - billed;
  const fee = Math.round(tranches * debitEach * 100) / 100;
  if (fee <= 0) return;

  try {
    await chargeTranche({
      userId: store.ownerId,
      storeId: String(store._id),
      amount: fee,
      currency,
      fromTranche: billed,
      toTranche: due,
      threshold,
      debitEach,
    });
  } catch (err) {
    await Store.updateOne(
      { _id: store._id, 'physicalBilling.tranchesBilled': due },
      { $set: { 'physicalBilling.tranchesBilled': billed } },
    );
    logger.error({ err, orderId, storeId: String(store._id) }, '[physical-commission] prélèvement du palier échoué');
  }
}

/** 0,1 de solde = 800 CFA = 3 DT. Le libellé parle en monnaie, pas en fraction de solde. */
function trancheNote(debitEach: number, threshold: number, currency: string): string {
  const steps = Math.round(debitEach / 0.1);
  const fee = currency === 'XOF' || currency === 'XAF'
    ? `${(steps * 800).toLocaleString('fr-FR')} CFA`
    : currency === 'TND'
      ? `${steps * 3} DT`
      : `${String(debitEach).replace('.', ',')} de solde`;
  const unit = currency === 'XOF' || currency === 'XAF' ? 'CFA' : currency;
  return `Palier · −${fee} sur le solde principal · chaque ${threshold.toLocaleString('fr-FR')} ${unit} de chiffre d'affaires`;
}

async function chargeTranche(args: {
  userId: mongoose.Types.ObjectId;
  storeId: string;
  amount: number;
  currency: string;
  fromTranche: number;
  toTranche: number;
  threshold: number;
  debitEach: number;
}): Promise<void> {
  const result = await debit({
    userId: args.userId,
    amount: args.amount,
    bucket: 'main',
    kind: 'commission',
    paymentReference: `physical-tranche:${args.storeId}:${args.fromTranche}->${args.toTranche}`,
    note: trancheNote(args.amount, args.threshold, args.currency),
  });
  if (!result.alreadyApplied) {
    logger.info(
      { storeId: args.storeId, amount: args.amount, currency: args.currency, tranche: args.toTranche },
      '[physical-commission] palier prélevé sur le solde',
    );
  }
}
