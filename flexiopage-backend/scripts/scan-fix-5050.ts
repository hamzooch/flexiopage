/**
 * One-shot : rewrite tous les `http://localhost:5050/uploads/...` (legacy) en
 * chemin relatif `/uploads/...`. Le frontend les re-préfixe via NEXT_PUBLIC_API_URL.
 * Mode: dry-run par défaut, ajoute --apply pour persister.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const PATTERN = /http:\/\/localhost:5050/g;
const APPLY = process.argv.includes('--apply');

function rewrite(v: any): any {
  if (v == null) return v;
  if (typeof v === 'string') return v.replace(PATTERN, '');
  if (Array.isArray(v)) return v.map(rewrite);
  if (typeof v === 'object') {
    const out: any = Array.isArray(v) ? [] : {};
    let changed = false;
    for (const k of Object.keys(v)) {
      const nv = rewrite(v[k]);
      if (nv !== v[k]) changed = true;
      out[k] = nv;
    }
    return changed ? out : v;
  }
  return v;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const cols = await db.listCollections().toArray();
  let totalScan = 0, totalChange = 0;
  for (const c of cols) {
    const col = db.collection(c.name);
    const cursor = col.find({ $where: 'JSON.stringify(this).indexOf("localhost:5050") > -1' });
    let count = 0, changed = 0;
    for await (const doc of cursor) {
      count++;
      const before = JSON.stringify(doc);
      const after = rewrite(doc);
      const afterStr = JSON.stringify(after);
      if (before !== afterStr) {
        changed++;
        if (APPLY) {
          await col.replaceOne({ _id: doc._id }, after);
        }
      }
    }
    if (count > 0) {
      console.log(`${c.name}: scanned=${count}  changed=${changed}`);
      totalScan += count; totalChange += changed;
    }
  }
  console.log(`\nTotal: scanned=${totalScan}  changed=${totalChange}  apply=${APPLY}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
