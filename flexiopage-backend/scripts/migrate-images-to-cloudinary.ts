/**
 * Migration one-shot : ré-uploade les images legacy vers Cloudinary.
 *
 * Cible :
 *   - Product.images[]  (toutes les photos produit)
 *   - Store.logo        (logo de chaque boutique)
 *   - Store.favicon     (favicon de chaque boutique)
 *   - Collection.image  (image de couverture des collections)
 *
 * Pipeline pour chaque URL :
 *   1. Skip si déjà `res.cloudinary.com` (idempotent).
 *   2. Résout l'URL (locale `/uploads/*` → API_URL + path).
 *   3. fetch → buffer.
 *   4. `storage.service.uploadFile` (sharp resize + Cloudinary upload).
 *   5. Remplace l'URL dans le document.
 *   6. Save.
 *
 * Modes :
 *   • Dry-run (défaut) : compte ce qui serait migré, ne touche rien.
 *   • Commit           : effectue vraiment. Passer `--commit`.
 *
 * Args optionnels :
 *   --commit           Applique les changements (sinon dry-run).
 *   --target=<name>    products | stores | collections | all (défaut all).
 *   --limit=N          Traite au plus N docs par target (utile pour tests).
 *   --sleep=MS         Pause entre uploads pour éviter rate-limit (défaut 100).
 *
 * Exemples :
 *   npx tsx scripts/migrate-images-to-cloudinary.ts                   # dry-run tout
 *   npx tsx scripts/migrate-images-to-cloudinary.ts --target=products --limit=3
 *   npx tsx scripts/migrate-images-to-cloudinary.ts --commit
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Product } from '../src/models/Product.model';
import { Store } from '../src/models/Store.model';
import { Collection } from '../src/models/Collection.model';
import { uploadFile } from '../src/services/storage.service';

// ── Args parsing ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const commit = args.includes('--commit');
const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1] || 'all';
const limitArg = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || 0;
const sleepMs = Number(args.find((a) => a.startsWith('--sleep='))?.split('=')[1]) || 100;

const targets = new Set(
  targetArg === 'all' ? ['products', 'stores', 'collections'] : [targetArg],
);

// ── Helpers ────────────────────────────────────────────────────────
async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True si l'URL est déjà sur Cloudinary → skip. */
function isCloudinaryUrl(url: string): boolean {
  return /res\.cloudinary\.com/.test(url);
}

/** Résout `/uploads/xxx` → `https://api.flexiopage.com/uploads/xxx`.
 *  Les URLs absolues (http/https) sont retournées telles quelles. */
function resolveUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const apiBase = (process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051').replace(/\/$/, '');
  return `${apiBase}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

interface Stats { total: number; migrated: number; skipped: number; failed: number }

/** Migre une URL image : fetch → upload Cloudinary. Retourne la nouvelle URL
 *  ou null si skip (Cloudinary déjà ou URL vide), ou throw sur erreur réelle. */
async function migrateOne(rawUrl: string, folder: string): Promise<string | null> {
  if (!rawUrl || isCloudinaryUrl(rawUrl)) return null;
  const abs = resolveUrl(rawUrl);
  if (!abs) return null;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`fetch ${abs} → HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  // Nom fichier basé sur la fin de l'URL originale (juste esthétique — Cloudinary
  // ajoute son propre suffixe aléatoire de toute façon via `safeName` interne).
  const filename = abs.split('/').pop()?.split('?')[0] || 'legacy.jpg';
  const upload = await uploadFile(buffer, filename, folder, mimeType, 'media');
  return upload.url;
}

// ── Migrations par modèle ──────────────────────────────────────────

async function migrateProducts(): Promise<Stats> {
  const stats: Stats = { total: 0, migrated: 0, skipped: 0, failed: 0 };
  const query = Product.find({ images: { $exists: true, $ne: [] } });
  if (limitArg) query.limit(limitArg);
  const cursor = query.cursor();

  for await (const product of cursor) {
    const before: string[] = product.images || [];
    const after: string[] = [];
    let touched = false;
    for (const url of before) {
      stats.total++;
      if (!url) { after.push(url); continue; }
      if (isCloudinaryUrl(url)) { after.push(url); stats.skipped++; continue; }
      if (!commit) {
        after.push(url);
        stats.migrated++;
        console.log(`  [dry] product ${product._id} img: ${url.slice(0, 80)}`);
        continue;
      }
      try {
        const newUrl = await migrateOne(url, `products/${product._id}`);
        if (newUrl) {
          after.push(newUrl);
          touched = true;
          stats.migrated++;
          console.log(`  ✓ product ${product._id}: ${url.slice(0, 60)} → ${newUrl.slice(0, 60)}`);
          await sleep(sleepMs);
        } else {
          after.push(url);
          stats.skipped++;
        }
      } catch (err) {
        stats.failed++;
        after.push(url); // garde l'URL originale, on retentera plus tard
        console.error(`  ✗ product ${product._id}: ${(err as Error).message}`);
      }
    }
    if (touched && commit) {
      product.images = after;
      await product.save();
    }
  }
  return stats;
}

