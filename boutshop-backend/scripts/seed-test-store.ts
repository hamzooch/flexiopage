/**
 * Seed: a fully-configured test boutique for the MogaDelivery integration.
 *
 *   - 1 seller (test-seller@boutshop.dev / Test1234!)
 *   - 1 published store with the "atelier" theme, FR-fr, currency XOF, country SN
 *   - integrations.delivery = mogadelivery, autoDispatch=true, with a pickup
 *     address. webhookSecret comes from BOUTSHOP_WEBHOOK_SECRET (env) — the
 *     same value MogaDelivery uses to verify our X-Boutshop-Signature.
 *   - 8 physical products with SKU + stock + variants + images
 *
 * Idempotent: re-running cleans the previous test store and recreates it from
 * scratch. Existing other stores are untouched.
 *
 * Run:
 *   cd boutshop-backend && npm run seed:test-store
 *
 * After seeding:
 *   - Storefront:    http://localhost:3000/store/boutique-test
 *   - Dashboard:     http://localhost:3000/login  (creds printed at end)
 *   - Test dispatch: npm run dispatch:test-order
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User.model';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';
import { Order } from '../src/models/Order.model';
import { Customer } from '../src/models/Customer.model';

const SELLER_EMAIL = 'test-seller@boutshop.dev';
const SELLER_PASSWORD = 'Test1234!';
const STORE_SLUG = 'boutique-test';
const STORE_SUBDOMAIN = 'boutique-test';

/**
 * Realistic catalogue mixing fashion, beauty and electronics so we can
 * exercise different SKUs / variants / weight units against MogaDelivery.
 * Image URLs use Unsplash's CDN (stable, no API key required).
 */
const PRODUCTS = [
  {
    name: 'Caftan Brodé Marrakech',
    slug: 'caftan-brode-marrakech',
    description:
      'Caftan en soie brodée à la main, finitions dorées. Coupe ample, idéal pour les occasions.',
    price: 45000,
    compareAtPrice: 60000,
    sku: 'BS-CAFTAN-MAR-001',
    stock: 24,
    weight: 0.6,
    weightUnit: 'kg',
    images: [
      'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=1200',
      'https://images.unsplash.com/photo-1581338834647-b0fb40704e21?w=1200',
    ],
    variants: [
      { name: 'S', sku: 'BS-CAFTAN-MAR-001-S', price: 45000, stock: 6 },
      { name: 'M', sku: 'BS-CAFTAN-MAR-001-M', price: 45000, stock: 8 },
      { name: 'L', sku: 'BS-CAFTAN-MAR-001-L', price: 45000, stock: 6 },
      { name: 'XL', sku: 'BS-CAFTAN-MAR-001-XL', price: 45000, stock: 4 },
    ],
  },
  {
    name: 'Sac à main cuir Sahel',
    slug: 'sac-cuir-sahel',
    description:
      'Sac à main en cuir véritable tanné au Sahel. Bandoulière ajustable, doublure coton.',
    price: 28000,
    sku: 'BS-BAG-SAHEL-002',
    stock: 18,
    weight: 0.9,
    weightUnit: 'kg',
    images: [
      'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=1200',
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=1200',
    ],
  },
  {
    name: 'Argan Pure Oil 100ml',
    slug: 'argan-pure-oil',
    description:
      "Huile d'argan pressée à froid. 100% pure, idéale cheveux, peau et ongles.",
    price: 8500,
    sku: 'BS-ARGAN-100-003',
    stock: 60,
    weight: 0.15,
    weightUnit: 'kg',
    images: [
      'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=1200',
    ],
  },
  {
    name: 'Parfum Ambre Désert 50ml',
    slug: 'parfum-ambre-desert',
    description:
      'Eau de parfum aux notes ambrées et boisées. Tenue 8h. Flacon en verre.',
    price: 32000,
    sku: 'BS-PARFUM-AMBRE-004',
    stock: 30,
    weight: 0.3,
    weightUnit: 'kg',
    images: [
      'https://images.unsplash.com/photo-1541643600914-78b084683601?w=1200',
    ],
  },
  {
    name: 'Casque Bluetooth Volt Pro',
    slug: 'casque-bluetooth-volt-pro',
    description:
      'Casque sans fil avec réduction de bruit active. Autonomie 30h. USB-C.',
    price: 65000,
    compareAtPrice: 85000,
    sku: 'BS-AUDIO-VOLT-005',
    stock: 12,
    weight: 0.32,
    weightUnit: 'kg',
    images: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200',
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=1200',
    ],
    variants: [
      { name: 'Noir', sku: 'BS-AUDIO-VOLT-005-BLK', price: 65000, stock: 7 },
      { name: 'Beige', sku: 'BS-AUDIO-VOLT-005-BEI', price: 65000, stock: 5 },
    ],
  },
  {
    name: 'Montre cuir Atlas',
    slug: 'montre-cuir-atlas',
    description:
      "Montre analogique avec bracelet cuir, mouvement quartz japonais, étanche 5 ATM.",
    price: 38000,
    sku: 'BS-WATCH-ATLAS-006',
    stock: 22,
    weight: 0.18,
    weightUnit: 'kg',
    images: [
      'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=1200',
    ],
  },
  {
    name: 'Théière en argent ciselé',
    slug: 'theiere-argent-ciselee',
    description:
      'Théière marocaine traditionnelle en métal argenté ciselé à la main. Capacité 1L.',
    price: 22000,
    sku: 'BS-HOME-THE-007',
    stock: 14,
    weight: 1.2,
    weightUnit: 'kg',
    images: [
      'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=1200',
    ],
  },
  {
    name: 'Bracelet perles Tuareg',
    slug: 'bracelet-perles-tuareg',
    description:
      "Bracelet en perles d'argent et cuir tressé fait main par les artisans Tuareg.",
    price: 12000,
    sku: 'BS-JEWEL-TUAREG-008',
    stock: 35,
    weight: 0.05,
    weightUnit: 'kg',
    images: [
      'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=1200',
    ],
  },
] as const;

