/**
 * One-off migration: pour chaque Store sans `markets[]`, créer un market
 * unique à partir de `settings.country` / `settings.currency` + transposer
 * l'`integrations.delivery` existant. Ce premier market devient `isDefault`
 * et préserve les credentials MogaDelivery déjà configurés.
 *
 * Why : on passe d'un modèle 1 boutique = 1 pays à 1 boutique = N marchés
 * (voir memory/mogadelivery-multi-pays-architecture.md). La conf legacy
 * `settings.country/currency` + `integrations.delivery` reste en place comme
 * fallback ; ce script aligne l'existant sur le nouveau format sans rien
 * supprimer.
 *
 * Idempotent : un Store qui a déjà `markets.length > 0` est ignoré.
 *
 * Run :
 *   npm run migrate:stores-to-markets             # écrit en base
 *   npm run migrate:stores-to-markets -- --dry-run
 *
 * En prod sur le VPS :
 *   docker compose -f /opt/flexiopage/docker-compose.prod.yml \
 *     exec backend npm run migrate:stores-to-markets
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Store } from '../src/models/Store.model';

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  await connectDB();

  const stores = await Store.find({
    $or: [{ markets: { $exists: false } }, { markets: { $size: 0 } }],
  });

  if (stores.length === 0) {
    console.log('✓ Rien à migrer — toutes les boutiques ont déjà un markets[].');
    await mongoose.disconnect();
    return;
  }

  console.log(`Trouvé ${stores.length} boutique(s) sans markets[].\n`);

  let updated = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const s of stores) {
    const country = (s.settings?.country || '').toUpperCase();
    const currency = (s.settings?.currency || '').toUpperCase();

    if (!country) {
      skipped.push({ id: String(s._id), reason: 'settings.country manquant' });
      continue;
    }
    if (!currency) {
      skipped.push({ id: String(s._id), reason: 'settings.currency manquant' });
      continue;
    }

    const legacyDelivery = s.integrations?.delivery;
    const market = {
      country,
      currency,
      isDefault: true,
      enabled: true,
      delivery: legacyDelivery?.provider
        ? {
            provider: legacyDelivery.provider,
            storeIdMD: undefined as string | undefined,
            webhookSecret: legacyDelivery.webhookSecret,
            boutiqueIdMD: undefined as string | undefined,
            baseUrl: legacyDelivery.baseUrl,
            enabled: legacyDelivery.enabled !== false,
          }
        : undefined,
      shippingFee: s.settings?.codForm?.shippingFee ?? 0,
    };

    if (DRY_RUN) {
      console.log(`  · [dry-run] ${s._id}  ${s.name}  → market ${country}/${currency}`);
      continue;
    }

    s.markets = [market];
    await s.save();
    updated += 1;
    console.log(`  ✓ ${s._id}  ${s.name}  → market ${country}/${currency}`);
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] ${stores.length - skipped.length} boutique(s) seraient migrées.`);
  } else {
    console.log(`\n✓ Migré ${updated} boutique(s).`);
  }
  if (skipped.length > 0) {
    console.log(`\n⚠ Sauté ${skipped.length} boutique(s) :`);
    for (const s of skipped) console.log(`  · ${s.id}  (${s.reason})`);
    console.log('\nRenseigne settings.country/currency puis relance.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', (err as Error).message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
