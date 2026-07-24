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
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../lib/logger';

/**
 * Marketplace détectée. Les 3 majeurs sont typés explicitement pour permettre
 * un fallback spécifique (ex. selectors Amazon custom), `'other'` couvre tout
 * le reste (Shopify, WooCommerce, boutique perso…) — ces URLs sont traitées
 * uniquement par le fallback Jina + LLM (extraction AI) car on n'a aucune
 * connaissance a priori du schéma HTML.
 */
export type ImportSource = 'aliexpress' | 'alibaba' | 'amazon' | 'other';

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

/**
 * Détecte la place de marché depuis le hostname. Retourne :
 *  - `'aliexpress' | 'alibaba' | 'amazon'` quand on reconnaît un des 3 grands
 *    (extraction avec selectors optimisés + fallbacks Cheerio).
 *  - `'other'` pour toute URL http(s) valide → le fallback Jina + LLM prendra
 *    le relai. C'est ce qui permet d'importer depuis Shopify, WooCommerce, ou
 *    n'importe quelle boutique en ligne.
 *  - `null` uniquement si l'URL n'est pas parseable ou pas http(s).
 */
export function detectSource(rawUrl: string): ImportSource | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  if (host.includes('aliexpress.')) return 'aliexpress';
  if (host.includes('alibaba.')) return 'alibaba';
  if (host.includes('amazon.') || host.includes('amzn.')) return 'amazon';
  return 'other';
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

// ─────────────────────────────────────────────────────────────────────
// Fallback Jina Reader + Claude Haiku
// ─────────────────────────────────────────────────────────────────────
// Jina Reader (r.jina.ai) est un service gratuit qui prend n'importe quelle
// URL, exécute le JavaScript, contourne la plupart des anti-bots, et retourne
// le contenu de la page en markdown propre. On l'utilise comme fallback
// gratuit et "AI-friendly" pour AliExpress/Amazon (souvent bloqués en HTTP
// direct) et pour toute boutique en ligne non-listée (`source: 'other'`).
//
// On envoie ensuite le markdown à Claude Haiku 4.5 (déjà intégré via le
// botstore) qui extrait un JSON structuré { title, description, price,
// currency, images }. Coût ~0,003 $ par extraction — bien plus rentable
// qu'un abonnement scraping.

const JINA_READER_BASE = 'https://r.jina.ai';
// 60s : `X-Engine: browser` charge un vrai Chromium et attend le rendu JS,
// c'est significativement plus lent que le mode HTTP direct (2-5s → 15-45s
// selon la page). 60s couvre les worst-cases sans laisser l'utilisateur
// bloqué éternellement.
const JINA_TIMEOUT_MS = 60_000;
const JINA_MAX_CHARS = 60_000; // borne l'input Claude — 60k chars ≈ 15k tokens
const JINA_LLM_MODEL = process.env.PRODUCT_IMPORT_MODEL || 'claude-haiku-4-5-20251001';

let _anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (_anthropicClient) return _anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropicClient;
}

/**
 * Récupère la page via Jina Reader et retourne le markdown propre.
 * @throws ImportError 502 si Jina répond mal.
 */
