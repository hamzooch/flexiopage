/**
 * Test end-to-end de la logique marketplace :
 *   1. Admin crée un produit marketplace
 *   2. Vendeur "acquiert" le produit (aucun débit wallet)
 *   3. 1re vente client (Moneroo/CinetPay) → prélèvement wholesale
 *   4. Idempotence : re-fire du hook = 0 débit supplémentaire
 *   5. 2e vente → seule la commission 15% s'applique (pas de wholesale)
 *   6. Refund 1re vente → wholesale recrédité + acquisition redevient active
 *   7. 3e vente (post-refund) → wholesale re-débité (parce que active)
 *
 * Run : cd flexiopage-backend && npx tsx scripts/test-marketplace-flow.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User.model';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';
import { Order } from '../src/models/Order.model';
import { Wallet } from '../src/models/Wallet.model';
import { MarketplaceProduct } from '../src/models/MarketplaceProduct.model';
import { VendorAcquisition } from '../src/models/VendorAcquisition.model';
import {
  creditSellerForPaidOrder,
  reverseMarketplaceDebitsForRefund,
} from '../src/services/seller-earnings.service';

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
  console.log('\n🧪 Test marketplace flow (post-paid billing)\n');
  await connectDB();

  // ─── SETUP ──────────────────────────────────────────────────────────
  console.log('── Setup ─────────────────────────────────────────────');

  const vendor = await User.create({
    email: `vendor+${SUFFIX}@test.local`,
    name: 'Vendor Test',
    password: 'test1234',
    role: 'user',
    emailVerified: true,
  });
  check('Vendor user créé', !!vendor._id, { email: vendor.email });

  const store = await Store.create({
    ownerId: vendor._id,
    name: `Store Test ${SUFFIX}`,
    slug: `store-test-${SUFFIX}`,
    subdomain: `store-test-${SUFFIX}`,
    storeType: 'digital',
    settings: { currency: 'USD', country: 'US' },
  });
  check('Store vendeur créée', !!store._id, { name: store.name });

  // ─── 1. Admin crée un produit marketplace ──────────────────────────
  console.log('\n── 1. Admin crée un produit marketplace ─────────────');

  const marketplaceProduct = await MarketplaceProduct.create({
    title: `Ebook Test ${SUFFIX}`,
    slug: `ebook-test-${SUFFIX}`,
    description: 'Un ebook de test.',
    digitalKind: 'download',
    wholesalePrice: 3000, // ← Ce que le vendeur devra à sa 1re vente
    suggestedRetailPrice: 10000,
    currency: 'USD',
    isActive: true,
    deliverableAssets: [
      { id: 'a1', name: 'ebook.pdf', url: 'https://example.com/ebook.pdf', kind: 'file', order: 0 },
    ],
    stats: { acquisitions: 0, totalSales: 0 },
  });
  check('MarketplaceProduct créé', !!marketplaceProduct._id, {
    wholesalePrice: marketplaceProduct.wholesalePrice,
    currency: marketplaceProduct.currency,
  });

  // ─── 2. Vendeur acquiert le produit ─────────────────────────────────
  console.log('\n── 2. Vendeur acquiert (0 débit attendu) ────────────');

  // On simule ce que fait le controller marketplace-vendor.acquire
  const vendorProduct = await Product.create({
    storeId: store._id,
    name: marketplaceProduct.title,
    slug: `vendor-ebook-${SUFFIX}`,
    type: 'digital',
    digitalKind: 'download',
    digitalAssets: marketplaceProduct.deliverableAssets,
    price: 10000, // ← Prix retail choisi par le vendeur
    cost: marketplaceProduct.wholesalePrice,
    stock: 0,
    trackInventory: false,
    allowBackorder: true,
    isPublished: true,
    sourceMarketplaceId: marketplaceProduct._id,
  });

  const acquisition = await VendorAcquisition.create({
    vendorId: vendor._id,
    storeId: store._id,
    marketplaceProductId: marketplaceProduct._id,
    vendorProductId: vendorProduct._id,
    retailPrice: 10000,
    currency: 'USD',
    status: 'active',
    wholesaleOwed: marketplaceProduct.wholesalePrice,
  });
  vendorProduct.sourceAcquisitionId = acquisition._id as mongoose.Types.ObjectId;
  await vendorProduct.save();

  check('VendorAcquisition en statut active', acquisition.status === 'active');
  check(
    'wholesaleOwed figé à 3000',
    acquisition.wholesaleOwed === 3000,
    { wholesaleOwed: acquisition.wholesaleOwed },
  );

  // Vérifie qu'aucun wallet n'est créé/débité à ce stade
  const walletBefore = await Wallet.findOne({ userId: vendor._id });
  check('Aucun wallet créé à l\'acquisition (0 débit)', !walletBefore);

  // ─── 3. 1re vente → prélèvement wholesale ──────────────────────────
  console.log('\n── 3. 1re vente client (attendu: −1500 commission −3000 wholesale) ─');

  const order1 = await Order.create({
    storeId: store._id,
    orderNumber: `TEST-${SUFFIX}-1`,
    email: 'client@test.local',
    items: [{
      productId: vendorProduct._id,
      name: vendorProduct.name,
      quantity: 1,
      price: 10000,
      total: 10000,
    }],
    subtotal: 10000,
    shippingCost: 0,
    tax: 0,
    discount: 0,
    total: 10000,
    currency: 'USD',
    paymentStatus: 'paid',
    paymentMethod: 'card',
    paymentProvider: 'cinetpay', // ← Doit être un online provider pour trigger
    fulfillmentStatus: 'unfulfilled',
  });

  const credited1 = await creditSellerForPaidOrder(order1);
  check('sale_credit renvoie le net', credited1 === 8500, { credited: credited1 });

  const wallet1 = await Wallet.findOne({ userId: vendor._id });
  check('Wallet créé', !!wallet1);
  if (!wallet1) throw new Error('wallet missing');

  // Attendu : sale_credit +8500 puis marketplace_debit −3000 = 5500
  check(
    'payoutBalance = 5500 (8500 sale − 3000 wholesale)',
    wallet1.payoutBalance === 5500,
    { balance: wallet1.payoutBalance },
  );

  const txSale = wallet1.transactions.find(
    (t) => t.kind === 'sale_credit' && t.orderId?.toString() === order1._id.toString(),
  );
  const txWholesale = wallet1.transactions.find(
    (t) => t.kind === 'marketplace_debit' && t.orderId?.toString() === order1._id.toString(),
  );
  check('Transaction sale_credit présente', !!txSale, { amount: txSale?.amount });
  check('Transaction marketplace_debit présente', !!txWholesale, { amount: txWholesale?.amount });
  check('marketplace_debit = −3000', txWholesale?.amount === -3000);

  const acq1 = await VendorAcquisition.findById(acquisition._id);
  check('Acquisition passée en settled', acq1?.status === 'settled');
  check('firstSaleAt renseigné', !!acq1?.firstSaleAt);
  check('settledByOrderId = order1', acq1?.settledByOrderId?.toString() === order1._id.toString());

  // ─── 4. Idempotence : re-fire → pas de double débit ─────────────────
  console.log('\n── 4. Re-fire du hook sur order1 (idempotence) ──────');

  const credited1bis = await creditSellerForPaidOrder(order1);
  const wallet1bis = await Wallet.findOne({ userId: vendor._id });
  check('Re-fire renvoie 0 (déjà crédité)', credited1bis === 0);
  check(
    'payoutBalance inchangé (5500)',
    wallet1bis?.payoutBalance === 5500,
    { balance: wallet1bis?.payoutBalance },
  );
  const wholesaleTxCount = wallet1bis!.transactions.filter((t) => t.kind === 'marketplace_debit').length;
  check('1 seule transaction marketplace_debit', wholesaleTxCount === 1);

  // ─── 5. 2e vente → seule commission, pas de wholesale ──────────────
  console.log('\n── 5. 2e vente (attendu: seulement −1500 commission) ─');

  const order2 = await Order.create({
    storeId: store._id,
    orderNumber: `TEST-${SUFFIX}-2`,
    email: 'client2@test.local',
    items: [{
      productId: vendorProduct._id,
      name: vendorProduct.name,
      quantity: 1,
      price: 10000,
      total: 10000,
    }],
    subtotal: 10000,
    shippingCost: 0,
    tax: 0,
    discount: 0,
    total: 10000,
    currency: 'USD',
    paymentStatus: 'paid',
    paymentMethod: 'card',
    paymentProvider: 'cinetpay',
    fulfillmentStatus: 'unfulfilled',
  });

  await creditSellerForPaidOrder(order2);
  const wallet2 = await Wallet.findOne({ userId: vendor._id });
  // Attendu : 5500 + 8500 = 14000 (pas de wholesale sur 2e vente)
  check(
    'payoutBalance = 14000 (5500 + 8500)',
    wallet2?.payoutBalance === 14000,
    { balance: wallet2?.payoutBalance },
  );
  const wholesaleTxCount2 = wallet2!.transactions.filter((t) => t.kind === 'marketplace_debit').length;
  check('Toujours 1 seule transaction marketplace_debit', wholesaleTxCount2 === 1);

  // ─── 6. Refund order1 → réouverture acquisition ────────────────────
  console.log('\n── 6. Refund order1 (attendu: +3000 recrédité, acq→active) ─');

  order1.paymentStatus = 'refunded';
  await order1.save();
  const refunded = await reverseMarketplaceDebitsForRefund(order1);
  check('reverseMarketplaceDebitsForRefund renvoie 3000', refunded === 3000);

  const wallet3 = await Wallet.findOne({ userId: vendor._id });
  // 14000 + 3000 = 17000
  check(
    'payoutBalance = 17000 (14000 + 3000)',
    wallet3?.payoutBalance === 17000,
    { balance: wallet3?.payoutBalance },
  );
  const txRefund = wallet3?.transactions.find((t) => t.kind === 'marketplace_debit_refund');
  check('Transaction marketplace_debit_refund présente', !!txRefund, { amount: txRefund?.amount });

  const acq2 = await VendorAcquisition.findById(acquisition._id);
  check('Acquisition repassée en active', acq2?.status === 'active');
  check('firstSaleAt effacé', !acq2?.firstSaleAt);
  check('settledByOrderId effacé', !acq2?.settledByOrderId);

  // Idempotence refund
  const refundedBis = await reverseMarketplaceDebitsForRefund(order1);
  check('Re-fire refund = 0 (idempotent)', refundedBis === 0);

  // ─── 7. 3e vente post-refund → wholesale re-débité ─────────────────
  console.log('\n── 7. 3e vente post-refund (attendu: re-débit wholesale) ─');

  const order3 = await Order.create({
    storeId: store._id,
    orderNumber: `TEST-${SUFFIX}-3`,
    email: 'client3@test.local',
    items: [{
      productId: vendorProduct._id,
      name: vendorProduct.name,
      quantity: 1,
      price: 10000,
      total: 10000,
    }],
    subtotal: 10000,
    shippingCost: 0,
    tax: 0,
    discount: 0,
    total: 10000,
    currency: 'USD',
    paymentStatus: 'paid',
    paymentMethod: 'card',
    paymentProvider: 'cinetpay',
    fulfillmentStatus: 'unfulfilled',
  });

  await creditSellerForPaidOrder(order3);
  const wallet4 = await Wallet.findOne({ userId: vendor._id });
  // 17000 + 8500 − 3000 = 22500
  check(
    'payoutBalance = 22500 (17000 + 8500 − 3000)',
    wallet4?.payoutBalance === 22500,
    { balance: wallet4?.payoutBalance },
  );
  const wholesaleTxCount3 = wallet4!.transactions.filter((t) => t.kind === 'marketplace_debit').length;
  check('2 transactions marketplace_debit au total', wholesaleTxCount3 === 2);

  const acq3 = await VendorAcquisition.findById(acquisition._id);
  check('Acquisition repassée en settled (par order3)', acq3?.status === 'settled');
  check(
    'settledByOrderId = order3',
    acq3?.settledByOrderId?.toString() === order3._id.toString(),
  );

  // ─── 8. Cas limite : dette (payoutBalance négatif) ─────────────────
  console.log('\n── 8. Cas limite : dette wholesale > balance courant ─');

  // Créer un 2e produit marketplace avec wholesale énorme
  const mp2 = await MarketplaceProduct.create({
    title: `Big product ${SUFFIX}`,
    slug: `big-${SUFFIX}`,
    digitalKind: 'download',
    wholesalePrice: 50000, // ← Gros wholesale
    currency: 'USD',
    isActive: true,
    deliverableAssets: [],
    stats: { acquisitions: 0, totalSales: 0 },
  });
  const vp2 = await Product.create({
    storeId: store._id,
    name: mp2.title,
    slug: `vp2-${SUFFIX}`,
    type: 'digital',
    price: 60000,
    stock: 0,
    trackInventory: false,
    sourceMarketplaceId: mp2._id,
  });
  const acq4 = await VendorAcquisition.create({
    vendorId: vendor._id,
    storeId: store._id,
    marketplaceProductId: mp2._id,
    vendorProductId: vp2._id,
    retailPrice: 60000,
    currency: 'USD',
    status: 'active',
    wholesaleOwed: 50000,
  });
  vp2.sourceAcquisitionId = acq4._id as mongoose.Types.ObjectId;
  await vp2.save();

  // Vendeur solde: 22500. Prix vente 60000 → +51000 sale_credit − 50000 wholesale = 23500
  // Total attendu: 22500 + 51000 − 50000 = 23500
  const order4 = await Order.create({
    storeId: store._id,
    orderNumber: `TEST-${SUFFIX}-4`,
    email: 'c4@test.local',
    items: [{ productId: vp2._id, name: vp2.name, quantity: 1, price: 60000, total: 60000 }],
    subtotal: 60000,
    shippingCost: 0, tax: 0, discount: 0,
    total: 60000,
    currency: 'USD',
    paymentStatus: 'paid',
    paymentMethod: 'card',
    paymentProvider: 'cinetpay',
    fulfillmentStatus: 'unfulfilled',
  });
  await creditSellerForPaidOrder(order4);
  const wallet5 = await Wallet.findOne({ userId: vendor._id });
  check(
    'payoutBalance = 23500 (22500 + 51000 − 50000)',
    wallet5?.payoutBalance === 23500,
    { balance: wallet5?.payoutBalance },
  );

  // Cas plus extrême : wholesale qui met la balance négative
  const mp3 = await MarketplaceProduct.create({
    title: `Debt product ${SUFFIX}`,
    slug: `debt-${SUFFIX}`,
    digitalKind: 'download',
    wholesalePrice: 100000, // ← Wholesale plus grand que le solde final
    currency: 'USD',
    isActive: true,
    deliverableAssets: [],
    stats: { acquisitions: 0, totalSales: 0 },
  });
  const vp3 = await Product.create({
    storeId: store._id,
    name: mp3.title,
    slug: `vp3-${SUFFIX}`,
    type: 'digital',
    price: 500, // ← Prix vente TRÈS bas, wholesale >>> net vente
    stock: 0,
    trackInventory: false,
    sourceMarketplaceId: mp3._id,
  });
  const acq5 = await VendorAcquisition.create({
    vendorId: vendor._id,
    storeId: store._id,
    marketplaceProductId: mp3._id,
    vendorProductId: vp3._id,
    retailPrice: 500,
    currency: 'USD',
    status: 'active',
    wholesaleOwed: 100000,
  });
  vp3.sourceAcquisitionId = acq5._id as mongoose.Types.ObjectId;
  await vp3.save();

  const order5 = await Order.create({
    storeId: store._id,
    orderNumber: `TEST-${SUFFIX}-5`,
    email: 'c5@test.local',
    items: [{ productId: vp3._id, name: vp3.name, quantity: 1, price: 500, total: 500 }],
    subtotal: 500,
    shippingCost: 0, tax: 0, discount: 0,
    total: 500,
    currency: 'USD',
    paymentStatus: 'paid',
    paymentMethod: 'card',
    paymentProvider: 'cinetpay',
    fulfillmentStatus: 'unfulfilled',
  });
  await creditSellerForPaidOrder(order5);
  const wallet6 = await Wallet.findOne({ userId: vendor._id });
  // 23500 + 425 (500-75 commission) − 100000 = -76075
  check(
    'payoutBalance devient NÉGATIF (dette autorisée)',
    (wallet6?.payoutBalance || 0) < 0,
    { balance: wallet6?.payoutBalance },
  );
  check(
    'payoutBalance = −76075 (23500 + 425 − 100000)',
    wallet6?.payoutBalance === -76075,
    { balance: wallet6?.payoutBalance },
  );

  // ─── CLEANUP ────────────────────────────────────────────────────────
  console.log('\n── Cleanup ────────────────────────────────────────');
  await User.deleteOne({ _id: vendor._id });
  await Store.deleteOne({ _id: store._id });
  await Product.deleteMany({ storeId: store._id });
  await Order.deleteMany({ storeId: store._id });
  await Wallet.deleteOne({ userId: vendor._id });
  await VendorAcquisition.deleteMany({ vendorId: vendor._id });
  await MarketplaceProduct.deleteMany({
    _id: { $in: [marketplaceProduct._id, mp2._id, mp3._id] },
  });
  console.log('  Cleaned up test data.');

  // ─── SUMMARY ────────────────────────────────────────────────────────
  console.log(`\n📊 Résultats : ${pass} ok · ${fail} échecs`);
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n💥 Test crashé :', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(2);
});
