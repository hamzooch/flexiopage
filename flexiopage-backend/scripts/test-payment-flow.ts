/**
 * End-to-end smoke test for the payment integration.
 *
 * Runs entirely against the DB + provider registry (no HTTP server needed).
 * In MOCK mode (no gateway keys) it exercises the full logical flow:
 *   1. Country → method routing matrix (digital vs physical)
 *   2. Order creation (server-computed amount)
 *   3. Payment init → hosted checkout URL + transactionRef
 *   4. "Webhook" finalize → marks paid, and IDEMPOTENCE (2nd call = no-op)
 *   5. PaymentLog audit entries
 *
 * With real TEST keys set (CINETPAY_* / FLW_*), step 3 hits the real sandbox
 * and prints the live checkout URL you can open in a browser.
 *
 * Run:
 *   cd flexiopage-backend && npm run test:payment-flow
 *
 * Prereq: a seeded store + product. Uses "boutique-test" (npm run seed:test-store).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';
import { createOrder } from '../src/services/order.service';
import { initOrderPaymentWith, isMockMode } from '../src/services/payment/registry';
import { getAvailableMethods, isMethodAllowed } from '../src/services/payment/country-routing';
import { finalizePaidOrder } from '../src/services/order-finalize.service';
import { PaymentLog, logPayment } from '../src/models/PaymentLog.model';

const STORE_SLUG = process.env.TEST_STORE_SLUG || 'boutique-test';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra?: unknown): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  ok ? pass++ : fail++;
}

async function main(): Promise<void> {
  await connectDB();
  console.log(`\n=== Payment flow test (${isMockMode() ? 'MOCK mode' : 'REAL gateway mode'}) ===\n`);

  // ── 1. Routing matrix ───────────────────────────────────────────────
  console.log('— Routing matrix —');
  const sn = getAvailableMethods('SN', 'physical');
  check('SN physical → CinetPay mobile_money + COD',
    sn.some((m) => m.gateway === 'cinetpay') && sn.some((m) => m.id === 'cod'), sn.map((m) => m.id));

  const ng = getAvailableMethods('NG', 'physical');
  check('NG physical → Flutterwave card + mobile_money + COD',
    ng.some((m) => m.gateway === 'flutterwave' && m.id === 'card') && ng.some((m) => m.id === 'cod'), ng.map((m) => m.id));

  const snDigital = getAvailableMethods('SN', 'digital');
  check('SN digital → online only, NO COD',
    snDigital.length > 0 && !snDigital.some((m) => m.id === 'cod'), snDigital.map((m) => m.id));

  const otherPhysical = getAvailableMethods('FR', 'physical');
  check('FR (other) physical → COD only',
    otherPhysical.length === 1 && otherPhysical[0].id === 'cod', otherPhysical.map((m) => m.id));

  const otherDigital = getAvailableMethods('FR', 'digital');
  check('FR (other) digital → online fallback (never empty)',
    otherDigital.length > 0 && !otherDigital.some((m) => m.id === 'cod'), otherDigital.map((m) => m.id));

  check('Guard: SN digital + COD is rejected', !isMethodAllowed('SN', 'digital', 'cod', 'cod'));
  check('Guard: SN physical + cinetpay mobile_money allowed', isMethodAllowed('SN', 'physical', 'cinetpay', 'mobile_money'));

  // ── 2. Order creation + init ─────────────────────────────────────────
  console.log('\n— Order + init —');
  const store = await Store.findOne({ slug: STORE_SLUG });
  if (!store) throw new Error(`Store "${STORE_SLUG}" not found — run "npm run seed:test-store" first`);
  const product = await Product.findOne({ storeId: store._id, isPublished: true });
  if (!product) throw new Error(`No published product in "${STORE_SLUG}"`);

  const gateway = (store.storeType === 'digital' ? 'flutterwave' : 'cinetpay') as 'cinetpay' | 'flutterwave';
  const order = await createOrder({
    storeId: store._id.toString(),
    email: 'test-buyer@example.com',
    customerName: 'Test Buyer',
    customerPhone: '+221770000000',
    shippingAddress: store.storeType === 'physical' ? { line1: 'Rue 1', city: 'Dakar', country: 'SN' } : undefined,
    items: [{ productId: product._id.toString(), name: product.name, quantity: 2, price: product.price }],
    subtotal: product.price * 2,
    currency: store.settings?.currency || 'XOF',
    paymentMethod: 'mobile_money',
  });
  check('Order created with server-computed total', order.total === product.price * 2, { total: order.total });

  const init = await initOrderPaymentWith(order, gateway, { phone: '+221770000000', channel: 'all' });
  order.paymentReference = init.reference;
  order.paymentProvider = init.provider;
  await order.save();
  await logPayment({ orderId: order._id, storeId: store._id, gateway: init.provider, reference: init.reference, event: 'initiate', status: 'pending' });
  check('Init returned a checkout URL', !!init.checkoutUrl, { url: init.checkoutUrl });
  check('Init returned a transactionRef', !!init.reference, { ref: init.reference });

  // ── 3. Webhook finalize + idempotence ────────────────────────────────
  console.log('\n— Finalize + idempotence —');
  const first = await finalizePaidOrder(order._id.toString(), {
    paymentReference: init.reference,
    paymentProvider: init.provider,
    webhookData: { simulated: true },
  });
  await logPayment({ orderId: order._id, storeId: store._id, gateway: init.provider, reference: init.reference, event: 'webhook', status: 'paid', signatureValid: true, rawPayload: { simulated: true } });
  check('First finalize marks order paid', first.order.paymentStatus === 'paid' && first.alreadyDone === false);

  const second = await finalizePaidOrder(order._id.toString(), {
    paymentReference: init.reference, paymentProvider: init.provider, webhookData: { simulated: true },
  });
  check('Second finalize is idempotent (no double-credit)', second.alreadyDone === true);

  // ── 4. Audit log ─────────────────────────────────────────────────────
  console.log('\n— Audit —');
  const logs = await PaymentLog.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();
  check('PaymentLog recorded initiate + webhook', logs.length >= 2, logs.map((l) => `${l.event}:${l.status}`));

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (!isMockMode()) {
    console.log(`👉 Open the checkout URL above to complete a real sandbox payment, then watch the webhook log.`);
  }

  // Cleanup the throwaway order so reruns stay clean.
  await mongoose.connection.collection('orders').deleteOne({ _id: order._id });
  await PaymentLog.deleteMany({ orderId: order._id });
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test-payment-flow failed:', err);
  process.exit(1);
});
