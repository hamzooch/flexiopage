/**
 * Import de produit depuis un lien AliExpress / Alibaba / Amazon.
 *
 * Stratégie HYBRIDE :
 *   1) Extraction gratuite côté serveur (fetch HTML → JSON-LD + OpenGraph +
 *      quelques sélecteurs de repli). Marche souvent pour Amazon ; aléatoire
 *      sur AliExpress/Alibaba (rendus en JS).
 *   2) Repli API tierce OPTIONNEL : si `PRODUCT_SCRAPER_API_URL` +
 *      `PRODUCT_SCRAPER_API_KEY` sont définis et que l'extraction gratuite est
 *      insuffisante, on interroge le service configuré. Tant que ces variables
 *      sont vides, seul le chemin gratuit est utilisé.
 *
 * Sécurité : seuls les domaines AliExpress/Alibaba/Amazon sont acceptés
 * (allowlist anti-SSRF). On n'extrait que les données, on ne persiste rien ici
 * (le téléchargement des images se fait à la création, via persistRemoteImage).
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../lib/logger';

export type ImportSource = 'aliexpress' | 'alibaba' | 'amazon';

export interface ImportedProduct {
  source: ImportSource;
  sourceUrl: string;
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  images: string[];
}

/** Erreur d'import portant un code HTTP pour le contrôleur. */
export class ImportError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'ImportError';
    this.statusCode = statusCode;
  }
}

const MAX_IMAGES = 8;
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/** Détecte la place de marché depuis le hostname. `null` si non supporté. */
export function detectSource(rawUrl: string): ImportSource | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes('aliexpress.')) return 'aliexpress';
  if (host.includes('alibaba.')) return 'alibaba';
  if (host.includes('amazon.') || host.includes('amzn.')) return 'amazon';
  return null;
}

interface Partial {
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  images?: string[];
}

function toPrice(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Extrait depuis les blocs JSON-LD `@type: Product`. */
export function extractFromJsonLd($: cheerio.CheerioAPI): Partial {
  const out: Partial = { images: [] };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    // Aplati @graph et tableaux.
    const candidates: Record<string, unknown>[] = [];
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (Array.isArray(obj['@graph'])) (obj['@graph'] as unknown[]).forEach(visit);
        candidates.push(obj);
      }
    };
    visit(parsed);

    for (const node of candidates) {
      const type = node['@type'];
      const isProduct = Array.isArray(type)
        ? type.some((t) => String(t).toLowerCase() === 'product')
        : String(type).toLowerCase() === 'product';
      if (!isProduct) continue;

      if (!out.title && typeof node.name === 'string') out.title = node.name;
      if (!out.description && typeof node.description === 'string') out.description = node.description;
      for (const img of asArray(node.image as string | string[])) {
        if (typeof img === 'string') out.images!.push(img);
        else if (img && typeof img === 'object' && typeof (img as { url?: string }).url === 'string') {
          out.images!.push((img as { url: string }).url);
        }
      }
      const offers = asArray(node.offers as Record<string, unknown> | Record<string, unknown>[]);
      for (const offer of offers) {
        if (out.price == null) out.price = toPrice(offer.price ?? offer.lowPrice);
        if (!out.currency && typeof offer.priceCurrency === 'string') out.currency = offer.priceCurrency;
      }
    }
  });
  return out;
}

/** Extrait depuis les balises OpenGraph / meta produit. */
export function extractFromOpenGraph($: cheerio.CheerioAPI): Partial {
  const meta = (sel: string): string | undefined => {
    const v = $(sel).attr('content');
    return v && v.trim() ? v.trim() : undefined;
  };
  const images: string[] = [];
  $('meta[property="og:image"], meta[name="og:image"], meta[property="og:image:secure_url"]').each((_, el) => {
    const c = $(el).attr('content');
    if (c) images.push(c.trim());
  });
  const twImg = meta('meta[name="twitter:image"]');
  if (twImg) images.push(twImg);

  return {
    title: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]'),
    description:
      meta('meta[property="og:description"]') ||
      meta('meta[name="description"]') ||
      meta('meta[name="twitter:description"]'),
    price: toPrice(meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]')),
    currency: meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]'),
    images,
  };
}

/** Repli spécifique Amazon (sélecteurs DOM classiques). */
export function extractAmazonFallback($: cheerio.CheerioAPI): Partial {
  const images: string[] = [];
  const hires = $('#landingImage').attr('data-old-hires') || $('#landingImage').attr('src');
  if (hires) images.push(hires);
  return {
    title: $('#productTitle').text().trim() || undefined,
    price: toPrice($('#corePrice_feature_div .a-offscreen').first().text() || $('.a-price .a-offscreen').first().text()),
    images,
  };
}

