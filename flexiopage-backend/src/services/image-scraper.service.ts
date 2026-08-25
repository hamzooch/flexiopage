/**
 * Image scraper — récupère l'image principale d'une page web (OpenGraph &
 * fallbacks). Utilisé par le Studio Vidéo pour permettre de coller une URL
 * de page produit (Amazon, AliExpress, blog…) et anime automatiquement
 * l'image la plus représentative.
 *
 * Ordre de sélection :
 *   1. <meta property="og:image">
 *   2. <meta name="twitter:image">
 *   3. <link rel="image_src">
 *   4. Plus grande <img> plausible dans la page (heuristique par attributs
 *      width/height ou par présence dans un container "product/gallery").
 *
 * Sécurité : bloque loopback, IP privées, .local (SSRF), impose timeout
 * strict, taille max de la page téléchargée.
 */
import * as cheerio from 'cheerio';
import { lookup } from 'dns/promises';
import { logger } from '../lib/logger';

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024; // 3MB — largement suffisant pour un HTML de page.
const USER_AGENT =
  'Mozilla/5.0 (compatible; FlexioPageBot/1.0; +https://flexiopage.com/bot)';

export interface ScrapeResult {
  imageUrl: string;
  sourceUrl: string;
  title?: string;
  origin: 'og:image' | 'twitter:image' | 'image_src' | 'img';
}

class ScrapeError extends Error {
  statusCode: number;
  publicMessage: string;
  constructor(publicMessage: string, statusCode = 400) {
    super(publicMessage);
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

/**
 * SSRF guard : refuse loopback, link-local, private ranges, .local. On
 * résout le DNS explicitement et compare — sinon un attaquant peut viser
 * un service interne (metadata AWS, MongoDB local, etc.).
 */
async function assertSafeUrl(u: URL): Promise<void> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ScrapeError('URL invalide (protocole non supporté).');
  }
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new ScrapeError('URL refusée (hôte interne).');
  }
  try {
    const { address } = await lookup(host);
    if (isPrivateIp(address)) {
      throw new ScrapeError('URL refusée (IP privée).');
    }
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError('Impossible de résoudre le domaine.');
  }
}

function isPrivateIp(ip: string): boolean {
  // IPv4 : 10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, 0.x
  const v4 = ip.split('.').map(Number);
  if (v4.length === 4 && v4.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = v4;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  // IPv6 : bloque loopback/link-local/private
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6.startsWith('fe80:') || v6.startsWith('fc') || v6.startsWith('fd')) {
    return true;
  }
  return false;
}

/** Fetch avec timeout + limite de taille. Retourne le HTML brut. */
async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr,en;q=0.8,ar;q=0.6',
      },
    });
    if (!res.ok) {
      throw new ScrapeError(`La page a répondu ${res.status}. Vérifie le lien.`);
    }
    const ct = res.headers.get('content-type') || '';
    // Si l'URL pointe directement vers une image, court-circuit : on
    // laisse l'appelant utiliser l'URL telle quelle.
    if (ct.startsWith('image/')) {
      throw new ScrapeError(
        'DIRECT_IMAGE',
        200,
      );
    }
    if (!ct.includes('html') && !ct.includes('xml')) {
      throw new ScrapeError('Le lien ne pointe pas vers une page web.');
    }
    // Lecture bornée — on refuse les documents énormes qui pourraient
    // saturer la mémoire.
    const reader = res.body?.getReader();
    if (!reader) throw new ScrapeError('Réponse vide.');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new ScrapeError('Page trop volumineuse (>3MB).');
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return buf.toString('utf8');
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new ScrapeError('La page met trop de temps à répondre.');
    }
    throw new ScrapeError('Impossible de télécharger la page.');
  } finally {
    clearTimeout(timer);
  }
}

/** Retourne une URL absolue à partir d'une URL potentiellement relative. */
function toAbsoluteUrl(raw: string | undefined, base: URL): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

/**
 * Scrape l'image principale de la page. Peut lancer ScrapeError avec un
 * publicMessage prêt à afficher.
 */
export async function scrapeImageFromUrl(rawUrl: string): Promise<ScrapeResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ScrapeError('URL invalide.');
  }
  await assertSafeUrl(parsed);

  // Fetch avec fallback "URL pointe directement vers image".
  let html: string;
  try {
    html = await fetchHtml(parsed.toString());
  } catch (err) {
    if (err instanceof ScrapeError && err.message === 'DIRECT_IMAGE') {
      return {
        imageUrl: parsed.toString(),
        sourceUrl: parsed.toString(),
        origin: 'img',
      };
    }
    throw err;
  }

  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || undefined;

  const og = toAbsoluteUrl($('meta[property="og:image"]').attr('content'), parsed);
  if (og) return { imageUrl: og, sourceUrl: parsed.toString(), title, origin: 'og:image' };

  const tw = toAbsoluteUrl($('meta[name="twitter:image"]').attr('content'), parsed);
  if (tw) return { imageUrl: tw, sourceUrl: parsed.toString(), title, origin: 'twitter:image' };

  const linkImg = toAbsoluteUrl($('link[rel="image_src"]').attr('href'), parsed);
  if (linkImg) return { imageUrl: linkImg, sourceUrl: parsed.toString(), title, origin: 'image_src' };

  // Fallback : la plus grande <img> plausible. On score par (w * h) quand
  // disponibles, sinon on prend la première non-tracking pixel.
  let best: { url: string; score: number } | null = null;
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    const abs = toAbsoluteUrl(src, parsed);
    if (!abs) return;
    // Ignore data URIs, SVG inline et pixels espions <=32px.
    if (abs.startsWith('data:')) return;
    const w = parseInt($(el).attr('width') || '0', 10) || 0;
    const h = parseInt($(el).attr('height') || '0', 10) || 0;
    if ((w && w < 64) || (h && h < 64)) return;
    const score = w && h ? w * h : 1;
    if (!best || score > best.score) best = { url: abs, score };
  });
  if (best) {
    return { imageUrl: (best as { url: string; score: number }).url, sourceUrl: parsed.toString(), title, origin: 'img' };
  }

  throw new ScrapeError('Aucune image trouvée sur cette page.');
}

/**
 * Utilitaire : masque de type-guard pour reconnaître nos erreurs publiques.
 */
export function isScrapeError(err: unknown): err is ScrapeError {
  return err instanceof ScrapeError;
}

// Petit log discret pour debug — on trace les origines pour ajuster la
// stratégie si un site échoue trop souvent.
export function logScrapeOrigin(url: string, origin: ScrapeResult['origin']): void {
  logger.info({ url, origin }, '[image-scraper] resolved');
}
