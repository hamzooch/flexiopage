/**
 * One-off backfill: renseigne Order.customerPhoneKey sur les commandes
 * existantes à partir de customerPhone.
 *
 * Pourquoi : la feature « fiabilité client » (score de retours pour l'agent
 * de confirmation) agrège l'historique d'un numéro via la clé indexée
 * customerPhoneKey. Les commandes créées avant l'ajout du champ ne l'ont pas ;
 * sans backfill, elles seraient invisibles pour le score.
 *
 * Idempotent : ne touche que les commandes ayant un customerPhone et dont la
 * clé calculée diffère de la valeur stockée. Re-run = no-op.
 *
 * Run sur le VPS :
 *   docker compose -f /opt/flexiopage/docker-compose.prod.yml \
 *     exec backend npm run backfill:phone-key
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Order } from '../src/models/Order.model';
import { phoneKey } from '../src/utils/phone';

async function main(): Promise<void> {
  await connectDB();

  const cursor = Order.find({ customerPhone: { $exists: true, $ne: '' } })
    .select('customerPhone customerPhoneKey')
    .cursor();

  let scanned = 0;
  let updated = 0;
  let cleared = 0;
  const bulk: Array<{ updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }> = [];

  for await (const o of cursor) {
    scanned += 1;
    const key = phoneKey(o.customerPhone) ?? null;
    if ((o.customerPhoneKey ?? null) === key) continue;
    if (key === null) cleared += 1;
    else updated += 1;
    bulk.push({
      updateOne: {
        filter: { _id: o._id },
        update: key === null ? { $unset: { customerPhoneKey: '' } } : { $set: { customerPhoneKey: key } },
      },
    });
    if (bulk.length >= 500) {
      await Order.bulkWrite(bulk);
      bulk.length = 0;
    }
  }
  if (bulk.length) await Order.bulkWrite(bulk);

  console.log(`[backfill-phone-key] scanned=${scanned} updated=${updated} cleared=${cleared}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[backfill-phone-key] failed:', err);
  process.exit(1);
});