/** Garde des URLs d'image http(s) uniques. */
function dedupeImages(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (typeof u !== 'string') continue;
    const clean = u.trim();
    if (!/^https?:\/\//i.test(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await axios.get<string>(url, {
      headers: BROWSER_HEADERS,
      timeout: 15_000,
      maxContentLength: 8 * 1024 * 1024,
      responseType: 'text',
      // Les places de marché redirigent beaucoup (langue/région).
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    return typeof res.data === 'string' ? res.data : String(res.data);
  } catch (err) {
    logger.warn({ err: (err as Error).message, url }, '[product-import] fetch HTML échec');
    throw new ImportError("Impossible de récupérer la page (le site a peut-être bloqué la requête).", 502);
  }
}

function extractFreeFromHtml(html: string, source: ImportSource, url: string): ImportedProduct {
  const $ = cheerio.load(html);
  const jsonld = extractFromJsonLd($);
  const og = extractFromOpenGraph($);
  const fb = source === 'amazon' ? extractAmazonFallback($) : {};

  const images = dedupeImages([
    ...(jsonld.images || []),
    ...(og.images || []),
    ...(fb.images || []),
  ]).slice(0, MAX_IMAGES);

  return {
    source,
    sourceUrl: url,
    title: (jsonld.title || og.title || fb.title || '').trim(),
    description: (jsonld.description || og.description || fb.description || '').trim() || undefined,
    price: jsonld.price ?? og.price ?? fb.price,
    currency: jsonld.currency || og.currency || fb.currency,
    images,
  };
}

/**
 * Repli API tierce (Apify / Rainforest / ScraperAPI…). Point d'injection :
 * inactif tant que `PRODUCT_SCRAPER_API_URL` + `PRODUCT_SCRAPER_API_KEY` ne
 * sont pas définis. Le service est interrogé en GET `?url=` et doit renvoyer
 * un JSON contenant tout ou partie de { title, description, price, currency,
 * images }. Adapte le mapping ci-dessous au fournisseur retenu.
 */
async function fetchViaScraperApi(url: string, source: ImportSource): Promise<ImportedProduct | null> {
  const apiUrl = process.env.PRODUCT_SCRAPER_API_URL;
  const apiKey = process.env.PRODUCT_SCRAPER_API_KEY;
  if (!apiUrl || !apiKey) return null;
  try {
    const res = await axios.get(apiUrl, {
      params: { url, api_key: apiKey },
      timeout: 30_000,
    });
    const d = res.data as Record<string, unknown>;
    const images = dedupeImages(asArray(d.images as string | string[])).slice(0, MAX_IMAGES);
    const title = typeof d.title === 'string' ? d.title : '';
    if (!title && images.length === 0) return null;
    return {
      source,
      sourceUrl: url,
      title: title.trim(),
      description: typeof d.description === 'string' ? d.description.trim() : undefined,
      price: toPrice(d.price),
      currency: typeof d.currency === 'string' ? d.currency : undefined,
      images,
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message, url }, '[product-import] API tierce échec');
    return null;
  }
}

/** Combine deux extractions en préférant les champs de `primary`. */
function mergePreferring(primary: ImportedProduct, secondary: ImportedProduct): ImportedProduct {
  return {
    source: primary.source,
    sourceUrl: primary.sourceUrl,
    title: primary.title || secondary.title,
    description: primary.description || secondary.description,
    price: primary.price ?? secondary.price,
    currency: primary.currency || secondary.currency,
    images: dedupeImages([...primary.images, ...secondary.images]).slice(0, MAX_IMAGES),
  };
}

/**
 * Extrait les données produit d'un lien marketplace. Ne persiste rien.
 * @throws ImportError (avec statusCode) si lien non supporté ou extraction vide.
 */
export async function extractProductFromUrl(rawUrl: string): Promise<ImportedProduct> {
  const url = rawUrl.trim();
  const source = detectSource(url);
  if (!source) {
    throw new ImportError('Lien non supporté. Utilise un lien AliExpress, Alibaba ou Amazon.', 400);
  }

  const html = await fetchHtml(url);
  let data = extractFreeFromHtml(html, source, url);

  // Repli API si l'extraction gratuite est insuffisante.
  if (!data.title || data.images.length === 0) {
    const viaApi = await fetchViaScraperApi(url, source);
    if (viaApi) data = mergePreferring(viaApi, data);
  }

  if (!data.title && data.images.length === 0) {
    throw new ImportError(
      "Impossible d'extraire les infos de ce lien. Ajoute le produit manuellement, ou active une API d'import pour ce site.",
      422,
    );
  }
  return data;
}