async function fetchViaJina(url: string): Promise<string> {
  const target = `${JINA_READER_BASE}/${url}`;
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'X-Return-Format': 'markdown',
    // `X-Engine: browser` force Jina à ouvrir un vrai Chromium côté serveur
    // au lieu du fetch HTTP rapide. C'est ~2× plus lent MAIS c'est ce qui
    // permet de passer les captchas AliExpress, les 403 Amazon, et le
    // rendu JavaScript des Shopify/WooCommerce. Sans ce header, ces sites
    // renvoient un mur anti-bot que le LLM ne peut pas interpréter.
    'X-Engine': 'browser',
    // Garde les métadonnées produit dans le rendu.
    'X-Retain-Images': 'all',
  };
  // Clé API Jina facultative — sans clé on est sur le free-tier public
  // (rate-limit à quelques req/min mais gratuit). Avec clé, quota bien plus
  // large. On l'utilise si présente.
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }
  try {
    const res = await axios.get<string>(target, {
      headers,
      timeout: JINA_TIMEOUT_MS,
      responseType: 'text',
      transformResponse: (data) => data, // évite le auto-parse JSON
      maxContentLength: 8 * 1024 * 1024,
      // Accepte tous les status pour parser le corps d'erreur nous-mêmes
      // (Jina renvoie ses erreurs en JSON avec des detail exploitables).
      validateStatus: () => true,
    });
    // Jina renvoie ses erreurs en JSON avec des codes parlants — on les
    // parse pour donner un message actionnable au vendeur/admin plutôt
    // qu'un opaque 502. Les cas fréquents :
    //   403 + AbuseAlleviationError : le domaine est banni en anonyme →
    //     l'admin doit configurer JINA_API_KEY pour ré-attribuer les
    //     requêtes à son compte.
    //   422 + SubmittedDataMalformedError : URL non résolue (DNS/typo).
    //   429 : rate-limit du free-tier → JINA_API_KEY débloque.
    if (res.status < 200 || res.status >= 300) {
      // Jina renvoie ses erreurs sous DEUX formats selon l'Accept :
      //   - JSON `{ code, name, message }` quand Accept: application/json
      //   - PLAIN TEXT `"AbuseAlleviationError: <message>"` quand Accept: text/plain
      //     (comportement observé — c'est notre cas puisqu'on demande du markdown).
      // On gère les 2 pour surfacer un motif précis.
      let jinaCode: string | undefined;
      let jinaMsg: string | undefined;
      const raw = typeof res.data === 'string' ? res.data : String(res.data || '');
      if (raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw) as { code?: number; name?: string; message?: string };
          jinaCode = parsed.name;
          jinaMsg = parsed.message;
        } catch { /* pas de JSON exploitable */ }
      } else if (res.data && typeof res.data === 'object') {
        const p = res.data as { name?: string; message?: string };
        jinaCode = p.name;
        jinaMsg = p.message;
      } else {
        // Format plain text : "<ErrorName>: <message>"
        const m = raw.match(/^([A-Za-z]+Error):\s*(.+)$/s);
        if (m) {
          jinaCode = m[1];
          jinaMsg = m[2].trim();
        }
      }

      // Blocage anti-abuse : le seul remède est de configurer une clé Jina.
      if (jinaCode === 'AbuseAlleviationError' && !process.env.JINA_API_KEY) {
        const domain = (() => {
          try { return new URL(url).hostname; } catch { return 'ce domaine'; }
        })();
        logger.warn(
          { url, domain, jinaMsg },
          '[product-import] Jina bloque le domaine en anonyme — configure JINA_API_KEY',
        );
        throw new ImportError(
          `Jina Reader a bloqué l'accès anonyme à ${domain} (abus signalé sur ce domaine par un autre utilisateur). ` +
          `Solution : ajoute JINA_API_KEY dans .env (clé gratuite sur https://jina.ai/reader/). ` +
          `Avec une clé, les requêtes sont attribuées à ton compte et le blocage anonyme ne s'applique plus.`,
          502,
        );
      }
      // Autres 403/429 : on donne quand même un indice utile.
      if (res.status === 403 || res.status === 429) {
        logger.warn(
          { url, status: res.status, jinaCode, jinaMsg },
          '[product-import] Jina refuse la requête',
        );
        throw new ImportError(
          `Jina Reader a refusé la requête (HTTP ${res.status}${jinaCode ? ` — ${jinaCode}` : ''}). ` +
          `${!process.env.JINA_API_KEY ? 'Ajouter JINA_API_KEY dans .env peut résoudre le blocage (free-tier généreux sur https://jina.ai/reader/). ' : ''}` +
          (jinaMsg || 'Sans détail supplémentaire.'),
          502,
        );
      }
      // 4xx/5xx génériques.
      logger.warn(
        { url, status: res.status, jinaCode, jinaMsg },
        '[product-import] Jina Reader échec',
      );
      throw new ImportError(
        `Jina Reader n'a pas pu lire la page (HTTP ${res.status}${jinaCode ? ` — ${jinaCode}` : ''}). ${jinaMsg || ''}`.trim(),
        502,
      );
    }

    const md = typeof res.data === 'string' ? res.data : String(res.data);
    if (!md || md.length < 200) {
      throw new ImportError('Jina Reader a renvoyé une page vide.', 502);
    }
    return md.slice(0, JINA_MAX_CHARS);
  } catch (err) {
    if (err instanceof ImportError) throw err;
    logger.warn({ err: (err as Error).message, url }, '[product-import] Jina Reader échec (réseau/timeout)');
    throw new ImportError('Impossible de récupérer la page via Jina (réseau/timeout).', 502);
  }
}

