/**
 * Phone helpers for customer-reliability matching (COD).
 *
 * En COD (Maghreb / Afrique de l'Ouest), le même acheteur qui refuse ses
 * colis à répétition change souvent de nom et d'email, mais garde son numéro.
 * Le numéro est donc la vraie clé d'identité d'un client « à risque ».
 *
 * Problème : le même numéro est saisi sous des formes différentes selon la
 * boutique / le formulaire (`+216 20 123 456`, `0021620123456`, `20123456`,
 * `020123456`…). On ne peut pas fiabiliser un indicatif pays sans contexte,
 * donc on agrège sur les **derniers chiffres significatifs** de l'abonné,
 * ce qui réconcilie la grande majorité des variations de format.
 *
 * `phoneKey()` est la clé indexée stockée sur Order.customerPhoneKey.
 */

/** Nombre de chiffres significatifs (partie abonné) utilisés comme clé. */
const KEY_DIGITS = 8;

/** Chiffres bruts, sans aucun séparateur ni indicatif « + » / « 00 ». */
export function phoneDigits(raw?: string | null): string {
  if (!raw) return '';
  let d = String(raw).replace(/\D+/g, '');
  // Préfixe international composé (00 33…) → on retire le trunk 00.
  if (d.startsWith('00')) d = d.slice(2);
  return d;
}

/**
 * Forme normalisée lisible (chiffres, trunk 00 retiré). Sert à l'affichage
 * / au debug, pas au matching.
 */
export function normalizePhone(raw?: string | null): string | undefined {
  const d = phoneDigits(raw);
  return d || undefined;
}

/**
 * Clé d'agrégation d'un client : les derniers `KEY_DIGITS` chiffres du numéro.
 * Deux commandes du même abonné saisies « avec » ou « sans » indicatif pays
 * tombent sur la même clé tant que la partie abonné coïncide. Retourne
 * `undefined` si le numéro est trop court pour être exploitable (bruit).
 */
export function phoneKey(raw?: string | null): string | undefined {
  const d = phoneDigits(raw);
  if (d.length < 6) return undefined; // trop court → pas un vrai numéro
  return d.slice(-KEY_DIGITS);
}
