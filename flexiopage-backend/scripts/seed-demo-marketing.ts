/**
 * Seed « démo marketing » — peuple un compte vendeur avec des données
 * réalistes et impressionnantes pour capturer des screenshots destinés
 * à la landing page + campagnes Facebook Ads.
 *
 * Ce qu'on crée :
 *   - 1 utilisateur (demo-vendor@flexiopage.dev / Demo2026!)
 *   - 1 boutique « Digital Business Pro »
 *   - 12 produits digitaux (formations, e-books, templates)
 *   - 480+ commandes payées réparties sur 30 jours (courbe croissante)
 *   - Répartition Wave 45% / OM 30% / MTN 15% / Moov 5% / Card 5%
 *   - Notifications push simulées (à déclencher manuellement pour screenshot)
 *
 * Idempotent : ré-exécution nettoie et recrée le tout. N'affecte AUCUN
 * autre compte / store de la DB.
 *
 * Lancer :
 *   cd /opt/flexiopage
 *   docker compose -f docker-compose.prod.yml exec backend \
 *     node -r ts-node/register scripts/seed-demo-marketing.ts
 *
 * OU en local dev :
 *   cd flexiopage-backend && npx tsx scripts/seed-demo-marketing.ts
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User.model';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';
import { Order } from '../src/models/Order.model';
import { PaymentLog } from '../src/models/PaymentLog.model';
import { Wallet } from '../src/models/Wallet.model';

const SELLER_EMAIL = 'demo-vendor@flexiopage.dev';
const SELLER_PASSWORD = 'Demo2026!';
const SELLER_NAME = 'Aïcha Konaté';
const STORE_SLUG = 'digital-business-pro';
const STORE_NAME = 'Digital Business Pro';

/** Produits digitaux avec des titres qui parlent au marché francophone africain. */
const PRODUCTS = [
  {
    name: 'Formation Dropshipping CI 2026 — De 0 à 500K FCFA/mois',
    slug: 'formation-dropshipping-ci-2026',
    price: 14990,
    compareAtPrice: 29990,
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=800&fit=crop',
    description: 'Méthode pas-à-pas pour lancer ta boutique en Côte d\'Ivoire, Sénégal, Mali, Burkina — même sans capital de départ.',
  },
  {
    name: 'Pack 200 produits gagnants pour Wave / Orange Money',
    slug: 'pack-200-produits-gagnants',
    price: 9990,
    compareAtPrice: 19990,
    image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&h=800&fit=crop',
    description: '200 produits validés sur le marché francophone africain avec fournisseurs Alibaba, marges nettes calculées.',
  },
  {
    name: 'Meta Ads Blueprint — Campagnes rentables au 1er essai',
    slug: 'meta-ads-blueprint',
    price: 19990,
    compareAtPrice: 39990,
    image: 'https://images.unsplash.com/photo-1611926653458-09294b3142bf?w=800&h=800&fit=crop',
    description: 'Le playbook des Meta Ads pour l\'Afrique de l\'Ouest — audiences, créatifs, budgets optimisés pour le CPA local.',
  },
  {
    name: 'E-book — Réussir avec le CBD au Sénégal',
    slug: 'ebook-cbd-senegal',
    price: 4990,
    compareAtPrice: 9990,
    image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=800&h=800&fit=crop',
    description: 'Guide pratique de A à Z pour démarrer ton business CBD légalement.',
  },
  {
    name: 'Pack Templates Instagram Ads (100 designs Canva)',
    slug: 'pack-templates-instagram',
    price: 6990,
    compareAtPrice: 14990,
    image: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&h=800&fit=crop',
    description: '100 templates Canva prêts à personnaliser en 2 clics, spécial marché africain.',
  },
  {
    name: 'Bot ChatGPT Vendeur — Réponds à tes clients 24/7',
    slug: 'bot-chatgpt-vendeur',
    price: 24990,
    compareAtPrice: 49990,
    image: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&h=800&fit=crop',
    description: 'Setup pas-à-pas pour connecter ton bot ChatGPT à WhatsApp + Messenger + ton storefront.',
  },
  {
    name: 'Masterclass — Trouver des fournisseurs Alibaba fiables',
    slug: 'masterclass-fournisseurs-alibaba',
    price: 12990,
    compareAtPrice: 24990,
    image: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&h=800&fit=crop',
    description: '3h de vidéos pour identifier les fournisseurs sérieux, négocier les prix et sécuriser tes paiements.',
  },
  {
    name: 'Kit Complet Lancement E-commerce (checklist + calculs)',
    slug: 'kit-lancement-ecommerce',
    price: 4990,
    compareAtPrice: 9990,
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=800&fit=crop',
    description: 'Checklist des 47 étapes pour un lancement de boutique réussi + calculateur de rentabilité.',
  },
  {
    name: 'Copywriting pour Landing Pages qui Convertissent',
    slug: 'copywriting-landing-pages',
    price: 8990,
    compareAtPrice: 17990,
    image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=800&fit=crop',
    description: 'Formation copywriting orientée conversion pour le public francophone africain.',
  },
  {
    name: 'Guide TikTok Ads — Génère du trafic à moins de 50F le clic',
    slug: 'guide-tiktok-ads',
    price: 11990,
    compareAtPrice: 22990,
    image: 'https://images.unsplash.com/photo-1596558450268-9c27524ba856?w=800&h=800&fit=crop',
    description: 'Blueprint TikTok Ads pour toucher les jeunes acheteurs africains à coût dérisoire.',
  },
  {
    name: 'Business Plan Pré-rempli (12 modèles secteurs)',
    slug: 'business-plan-preremplis',
    price: 3990,
    compareAtPrice: 7990,
    image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=800&fit=crop',
    description: '12 business plans templates (dropshipping, resto, boutique, e-commerce…) pour ton dossier banque / mobile money.',
  },
  {
    name: 'Formation Wave Business — Encaisse en toute sécurité',
    slug: 'formation-wave-business',
    price: 7990,
    compareAtPrice: 15990,
    image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=800&fit=crop',
    description: 'Setup compte Wave Business + intégration checkout + astuces pour éviter les blocages.',
  },
];

