/**
 * CinetPay sandbox end-to-end validator.
 *
 * Exercises the CinetPayProvider against CinetPay's sandbox (`.net`) so a
 * seller can prove the integration works before switching to live (`.com`).
 * Runs three steps:
 *
 *   1. initPayment  → hits `/v2/payment` and prints the checkout URL. Open it
 *                     in a browser to complete a sandbox transaction.
 *   2. parseWebhook → replays what CinetPay would POST after the buyer pays,
 *                     confirming our HMAC + `/payment/check` re-verify logic
 *                     matches the sandbox response.
 *   3. verifyTransaction → hits `/v2/payment/check` for the same transaction
 *                          and reports ACCEPTED / REFUSED / PENDING.
 *
 * Prerequisites: CINETPAY_API_KEY, CINETPAY_SITE_ID (and CINETPAY_BASE_URL
 * pointing at the sandbox) set in .env.
 *
 * Usage:
 *   npm run test:cinetpay-sandbox           # runs init + verify with a mock order
 *   npm run test:cinetpay-sandbox -- --tx=<orderId>  # verify a real sandbox tx
 */
import 'dotenv/config';
import { CinetPayProvider } from '../src/services/payment/cinetpay.service';
import type { IOrder } from '../src/models/Order.model';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

function log(color: string, tag: string, msg: string): void {
  console.log(`${color}${BOLD}${tag}${RESET} ${msg}`);
}

function assertEnv(): void {
  const missing: string[] = [];
  if (!process.env.CINETPAY_API_KEY) missing.push('CINETPAY_API_KEY');
  if (!process.env.CINETPAY_SITE_ID) missing.push('CINETPAY_SITE_ID');
  if (missing.length) {
    log(RED, '❌', `Env manquantes: ${missing.join(', ')}`);
    log(YELLOW, '💡', 'Ajoute-les dans flexiopage-backend/.env');
    process.exit(1);
  }
  const base = process.env.CINETPAY_BASE_URL || 'https://api-checkout.cinetpay.com/v1';
  if (base.includes('.com')) {
    log(YELLOW, '⚠️ ', `CINETPAY_BASE_URL pointe sur PROD (${base}) — les charges seront réelles.`);
    log(YELLOW, '💡', 'Pour la sandbox: CINETPAY_BASE_URL=https://api-checkout.cinetpay.net/v1');
  } else {
    log(GREEN, '✅', `Sandbox: ${base}`);
  }
  if (!/\/v1$/.test(base)) {
    log(YELLOW, '⚠️ ', `L'URL doit se terminer par /v1 pour la nouvelle API (tu as ${base}).`);
  }
}

/** Fabrique un IOrder minimal en mémoire (pas d'écriture DB — on teste juste
 *  la couche provider). */
function mockOrder(overrides: Partial<IOrder> = {}): IOrder {
  const orderId = overrides._id ? String(overrides._id) : `test_${Date.now()}`;
  return {
    _id: orderId,
    orderNumber: `TEST-${Math.floor(Math.random() * 9000 + 1000)}`,
    email: 'test@mogadelivery.com',
    customerName: 'Test Client',
    total: 500,
    currency: 'XOF',
    paymentPhone: '+2250709999999',
    shippingAddress: { country: 'CI' },
    paymentReference: overrides.paymentReference,
    ...overrides,
  } as unknown as IOrder;
}

