/**
 * Migration one-shot : recalcule le payoutBalance des wallets à partir des
 * commandes payées réelles, dans la devise de la boutique principale du
 * vendeur.
 *
 * Contexte : le `wallet.currency` est pinné à USD (pour le bucket main/AI),
 * mais le `payoutBalance` a longtemps été accumulé en additionnant des
 * montants dans des devises différentes (USD + XOF + …) — résultat des
 * chiffres incohérents comme "1275 USD" alors qu'il n'y a eu qu'une vente
 * de 500 XOF. On repart de la vérité (Order.paymentStatus='paid').
 *
 * Idempotent : ré-exécuter recalcule à nouveau les mêmes valeurs.
 *
 * Usage :
 *   docker compose -f docker-compose.prod.yml exec backend \
 *     npx tsx scripts/fix-wallet-payout-currency.ts
 *
 * DRY-RUN par défaut. Ajouter `--apply` pour écrire.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User.model';
import { Store } from '../src/models/Store.model';
import { Order } from '../src/models/Order.model';
import { Wallet } from '../src/models/Wallet.model';
import { getSettings } from '../src/models/Settings.model';
import { Payout } from '../src/models/Payout.model';

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`\n🔧 Fix wallet payoutBalance & payoutCurrency ${APPLY ? '(APPLY)' : '(DRY-RUN)'}\n`);
  await connectDB();

  const settings = await getSettings();
  const commissionRate = Math.max(0, Math.min(1, settings.platform?.commissionRate ?? 0.03));
  console.log(`  Commission plateforme lue en DB : ${(commissionRate * 100).toFixed(1)}%`);
  console.log('');

  const wallets = await Wallet.find({});
  let touched = 0;
  let skipped = 0;

  for (const w of wallets) {
    // Trouve les stores du user
    const stores = await Store.find({ ownerId: w.userId }).select('_id settings.currency createdAt').sort({ createdAt: 1 }).lean();
    if (stores.length === 0) {
      console.log(`  • ${w.userId} — pas de store, skip`);
      skipped++;
      continue;
    }
    const primaryCurrency = stores[0].settings?.currency || 'USD';
    const storeIds = stores.map((s) => s._id);

    // Somme des ventes payées online dans la devise principale
    const paidOrders = await Order.find({
      storeId: { $in: storeIds },
      paymentStatus: 'paid',
      paymentProvider: { $in: ['cinetpay', 'moneróo', 'flutterwave', 'wave', 'orange_money', 'mtn_momo', 'moov_money'] },
      currency: primaryCurrency,
    }).select('_id total currency').lean();

    let grossSum = 0;
    for (const o of paidOrders) grossSum += o.total || 0;
    const commissionSum = Math.round(grossSum * commissionRate);
    const realPayoutBalance = Math.max(0, grossSum - commissionSum);

    // Ce qui a déjà été versé au vendeur (soustrait)
    const paidPayouts = await Payout.aggregate<{ _id: null; total: number }>([
      { $match: { userId: w.userId, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const alreadyPaidOut = paidPayouts[0]?.total || 0;
    const expected = Math.max(0, realPayoutBalance - alreadyPaidOut);

    const before = w.payoutBalance || 0;
    if (before === expected) {
      console.log(`  • wallet ${w._id} déjà OK (${expected} ${primaryCurrency})`);
      skipped++;
      continue;
    }

    const user = await User.findById(w.userId).select('email').lean();
    console.log(`  ✏️  ${user?.email || w.userId}`);
    console.log(`     Store principal : ${stores[0].settings?.currency || '?'}`);
    console.log(`     Ventes cumulées : ${grossSum} ${primaryCurrency} (${paidOrders.length} orders)`);
    console.log(`     Commission ${(commissionRate * 100).toFixed(1)}% : ${commissionSum} ${primaryCurrency}`);
    console.log(`     Déjà versé      : ${alreadyPaidOut} ${primaryCurrency}`);
    console.log(`     Nouveau solde   : ${before} → ${expected} ${primaryCurrency}`);

    if (APPLY) {
      w.payoutBalance = expected;
      // Note de reconciliation dans le ledger
      w.transactions.push({
        id: `reconcile-${Date.now()}`,
        kind: 'adjustment',
        bucket: 'payout',
        amount: expected - before,
        balanceAfter: expected,
        note: `Solde payout reconcilié depuis les ventes réelles (${primaryCurrency}). Anciennement ${before}.`,
        createdAt: new Date(),
      } as unknown as (typeof w.transactions)[number]);
      await w.save();
    }
    touched++;
  }

  console.log('');
  console.log(`✅ Terminé. ${touched} wallet(s) ${APPLY ? 'mis à jour' : 'à mettre à jour'}, ${skipped} skip.`);
  if (!APPLY) console.log(`   Relancer avec --apply pour écrire.`);
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('💥 Erreur :', err);
  process.exit(1);
});
