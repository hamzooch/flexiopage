/**
 * Test e2e LOCAL du Messenger Bot — sans Facebook.
 *
 * Valide : chiffrement aller-retour, signature webhook HMAC, et surtout le
 * CERVEAU conversationnel : on simule des messages client (darija) et on fait
 * tourner le worker → on imprime la réponse de Claude + les tools + la commande
 * créée. L'envoi Messenger est désactivé (MESSENGER_DRY_RUN).
 *
 * Prérequis :
 *   npm run seed:test-store && npm run seed:messenger-bot
 *   ANTHROPIC_API_KEY dans .env  (sinon les tours Claude sont sautés)
 *
 * Run : npm run test:messenger-bot
 */
import 'dotenv/config';
process.env.MESSENGER_DRY_RUN = 'true';
process.env.TOKEN_ENCRYPTION_KEY ||= 'dev-messenger-token-key-change-me';

import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Store } from '../src/models/Store.model';
import { Product } from '../src/models/Product.model';
import { BotConfig } from '../src/modules/messenger-bot/models/BotConfig.model';
import { Conversation } from '../src/modules/messenger-bot/models/Conversation.model';
import { Message } from '../src/modules/messenger-bot/models/Message.model';
import { encryptionService } from '../src/modules/messenger-bot/services/encryption.service';
import { validateMetaSignature } from '../src/modules/messenger-bot/utils/signatureValidator';
import { processIncomingMessage } from '../src/modules/messenger-bot/workers/messageWorker';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  ok ? pass++ : fail++;
};

const TEST_PSID = 'TEST_PSID_999';

async function runTurn(job: { botConfigId: string; conversationId: string; vendorId: string; text: string }) {
  await Message.create({
    conversation_id: job.conversationId,
    vendor_id: job.vendorId,
    sender: 'customer',
    content: job.text,
  });
  return processIncomingMessage({
    botConfigId: job.botConfigId,
    conversationId: job.conversationId,
    vendorId: job.vendorId,
    pageId: 'TEST_PAGE_123',
    customerPsid: TEST_PSID,
    text: job.text,
  });
}

async function main(): Promise<void> {
  await connectDB();
  console.log('\n=== Test Messenger Bot (LOCAL, dry-run) ===\n');

  // 1. Chiffrement
  const secret = 'super-token-secret';
  const enc = encryptionService.encrypt(secret);
  check('Chiffrement aller-retour AES-256-GCM', encryptionService.decrypt(enc) === secret);

  // 2. Signature webhook
  const appSecret = 'app-secret-xyz';
  const body = JSON.stringify({ object: 'page', entry: [] });
  const sig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');
  check('Signature Meta valide acceptée', validateMetaSignature(body, sig, appSecret));
  check('Signature Meta falsifiée rejetée', !validateMetaSignature(body + 'x', sig, appSecret));

  // 3. Cerveau conversationnel
  const config = await BotConfig.findOne({ facebook_page_id: 'TEST_PAGE_123' });
  if (!config) throw new Error('BotConfig de test absent — lance "npm run seed:messenger-bot".');
  const product = await Product.findOne({ storeId: config.vendor_id, isPublished: true });
  if (!product) throw new Error('Aucun produit publié sur la boutique test.');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n⚠️  ANTHROPIC_API_KEY absent → tours Claude sautés (briques 1-2 OK).');
    console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
    await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }

  // Conversation de test propre.
  await Conversation.deleteMany({ vendor_id: config.vendor_id, customer_psid: TEST_PSID });
  const conv = await Conversation.create({
    vendor_id: config.vendor_id,
    bot_config_id: config._id,
    customer_psid: TEST_PSID,
    status: 'active',
  });
  const base = { botConfigId: String(config._id), conversationId: String(conv._id), vendorId: String(config.vendor_id) };

  try {
    console.log(`\n— Tour 1 : question produit —`);
    const t1 = await runTurn({ ...base, text: 'Salam, chno 3andkom f produits? bghit nchouf chi haja' });
    console.log('🤖', t1.replyText);
    check('Tour 1 : réponse non vide', !!t1.replyText.trim());

    console.log(`\n— Tour 2 : infos commande (le bot doit demander confirmation) —`);
    const orderMsg = `bghit nakhod ${product.name}, smiti Ahmed Alami, tel 0612345678, Casablanca, Hay Salam rue 5 num 12`;
    const t2 = await runTurn({ ...base, text: orderMsg });
    console.log('🤖', t2.replyText);
    check('Tour 2 : récap + demande de confirmation (pas encore de commande)', !t2.orderId);

    console.log(`\n— Tour 3 : confirmation → création de la commande —`);
    const t3 = await runTurn({ ...base, text: 'Wakha, sift lik lcommande ✅' });
    console.log('🤖', t3.replyText);
    const cost = (t1.costUsd + t2.costUsd + t3.costUsd).toFixed(6);
    console.log('   tools:', t3.toolsUsed, '| order:', t3.orderId || '—', '| coût total $:', cost);
    check('Tour 3 : tool create_order appelé + commande créée', t3.toolsUsed.includes('create_order') && !!t3.orderId);
    if (t3.orderId) {
      const ord = await mongoose.connection.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(t3.orderId) });
      check('Commande COD persistée en DB', !!ord && ord.paymentMethod === 'cod', { orderNumber: ord?.orderNumber, total: ord?.total });
      await mongoose.connection.collection('orders').deleteOne({ _id: new mongoose.Types.ObjectId(t3.orderId) });
    }
  } catch (err) {
    const msg = (err as Error).message || '';
    if (/authentication_error|invalid x-api-key|401/.test(msg)) {
      console.log('\n⚠️  ANTHROPIC_API_KEY invalide → mets une vraie clé dans .env pour tester les tours Claude.');
      fail++;
    } else {
      throw err;
    }
  } finally {
    await Message.deleteMany({ conversation_id: conv._id });
    await Conversation.deleteOne({ _id: conv._id });
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test-messenger-bot échec:', err);
  process.exit(1);
});
