/**
 * Générateur Code 128-B (sous-ensemble B : ASCII 32-126) sans dépendance.
 * Utilisé pour imprimer un code-barres scannable du numéro de commande sur le
 * bordereau de livraison. Retourne la séquence de largeurs de modules
 * (barres/espaces en alternance, en commençant par une barre), à dessiner en
 * SVG côté composant.
 */

// Table canonique des 108 patterns Code 128 (largeurs de modules).
// Index 0-102 = données, 104 = Start B, 106 = Stop.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/**
 * Encode `text` en Code 128-B. Renvoie la liste des largeurs de modules
 * (1er élément = barre, puis alternance). Les caractères hors ASCII 32-126
 * sont ignorés.
 */
export function encodeCode128B(text: string): number[] {
  // Ne garde que l'ASCII imprimable (32-126) supporté par le sous-ensemble B.
  const codes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 32 && code <= 126) codes.push(code - 32);
  }

  const values: number[] = [START_B];
  for (let i = 0; i < codes.length; i++) values.push(codes[i]);

  // Checksum : (Start + Σ position·valeur) mod 103.
  let sum = START_B;
  for (let i = 0; i < codes.length; i++) sum += codes[i] * (i + 1);
  values.push(sum % 103);
  values.push(STOP);

  const modules: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const pattern = PATTERNS[values[i]];
    for (let j = 0; j < pattern.length; j++) modules.push(Number(pattern[j]));
  }
  return modules;
}
