/**
 * One-shot repair : cherche toutes les URLs stockées en base dont le colon
 * du scheme a disparu (`https//res.cloudinary.com/...` au lieu de
 * `https://…`) et les réécrit proprement.
 *
 * D'où ça vient : héritage d'une migration passée qui a mangé le `:` sur
 * une partie des documents (identifiable au préfixe `migrated/…` chez
 * Cloudinary). Symptômes visibles côté vendeur : images cassées + 422
 * à la génération vidéo (fal-ai refuse une image_url invalide).
 *
 * Idempotent : les URLs déjà valides ne matchent pas la regex.
 *
 * Usage :
 *   npm run backfill:url-scheme            # applique les corrections
 *   npm run backfill:url-scheme -- --dry-run   # log seulement
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { User } from '../src/models/User.model';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';
import { Collection } from '../src/models/Collection.model';
import { LandingPage } from '../src/models/LandingPage.model';
import { Media } from '../src/models/Media.model';

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexiopage';

const BROKEN_SCHEME_RE = /\bhttps?\/\//gi;

function repair(str: string): string {
  return str.replace(BROKEN_SCHEME_RE, (m) => m.replace('//', '://'));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function deepRepair(value: unknown, stats: { fields: number }): { value: unknown; changed: boolean } {
  if (typeof value === 'string') {
    if (!BROKEN_SCHEME_RE.test(value)) return { value, changed: false };
    // reset lastIndex — la regex est globale
    BROKEN_SCHEME_RE.lastIndex = 0;
    const next = repair(value);
    if (next === value) return { value, changed: false };
    stats.fields++;
    return { value: next, changed: true };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = deepRepair(item, stats);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: next, changed };
  }
  if (isPlainObject(value)) {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = deepRepair(v, stats);
      if (r.changed) changed = true;
      next[k] = r.value;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}

async function repairCollection(
  Model: {
    modelName: string;
    find: (filter: object) => { lean: () => Promise<unknown[]> };
    collection: { updateOne: (filter: object, update: object) => Promise<unknown> };
  },
): Promise<void> {
  const docs = (await Model.find({}).lean()) as Array<{ _id: unknown }>;
  let updated = 0;
  let totalFields = 0;
  for (const doc of docs) {
    const { _id, ...rest } = doc;
    const stats = { fields: 0 };
    const r = deepRepair(rest, stats);
    if (!r.changed) continue;
    updated++;
    totalFields += stats.fields;
    console.log(`  → ${Model.modelName} ${String(_id)} (${stats.fields} champ(s))`);
    if (!DRY_RUN) {
      await Model.collection.updateOne({ _id }, { $set: r.value as Record<string, unknown> });
    }
  }
  console.log(`  ${Model.modelName}: ${updated}/${docs.length} doc(s), ${totalFields} champ(s) réparés.`);
}

async function main(): Promise<void> {
  console.log(`\nRéparation URLs scheme cassé ${DRY_RUN ? '(DRY-RUN)' : ''}\n`);
  await mongoose.connect(MONGO);
  console.log('Connecté à MongoDB.\n');

  await repairCollection(User as never);
  await repairCollection(Store as never);
  await repairCollection(Product as never);
  await repairCollection(Collection as never);
  await repairCollection(LandingPage as never);
  await repairCollection(Media as never);

  await mongoose.disconnect();
  console.log('\nTerminé.');
}

main().catch((err) => {
  console.error('Échec :', err);
  process.exit(1);
});
