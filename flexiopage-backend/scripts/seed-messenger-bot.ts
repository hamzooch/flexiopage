/**
 * Crée/maj un BotConfig de test rattaché à la boutique "boutique-test", afin de
 * pouvoir tester le bot SANS passer par l'OAuth Facebook (pas encore branché).
 *
 * Run :
 *   cd flexiopage-backend
 *   npm run seed:test-store        # une fois (crée la boutique + produits)
 *   npm run seed:messenger-bot
 */
import 'dotenv/config';
// Clé par défaut en dev pour que le chiffrement fonctionne sans config.
process.env.TOKEN_ENCRYPTION_KEY ||= 'dev-messenger-token-key-change-me';

import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Store } from '../src/models/Store.model';
import { BotConfig } from '../src/modules/messenger-bot/models/BotConfig.model';
import { encryptionService } from '../src/modules/messenger-bot/services/encryption.service';

const STORE_SLUG = process.env.TEST_STORE_SLUG || 'boutique-test';
const TEST_PAGE_ID = 'TEST_PAGE_123';

async function main(): Promise<void> {
  await connectDB();
  const store = await Store.findOne({ slug: STORE_SLUG });
  if (!store) throw new Error(`Boutique "${STORE_SLUG}" introuvable — lance d'abord "npm run seed:test-store".`);

  const config = await BotConfig.findOneAndUpdate(
    { facebook_page_id: TEST_PAGE_ID },
    {
      $set: {
        vendor_id: store._id,
        page_name: `${store.name} (page test)`,
        page_access_token_encrypted: encryptionService.encrypt('TEST-PAGE-TOKEN-not-real'),
        status: 'active',
        language: 'darija_ma',
        country: 'MA',
        catalog_source: 'auto',
        ai_personality: 'friendly',
        auto_create_order: true,
        ask_confirmation_before_order: true,
        shipping_fees: [
          { city: 'Casablanca', fee: 30 },
          { city: 'Rabat', fee: 30 },
        ],
        default_shipping_fee: 35,
        plan: 'free',
        conversations_limit: 50,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log('✅ BotConfig prêt :');
  console.log('   id        :', config._id.toString());
  console.log('   page_id   :', config.facebook_page_id);
  console.log('   store     :', store.name, `(${store._id})`);
  console.log('   pays/lang :', config.country, config.language);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('seed-messenger-bot échec:', err);
  process.exit(1);
});
