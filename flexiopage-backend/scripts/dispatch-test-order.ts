/**
 * Quick smoke test for the MogaDelivery integration.
 *
 *   1. Loads the seeded "boutique-test" store (run seed:test-store first)
 *   2. Creates a 2-item COD order with a Dakar shipping address
 *   3. Calls dispatchOrder() to POST it to MogaDelivery
 *   4. Prints the request signature, the response, and the saved
 *      delivery.externalId on the order
 *
 * Run:
 *   cd flexiopage-backend && npm run dispatch:test-order
 *
 * Notes:
 *   - The order is created with paymentStatus='manual' (COD: courier collects).
 *   - The mogadelivery integration must be enabled on the store (the seed
 *     does this).
 *   - Set MOGADELIVERY_WEBHOOK_URL=http://localhost:9999/...  to redirect
 *     the call to a local listener for offline testing.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';
import { createOrder } from '../src/services/order.service';
import { dispatchOrder } from '../src/services/delivery.service';

const STORE_SLUG = 'boutique-test';

async function main(): Promise<void> {
  await connectDB();

  const store = await Store.findOne({ slug: STORE_SLUG });
  if (!store) {
    throw new Error(`Store "${STORE_SLUG}" not found — run "npm run seed:test-store" first`);
  }
  if (!store.integrations?.delivery?.enabled) {
    throw new Error(`Store ${store.slug} has delivery integration disabled`);
  }

  // Pick up to 5 products with varying quantities to stress multi-item payload
  const products = await Product.find({ storeId: store._id }).limit(5).lean();
  if (products.length < 2) {
    throw new Error(`Not enough products on ${store.slug} — re-run the seed`);
  }

  const quantities = [3, 1, 2, 1, 4];
  const items = products.map((p, i) => ({
    productId: p._id.toString(),
    name: p.name,
    quantity: quantities[i] ?? 1,
    price: p.price,
    sku: p.sku,
  }));
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const shippingCost = 1500; // local courier fee in XOF

  const order = await createOrder({
    storeId: store._id.toString(),
    email: 'client.test@flexiopage.dev',
    customerName: 'Aïssatou Diallo',
    customerPhone: '+221770000000',
    shippingAddress: {
      line1: '54 Rue Carnot',
      line2: 'Médina',
      city: 'Dakar',
      state: 'Dakar',
      postalCode: '11000',
      country: 'SN',
    },
    items,
    subtotal,
    shippingCost,
    paymentMethod: 'cod',
    currency: store.settings?.currency || 'XOF',
    notes: 'Commande de test — paiement à la livraison.',
  });
  console.log(`✓ Commande COD créée : ${order.orderNumber} (total ${order.total} ${order.currency})`);

  console.log(`→ Dispatch vers MogaDelivery (${store.integrations.delivery.provider})…`);
  const result = await dispatchOrder({ order, store });

  if (!result.ok) {
    console.error('✗ Dispatch ÉCHOUÉ :', result.error);
    process.exit(1);
  }
  if (result.alreadyDispatched) {
    console.log('↻ Déjà dispatchée (idempotent)');
  } else {
    console.log('✓ Dispatch OK');
    console.log('  externalId    :', result.result?.externalId);
    console.log('  externalStatus:', result.result?.externalStatus);
    console.log('  trackingUrl   :', result.result?.trackingUrl || '(none)');
    if (result.result?.raw) {
      console.log('  réponse Moga  :', JSON.stringify(result.result.raw).slice(0, 300));
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Dispatch test failed:', (err as Error).message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
