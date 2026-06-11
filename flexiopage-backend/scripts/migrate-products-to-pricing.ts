/**
 * One-off migration: pour chaque Product sans `pricing[]`, créer une entrée
 * pricing à partir du prix/stock racine + du market par défaut de la boutique
 * parente (Store.markets[isDefault] → fallback settings.country/currency).
 *
 * Why : complément à migrate-stores-to-markets. Une fois que chaque Store a
 * un markets[0], on aligne ses produits sur le premier pays — comme ça la
 * lecture côté storefront peut directement passer en mode pricing[country]
 * sans casser les boutiques existantes. Champs racine `price/compareAtPrice/
 * stock` restent en place comme fallback.
 *
 * Idempotent : un Product qui a déjà `pricing.length > 0` est ignoré.
 *
 * Run :
 *   npm run migrate:products-to-pricing
 *   npm run migrate:products-to-pricing -- --dry-run
 *
 * À lancer APRÈS migrate:stores-to-markets.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  await connectDB();

  const products = await Product.find({
    $or: [{ pricing: { $exists: false } }, { pricing: { $size: 0 } }],
  });

  if (products.length === 0) {
    console.log('✓ Rien à migrer — tous les produits ont déjà un pricing[].');
    await mongoose.disconnect();
    return;
  }

  console.log(`Trouvé ${products.length} produit(s) sans pricing[].\n`);

  // Cache (country, currency) par storeId pour éviter N lookups.
  const storeCache = new Map<string, { country: string; currency: string } | null>();

  async function resolveStoreMarket(
    storeId: mongoose.Types.ObjectId
  ): Promise<{ country: string; currency: string } | null> {
    const key = String(storeId);
    if (storeCache.has(key)) return storeCache.get(key) ?? null;
    const store = await Store.findById(storeId).lean();
    if (!store) {
      storeCache.set(key, null);
      return null;
    }
    const def =
      store.markets?.find((m) => m.isDefault) || store.markets?.[0] || null;
    const country = (def?.country || store.settings?.country || '').toUpperCase();
    const currency = (def?.currency || store.settings?.currency || '').toUpperCase();
    const resolved = country && currency ? { country, currency } : null;
    storeCache.set(key, resolved);
    return resolved;
  }

  let updated = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const p of products) {
    const market = await resolveStoreMarket(p.storeId);
    if (!market) {
      skipped.push({
        id: String(p._id),
        reason: 'store sans market par défaut ni settings.country/currency',
      });
      continue;
    }

    const pricing = {
      country: market.country,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      currency: market.currency,
      stock: p.stock || 0,
      available: true,
    };

    if (DRY_RUN) {
      console.log(
        `  · [dry-run] ${p._id}  ${p.name}  → pricing ${market.country} = ${pricing.price} ${market.currency}`
      );
      continue;
    }

    p.pricing = [pricing];
    await p.save();
    updated += 1;
    console.log(
      `  ✓ ${p._id}  ${p.name}  → pricing ${market.country} = ${pricing.price} ${market.currency}`
    );
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] ${products.length - skipped.length} produit(s) seraient migrés.`);
  } else {
    console.log(`\n✓ Migré ${updated} produit(s).`);
  }
  if (skipped.length > 0) {
    console.log(`\n⚠ Sauté ${skipped.length} produit(s) :`);
    for (const s of skipped) console.log(`  · ${s.id}  (${s.reason})`);
    console.log('\nLance d\'abord migrate:stores-to-markets, puis relance.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', (err as Error).message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