async function migrateStores(): Promise<Stats> {
  const stats: Stats = { total: 0, migrated: 0, skipped: 0, failed: 0 };
  const query = Store.find({ $or: [{ logo: { $exists: true, $ne: null } }, { favicon: { $exists: true, $ne: null } }] });
  if (limitArg) query.limit(limitArg);
  const cursor = query.cursor();

  for await (const store of cursor) {
    let touched = false;
    for (const field of ['logo', 'favicon'] as const) {
      const url = (store as unknown as Record<string, string | undefined>)[field];
      if (!url) continue;
      stats.total++;
      if (isCloudinaryUrl(url)) { stats.skipped++; continue; }
      if (!commit) {
        stats.migrated++;
        console.log(`  [dry] store ${store._id} ${field}: ${url.slice(0, 80)}`);
        continue;
      }
      try {
        const newUrl = await migrateOne(url, `stores/${store._id}/${field}`);
        if (newUrl) {
          (store as unknown as Record<string, string>)[field] = newUrl;
          touched = true;
          stats.migrated++;
          console.log(`  ✓ store ${store._id} ${field}: ${url.slice(0, 60)} → ${newUrl.slice(0, 60)}`);
          await sleep(sleepMs);
        } else {
          stats.skipped++;
        }
      } catch (err) {
        stats.failed++;
        console.error(`  ✗ store ${store._id} ${field}: ${(err as Error).message}`);
      }
    }
    if (touched && commit) await store.save();
  }
  return stats;
}

async function migrateCollections(): Promise<Stats> {
  const stats: Stats = { total: 0, migrated: 0, skipped: 0, failed: 0 };
  const query = Collection.find({ image: { $exists: true, $ne: null } });
  if (limitArg) query.limit(limitArg);
  const cursor = query.cursor();

  for await (const coll of cursor) {
    const url = (coll as unknown as { image?: string }).image;
    if (!url) continue;
    stats.total++;
    if (isCloudinaryUrl(url)) { stats.skipped++; continue; }
    if (!commit) {
      stats.migrated++;
      console.log(`  [dry] collection ${coll._id} image: ${url.slice(0, 80)}`);
      continue;
    }
    try {
      const newUrl = await migrateOne(url, `collections/${coll._id}`);
      if (newUrl) {
        (coll as unknown as { image: string }).image = newUrl;
        await coll.save();
        stats.migrated++;
        console.log(`  ✓ collection ${coll._id}: ${url.slice(0, 60)} → ${newUrl.slice(0, 60)}`);
        await sleep(sleepMs);
      } else {
        stats.skipped++;
      }
    } catch (err) {
      stats.failed++;
      console.error(`  ✗ collection ${coll._id}: ${(err as Error).message}`);
    }
  }
  return stats;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('── Migration images → Cloudinary ─────────────────────\n');
  console.log('Mode        :', commit ? '⚠️  COMMIT (apply changes)' : '🔍 DRY-RUN (no writes)');
  console.log('Target      :', [...targets].join(', '));
  console.log('Limit       :', limitArg || 'no limit');
  console.log('Sleep       :', `${sleepMs}ms entre uploads`);
  console.log('MongoDB     :', process.env.MONGO_URI ? 'from env' : '(unset)');
  console.log('Storage     :', process.env.STORAGE_DRIVER || 'local');
  console.log('');

  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI manquant dans .env');
    process.exit(1);
  }
  if (process.env.STORAGE_DRIVER !== 'cloudinary') {
    console.error('❌ STORAGE_DRIVER doit être "cloudinary" (actuellement:', process.env.STORAGE_DRIVER, ')');
    console.error('   Sinon les uploads iront ailleurs — pas ce que tu veux.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ MongoDB connected\n');

  const totals: Record<string, Stats> = {};
  if (targets.has('products')) {
    console.log('▶ Products…');
    totals.products = await migrateProducts();
  }
  if (targets.has('stores')) {
    console.log('\n▶ Stores…');
    totals.stores = await migrateStores();
  }
  if (targets.has('collections')) {
    console.log('\n▶ Collections…');
    totals.collections = await migrateCollections();
  }

  console.log('\n── Résumé ───────────────────────────────────────────');
  for (const [name, s] of Object.entries(totals)) {
    console.log(`${name.padEnd(12)} · total ${s.total}  migrated ${s.migrated}  skipped ${s.skipped}  failed ${s.failed}`);
  }
  if (!commit) {
    console.log('\n💡 Dry-run terminé — aucune modification en base.');
    console.log('   Relance avec `--commit` pour appliquer.');
  } else {
    console.log('\n✅ Migration appliquée.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ FATAL :', err.message);
  console.error(err.stack);
  process.exit(1);
});
