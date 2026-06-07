/**
 * Unicode-aware slugifier. The previous local copies in each service kept
 * only [a-z0-9], which silently collapsed Arabic, Chinese, accented French
 * and any non-Latin name to an empty string — and `slug: required` would
 * then reject the document with a useless "Failed to create" error.
 *
 * Keeps every Unicode letter/number, collapses anything else into a single
 * dash, and trims dashes from the ends. The result is URL-safe because
 * browsers percent-encode non-ASCII; we don't try to transliterate (a
 * sensible Arabic→Latin transliterator is a library on its own and
 * preserving the original script matches the seller's intent).
 *
 * If the entire input is filtered out (e.g. emoji-only name), we fall back
 * to `<prefix>-<random>` so the caller never has to guard against `""`.
 * The random suffix avoids unique-index collisions when several products
 * with the same untranslatable name land at the same moment.
 */
import { randomBytes } from 'crypto';

/**
 * @param ascii  Restrict the output to [a-z0-9-]. Use this for store slugs
 *               (they become DNS subdomains, which can't carry raw Unicode
 *               without IDN/punycode). Default is Unicode so product /
 *               collection / page slugs can keep Arabic, French accents, etc.
 */
export function slugify(text: string, fallbackPrefix: string = 'item', opts: { ascii?: boolean } = {}): string {
  const pattern = opts.ascii ? /[^a-z0-9]+/g : /[^\p{L}\p{N}]+/gu;
  const base = (text || '')
    .toLowerCase()
    .replace(pattern, '-')
    .replace(/^-+|-+$/g, '');
  if (base) return base;
  // Random suffix so concurrent inserts with the same untranslatable name
  // don't collide on the unique slug index.
  return `${fallbackPrefix}-${randomBytes(3).toString('hex')}`;
}
