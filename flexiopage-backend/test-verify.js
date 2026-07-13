/**
 * Test du verifyTransaction Moneroo
 * Lance avec: node test-verify.js
 */

const MoneróoProvider = require('./dist/services/payment/moneróo.service').MoneróoProvider;

async function test() {
  console.log('========================================');
  console.log('🧪 Test verifyTransaction Moneroo');
  console.log('========================================');
  console.log('');

  const provider = new MoneróoProvider();

  // Test 1: Vérifier si configuré
  console.log('1️⃣ Vérifier si Moneroo est configuré...');
  const configured = provider.isConfigured();
  console.log(`   ${configured ? '✅' : '❌'} Moneroo configuré: ${configured}`);
  console.log('');

  if (!configured) {
    console.log('⚠️  Moneroo n\'est pas configuré!');
    console.log('Définissez MONERÓO_API_KEY dans .env');
    console.log('');
    return;
  }

  // Test 2: Créer un mock order
  console.log('2️⃣ Créer un mock order pour test...');
  const mockOrder = {
    _id: 'test_order_id_123',
    paymentReference: 'test_payment_ref_abc',
    paymentStatus: 'pending',
  };
  console.log(`   Order: ${JSON.stringify(mockOrder, null, 2)}`);
  console.log('');

  // Test 3: Appeler verifyTransaction
  console.log('3️⃣ Appeler verifyTransaction...');
  try {
    const result = await provider.verifyTransaction(mockOrder);
    console.log('   ✅ Réponse du verifyTransaction:');
    console.log(`   ${JSON.stringify(result, null, 2)}`);
  } catch (err) {
    console.log('   ❌ Erreur:');
    console.log(`   ${err.message}`);
  }
  console.log('');

  console.log('========================================');
  console.log('✅ Test Terminé!');
  console.log('========================================');
}

test().catch(console.error);
