/**
 * Test end-to-end du flow top-up wallet (Stripe + CinetPay).
 *
 * Ne fait PAS d'appel réel aux gateways (les clés ne sont pas nécessaires).
 * Teste les parties de logique locales :
 *   1. availableGatewaysForUser selon le pays du vendeur
 *   2. Refus initiateTopUp quand aucun gateway n'est disponible
 *   3. Création WalletTopUp `pending`
 *   4. settleTopUp → crédite le wallet main, passe en `paid`, idempotent
 *   5. settleTopUp bucket AI → conversion USD → tokens correcte
 *   6. Idempotence côté wallet : appeler credit() 2x avec même paymentReference
 *      ne double-crédite pas (garanti par gatewayReference unique)
 *   7. markTopUpFailed passe `pending → failed`
 *
 * Run : cd flexiopage-backend && npx tsx scripts/test-topup-flow.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User.model';
import { Store } from '../src/models/Store.model';
import { Wallet } from '../src/models/Wallet.model';
import { WalletTopUp } from '../src/models/WalletTopUp.model';
import {
  availableGatewaysForUser,
  settleTopUp,
  markTopUpFailed,
  initiateTopUp,
} from '../src/services/topup.service';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra?: unknown): void {
  const icon = ok ? '✅' : '❌';
  const extraStr = extra !== undefined ? '  ' + JSON.stringify(extra) : '';
  console.log(`${icon} ${label}${extraStr}`);
  ok ? pass++ : fail++;
}

const SUFFIX = Date.now();

async function main() {
  console.log('\n🧪 Test top-up flow (Stripe + CinetPay)\n');
  await connectDB();

  console.log('── Setup vendeur (pays CI = éligible CinetPay) ──');
  const vendorCI = await User.create({
    email: `topup+ci+${SUFFIX}@test.local`,
    name: 'Vendor CI',
    password: 'test1234',
    role: 'user',
    emailVerified: true,
  });
  await Store.create({
    ownerId: vendorCI._id,
    name: `Store CI ${SUFFIX}`,
    slug: `store-ci-${SUFFIX}`,
    subdomain: `store-ci-${SUFFIX}`,
    storeType: 'digital',
    settings: { currency: 'XOF', country: 'CI' },
  });
  check('Vendor CI + Store créés', true);

  console.log('\n── Setup vendeur (pays US = hors CFA, Stripe uniquement) ──');
  const vendorUS = await User.create({
    email: `topup+us+${SUFFIX}@test.local`,
    name: 'Vendor US',
    password: 'test1234',
    role: 'user',
    emailVerified: true,
  });
  await Store.create({
    ownerId: vendorUS._id,
    name: `Store US ${SUFFIX}`,
    slug: `store-us-${SUFFIX}`,
    subdomain: `store-us-${SUFFIX}`,
    storeType: 'digital',
    settings: { currency: 'USD', country: 'US' },
  });
  check('Vendor US + Store créés', true);

  // ─── 1. availableGatewaysForUser ────────────────────────────────────
  console.log('\n── 1. Gateway resolution selon pays ──');
  const cinetpayConfigured = !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_API_PASSWORD);
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
  console.log(`   CINETPAY_API_KEY: ${cinetpayConfigured ? '✅' : '❌'}`);
  console.log(`   STRIPE_SECRET_KEY: ${stripeConfigured ? '✅' : '❌'}`);

  const gwCI = await availableGatewaysForUser(vendorCI);
  const gwUS = await availableGatewaysForUser(vendorUS);
  console.log(`   Gateways CI: ${JSON.stringify(gwCI)}`);
  console.log(`   Gateways US: ${JSON.stringify(gwUS)}`);

  if (cinetpayConfigured) {
    check('Vendor CI a CinetPay dispo', gwCI.includes('cinetpay'));
  } else {
    check('Vendor CI n\'a PAS CinetPay (non configuré)', !gwCI.includes('cinetpay'));
  }
  check('Vendor US n\'a JAMAIS CinetPay (hors zone CFA)', !gwUS.includes('cinetpay'));
  if (stripeConfigured) {
    check('Vendor CI a Stripe dispo', gwCI.includes('stripe'));
    check('Vendor US a Stripe dispo', gwUS.includes('stripe'));
  } else {
    check('Vendor US n\'a AUCUN gateway (Stripe pas configuré, hors CFA)', gwUS.length === 0);
  }

  // ─── 2. initiateTopUp refuse si aucun gateway ───────────────────────
  console.log('\n── 2. initiateTopUp refuse si aucun gateway ──');
  if (gwUS.length === 0) {
    let threw = false;
    try {
      await initiateTopUp({
        user: vendorUS,
        amount: 10,
        bucket: 'main',
        gateway: 'auto',
        frontendBaseUrl: 'http://localhost:3000',
      });
    } catch (e) {
      threw = true;
      console.log(`   Rejeté correctement: ${(e as Error).message}`);
    }
    check('initiateTopUp lève une erreur quand aucun gateway', threw);
  }

  // ─── 3. Création WalletTopUp pending directement (simulate initiate) ───
  console.log('\n── 3. Création WalletTopUp pending (simulation) ──');
  const gatewayReference = `tu_${Date.now().toString(36)}_test1234`;
  const topUp = await WalletTopUp.create({
    userId: vendorCI._id,
    amount: 10000,
    currency: 'XOF',
    bucket: 'main',
    gateway: 'cinetpay',
    gatewayReference,
    gatewayTxId: 'CPTX_TEST_123',
    checkoutUrl: 'https://checkout.cinetpay.com/example',
    status: 'pending',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  check('WalletTopUp pending créé', topUp.status === 'pending');
  check('gatewayReference unique commence par tu_', topUp.gatewayReference.startsWith('tu_'));

  // Aucun wallet ne doit exister encore
  const walletBefore = await Wallet.findOne({ userId: vendorCI._id });
  check('Wallet non créé avant settle', !walletBefore);

  // ─── 4. settleTopUp → crédite le wallet main ────────────────────────
  console.log('\n── 4. settleTopUp crédite le wallet main ──');
  const settled1 = await settleTopUp(String(topUp._id));
  check('settleTopUp renvoie true (crédit effectué)', settled1 === true);

  const wallet1 = await Wallet.findOne({ userId: vendorCI._id });
  check('Wallet créé', !!wallet1);
  check(
    'Balance main = 10000 XOF',
    wallet1?.balance === 10000,
    { balance: wallet1?.balance },
  );
  const topUpAfter = await WalletTopUp.findById(topUp._id);
  check('Statut top-up = paid', topUpAfter?.status === 'paid');
  check('paidAt renseigné', !!topUpAfter?.paidAt);

  const topUpTx = wallet1?.transactions.find((t) => t.kind === 'top_up');
  check('Transaction top_up présente dans le ledger', !!topUpTx);
  check(
    'paymentReference du tx = gatewayReference (dedup key)',
    topUpTx?.paymentReference === gatewayReference,
  );

  // ─── 5. Idempotence settleTopUp ─────────────────────────────────────
  console.log('\n── 5. Idempotence settleTopUp ──');
  const settled2 = await settleTopUp(String(topUp._id));
  check('2e settleTopUp renvoie false (déjà paid, no-op)', settled2 === false);

  const wallet2 = await Wallet.findOne({ userId: vendorCI._id });
  check(
    'Balance inchangée (10000, pas double-crédité)',
    wallet2?.balance === 10000,
    { balance: wallet2?.balance },
  );
  const topUpTxCount = wallet2!.transactions.filter((t) => t.kind === 'top_up').length;
  check('1 seule transaction top_up dans le ledger', topUpTxCount === 1);

  // ─── 6. Top-up bucket AI → conversion USD → tokens ──────────────────
  console.log('\n── 6. Top-up AI convertit USD → tokens ──');
  const gatewayReferenceAI = `tu_${Date.now().toString(36)}_aitest`;
  const topUpAI = await WalletTopUp.create({
    userId: vendorCI._id,
    amount: 10, // USD
    currency: 'USD',
    bucket: 'ai',
    gateway: 'stripe',
    gatewayReference: gatewayReferenceAI,
    gatewayTxId: 'cs_test_AI',
    checkoutUrl: 'https://checkout.stripe.com/example',
    status: 'pending',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const aiSettled = await settleTopUp(String(topUpAI._id));
  check('settleTopUp AI renvoie true', aiSettled === true);

  const walletAI = await Wallet.findOne({ userId: vendorCI._id });
  check(
    'aiBalance > 0 (tokens crédités)',
    (walletAI?.aiBalance || 0) > 0,
    { aiBalance: walletAI?.aiBalance },
  );
  const aiTx = walletAI!.transactions.find((t) => t.kind === 'top_up_ai');
  check('Transaction top_up_ai présente', !!aiTx);
  check('paymentReference AI = gatewayReference', aiTx?.paymentReference === gatewayReferenceAI);
  // Note du tx contient bien la conversion USD → tokens
  check('Note contient la conversion USD → tokens', aiTx?.note?.includes('tokens') ?? false);

  // ─── 7. markTopUpFailed ─────────────────────────────────────────────
  console.log('\n── 7. markTopUpFailed transition pending → failed ──');
  const topUpFail = await WalletTopUp.create({
    userId: vendorCI._id,
    amount: 5000,
    currency: 'XOF',
    bucket: 'main',
    gateway: 'cinetpay',
    gatewayReference: `tu_${Date.now().toString(36)}_fail`,
    gatewayTxId: 'CPTX_FAIL',
    checkoutUrl: 'https://x.example',
    status: 'pending',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await markTopUpFailed(String(topUpFail._id), 'test failure');
  const topUpFailAfter = await WalletTopUp.findById(topUpFail._id);
  check('Statut passé à failed', topUpFailAfter?.status === 'failed');
  check('failureReason renseigné', topUpFailAfter?.failureReason === 'test failure');

  // markTopUpFailed ne touche pas un top-up déjà paid
  await markTopUpFailed(String(topUp._id), 'should be ignored');
  const paidStill = await WalletTopUp.findById(topUp._id);
  check('markTopUpFailed n\'écrase pas un paid', paidStill?.status === 'paid');

  // ─── 8. Dedup wallet — 2 top-ups différents avec bucket main s'accumulent ──
  console.log('\n── 8. 2 top-ups distincts s\'accumulent (pas de collision) ──');
  const topUp2 = await WalletTopUp.create({
    userId: vendorCI._id,
    amount: 5000,
    currency: 'XOF',
    bucket: 'main',
    gateway: 'cinetpay',
    gatewayReference: `tu_${Date.now().toString(36)}_second`,
    gatewayTxId: 'CPTX_2',
    checkoutUrl: 'https://x.example',
    status: 'pending',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await settleTopUp(String(topUp2._id));
  const walletFinal = await Wallet.findOne({ userId: vendorCI._id });
  check(
    'Balance main = 15000 (10000 + 5000)',
    walletFinal?.balance === 15000,
    { balance: walletFinal?.balance },
  );
  const allTopUpTx = walletFinal!.transactions.filter((t) => t.kind === 'top_up').length;
  check('2 transactions top_up distinctes', allTopUpTx === 2);

  // ─── CLEANUP ────────────────────────────────────────────────────────
  console.log('\n── Cleanup ──');
  await User.deleteMany({ _id: { $in: [vendorCI._id, vendorUS._id] } });
  await Store.deleteMany({ ownerId: { $in: [vendorCI._id, vendorUS._id] } });
  await Wallet.deleteMany({ userId: { $in: [vendorCI._id, vendorUS._id] } });
  await WalletTopUp.deleteMany({ userId: { $in: [vendorCI._id, vendorUS._id] } });
  console.log('  Cleaned up.');

  console.log(`\n📊 Résultats : ${pass} ok · ${fail} échecs`);
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n💥 Test crashé :', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(2);
});
