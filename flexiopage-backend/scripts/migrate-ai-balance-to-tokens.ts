/**
 * One-off migration : convertit l'aiBalance des wallets de USD vers TOKENS.
 *
 * Pourquoi : depuis le 2026-06-18 le solde IA est exprimé en tokens (1 USD
 * top-up = settings.aiPricing.usdToTokens tokens, défaut 1.5). Les wallets
 * historiques ont leur aiBalance et leurs transactions ai_generation /
 * top_up_ai stockés en USD — il faut les multiplier par le ratio pour
 * qu'un vendeur qui avait 10 USD de solde voie maintenant 15 tokens.
 *
 * Idempotent : marque chaque wallet migré via le champ `aiBalanceUnit`
 * (= 'tokens' après passage). Le filtre exclut les wallets déjà en tokens
 * donc relancer le script est un no-op.
 *
 * Formule :
 *   aiBalance_tokens     = round(aiBalance_usd     × usdToTokens)
 *   tx.amount_tokens     = round(tx.amount_usd     × usdToTokens)
 *   tx.balanceAfter_tk   = round(tx.balanceAfter_usd × usdToTokens)
 *
 * Seules les transactions du bucket 'ai' sont converties — le bucket main
 * reste en USD (commission).
 *
 * Lancer sur la VPS :
 *   docker compose -f /opt/flexiopage/docker-compose.prod.yml \
 *     exec backend npm run migrate:ai-balance-tokens
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Wallet } from '../src/models/Wallet.model';
import { getSettings, DEFAULT_AI_PRICING } from '../src/models/Settings.model';

async function main(): Promise<void> {
  await connectDB();

  const settings = await getSettings();
  const rate = settings.aiPricing?.usdToTokens || DEFAULT_AI_PRICING.usdToTokens;
  console.log(`Conversion rate: 1 USD → ${rate} tokens\n`);

  const candidates = await Wallet.find({ aiBalanceUnit: { $ne: 'tokens' } });

  if (candidates.length === 0) {
    console.log('✓ Nothing to migrate — every wallet is already in tokens.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${candidates.length} wallet(s) en USD à convertir.\n`);

  let updated = 0;

  for (const w of candidates) {
    const beforeAi = w.aiBalance || 0;
    const newAi = Math.round(beforeAi * rate);

    // Convertit chaque transaction du bucket 'ai' (top_up_ai, ai_generation,
    // refund/adjustment ciblant l'IA). Les transactions main sont laissées
    // intactes car le bucket principal reste en USD.
    let convertedTx = 0;
    for (const tx of w.transactions) {
      if (tx.bucket !== 'ai') continue;
      const amt = tx.amount || 0;
      const bal = tx.balanceAfter || 0;
      tx.amount = Math.round(amt * rate);
      tx.balanceAfter = Math.round(bal * rate);
      convertedTx += 1;
    }

    w.aiBalance = newAi;
    w.aiBalanceUnit = 'tokens';
    w.markModified('transactions');
    await w.save();
    updated += 1;
    console.log(
      `  ✓ ${w._id}  aiBalance ${beforeAi} USD → ${newAi} tokens  (${convertedTx} tx convertie(s))`,
    );
  }

  console.log(`\n✓ Migrated ${updated} wallet(s) du USD vers tokens.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', (err as Error).message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
