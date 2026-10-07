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

interface DialRule {
  dial: string;
  /** Longueur du numéro national, sans le 0 de composition. */
  nsn: readonly [number, number];
}

/** Indicatifs les plus longs d'abord, pour ne pas confondre 221 et un préfixe plus court. */
const DIAL_RULES: DialRule[] = [
  { dial: '221', nsn: [9, 9] },
  { dial: '225', nsn: [10, 10] },
  { dial: '223', nsn: [8, 8] },
  { dial: '226', nsn: [8, 8] },
  { dial: '229', nsn: [8, 10] },
  { dial: '228', nsn: [8, 8] },
  { dial: '224', nsn: [9, 9] },
  { dial: '227', nsn: [8, 8] },
  { dial: '220', nsn: [7, 7] },
  { dial: '233', nsn: [9, 9] },
  { dial: '234', nsn: [10, 10] },
  { dial: '237', nsn: [9, 9] },
  { dial: '212', nsn: [9, 9] },
  { dial: '216', nsn: [8, 8] },
  { dial: '213', nsn: [9, 9] },
  { dial: '218', nsn: [9, 10] },
  { dial: '351', nsn: [9, 9] },
  { dial: '39', nsn: [8, 11] },
  { dial: '34', nsn: [9, 9] },
  { dial: '33', nsn: [9, 9] },
  { dial: '32', nsn: [8, 9] },
  { dial: '49', nsn: [10, 11] },
  { dial: '31', nsn: [9, 9] },
  { dial: '41', nsn: [9, 9] },
];

function inNsn(len: number, nsn: readonly [number, number]): boolean {
  return len >= nsn[0] && len <= nsn[1];
}

/** Ramène la partie nationale à la longueur attendue, selon le pays. */
function nationalDigits(rule: DialRule, national: string): string | undefined {
  if (inNsn(national.length, rule.nsn)) return national;
  if (national.startsWith('0')) {
    const stripped = national.slice(1);
    if (inNsn(stripped.length, rule.nsn)) return stripped;
  }
  // Côte d'Ivoire : 07 / 05 / 01 font partie des 10 chiffres. Un 0 oublié se remet.
  if (rule.dial === '225' && national.length === 9 && /^[157]/.test(national)) {
    return `0${national}`;
  }
  return undefined;
}

function matchDial(digits: string): string | undefined {
  for (const rule of DIAL_RULES) {
    if (!digits.startsWith(rule.dial)) continue;
    const national = nationalDigits(rule, digits.slice(rule.dial.length));
    if (!national) continue;
    const full = rule.dial + national;
    if (full.length >= 8 && full.length <= 15) return `+${full}`;
  }
  return undefined;
}

/**
 * Numéro acheteur en `+` et chiffres, sans espace.
 * Accepte les espaces, tirets, un `00`, un indicatif déjà collé, un 0 national
 * en trop (France, Maroc, Sénégal) et le 0 obligatoire de Côte d'Ivoire.
 * `dialHint` est l'indicatif choisi dans le formulaire (`+225`) quand le
 * client n'a saisi que la partie locale.
 */
export function formatBuyerPhone(raw?: string | null, dialHint?: string | null): string | undefined {
  const digits = phoneDigits(raw);
  if (!digits) return undefined;

  const fromFull = matchDial(digits);
  if (fromFull) return fromFull;

  const hint = (dialHint || '').replace(/\D/g, '');
  const rule = DIAL_RULES.find((item) => item.dial === hint);
  if (rule) {
    const national = nationalDigits(rule, digits);
    if (national) {
      const full = rule.dial + national;
      if (full.length >= 8 && full.length <= 15) return `+${full}`;
    }
  }

  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return undefined;
}

/** Format CinetPay : `+` puis 8 à 15 chiffres, aucun espace. */
export function e164Phone(raw?: string | null): string | undefined {
  return formatBuyerPhone(raw);
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
