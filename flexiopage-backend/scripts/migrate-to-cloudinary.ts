/**
 * One-shot migration: copy every file under UPLOAD_PATH (default ./uploads)
 * to Cloudinary, then rewrite every Mongo document that referenced the old
 * local URL.
 *
 * Run :
 *   npm run migrate:to-cloudinary              # production: real upload + DB update
 *   npm run migrate:to-cloudinary -- --dry-run # show what would happen, no writes
 *
 * Idempotent — saves the local→cloudinary map to scripts/.cloudinary-urlmap.json
 * after phase 1, so a retry resumes where it stopped instead of re-uploading.
 *
 * Safe to run multiple times: a document whose URL was already migrated is
 * detected (no further match in the URL map) and skipped.
 *
 * Prereqs : Cloudinary env vars set (CLOUDINARY_CLOUD_NAME / _KEY / _SECRET).
 * The script forces driver=cloudinary regardless of STORAGE_DRIVER so you can
 * keep the prod app running on `local` while the migration writes to Cloudinary.
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

// Models that hold image/asset URLs anywhere in their tree.
import { User } from '../src/models/User.model';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';
import { Collection } from '../src/models/Collection.model';
import { LandingPage } from '../src/models/LandingPage.model';
import { Media } from '../src/models/Media.model';

const DRY_RUN = process.argv.includes('--dry-run');
const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads');
const PUBLIC_URL_PREFIX = process.env.PUBLIC_URL_PREFIX || '/uploads';
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
const MAP_FILE = path.join(__dirname, '.cloudinary-urlmap.json');

const REQUIRED_ENV = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'MONGODB_URI'];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    console.error(`❌ Manque la variable d'env ${k}`);
    process.exit(1);
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

interface UrlMapEntry {
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
}
type UrlMap = Record<string, UrlMapEntry>;

async function loadMap(): Promise<UrlMap> {
  try {
    const raw = await fs.readFile(MAP_FILE, 'utf-8');
    return JSON.parse(raw) as UrlMap;
  } catch {
    return {};
  }
}

async function saveMap(map: UrlMap): Promise<void> {
  if (DRY_RUN) return;
  await fs.writeFile(MAP_FILE, JSON.stringify(map, null, 2));
}

async function walkDir(dir: string, fn: (file: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, fn);
    } else if (entry.isFile()) {
      // Skip .DS_Store and other system files
      if (entry.name.startsWith('.')) continue;
      await fn(full);
    }
  }
}

function localUrlVariants(localUrl: string): string[] {
  // The same file might be referenced with several string forms; collect them
  // all so the DB sweep catches every variant.
  const out = new Set<string>([localUrl]);
  if (API_PUBLIC_URL) out.add(`${API_PUBLIC_URL}${localUrl}`);
  return [...out];
}

// ── Phase 1 ────────────────────────────────────────────────────────────
async function uploadAll(map: UrlMap): Promise<void> {
  let exists = false;
  try {
    await fs.access(UPLOAD_PATH);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) {
    console.log(`⚠️  Dossier ${UPLOAD_PATH} introuvable — phase 1 sautée.`);
    return;
  }

  let total = 0;
  let uploaded = 0;
  let skipped = 0;
  await walkDir(UPLOAD_PATH, async (filePath) => {
    total++;
    const rel = path.relative(UPLOAD_PATH, filePath).split(path.sep).join('/');
    const localUrl = `${PUBLIC_URL_PREFIX}/${rel}`.replace(/\/+/g, '/');

    if (map[localUrl]) {
      skipped++;
      return;
    }

    console.log(`  → upload ${localUrl}`);
    if (DRY_RUN) {
      map[localUrl] = { cloudinaryUrl: '[dry-run]', cloudinaryPublicId: '[dry-run]' };
      uploaded++;
      return;
    }
    try {
      const buffer = await fs.readFile(filePath);
      const publicIdNoExt = `migrated/${rel}`.replace(/\.[^./]+$/, '');
      const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { public_id: publicIdNoExt, resource_type: 'auto', overwrite: false },
          (err, res) => {
            if (err || !res) return reject(err || new Error('Cloudinary upload returned no result'));
            resolve(res as { secure_url: string; public_id: string });
          },
        );
        stream.end(buffer);
      });
      map[localUrl] = { cloudinaryUrl: result.secure_url, cloudinaryPublicId: result.public_id };
      uploaded++;
      if (uploaded % 25 === 0) await saveMap(map); // periodic checkpoint
    } catch (err) {
      console.error(`    ❌ échec ${localUrl} :`, (err as Error).message);
    }
  });
  await saveMap(map);
  console.log(`\nPhase 1 terminée — ${uploaded} uploadés, ${skipped} déjà migrés, ${total} fichiers parcourus.`);
}

// ── Phase 2 ────────────────────────────────────────────────────────────
/**
 * Walk a value (object/array/primitive) and replace every string that
 * contains one of the local URLs in the map with the Cloudinary URL.
 * Returns the transformed value and whether anything changed.
 */
