/**
 * Validation de la signature des webhooks Meta (`X-Hub-Signature-256`).
 *
 * Meta signe le corps BRUT de la requête en HMAC-SHA256 avec l'App Secret et
 * envoie l'en-tête `X-Hub-Signature-256: sha256=<hex>`. La comparaison doit se
 * faire sur le rawBody (pas le JSON re-sérialisé) → la route webhook doit donc
 * capturer le rawBody (express.raw ou un verify hook).
 */
import crypto from 'crypto';

/**
 * @param rawBody Corps brut de la requête (Buffer ou string).
 * @param signatureHeader Valeur de l'en-tête `X-Hub-Signature-256`.
 * @param appSecret FACEBOOK_APP_SECRET.
 * @returns true si la signature est valide.
 */
export function validateMetaSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  const [scheme, theirHex] = signatureHeader.split('=');
  if (scheme !== 'sha256' || !theirHex) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(theirHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Comparaison de chaînes à temps constant (anti timing attack). Renvoie false
 * si l'une est absente ou si les longueurs diffèrent (la longueur n'est pas un
 * secret pour un verify token).
 */
export function timingSafeEqualStr(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
