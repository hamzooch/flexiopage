/**
 * One-off migration: force every wallet's currency to 'USD' and CONVERT
 * the balance + aiBalance values using the USD→currency rate table from
 * Settings (same table that powered the legacy aiCostInCurrency).
 *
 * Why: as of 2026-05-17 the platform pins both wallet buckets to USD
 * (commit 80e386ed). New wallets default to USD already; this script
 * aligns legacy wallets created with a local currency (MAD, TND, XOF…)
 * by converting their stored amounts AND flipping the currency label.
 *
 * Conversion formula:
 *   amount_usd = round(amount_local / rate_usd_to_local)
 *
 * The Settings.aiPricing.rates table maps USD → currency, e.g.
 * { USD: 1, MAD: 10, TND: 3.1, XOF: 600 }. So 10500 MAD ÷ 10 = 1050 USD.
 * If no rate is found, the wallet is SKIPPED and reported so an admin
 * can decide manually.
 *
 * Idempotent: re-runs are no-ops because wallets already in USD are
 * filtered out.
 *
 * Run on the VPS:
 *   docker compose -f /opt/flexiopage/docker-compose.prod.yml \
 *     exec backend npm run migrate:wallets-usd
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Wallet } from '../src/models/Wallet.model';
import { getSettings, DEFAULT_AI_PRICING } from '../src/models/Settings.model';

async function main(): Promise<void> {
  await connectDB();

  const settings = await getSettings();
  const rates: Record<string, number> = {
    ...DEFAULT_AI_PRICING.rates,
    ...(settings.aiPricing?.rates || {}),
  };

  const candidates = await Wallet.find({ currency: { $ne: 'USD' } });

  if (candidates.length === 0) {
    console.log('✓ Nothing to migrate — every wallet is already in USD.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${candidates.length} non-USD wallet(s).\n`);

  let updated = 0;
  const skipped: Array<{ id: string; currency: string; reason: string }> = [];

  for (const w of candidates) {
    const cur = (w.currency || '').toUpperCase();
    const rate = rates[cur];
    if (!rate || rate <= 0) {
      skipped.push({ id: String(w._id), currency: cur, reason: `no rate for ${cur}` });
      continue;
    }
    const before = { currency: cur, balance: w.balance, aiBalance: w.aiBalance };
    const newBalance = Math.round((w.balance || 0) / rate);
    const newAi = Math.round((w.aiBalance || 0) / rate);
    w.currency = 'USD';
    w.balance = newBalance;
    w.aiBalance = newAi;
    await w.save();
    updated += 1;
    console.log(
      `  ✓ ${w._id}  ${before.currency} (main=${before.balance}, ai=${before.aiBalance})` +
      `  →  USD (main=${newBalance}, ai=${newAi})  [rate USD→${before.currency}=${rate}]`
    );
  }

  console.log(`\n✓ Migrated ${updated} wallet(s) to USD with FX conversion.`);
  if (skipped.length > 0) {
    console.log(`\n⚠ Skipped ${skipped.length} wallet(s) — no rate configured:`);
    for (const s of skipped) {
      console.log(`  · ${s.id}  ${s.currency}  (${s.reason})`);
    }
    console.log('\nAdd the missing rate(s) in Settings.aiPricing.rates and re-run.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', (err as Error).message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