async function main(): Promise<void> {
  await connectDB();
  console.log('Connected to MongoDB');

  // ─── Seller ──────────────────────────────────────────────────────────
  let seller = await User.findOne({ email: SELLER_EMAIL });
  if (!seller) {
    const hash = await bcrypt.hash(SELLER_PASSWORD, 10);
    seller = await User.create({
      email: SELLER_EMAIL,
      password: hash,
      name: 'Vendeur Test',
      role: 'user',
      emailVerified: true,
    });
    console.log(`✓ Vendeur créé : ${SELLER_EMAIL}`);
  } else {
    console.log(`✓ Vendeur existant : ${SELLER_EMAIL}`);
  }

  // ─── Reset previous test store (idempotent) ──────────────────────────
  const previous = await Store.findOne({ slug: STORE_SLUG });
  if (previous) {
    const prevId = previous._id;
    await Promise.all([
      Product.deleteMany({ storeId: prevId }),
      Order.deleteMany({ storeId: prevId }),
      Customer.deleteMany({ storeId: prevId }),
      Store.deleteOne({ _id: prevId }),
    ]);
    console.log('✓ Boutique précédente supprimée (produits, commandes, clients)');
  }

  // ─── Store ───────────────────────────────────────────────────────────
  const webhookSecret =
    process.env.BOUTSHOP_WEBHOOK_SECRET ||
    'dev-secret-change-me-' + Math.random().toString(36).slice(2, 18);

  const store = await Store.create({
    ownerId: seller._id,
    name: 'Boutique Test',
    slug: STORE_SLUG,
    subdomain: STORE_SUBDOMAIN,
    storeType: 'physical',
    description:
      'Boutique de démonstration FlexioPage ↔ MogaDelivery — produits artisanaux et tech.',
    settings: {
      currency: 'XOF',
      country: 'SN',
      timezone: 'Africa/Dakar',
      language: 'fr',
      direction: 'ltr',
      seoTitle: 'Boutique Test — FlexioPage',
      seoDescription:
        'Caftans, parfums, audio et artisanat. Livraison en Afrique de l’Ouest et Maghreb. Paiement à la livraison.',
    },
    theme: {
      templateId: 'atelier',
      primary: '#1c1917',
      accent: '#a16207',
      background: '#fafaf6',
      foreground: '#1c1917',
    },
    integrations: {
      delivery: {
        provider: 'mogadelivery',
        enabled: true,
        autoDispatch: true,
        webhookSecret,
        pickupAddress: {
          contactName: 'Boutique Test',
          contactPhone: '+221770000000',
          line1: '12 Rue Félix Faure',
          line2: 'Plateau',
          city: 'Dakar',
          state: 'Dakar',
          postalCode: '11000',
          country: 'SN',
        },
      },
    },
    isPublished: true,
  });
  console.log(`✓ Boutique créée : ${store.name} (slug=${store.slug})`);

  // ─── Products ────────────────────────────────────────────────────────
  for (const p of PRODUCTS) {
    await Product.create({
      storeId: store._id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      type: 'physical',
      price: p.price,
      compareAtPrice: 'compareAtPrice' in p ? p.compareAtPrice : undefined,
      sku: p.sku,
      stock: p.stock,
      trackInventory: true,
      allowBackorder: false,
      variants: ('variants' in p ? p.variants : []) as unknown as object[],
      images: [...p.images],
      weight: p.weight,
      weightUnit: p.weightUnit,
      isPublished: true,
    });
  }
  console.log(`✓ ${PRODUCTS.length} produits physiques créés`);

  // ─── Recap ───────────────────────────────────────────────────────────
  const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5000').replace(/\/$/, '');
  const frontBase = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

  console.log('\n────────────────────────────────────────────────────────');
  console.log('  ✅  SEED TERMINÉ');
  console.log('────────────────────────────────────────────────────────');
  console.log('  Vendeur (login dashboard) :');
  console.log(`    email    : ${SELLER_EMAIL}`);
  console.log(`    password : ${SELLER_PASSWORD}`);
  console.log('');
  console.log('  Boutique :');
  console.log(`    storeId      : ${store._id.toString()}`);
  console.log(`    storefront   : ${frontBase}/store/${store.slug}`);
  console.log(`    dashboard    : ${frontBase}/dashboard`);
  console.log(`    products API : ${apiBase}/api/public/stores/${store.slug}/products`);
  console.log('');
  console.log('  MogaDelivery :');
  console.log(`    store_id à donner au vendeur côté Moga : ${store._id.toString()}`);
  console.log(`    webhookSecret (à partager avec Moga)   : ${webhookSecret}`);
  console.log(`    autoDispatch                            : ON (paid order → POST vers Moga)`);
  console.log('────────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