/**
 * Fait extraire par Claude Haiku les champs produit depuis le markdown Jina.
 * Retourne `null` si la clé Anthropic est absente ou si le LLM échoue —
 * l'appelant gère le fallthrough gracieusement.
 */
async function extractWithLLM(
  markdown: string,
  url: string,
  source: ImportSource,
): Promise<ImportedProduct | null> {
  const client = getAnthropic();
  if (!client) {
    logger.warn('[product-import] ANTHROPIC_API_KEY manquant, fallback LLM désactivé');
    return null;
  }
  const systemPrompt = [
    "Tu es un extracteur de données produit pour un site e-commerce.",
    "Tu reçois le contenu markdown d'une page produit et tu retournes UN SEUL objet JSON, rien d'autre — pas de prose, pas de balises markdown.",
    "Schéma JSON attendu :",
    "{",
    '  "title": string (nom exact du produit tel que sur la page, sans le nom du site),',
    '  "description": string (2-4 phrases descriptives ; peut inclure specs clés) ou null,',
    '  "price": number (prix courant, sans symbole devise) ou null,',
    '  "currency": string (code ISO 4217 ou symbole, ex "USD", "EUR", "$") ou null,',
    '  "images": string[] (URLs absolues des images produit, max 8, ordre haute qualité en premier)',
    "}",
    "Règles :",
    "- N'invente jamais de valeur. Si tu n'es pas sûr, mets null pour ce champ (ou [] pour images).",
    "- Ne retourne QUE le JSON. Pas de ```json, pas de commentaire.",
    "- Les URLs d'images doivent être des URLs http(s) absolues telles qu'elles apparaissent dans le markdown (motifs `![alt](URL)`). Ignore les favicons, sprites, avatars vendeurs, images de note/étoiles.",
    "- Le prix est celui affiché comme prix de vente courant — pas le prix barré, pas un accessoire.",
  ].join('\n');

  try {
    const resp = await client.messages.create({
      model: JINA_LLM_MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: systemPrompt }],
      messages: [
        {
          role: 'user',
          content: `URL source: ${url}\n\n---\n\n${markdown}`,
        },
      ],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    // Claude peut renvoyer accidentellement ```json ...```; on nettoie.
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.warn({ raw: cleaned.slice(0, 200) }, '[product-import] LLM JSON parse échec');
      return null;
    }
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const images = dedupeImages(asArray(parsed.images as string | string[]))
      .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
      .slice(0, MAX_IMAGES);
    if (!title && images.length === 0) return null;
    return {
      source,
      sourceUrl: url,
      title,
      description: typeof parsed.description === 'string' ? parsed.description.trim() : undefined,
      price: toPrice(parsed.price),
      currency: typeof parsed.currency === 'string' ? parsed.currency : undefined,
      images,
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message, url }, '[product-import] LLM extraction échec');
    return null;
  }
}

/**
 * Pipeline Jina + LLM : récupère le markdown puis fait extraire par Claude.
 * Retourne { product | null, error? } — l'appelant peut remonter le motif
 * précis (blocage anti-abuse, DNS, LLM manquant, etc.) au lieu du générique
 * "impossible d'extraire".
 */
async function fetchViaJinaLLM(
  url: string,
  source: ImportSource,
): Promise<{ product: ImportedProduct | null; error?: string }> {
  try {
    const markdown = await fetchViaJina(url);
    const product = await extractWithLLM(markdown, url, source);
    if (!product) {
      return { product: null, error: 'Claude Haiku n\'a rien extrait d\'exploitable du markdown Jina.' };
    }
    return { product };
  } catch (err) {
    const message = (err as Error).message;
    logger.warn({ err: message, url }, '[product-import] Jina+LLM pipeline échec');
    return { product: null, error: message };
  }
}

