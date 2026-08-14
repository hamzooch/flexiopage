/**
 * One-off restore: remet en `pending` les commandes COD qui ont été flippées
 * en `abandoned` à tort par le sweeper cart-abandonment.
 *
 * Contexte : le sweeper (abandon-orders.service.ts) ne filtrait pas par
 * paymentMethod, donc il traitait les commandes COD (naturellement `pending`
 * jusqu'au paiement à la livraison) comme des paniers en ligne abandonnés.
 * Analytics exclut les `abandoned` → les KPI dashboard tombaient à 0 alors
 * que les notifs "nouvelle commande" avaient bien fait tinter la cloche.
 *
 * Idempotent : ne touche que les commandes { paymentMethod: 'cod',
 * paymentStatus: 'abandoned' }. Re-run = no-op.
 *
 * Run sur le VPS :
 *   docker compose -f /opt/flexiopage/docker-compose.prod.yml \
 *     exec backend npm run restore:cod-abandoned
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Order } from '../src/models/Order.model';

async function main(): Promise<void> {
  await connectDB();

  const filter = { paymentMethod: 'cod' as const, paymentStatus: 'abandoned' as const };
  const scanned = await Order.countDocuments(filter);
  if (scanned === 0) {
    console.log('[restore-cod-abandoned] no COD orders in `abandoned` — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const res = await Order.updateMany(filter, { $set: { paymentStatus: 'pending' as const } });
  console.log(`[restore-cod-abandoned] scanned=${scanned} restored=${res.modifiedCount ?? 0}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[restore-cod-abandoned] failed:', err);
  process.exit(1);
});
