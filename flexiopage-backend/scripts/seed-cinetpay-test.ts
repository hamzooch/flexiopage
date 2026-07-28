/**
 * Seed: a minimal digital store + product wired for CinetPay sandbox testing.
 *
 * Physical stores are locked to COD in the routing matrix (country-routing.ts),
 * so a live CinetPay checkout only works on a digital store. This seed spins
 * one up with XOF currency + CI country so the CINETPAY_TEST_MODE routing
 * override picks CinetPay.
 *
 * Idempotent: re-running upserts the same slug so nothing multiplies in Mongo.
 *
 * Run:
 *   cd flexiopage-backend && npm run seed:cinetpay-test
 *
 * After seeding:
 *   Storefront   : http://localhost:3002/store/cinetpay-test
 *   Product page : http://localhost:3002/store/cinetpay-test/product/ebook-test-cinetpay
 *   Dashboard    : http://localhost:3002/login  (creds printed at end)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User.model';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';

const SELLER_EMAIL = 'cinetpay-seller@flexiopage.dev';
const SELLER_PASSWORD = 'Test1234!';
const STORE_SLUG = 'cinetpay-test';
const PRODUCT_SLUG = 'ebook-test-cinetpay';
const PRODUCT_PRICE = 500; // XOF — well above CinetPay's 100 XOF minimum

async function main(): Promise<void> {
  await connectDB();

  // ── Seller ───────────────────────────────────────────────────────
  let seller = await User.findOne({ email: SELLER_EMAIL });
  if (!seller) {
    const hash = await bcrypt.hash(SELLER_PASSWORD, 10);
    seller = await User.create({
      email: SELLER_EMAIL,
      password: hash,
      name: 'CinetPay Test Seller',
      role: 'seller',
      emailVerified: true,
    });
    console.log(`✓ Created seller ${SELLER_EMAIL}`);
  } else {
    console.log(`✓ Reusing seller ${SELLER_EMAIL}`);
  }

  // ── Store (digital / XOF / CI) ───────────────────────────────────
  let store = await Store.findOne({ slug: STORE_SLUG });
  if (!store) {
    store = await Store.create({
      ownerId: seller._id,
      name: 'CinetPay Test',
      slug: STORE_SLUG,
      subdomain: STORE_SLUG,
      storeType: 'digital',
      isPublished: true,
      settings: {
        currency: 'XOF',
        country: 'CI',
        language: 'fr',
      },
    });
    console.log(`✓ Created digital store ${STORE_SLUG} (XOF / CI)`);
  } else {
    // Force the fields we care about so a leftover store from another test
    // doesn't sabotage the CinetPay routing (e.g. wrong currency).
    store.storeType = 'digital';
    store.isPublished = true;
    store.settings = {
      ...(store.settings || {}),
      currency: 'XOF',
      country: 'CI',
      language: 'fr',
    };
    await store.save();
    console.log(`✓ Reusing store ${STORE_SLUG} (forced digital / XOF / CI)`);
  }

  // ── Digital product ──────────────────────────────────────────────
  let product = await Product.findOne({ storeId: store._id, slug: PRODUCT_SLUG });
  if (!product) {
    product = await Product.create({
      storeId: store._id,
      name: 'Ebook Test CinetPay',
      slug: PRODUCT_SLUG,
      description: 'Produit digital test pour valider le flow paiement CinetPay sandbox.',
      price: PRODUCT_PRICE,
      currency: 'XOF',
      isPublished: true,
      isDigital: true,
      digitalKind: 'download',
    });
    console.log(`✓ Created product ${PRODUCT_SLUG} (${PRODUCT_PRICE} XOF)`);
  } else {
    product.price = PRODUCT_PRICE;
    product.currency = 'XOF';
    product.isPublished = true;
    await product.save();
    console.log(`✓ Reusing product ${PRODUCT_SLUG} (${PRODUCT_PRICE} XOF)`);
  }

  console.log('');
  console.log('────────────────────────────────────────────────────────');
  console.log('  CINETPAY SANDBOX TEST — READY');
  console.log('────────────────────────────────────────────────────────');
  console.log(`  Seller email : ${SELLER_EMAIL}`);
  console.log(`  Seller pass  : ${SELLER_PASSWORD}`);
  console.log(`  Store URL    : http://localhost:3002/store/${STORE_SLUG}`);
  console.log(`  Product URL  : http://localhost:3002/store/${STORE_SLUG}/product/${PRODUCT_SLUG}`);
  console.log(`  Amount       : ${PRODUCT_PRICE} XOF`);
  console.log(`  Country      : CI (Côte d'Ivoire)`);
  console.log('────────────────────────────────────────────────────────');
  console.log('');
  console.log('  Next steps :');
  console.log('   1. Ensure .env contains:');
  console.log('        CINETPAY_API_KEY=<sk_... from Dashboard → API & sécurité>');
  console.log('        CINETPAY_API_PASSWORD=<Mot de passe API — same page>');
  console.log(`        CINETPAY_TEST_STORE_SLUG=${STORE_SLUG}`);
  console.log('        API_PUBLIC_URL=https://<ton-tunnel>.ngrok-free.app');
  console.log('      (SDK auto-detects sandbox/prod from the key prefix — no BASE_URL to set.)');
  console.log('      Only this specific store slug routes to CinetPay — all others');
  console.log('      keep their normal rail (Moneróo / Flutterwave).');
  console.log('   2. Restart the backend so env changes are picked up.');
  console.log('   3. Open the product URL, add to cart, checkout, pick CinetPay.');
  console.log('   4. Complete the sandbox payment in the CinetPay page.');
  console.log('   5. Watch backend logs — the webhook + verify should flip the');
  console.log('      order to paid within ~10s.');
  console.log('');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