/**
 * Extrait les données produit d'un lien e-commerce. Ne persiste rien.
 *
 * Cascade des tentatives :
 *   1. Fetch HTML direct (axios + Cheerio) — gratuit, marche pour les petits
 *      sites qui exposent proprement JSON-LD / OpenGraph.
 *   2. Repli API tierce (ScraperAPI, Rainforest…) — actif seulement si
 *      PRODUCT_SCRAPER_API_URL + KEY sont set.
 *   3. Repli Jina Reader + Claude Haiku — gratuit, marche pour AliExpress,
 *      Amazon, Alibaba (souvent bloqués en direct) ET pour toute autre
 *      boutique en ligne (Shopify, WooCommerce, page perso). C'est le
 *      chemin par défaut recommandé pour cette feature.
 *
 * @throws ImportError (avec statusCode) si lien non supporté ou toutes les
 *         tentatives échouent.
 */
export async function extractProductFromUrl(rawUrl: string): Promise<ImportedProduct> {
  const url = rawUrl.trim();
  const source = detectSource(url);
  if (!source) {
    throw new ImportError('Lien non supporté. Colle un lien http(s) vers une page produit.', 400);
  }

  const empty: ImportedProduct = {
    source,
    sourceUrl: url,
    title: '',
    description: undefined,
    price: undefined,
    currency: undefined,
    images: [],
  };
  let data = empty;
  // Dernière raison d'échec (Jina blocage, LLM manquant, HTTP 404, etc.) —
  // remontée dans le message d'erreur final pour que le vendeur/admin voit
  // exactement où le pipeline a bloqué (au lieu du générique "impossible").
  let lastError: string | undefined;

  // Stratégie de cascade :
  //   - Marketplaces connus (AliExpress/Alibaba/Amazon) : Cheerio en premier
  //     car on a des selectors optimisés (extractAmazonFallback, patterns
  //     JSON-LD adaptés). En cas d'échec/blocage → Jina+LLM.
  //   - Autres sites ('other') : Jina+LLM en premier car on n'a AUCUNE
  //     connaissance du HTML — les balises OpenGraph attrappent souvent la
  //     méta du site plutôt que du produit. Cheerio ne sert que de repli.
  const preferLlmFirst = source === 'other';

  if (!preferLlmFirst) {
    try {
      const html = await fetchHtml(url);
      data = extractFreeFromHtml(html, source, url);
    } catch (err) {
      lastError = `Fetch direct: ${(err as Error).message}`;
      logger.info(
        { url, err: (err as Error).message },
        '[product-import] fetch direct impossible — bascule fallback Jina/LLM',
      );
    }

    if (!data.title || data.images.length === 0) {
      const viaApi = await fetchViaScraperApi(url, source);
      if (viaApi) data = mergePreferring(viaApi, data);
      else if (process.env.PRODUCT_SCRAPER_API_URL) lastError = 'ScraperAPI tiers a échoué';
    }

    if (!data.title || data.images.length === 0) {
      const { product: viaLlm, error } = await fetchViaJinaLLM(url, source);
      if (viaLlm) data = mergePreferring(viaLlm, data);
      else if (error) lastError = error;
    }
  } else {
    // 'other' → Jina+LLM d'abord (extraction AI = source de vérité).
    const { product: viaLlm, error } = await fetchViaJinaLLM(url, source);
    if (viaLlm) data = viaLlm;
    else if (error) lastError = error;

    // Complète avec ce que Cheerio peut ajouter (rare mais bonus quand
    // l'HTML a un beau JSON-LD Product). On MERGE en préférant le LLM.
    if (!data.title || data.images.length === 0) {
      try {
        const html = await fetchHtml(url);
        const viaCheerio = extractFreeFromHtml(html, source, url);
        data = mergePreferring(data, viaCheerio);
      } catch {
        /* silencieux : le LLM est déjà notre source principale ici */
      }
    }

    if (!data.title || data.images.length === 0) {
      const viaApi = await fetchViaScraperApi(url, source);
      if (viaApi) data = mergePreferring(data, viaApi);
    }
  }

  if (!data.title && data.images.length === 0) {
    // On remonte la vraie raison au vendeur/admin — pas juste "impossible".
    // Ça permet de savoir immédiatement s'il faut ajouter JINA_API_KEY, si
    // c'est un DNS bidon, ou si le LLM a bug.
    const detail = lastError ? `\n\nDétail : ${lastError}` : '';
    throw new ImportError(
      `Impossible d'extraire les infos de ce lien. Vérifie l'URL, ou ajoute le produit manuellement.${detail}`,
      422,
    );
  }
  return data;
}