/** Prénoms + noms francophones africains pour des acheteurs crédibles. */
const FIRST_NAMES = [
  'Aïssatou', 'Mamadou', 'Fatou', 'Ibrahim', 'Awa', 'Ousmane', 'Mariam', 'Cheikh',
  'Aminata', 'Souleymane', 'Adama', 'Moussa', 'Rokhaya', 'Boubacar', 'Khady', 'Amadou',
  'Fatima', 'Mohamed', 'Nafissatou', 'Ndeye', 'Djibril', 'Bineta', 'Alioune', 'Ramatoulaye',
  'Modou', 'Sokhna', 'Serigne', 'Coumba', 'Papa', 'Yacine', 'Assane', 'Aida',
];
const LAST_NAMES = [
  'Diallo', 'Ndiaye', 'Fall', 'Sarr', 'Cissé', 'Ba', 'Sy', 'Diop',
  'Traoré', 'Kone', 'Konaté', 'Camara', 'Bâ', 'Sané', 'Faye', 'Gueye',
  'Diarra', 'Coulibaly', 'Sylla', 'Doumbia', 'Touré', 'Kaba', 'Diakité', 'Sissoko',
];

/** Répartition des méthodes de paiement — Wave domine largement en CI/SN/ML. */
const PAYMENT_METHODS: Array<{ method: string; weight: number; provider: string }> = [
  { method: 'WAVE',   weight: 45, provider: 'cinetpay' },
  { method: 'OM',     weight: 30, provider: 'cinetpay' },
  { method: 'MTN',    weight: 15, provider: 'cinetpay' },
  { method: 'MOOV',   weight:  5, provider: 'cinetpay' },
  { method: 'VISA',   weight:  5, provider: 'cinetpay' },
];