function deepReplace(value: unknown, lookup: Map<string, string>): { value: unknown; changed: boolean } {
  if (typeof value === 'string') {
    let next = value;
    let changed = false;
    for (const [local, cloud] of lookup) {
      if (next.includes(local)) {
        next = next.split(local).join(cloud);
        changed = true;
      }
    }
    return { value: next, changed };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = deepReplace(item, lookup);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = deepReplace(v, lookup);
      if (r.changed) changed = true;
      next[k] = r.value;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}

async function rewriteCollection(
  Model: { modelName: string; find: (filter: object) => { lean: () => Promise<unknown[]> }; updateOne: (filter: object, update: object) => Promise<unknown> },
  lookup: Map<string, string>,
): Promise<void> {
  const docs = (await Model.find({}).lean()) as Array<{ _id: unknown }>;
  let updated = 0;
  for (const doc of docs) {
    const { _id, ...rest } = doc;
    const r = deepReplace(rest, lookup);
    if (!r.changed) continue;
    updated++;
    console.log(`  → ${Model.modelName} ${String(_id)} (${countChangedFields(rest, r.value)} champ(s))`);
    if (!DRY_RUN) {
      await Model.updateOne({ _id }, { $set: r.value as Record<string, unknown> });
    }
  }
  console.log(`  ${Model.modelName}: ${updated}/${docs.length} document(s) mis à jour.`);
}

function countChangedFields(a: unknown, b: unknown, count = { n: 0 }): number {
  if (typeof a === 'string' && typeof b === 'string') {
    if (a !== b) count.n++;
  } else if (Array.isArray(a) && Array.isArray(b)) {
    a.forEach((v, i) => countChangedFields(v, b[i], count));
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of Object.keys(a as Record<string, unknown>)) {
      countChangedFields((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], count);
    }
  }
  return count.n;
}

// ── Entrée principale ──────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n🚀 Migration vers Cloudinary ${DRY_RUN ? '(DRY-RUN — aucune écriture)' : ''}\n`);
  console.log(`   UPLOAD_PATH         : ${UPLOAD_PATH}`);
  console.log(`   PUBLIC_URL_PREFIX   : ${PUBLIC_URL_PREFIX}`);
  console.log(`   API_PUBLIC_URL      : ${API_PUBLIC_URL || '(non défini)'}\n`);

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connecté à MongoDB.\n');

  const map = await loadMap();
  const initialSize = Object.keys(map).length;
  console.log(`📦 Phase 1 — upload des fichiers locaux (${initialSize > 0 ? `reprise, ${initialSize} déjà mappés` : 'depuis zéro'})…`);
  await uploadAll(map);

  // Build the lookup (string → string) with both variants per local URL.
  const lookup = new Map<string, string>();
  for (const [localUrl, entry] of Object.entries(map)) {
    if (entry.cloudinaryUrl === '[dry-run]') continue;
    for (const variant of localUrlVariants(localUrl)) {
      lookup.set(variant, entry.cloudinaryUrl);
    }
  }

  if (lookup.size === 0) {
    console.log('\n⚠️  Aucun mapping disponible — phase 2 sautée.');
  } else {
    console.log(`\n🗄️  Phase 2 — réécriture des URLs en base (${lookup.size} entrées)…\n`);
    await rewriteCollection(User as never, lookup);
    await rewriteCollection(Store as never, lookup);
    await rewriteCollection(Product as never, lookup);
    await rewriteCollection(Collection as never, lookup);
    await rewriteCollection(LandingPage as never, lookup);
    await rewriteCollection(Media as never, lookup);
  }

  await mongoose.disconnect();
  console.log('\n✅ Terminé.');
}

main().catch((err) => {
  console.error('💥 Échec de la migration :', err);
  process.exit(1);
});
