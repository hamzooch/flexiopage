/**
 * Test unitaire de la fonction joinPhone du formulaire COD.
 * Réimplémentée ici à l'identique (elle vit dans un .tsx client-side).
 * Vérifie l'idempotence, le trim, le préfixe manquant, etc.
 *
 * Run : cd flexiopage-backend && npx tsx scripts/test-phone-join.ts
 */

function joinPhone(prefix: string, localPhone: string): string {
  const cleaned = localPhone.trim();
  if (!cleaned) return '';
  const startsWithPlus = cleaned.startsWith('+');
  const startsWithPrefixDigits = prefix && cleaned.replace(/\s/g, '').startsWith(prefix.replace(/\s/g, ''));
  if (startsWithPlus || startsWithPrefixDigits) return cleaned;
  return `${prefix} ${cleaned}`.trim();
}

let pass = 0, fail = 0;
function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  console.log(`${ok ? '✅' : '❌'} ${label}  → "${actual}"${ok ? '' : ` (attendu "${expected}")`}`);
  ok ? pass++ : fail++;
}

console.log('\n🧪 Test joinPhone (formulaire COD)\n');

// Cas nominal : client tape juste son numéro local
check('CI + 70 000 00 00', joinPhone('+225', '70 000 00 00'), '+225 70 000 00 00');
check('SN + 771234567', joinPhone('+221', '771234567'), '+221 771234567');
check('MA + 6 12 34 56 78', joinPhone('+212', '6 12 34 56 78'), '+212 6 12 34 56 78');

// Idempotence : client copie-colle un numéro déjà avec préfixe
check('Idempotent avec +', joinPhone('+225', '+225 70 000 00 00'), '+225 70 000 00 00');
check('Idempotent sans espace', joinPhone('+225', '+22570000000'), '+22570000000');
check('Idempotent autre pays préfixé', joinPhone('+225', '+33612345678'), '+33612345678');

// Vide
check('Local vide', joinPhone('+225', ''), '');
check('Local que des espaces', joinPhone('+225', '   '), '');

// Trim
check('Trim espaces début/fin', joinPhone('+225', '  70 000 00 00  '), '+225 70 000 00 00');

// Préfixe vide (edge case si pays inconnu)
check('Préfixe vide + local', joinPhone('', '70000000'), '70000000');

// Client tape avec 0 (numéro national) — on le passe tel quel, backend gère
check('Numéro national avec 0', joinPhone('+225', '070000000'), '+225 070000000');

console.log(`\n📊 Résultats : ${pass} ok · ${fail} échecs\n`);
process.exit(fail === 0 ? 0 : 1);