const TOTAL_WEIGHT = PAYMENT_METHODS.reduce((s, m) => s + m.weight, 0);
function pickMethod(): { method: string; provider: string } {
  const r = Math.random() * TOTAL_WEIGHT;
  let acc = 0;
  for (const m of PAYMENT_METHODS) {
    acc += m.weight;
    if (r < acc) return { method: m.method, provider: m.provider };
  }
  return PAYMENT_METHODS[0];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBuyerEmail(first: string, last: string): string {
  const clean = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const domains = ['gmail.com', 'yahoo.fr', 'hotmail.com', 'outlook.com', 'orange.sn', 'orange.ci'];
  const suffix = Math.floor(Math.random() * 900) + 10;
  return `${clean(first)}.${clean(last)}${suffix}@${pick(domains)}`;
}

function randomPhone(): string {
  const prefixes = ['+22507', '+22106', '+2216', '+22370', '+22677', '+22879'];
  const rest = String(Math.floor(Math.random() * 90_000_000) + 10_000_000);
  return pick(prefixes) + rest;
}

/**
 * Distribution des commandes sur 30 jours avec une courbe croissante
 * (mimique du "growth" que tu veux montrer sur la landing).
 * Jour 0 (il y a 30j) : ~5 orders. Jour 29 (aujourd'hui) : ~35 orders.
 */
function ordersPerDay(dayIndex: number): number {
  const base = 5 + dayIndex * 1.1; // 5 → ~37
  const jitter = (Math.random() - 0.5) * 6;
  const weekend = (dayIndex + 5) % 7 < 2 ? 1.3 : 1; // vendredi-samedi boost
  return Math.max(1, Math.round((base + jitter) * weekend));
}

async function main() {
  console.log('\n🎬 Seed démo marketing — démarrage…\n');
  await connectDB();

  // 1) User -----------------------------------------------------------
  let user = await User.findOne({ email: SELLER_EMAIL });
  if (user) {
    console.log('👤 User existe déjà — cleanup des données précédentes…');
    const oldStores = await Store.find({ ownerId: user._id }).select('_id').lean();
    const oldStoreIds = oldStores.map((s) => s._id);
    if (oldStoreIds.length) {
      await Product.deleteMany({ storeId: { $in: oldStoreIds } });
      await Order.deleteMany({ storeId: { $in: oldStoreIds } });
      await PaymentLog.deleteMany({ storeId: { $in: oldStoreIds } });
      await Store.deleteMany({ _id: { $in: oldStoreIds } });
    }
    await Wallet.deleteOne({ userId: user._id });
    // Mise à jour du password au cas où
    user.password = await bcrypt.hash(SELLER_PASSWORD, 10);
    user.name = SELLER_NAME;
    user.emailVerified = true;
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    console.log('👤 Création du user vendeur démo…');
    user = await User.create({
      email: SELLER_EMAIL,
      password: await bcrypt.hash(SELLER_PASSWORD, 10),
      name: SELLER_NAME,
      role: 'user',
      emailVerified: true,
      lastLoginAt: new Date(),
    });
  }

  // 2) Store ----------------------------------------------------------
  console.log('🏪 Création de la boutique démo…');
  const store = await Store.create({
    ownerId: user._id,
    name: STORE_NAME,
    slug: STORE_SLUG,
    subdomain: STORE_SLUG,
    storeType: 'digital',
    description: 'Formations, e-books et outils digitaux pour entrepreneurs francophones africains.',
    logo: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=200&h=200&fit=crop',
    theme: { templateId: 'atelier' },
    settings: {
      currency: 'XOF',
      country: 'CI',
      language: 'fr',
    },
    isPublished: true,
  });
  console.log(`  → /store/${store.slug}`);

  // 3) Products -------------------------------------------------------
  console.log(`📦 Création de ${PRODUCTS.length} produits digitaux…`);
  const createdProducts = await Promise.all(
    PRODUCTS.map((p) =>
      Product.create({
        storeId: store._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        type: 'digital',
        digitalKind: 'download',
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        images: [p.image],
        isPublished: true,
        // Assets fictifs pour que hasDigitalContent() passe
        digitalAssets: [{
          id: 'demo-asset-1',
          name: 'Contenu principal.pdf',
          url: 'https://example.com/demo.pdf',
          kind: 'file',
          order: 0,
        }],
        accessType: 'lifetime',
        downloadLimit: 0,
      }),
    ),
  );
  console.log(`  → ${createdProducts.length} produits publiés`);

  // 4) Orders + PaymentLogs ------------------------------------------
  console.log('🛒 Création des commandes payées sur 30 jours…');
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  let orderCount = 0;
  let orderNumber = 1000;
  const orders: unknown[] = [];
  const paymentLogs: unknown[] = [];

  for (let day = 0; day < 30; day++) {
    const daysAgo = 29 - day;
    const count = ordersPerDay(day);
    for (let i = 0; i < count; i++) {
      const product = pick(createdProducts);
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const method = pickMethod();
      const createdAt = new Date(now - daysAgo * oneDay - Math.floor(Math.random() * oneDay));
      const orderNumStr = `ORD-${++orderNumber}`;
      const orderId = new mongoose.Types.ObjectId();
      const reference = 'demo_' + Math.random().toString(36).slice(2, 18);
      orders.push({
        _id: orderId,
        storeId: store._id,
        orderNumber: orderNumStr,
        email: randomBuyerEmail(first, last),
        customerName: `${first} ${last}`,
        customerPhone: randomPhone(),
        customerWhatsapp: randomPhone(),
        items: [{
          productId: product._id,
          name: product.name,
          quantity: 1,
          price: product.price,
        }],
        subtotal: product.price,
        shippingCost: 0,
        tax: 0,
        discount: 0,
        total: product.price,
        currency: 'XOF',
        marketCountry: 'CI',
        paymentStatus: 'paid',
        paymentMethod: method.method === 'VISA' ? 'card' : 'mobile_money',
        paymentProvider: method.provider,
        paymentReference: reference,
        fulfillmentStatus: 'fulfilled',
        downloadToken: Math.random().toString(36).slice(2, 24),
        downloadExpiresAt: new Date(createdAt.getTime() + 30 * oneDay),
        createdAt,
        updatedAt: createdAt,
      });
      paymentLogs.push({
        orderId,
        storeId: store._id,
        gateway: 'cinetpay',
        reference,
        event: 'webhook',
        status: 'paid',
        signatureValid: true,
        rawPayload: {
          code: 100,
          country: 'CI',
          currency: 'XOF',
          merchant_transaction_id: String(orderId),
          payment_method: method.method,
          amount: product.price,
          status: 200,
          transaction_id: reference,
        },
        createdAt,
      });
      orderCount++;
    }
  }

  await Order.insertMany(orders);
  await PaymentLog.insertMany(paymentLogs);
  console.log(`  → ${orderCount} commandes payées créées`);

  // 5) Wallet + revenue --------------------------------------------
  const totalRevenue = orders.reduce((s, o) => s + (o as { total: number }).total, 0);
  const commissionRate = Number(process.env.COMMISSION_RATE || 0.015);
  const commission = Math.round(totalRevenue * commissionRate);
  const payoutBalance = totalRevenue - commission;
  console.log('💰 Wallet du vendeur…');
  await Wallet.create({
    userId: user._id,
    currency: 'XOF',
    balance: 0,
    aiBalance: 500, // quelques tokens IA pour la démo
    aiBalanceUnit: 'tokens',
    payoutBalance,
    transactions: [{
      id: `demo-${Date.now()}`,
      kind: 'sale_credit',
      bucket: 'payout',
      amount: payoutBalance,
      balanceAfter: payoutBalance,
      note: 'Solde consolidé des ventes en ligne (démo)',
      createdAt: new Date(),
    }],
  });
  console.log(`  → Payout balance : ${payoutBalance.toLocaleString()} XOF`);

  // 6) Print summary --------------------------------------------
  console.log('\n' + '━'.repeat(60));
  console.log('✅ Seed démo terminé !\n');
  console.log('👤 Compte vendeur :');
  console.log(`   Email     : ${SELLER_EMAIL}`);
  console.log(`   Password  : ${SELLER_PASSWORD}`);
  console.log('');
  console.log('🏪 Boutique publique :');
  console.log(`   Storefront : https://flexiopage.com/store/${STORE_SLUG}`);
  console.log('');
  console.log('📊 Chiffres pour tes screenshots :');
  console.log(`   Commandes    : ${orderCount}`);
  console.log(`   Revenu total : ${totalRevenue.toLocaleString()} XOF`);
  console.log(`   À reverser   : ${payoutBalance.toLocaleString()} XOF (après commission ${(commissionRate * 100).toFixed(1)}%)`);
  console.log('');
  console.log('📸 Écrans à screenshot :');
  console.log('   1. Dashboard vendeur  : /dashboard (revenus + graph + notifs)');
  console.log('   2. Storefront produit : /store/' + STORE_SLUG + '/product/formation-dropshipping-ci-2026');
  console.log('   3. Checkout           : /store/' + STORE_SLUG + '/checkout/formation-dropshipping-ci-2026');
  console.log('   4. Analytics store    : /dashboard/analytics');
  console.log('   5. Earnings vendeur   : /dashboard/earnings');
  console.log('');
  console.log('💡 Pour re-générer avec des nouvelles données : relance ce script.');
  console.log('━'.repeat(60) + '\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('💥 Erreur seed :', err);
  process.exit(1);
});