async function main(): Promise<void> {
  assertEnv();

  const argv = process.argv.slice(2);
  const txArg = argv.find((a) => a.startsWith('--tx='))?.split('=')[1];

  const provider = new CinetPayProvider();
  const order = mockOrder(txArg ? { _id: txArg } : {});

  console.log('');
  log(CYAN, '━━━', 'CinetPay Sandbox — Test End-to-End');
  console.log('');
  console.log(`  Order ID       : ${order._id}`);
  console.log(`  Order number   : ${order.orderNumber}`);
  console.log(`  Amount         : ${order.total} ${order.currency}`);
  console.log(`  Customer phone : ${order.paymentPhone}`);
  console.log('');

  // ── STEP 1 : initPayment ──────────────────────────────────────────
  log(CYAN, '1️⃣ ', 'initPayment — création du checkout CinetPay');
  try {
    const init = await provider.initPayment({
      order,
      phone: order.paymentPhone,
      channel: 'all',
    });
    log(GREEN, '   ✅', 'CinetPay a accepté la requête d\'initialisation.');
    console.log(`      • checkoutUrl : ${init.checkoutUrl}`);
    console.log(`      • reference   : ${init.reference}`);
    console.log(`      • provider    : ${init.provider}`);
    console.log('');
    log(YELLOW, '   👉', 'Ouvre le checkoutUrl dans un navigateur pour finaliser un test.');
    console.log('      En sandbox, choisis Wave / OM / MTN et complète le paiement fictif.');
  } catch (err) {
    const e = err as Error & { cause?: Error & { code?: string } };
    const cause = e.cause ? ` [${e.cause.code || 'unknown'}] ${e.cause.message || ''}`.trim() : '';
    log(RED, '   ❌', `Init a échoué: ${e.message}${cause ? ` — ${cause}` : ''}`);
    console.log('');
    log(YELLOW, '   💡', 'Causes fréquentes:');
    console.log('      • ENOTFOUND : le domaine dans CINETPAY_BASE_URL n\'existe pas — mauvais sous-domaine.');
    console.log('      • ECONNREFUSED / ETIMEDOUT : firewall du VPS bloque la sortie vers CinetPay.');
    console.log('      • 401 / 403 : clé invalide, IP non whitelistée, ou schéma d\'auth différent (essayer X-API-KEY).');
    console.log('      • 422 : payload rejeté — le message CinetPay indique le champ fautif.');
    console.log('      • Montant non multiple de 5 pour XOF/XAF (le code arrondit auto).');
    process.exit(1);
  }

  // ── STEP 2 : parseWebhook (simulation) ────────────────────────────
  console.log('');
  log(CYAN, '2️⃣ ', 'parseWebhook — replay d\'un webhook simulé');
  // v1 webhook payload — champs inférés de la doc /v1/payment response.
  // Le vrai webhook contiendra ces mêmes clés + un `notify_token` unique.
  const fakeWebhookPayload: Record<string, unknown> = {
    merchant_transaction_id: order._id,
    transaction_id: 'SANDBOX_TX_TEST',
    notify_token: 'SANDBOX_NOTIFY_TOKEN_TEST',
    payment_method: 'WAVE',
    amount: 500,
    currency: 'XOF',
    status: 'SUCCESS',
    designation: `Order ${order.orderNumber}`,
    lang: 'fr',
  };
  try {
    const result = await provider.parseWebhook(fakeWebhookPayload, {});
    console.log(`      • status         : ${result.status}`);
    console.log(`      • orderId        : ${result.orderId}`);
    console.log(`      • reference      : ${result.reference}`);
    console.log(`      • signatureValid : ${String(result.signatureValid)}`);
    if (result.signatureValid === undefined) {
      log(YELLOW, '   ⚠️ ', 'Pas de CINETPAY_SECRET_KEY — HMAC skippé, re-check /payment/check utilisé.');
    } else if (result.signatureValid === false) {
      log(YELLOW, '   ⚠️ ', 'HMAC invalide (attendu ici, la signature est bidon). En prod le webhook sera rejeté.');
    } else {
      log(GREEN, '   ✅', 'HMAC OK.');
    }
    // Le re-check /payment/check retournera "not found" pour cet order fictif,
    // donc le status final sera "pending" — c'est normal.
    if (result.status === 'pending') {
      log(YELLOW, '   ℹ️ ', 'Status "pending" attendu ici car la transaction n\'existe pas côté CinetPay.');
    }
  } catch (err) {
    log(RED, '   ❌', `parseWebhook a crashé: ${(err as Error).message}`);
  }

  // ── STEP 3 : verifyTransaction ────────────────────────────────────
  console.log('');
  log(CYAN, '3️⃣ ', 'verifyTransaction — re-check /payment/check');
  try {
    const verified = await provider.verifyTransaction(order);
    console.log(`      • status    : ${verified.status}`);
    console.log(`      • reference : ${verified.reference || '—'}`);
    if (verified.raw) {
      console.log(`      • raw       : ${JSON.stringify(verified.raw).slice(0, 200)}`);
    }
    if (verified.status === 'paid') {
      log(GREEN, '   ✅', 'Transaction confirmée ACCEPTED côté CinetPay.');
    } else if (verified.status === 'failed') {
      log(RED, '   ❌', 'Transaction REFUSED côté CinetPay.');
    } else {
      log(YELLOW, '   ⏳', 'Pending — normal si tu n\'as pas encore complété le paiement dans le navigateur.');
    }
  } catch (err) {
    log(RED, '   ❌', `verifyTransaction a échoué: ${(err as Error).message}`);
  }

  console.log('');
  log(CYAN, '━━━', 'Fin du test.');
  console.log('');
  console.log('Étapes suivantes:');
  console.log('  1. Copie le checkoutUrl de l\'étape 1 dans un navigateur');
  console.log('  2. Complète le paiement sandbox');
  console.log('  3. Relance:  npm run test:cinetpay-sandbox -- --tx=' + order._id);
  console.log('     → l\'étape 3 devrait afficher "paid".');
  console.log('  4. Vérifie côté panel CinetPay Sandbox → Transactions que la ligne est bien ACCEPTED.');
  console.log('  5. Envoie les screenshots à l\'équipe CinetPay pour validation.');
  console.log('');
}

main().catch((err) => {
  log(RED, '💥', `Erreur inattendue: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
