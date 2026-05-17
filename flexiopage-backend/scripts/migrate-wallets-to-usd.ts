/**
 * One-off migration: force every wallet's currency to 'USD'.
 *
 * Why: as of 2026-05-17 the platform pins both wallet buckets (main +
 * AI) to USD platform-wide (commit 80e386ed). New wallets default to
 * USD already; this script aligns wallets created BEFORE that change.
 *
 * What it does:
 *   - Finds every wallet where currency != 'USD'
 *   - Sets currency = 'USD'
 *   - Leaves balance / aiBalance values UNTOUCHED
 *     (we don't apply an FX conversion — sellers are early-stage and
 *     the displayed unit changes; if you need a true financial
 *     conversion run it separately first.)
 *
 * Run on the VPS:
 *   cd /opt/flexiopage/flexiopage-backend && npm run migrate:wallets-usd
 *
 * Idempotent: safe to re-run, no-op after the first pass.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Wallet } from '../src/models/Wallet.model';

async function main(): Promise<void> {
  await connectDB();

  const before = await Wallet.find({ currency: { $ne: 'USD' } })
    .select('_id userId currency balance aiBalance')
    .lean();

  if (before.length === 0) {
    console.log('✓ Nothing to migrate — every wallet is already in USD.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${before.length} non-USD wallet(s):`);
  for (const w of before) {
    console.log(`  · ${w._id}  user=${w.userId}  ${w.currency}  main=${w.balance}  ai=${w.aiBalance}`);
  }

  const result = await Wallet.updateMany(
    { currency: { $ne: 'USD' } },
    { $set: { currency: 'USD' } }
  );

  console.log(`\n✓ Updated ${result.modifiedCount} wallet(s) → currency='USD'.`);
  console.log('  (balance values left untouched — verify amounts match expected USD value.)');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', (err as Error).message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
