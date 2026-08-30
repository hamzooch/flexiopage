import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as pageService from '../services/page.service';
import * as productService from '../services/product.service';
import { LANDING_TEMPLATES } from '../data/landing-templates';
import { getSectionsFromTemplate, generateLandingWithAI } from '../services/ai-landing.service';
import { generateLandingFromProduct, generateLandingFromImage, runLLM } from '../services/fal-landing.service';
import { generatePoster, type PosterTheme, type PosterFormat } from '../services/poster.service';
import { generateLandingImage } from '../services/landing-image.service';
import { extractProductFromUrl, ImportError } from '../services/product-import.service';
import { persistRemoteImage } from '../services/storage.service';
import { cleanScrapedImages } from '../services/image-generation.service';
import { Product } from '../models/Product.model';
import { AiGeneration } from '../models/AiGeneration.model';
import * as jobService from '../services/generation-job.service';
import { chargeAiGeneration, aiCostInCurrency, refundAiGeneration } from '../services/wallet.service';
import { getOrCreateWallet } from '../services/wallet.service';
import { randomUUID } from 'crypto';
import type { AiKind } from '../models/Settings.model';
import validator from 'validator';
import { logger } from '../lib/logger';
import { notifyRevalidate } from '../lib/revalidate';

/** Nombre max d'images téléchargées quand on importe un produit depuis une URL. */
const MAX_URL_IMPORT_IMAGES = 8;

/**
 * Debit the seller's AI balance before launching a generation. Throws a
 * 402-style error when the balance is too low — the caller surfaces it as
 * an HTTP 402 with `code: 'insufficient_ai_balance'` so the dashboard can
 * prompt the user to top up.
 */
async function chargeOrFail(
  req: AuthRequest,
  res: Response,
  kind: AiKind,
  jobId?: string
): Promise<{ amount: number; balanceAfter: number; currency: string } | null> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  try {
    return await chargeAiGeneration({ userId: req.user._id, kind, jobId });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    // Look up the price in the user's wallet currency so the frontend can
    // show "Top up X TND" with the right amount, not the USD figure.
    let cost = 0;
    try {
      const wallet = await getOrCreateWallet(req.user._id);
      cost = await aiCostInCurrency(kind, wallet.currency);
    } catch { /* fall back to 0 if wallet read fails — already in an error path */ }
    res.status(e.statusCode || 402).json({
      error: e.message,
      code: e.code || 'insufficient_ai_balance',
      cost,
    });
    return null;
  }
}

/** GET /api/stores/:storeId/pages/templates - list professional templates */
export async function getTemplates(_req: AuthRequest, res: Response): Promise<void> {
  res.json({
    templates: LANDING_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      thumbnail: t.thumbnail,
      sectionCount: t.sections.length,
    })),
  });
}

/** POST /api/stores/:storeId/pages/generate-ai - generate landing content with AI or fallback */
export async function generateAiPage(req: AuthRequest, res: Response): Promise<void> {
  const { storeName, productType, productNames, description, tone } = req.body;
  if (!storeName?.trim()) {
    res.status(400).json({ error: 'Store name is required' });
    return;
  }
  const charge = await chargeOrFail(req, res, 'text_only');
  if (!charge) return;
  const result = await generateLandingWithAI({
    storeName: storeName.trim(),
    productType: productType || 'mixed',
    productNames,
    description,
    tone: tone || 'professional',
  });
  res.json(result);
}

/** POST /api/stores/:storeId/pages/generate-from-product - fal.ai landing from a product */
export async function generateFromProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as {
    productId?: string;
    tone?: 'professional' | 'friendly' | 'minimal';
    language?: string;
    country?: string;
    category?: string;
    priceBefore?: number | string;
    priceAfter?: number | string;
    currency?: string;
    pageKind?: 'landing' | 'product';
  };
  const { productId, tone } = body;
  if (!productId) {
    res.status(400).json({ error: 'productId is required' });
    return;
  }
  const product = await Product.findOne({ _id: productId, storeId: store._id }).lean();
  if (!product) {
    res.status(404).json({ error: 'Product not found in this store' });
    return;
  }
  const num = (v: number | string | undefined): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const kind = body.pageKind === 'product' ? 'product_page' : 'landing';
  const charge = await chargeOrFail(req, res, kind);
  if (!charge) return;
  try {
    const result = await generateLandingFromProduct(
      store.name,
      {
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        type: product.type,
        images: product.images,
      },
      tone,
      {
        language: body.language,
        country: body.country,
        category: body.category,
        priceBefore: num(body.priceBefore) ?? product.compareAtPrice,
        priceAfter: num(body.priceAfter) ?? product.price,
        currency: body.currency || store.settings?.currency,
        pageKind: body.pageKind,
      }
    );
    res.json(result);
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode || 500).json({ error: e.message || 'AI generation failed' });
  }
}

/** POST /api/stores/:storeId/pages/generate-from-image - fal.ai landing from an image URL */
export async function generateFromImage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as {
    imageUrl?: string;
    productId?: string;
    tone?: 'professional' | 'friendly' | 'minimal';
    language?: string;
    country?: string;
    category?: string;
    priceBefore?: number | string;
    priceAfter?: number | string;
    currency?: string;
    pageKind?: 'landing' | 'product';
  };
  // sanitizeMiddleware escapes "/" -> "&#x2F;"; reverse it for URL fields
  const imageUrl = typeof body.imageUrl === 'string' ? validator.unescape(body.imageUrl) : '';
  const { productId, tone } = body;
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    res.status(400).json({ error: 'imageUrl (http/https) is required' });
    return;
  }
  let productCtx: Parameters<typeof generateLandingFromImage>[2];
  let productPriceBefore: number | undefined;
  let productPriceAfter: number | undefined;
  if (productId) {
    const product = await Product.findOne({ _id: productId, storeId: store._id }).lean();
    if (product) {
      productCtx = {
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        type: product.type,
        images: product.images,
      };
      productPriceBefore = product.compareAtPrice;
      productPriceAfter = product.price;
    }
  }
  const num = (v: number | string | undefined): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const kind = body.pageKind === 'product' ? 'product_page' : 'landing';
  const charge = await chargeOrFail(req, res, kind);
  if (!charge) return;
  try {
    const result = await generateLandingFromImage(store.name, imageUrl, productCtx, tone, {
      language: body.language,
      country: body.country,
      category: body.category,
      priceBefore: num(body.priceBefore) ?? productPriceBefore,
      priceAfter: num(body.priceAfter) ?? productPriceAfter,
      currency: body.currency || store.settings?.currency,
      pageKind: body.pageKind,
    });
    res.json(result);
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode || 500).json({ error: e.message || 'AI generation failed' });
  }
}

/** POST /api/stores/:storeId/pages/from-template - get sections for a template id */
export async function getSectionsFromTemplateId(req: AuthRequest, res: Response): Promise<void> {
  const { templateId } = req.body;
  if (!templateId) {
    res.status(400).json({ error: 'Template ID is required' });
    return;
  }
  const sections = getSectionsFromTemplate(templateId);
  res.json({ sections });
}

export async function createPage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const storeId = store._id.toString();
  const { name, slug, sections, seoTitle, seoDescription, language, country, currency, direction } = req.body as {
    name?: string;
    slug?: string;
    sections?: unknown[];
    seoTitle?: string;
    seoDescription?: string;
    language?: string;
    country?: string;
    currency?: string;
    direction?: 'ltr' | 'rtl';
  };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Page name is required' });
    return;
  }
  const page = await pageService.createPage({
    storeId,
    name: name.trim(),
    slug,
    sections: (sections as Parameters<typeof pageService.createPage>[0]['sections']) || [],
    seoTitle,
    seoDescription,
    language,
    country,
    currency,
    direction: direction === 'rtl' ? 'rtl' : direction === 'ltr' ? 'ltr' : undefined,
  });
  notifyRevalidate([`store:${store.slug}`, `page:${store.slug}:${page.slug}`]);
  res.status(201).json({ page });
}

export async function listPages(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const kindParam = (req.query.kind as string | undefined)?.toLowerCase();
  const kind = kindParam === 'landing' || kindParam === 'info' ? kindParam : undefined;
  const pages = await pageService.getPagesByStore(store._id.toString(), kind ? { kind } : undefined);
  res.json({ pages });
}

export async function getPage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const page = await pageService.getPageById(req.params.pageId, store._id.toString());
  if (!page) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  res.json({ page });
}

export async function updatePage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const { name, slug, kind, body, sections, seoTitle, seoDescription, ogImage, isPublished, language, country, currency, direction } = req.body;
  const updates: Record<string, unknown> = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (typeof slug === 'string') updates.slug = slug.trim();
  if (kind === 'landing' || kind === 'info') updates.kind = kind;
  if (typeof body === 'string') updates.body = body;
  if (Array.isArray(sections)) updates.sections = sections;
  if (typeof seoTitle === 'string') updates.seoTitle = seoTitle;
  if (typeof seoDescription === 'string') updates.seoDescription = seoDescription;
  if (typeof ogImage === 'string') updates.ogImage = ogImage;
  if (typeof isPublished === 'boolean') updates.isPublished = isPublished;
  if (typeof language === 'string') updates.language = language;
  if (typeof country === 'string') updates.country = country;
  if (typeof currency === 'string') updates.currency = currency;
  if (direction === 'rtl' || direction === 'ltr') updates.direction = direction;
  const updated = await pageService.updatePage(req.params.pageId, store._id.toString(), updates as Parameters<typeof pageService.updatePage>[2]);
  if (!updated) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  notifyRevalidate([`store:${store.slug}`, `page:${store.slug}:${updated.slug}`]);
  res.json({ page: updated });
}

export async function deletePage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const deleted = await pageService.deletePage(req.params.pageId, store._id.toString());
  if (!deleted) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  notifyRevalidate(`store:${store.slug}`);
  res.json({ message: 'Page deleted' });
}

// ─────────────────────────────────────────────────────────────────────
// Async generation jobs — fire-and-forget pipeline + polling endpoint
// ─────────────────────────────────────────────────────────────────────

/** POST /api/stores/:storeId/pages/generate-from-product/async — kick off async job. */
export async function generateFromProductAsync(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const store = req.store!;
  const body = req.body as {
    productId?: string;
    tone?: 'professional' | 'friendly' | 'minimal';
    language?: string;
    country?: string;
    category?: string;
    priceBefore?: number | string;
    priceAfter?: number | string;
    currency?: string;
    pageKind?: 'landing' | 'product';
  };
  if (!body.productId) { res.status(400).json({ error: 'productId is required' }); return; }
  const product = await Product.findOne({ _id: body.productId, storeId: store._id }).lean();
  if (!product) { res.status(404).json({ error: 'Product not found in this store' }); return; }
  const num = (v: number | string | undefined): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const kindFromProduct = body.pageKind === 'product' ? 'product_page' : 'landing';
  const charge = await chargeOrFail(req, res, kindFromProduct);
  if (!charge) return;
  const job = await jobService.createJob({
    storeId: (store._id as { toString(): string }).toString(),
    ownerId: req.user._id.toString(),
    kind: 'landing-from-product',
    input: { productId: body.productId, tone: body.tone, country: body.country, language: body.language },
  });
  // Fire-and-forget — DO NOT await
  void jobService.runLandingPipeline(job._id.toString(), {
    kind: 'landing-from-product',
    storeName: store.name,
    product: {
      name: product.name,
      description: product.description,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      type: product.type,
      images: product.images,
      tags: product.tags,
    },
    tone: body.tone,
    context: {
      language: body.language || store.settings?.language,
      country: body.country || store.settings?.country,
      category: body.category,
      priceBefore: num(body.priceBefore) ?? product.compareAtPrice,
      priceAfter: num(body.priceAfter) ?? product.price,
      currency: body.currency || store.settings?.currency,
      pageKind: body.pageKind,
    },
  });
  res.status(202).json({ jobId: job._id.toString() });
}

/** POST /api/stores/:storeId/pages/generate-from-image/async — kick off async job from inspiration image. */
export async function generateFromImageAsync(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const store = req.store!;
  const body = req.body as {
    imageUrl?: string;
    productId?: string;
    tone?: 'professional' | 'friendly' | 'minimal';
    language?: string;
    country?: string;
    category?: string;
    priceBefore?: number | string;
    priceAfter?: number | string;
    currency?: string;
    pageKind?: 'landing' | 'product';
  };
  const imageUrl = typeof body.imageUrl === 'string' ? validator.unescape(body.imageUrl) : '';
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) { res.status(400).json({ error: 'imageUrl (http/https) is required' }); return; }
  const num = (v: number | string | undefined): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const kindFromImage = body.pageKind === 'product' ? 'product_page' : 'landing';
  const chargeImg = await chargeOrFail(req, res, kindFromImage);
  if (!chargeImg) return;
  let productCtx: { name: string; slug?: string; description?: string; price?: number; type?: 'physical' | 'digital'; images?: string[] } | undefined;
  let pBefore: number | undefined;
  let pAfter: number | undefined;
  if (body.productId) {
    const product = await Product.findOne({ _id: body.productId, storeId: store._id }).lean();
    if (product) {
      productCtx = {
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        type: product.type,
        images: product.images,
      };
      pBefore = product.compareAtPrice;
      pAfter = product.price;
    }
  }
  const job = await jobService.createJob({
    storeId: (store._id as { toString(): string }).toString(),
    ownerId: req.user._id.toString(),
    kind: 'landing-from-image',
    input: { imageUrl, productId: body.productId, country: body.country, language: body.language },
  });
  void jobService.runLandingPipeline(job._id.toString(), {
    kind: 'landing-from-image',
    storeName: store.name,
    imageUrl,
    product: productCtx,
    tone: body.tone,
    context: {
      language: body.language || store.settings?.language,
      country: body.country || store.settings?.country,
      category: body.category,
      priceBefore: num(body.priceBefore) ?? pBefore,
      priceAfter: num(body.priceAfter) ?? pAfter,
      currency: body.currency || store.settings?.currency,
      pageKind: body.pageKind,
    },
  });
  res.status(202).json({ jobId: job._id.toString() });
}

/**
 * POST /api/stores/:storeId/pages/generate-from-url/async
 *
 * Flow complet : URL AliExpress/Alibaba/Amazon → produit importé dans le
 * catalogue → landing page complète (toutes les sections) générée en async.
 *
 * 1. Scrape la page produit (title, description, price, currency, images).
 * 2. Télécharge les images dans notre stockage (persistRemoteImage) — évite
 *    le hotlink sur les CDN externes et évite les 403 depuis FAL/Anthropic.
 * 3. Crée un Product dans le catalogue de la boutique (draft, non publié).
 * 4. Lance le pipeline landing habituel avec ce nouveau productId — la
 *    landing embarque automatiquement le bloc COD form linké au vrai produit.
 * 5. Retourne { jobId, productId } — le front polle le job et redirige vers
 *    l'éditeur une fois terminé.
 *
 * Le billing est identique à `generate-from-product/async` — le seller paie
 * une seule génération landing. L'import produit est offert (pas de facture
 * séparée) parce que c'est un prérequis technique de la landing.
 */
export async function generateFromUrlAsync(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const store = req.store!;
  const body = req.body as {
    url?: string;
    tone?: 'professional' | 'friendly' | 'minimal';
    language?: string;
    country?: string;
    category?: string;
    priceBefore?: number | string;
    priceAfter?: number | string;
    currency?: string;
    pageKind?: 'landing' | 'product';
    /** Override optionnel — sinon on prend le titre scrap depuis l'URL. */
    productName?: string;
  };

  // sanitizeMiddleware HTML-escape les strings du body ; on dé-escape l'URL
  // pour ne pas casser les paramètres (?spm=..., &sku=...).
  const url = validator.unescape((body.url ?? '').toString()).trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'URL requise (http/https)' });
    return;
  }

  const num = (v: number | string | undefined): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const kind = body.pageKind === 'product' ? 'product_page' : 'landing';
  const charge = await chargeOrFail(req, res, kind);
  if (!charge) return;

  // ── 1. Scrape la page produit ────────────────────────────────────────
  let scraped;
  try {
    scraped = await extractProductFromUrl(url);
  } catch (err) {
    const e = err as ImportError;
    // On rembourse pas ici (rien de généré côté LLM/FAL) — juste un 4xx net.
    res.status(e.statusCode || 502).json({ error: e.message || 'URL non supportée ou produit introuvable.' });
    return;
  }

  const storeId = (store._id as { toString(): string }).toString();

  // ── 2. Rapatrie les images dans notre stockage (best-effort) ─────────
  const persistedImages: string[] = [];
  for (const raw of scraped.images.slice(0, MAX_URL_IMPORT_IMAGES)) {
    try {
      persistedImages.push(await persistRemoteImage(raw, `products/${storeId}`));
    } catch (err) {
      logger.warn({ err: (err as Error).message, url: raw }, '[url-to-landing] image non rapatriée — ignorée');
    }
  }

  // ── 2b. Nettoyage IA des images scrapées ─────────────────────────────
  // Les images Alibaba/AliExpress arrivent avec fond chargé + watermarks +
  // résolution moyenne. On passe chaque image dans fal-ai/rembg (retire le
  // fond) + clarity-upscaler (×2 + denoise, atténue les watermarks). Best-
  // effort — si un cleanup échoue, on garde l'image originale.
  // Désactivable via PRODUCT_IMAGE_CLEANUP_ENABLED=false.
  let cleanedImages = persistedImages;
  if (persistedImages.length > 0) {
    try {
      cleanedImages = await cleanScrapedImages(persistedImages);
      // Re-persist les URLs nettoyées (elles pointent vers fal.media, 24h TTL)
      // dans notre stockage. Si la re-persistance échoue, on garde l'URL fal.
      cleanedImages = await Promise.all(
        cleanedImages.map(async (u, i) => {
          if (u === persistedImages[i]) return u; // pas de changement → skip
          try {
            return await persistRemoteImage(u, `products/${storeId}`);
          } catch {
            return u;
          }
        }),
      );
      const changed = cleanedImages.filter((u, i) => u !== persistedImages[i]).length;
      logger.info({ total: persistedImages.length, cleaned: changed }, '[url-to-landing] images nettoyées');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[url-to-landing] cleanup a échoué — on garde les originaux');
    }
  }

  // ── 3. Crée le produit dans le catalogue ────────────────────────────
  // On le laisse non publié : le seller peut le publier depuis l'éditeur
  // de landing s'il veut, ou continuer de le retravailler.
  const productName = (body.productName?.trim() || scraped.title || 'Produit importé').slice(0, 200);
  const product = await productService.createProduct({
    storeId,
    name: productName,
    description: scraped.description,
    type: 'physical',
    price: num(body.priceAfter) ?? scraped.price ?? 0,
    compareAtPrice: num(body.priceBefore),
    stock: 0,
    images: cleanedImages,
    isPublished: false,
    tags: [`import:${scraped.source}`],
  });
  const productId = (product._id as { toString(): string }).toString();

  // ── 4. Lance le pipeline landing habituel avec ce productId ─────────
  const job = await jobService.createJob({
    storeId,
    ownerId: req.user._id.toString(),
    kind: 'landing-from-product',
    input: {
      productId,
      sourceUrl: url,
      source: scraped.source,
      tone: body.tone,
      country: body.country,
      language: body.language,
    },
  });
  void jobService.runLandingPipeline(job._id.toString(), {
    kind: 'landing-from-product',
    storeName: store.name,
    product: {
      name: product.name,
      description: product.description,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      type: product.type,
      images: product.images,
      tags: product.tags,
    },
    tone: body.tone,
    context: {
      language: body.language || store.settings?.language,
      country: body.country || store.settings?.country,
      category: body.category,
      priceBefore: num(body.priceBefore) ?? product.compareAtPrice,
      priceAfter: num(body.priceAfter) ?? product.price,
      currency: body.currency || scraped.currency || store.settings?.currency,
      pageKind: body.pageKind,
    },
  });

  res.status(202).json({
    jobId: job._id.toString(),
    productId,
    scraped: {
      source: scraped.source,
      title: scraped.title,
      imagesImported: cleanedImages.length,
    },
  });
}

/** GET /api/jobs/:jobId — poll endpoint. */
export async function getGenerationJob(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const job = await jobService.getJob(req.params.jobId, req.user._id.toString());
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json({ job });
}

/**
 * POST /api/stores/:storeId/pages/generate-poster
 * Generates a structured PosterContent JSON ready for the frontend renderer.
 * Body: { productId, theme?: 'gold-dark'|'cinema'|'warm-tan', language?, country?, currency? }
 * Synchronous (~30-60s : LLM + 2 avatars). Charges AI balance once on success.
 */
export async function generatePosterPage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as {
    productId?: string;
    theme?: PosterTheme;
    format?: PosterFormat;
    language?: string;
    country?: string;
    currency?: string;
  };
  if (!body.productId) {
    res.status(400).json({ error: 'productId is required' });
    return;
  }
  const product = await Product.findOne({ _id: body.productId, storeId: store._id }).lean();
  if (!product) {
    res.status(404).json({ error: 'Product not found in this store' });
    return;
  }
  // refundKey unique par requête — sert de paymentReference idempotent au
  // refund si la génération échoue. Ainsi une double-tentative de refund
  // (par ex. retry côté ops) n'accumule pas des crédits.
  const refundKey = randomUUID();
  const charge = await chargeOrFail(req, res, 'poster');
  if (!charge) return;
  try {
    const poster = await generatePoster({
      storeName: store.name,
      product: {
        name: product.name,
        description: product.description,
        images: product.images,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        type: product.type,
        tags: product.tags,
      },
      theme: body.theme,
      format: body.format,
      language: body.language || store.settings?.language,
      country: body.country || store.settings?.country,
      currency: body.currency || store.settings?.currency,
    });
    // Historique — sauvegarde jamais bloquante : si Mongo est en carafe on
    // renvoie quand même la réponse au vendeur (il a payé, il aura son résultat).
    AiGeneration.create({
      storeId: store._id,
      ownerId: req.user!._id,
      productId: product._id,
      kind: 'poster',
      result: poster as unknown as Record<string, unknown>,
      cost: charge?.amount,
      preview: {
        thumbnailUrl: product.images?.[0],
        title: product.name,
        subtitle: body.theme || 'poster',
      },
    }).catch((e) => logger.warn({ err: e.message }, '[ai-gen] failed to persist poster'));
    res.json({ poster, charge });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    // Refund : la génération a été débitée avant l'appel. Si le service
    // échoue (fal 502, JSON invalide, timeout), on rend les tokens.
    // Best-effort : si le refund lui-même échoue on log mais on ne masque
    // pas l'erreur d'origine au vendeur.
    if (charge.amount > 0) {
      refundAiGeneration({
        userId: req.user!._id,
        amount: charge.amount,
        refundKey,
        note: `Refund poster · ${(e.message || 'unknown').slice(0, 120)}`,
      }).catch((refundErr) =>
        logger.error({ err: refundErr, userId: req.user!._id.toString() }, '[ai-refund] poster refund failed'),
      );
    }
    res.status(e.statusCode || 500).json({ error: e.message || 'Poster generation failed' });
  }
}

/**
 * POST /api/stores/:storeId/pages/generate-landing-image
 * Generates a single tall 9:16 landing-page DESIGN mockup as an image
 * (TryAd-style): LLM writes the real copy, then an image model composes the
 * full designed page with the seller's product photo as a reference.
 * Body: { productId, language?, country?, currency? }
 * Synchronous (~30-90s). Charges AI balance once on success.
 */
export async function generateLandingImagePage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as {
    productId?: string;
    language?: string;
    country?: string;
    currency?: string;
  };
  if (!body.productId) {
    res.status(400).json({ error: 'productId is required' });
    return;
  }
  const product = await Product.findOne({ _id: body.productId, storeId: store._id }).lean();
  if (!product) {
    res.status(404).json({ error: 'Product not found in this store' });
    return;
  }
  const refundKey = randomUUID();
  const charge = await chargeOrFail(req, res, 'landing');
  if (!charge) return;
  try {
    const result = await generateLandingImage({
      storeName: store.name,
      product: {
        name: product.name,
        description: product.description,
        images: product.images,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        type: product.type,
        tags: product.tags,
      },
      language: body.language || store.settings?.language,
      country: body.country || store.settings?.country,
      currency: body.currency || store.settings?.currency,
    });
    AiGeneration.create({
      storeId: store._id,
      ownerId: req.user!._id,
      productId: product._id,
      kind: 'landing',
      result: result as unknown as Record<string, unknown>,
      cost: charge?.amount,
      preview: {
        thumbnailUrl: result.imageUrl,
        title: product.name,
        subtitle: 'landing',
      },
    }).catch((e) => logger.warn({ err: e.message }, '[ai-gen] failed to persist landing'));
    res.json({ result, charge });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    if (charge.amount > 0) {
      refundAiGeneration({
        userId: req.user!._id,
        amount: charge.amount,
        refundKey,
        note: `Refund landing · ${(e.message || 'unknown').slice(0, 120)}`,
      }).catch((refundErr) =>
        logger.error({ err: refundErr, userId: req.user!._id.toString() }, '[ai-refund] landing refund failed'),
      );
    }
    res.status(e.statusCode || 500).json({ error: e.message || 'Landing image generation failed' });
  }
}

/**
 * GET /api/stores/:storeId/ai-generations?kind=poster|landing|video&limit=10
 * Historique des générations Studio AI pour un store. TTL 30j côté DB
 * (voir AiGeneration.model.ts). Filtrable par kind pour n'afficher que
 * les vidéos dans l'onglet vidéo, etc.
 */
export async function listAiGenerations(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const kindRaw = typeof req.query.kind === 'string' ? req.query.kind : '';
  const allowedKinds = ['poster', 'landing', 'video'] as const;
  const kind = allowedKinds.find((k) => k === kindRaw);
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;

  const filter: Record<string, unknown> = { storeId: store._id };
  if (kind) filter.kind = kind;

  const items = await AiGeneration.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  res.json({ items });
}

/**
 * POST /api/stores/:storeId/pages/generate-video
 * Génère une vidéo IA image-to-video (Seedance Lite) à partir de la 1ʳᵉ
 * photo du produit + un prompt LLM court. Retourne l'URL MP4 hébergée
 * chez fal.media (TTL ~24h — à re-uploader chez soi si conservation).
 * Body: { productId, language?, country?, customPrompt?, duration? }
 * ASYNCHRONE : répond immédiatement { jobId, charge } puis le rendu tourne
 * en tâche de fond (runVideoPipeline) — le frontend poll /api/jobs/:id.
 * Avant, la route attendait la fin du rendu (1-6 min) et nginx coupait la
 * connexion → 502 alors que la vidéo était déjà facturée et rendue.
 */
export async function generateVideoPage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as {
    productId?: string;
    language?: string;
    country?: string;
    customPrompt?: string;
    duration?: number;
    /** Photo source alternative (upload custom / URL / scrape). Si fournie,
     *  remplace la 1ʳᵉ image du produit dans Seedance. */
    sourceImageUrl?: string;
    /** Script de voix-off optionnel. Si présent + non vide, on facture au
     *  tarif `video_with_voice` et le pipeline ajoute une piste TTS muxée. */
    voiceoverScript?: string;
    /** Langue de la voix — défaut = langue du produit / boutique. */
    voiceoverLanguage?: string;
  };
  if (!body.productId) {
    res.status(400).json({ error: 'productId is required' });
    return;
  }
  // Normalisation + validation du voice-over. Trim vide → traité comme absent.
  const voiceoverScript = (body.voiceoverScript || '').trim();
  const wantsVoice = voiceoverScript.length > 0;
  if (wantsVoice && voiceoverScript.length > 300) {
    res.status(400).json({
      error: 'voiceover_script_too_long',
      message: 'Le script du voice-over doit faire au maximum 300 caractères.',
    });
    return;
  }
  const product = await Product.findOne({ _id: body.productId, storeId: store._id }).lean();
  if (!product) {
    res.status(404).json({ error: 'Product not found in this store' });
    return;
  }
  // Valide la sourceImageUrl si fournie — évite d'accepter n'importe quel
  // string qui échouerait plus tard dans le pipeline fal.
  let sourceImageUrl: string | undefined;
  if (body.sourceImageUrl && body.sourceImageUrl.trim()) {
    const raw = body.sourceImageUrl.trim();
    if (!validator.isURL(raw, { protocols: ['http', 'https'], require_protocol: true })) {
      res.status(400).json({ error: 'invalid_source_image_url', message: 'URL image invalide.' });
      return;
    }
    sourceImageUrl = raw;
  }
  const hasImage = (product.images && product.images.length > 0) || !!sourceImageUrl;
  if (!hasImage) {
    res.status(400).json({
      error: 'product_has_no_image',
      message: 'Ce produit n\'a pas de photo. Ajoute une image, uploade-en une ou colle un lien.',
    });
    return;
  }
  // Tarif majoré si voice-over demandé (Settings.aiPricing.prices.video_with_voice).
  // Facturé AVANT la création du job comme pour toutes les générations IA.
  const charge = await chargeOrFail(req, res, wantsVoice ? 'video_with_voice' : 'video');
  if (!charge) return;
  const job = await jobService.createJob({
    storeId: (store._id as { toString(): string }).toString(),
    ownerId: req.user!._id.toString(),
    kind: 'video',
    // chargeAmount stocké sur le job — le pipeline s'en sert pour rembourser
    // via `refundAiGeneration({ refundKey: jobId })` en cas d'échec.
    input: {
      productId: body.productId,
      duration: body.duration,
      language: body.language,
      sourceImageUrl,
      hasVoiceover: wantsVoice,
      chargeAmount: charge.amount,
    },
  });
  // Fire-and-forget — DO NOT await (même pattern que les landing jobs).
  void jobService.runVideoPipeline(job._id.toString(), {
    storeName: store.name,
    product: {
      name: product.name,
      description: product.description,
      images: product.images,
      price: product.price,
      category: product.tags?.[0],
    },
    language: body.language || store.settings?.language,
    country: body.country || store.settings?.country,
    customPrompt: body.customPrompt,
    duration: body.duration,
    sourceImageUrl,
    voiceoverScript: wantsVoice ? voiceoverScript : undefined,
    voiceoverLanguage: body.voiceoverLanguage || body.language || store.settings?.language,
  });
  res.status(202).json({ jobId: job._id.toString(), charge });
}

/**
 * POST /api/stores/:storeId/ai/scrape-image
 * Récupère l'image principale d'une page web (og:image + fallbacks).
 * Utilisé par le Studio Vidéo pour permettre de coller un lien de page
 * produit externe (Amazon, AliExpress…) et anime automatiquement l'image
 * pertinente. Le storeId sert uniquement à scoper l'appel à un vendeur
 * authentifié (aucune persistance côté store).
 * Body: { url }  →  { imageUrl, sourceUrl, title? }
 */
export async function scrapeImageForVideo(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as { url?: string };
  const raw = (body.url || '').trim();
  if (!raw) {
    res.status(400).json({ error: 'url is required' });
    return;
  }
  if (!validator.isURL(raw, { protocols: ['http', 'https'], require_protocol: true })) {
    res.status(400).json({ error: 'invalid_url', message: 'Lien invalide. Format attendu : https://...' });
    return;
  }
  try {
    const { scrapeImageFromUrl, logScrapeOrigin, isScrapeError } = await import('../services/image-scraper.service');
    try {
      const result = await scrapeImageFromUrl(raw);
      logScrapeOrigin(result.sourceUrl, result.origin);
      res.json(result);
    } catch (err) {
      if (isScrapeError(err)) {
        res.status(err.statusCode).json({ error: 'scrape_failed', message: err.publicMessage });
        return;
      }
      throw err;
    }
  } catch (err) {
    logger.error({ err, url: raw }, '[scrape-image] unexpected error');
    res.status(500).json({ error: 'scrape_failed', message: 'Impossible de lire cette page.' });
  }
}

/**
 * UGC vidéo (personnage IA parlant ou en scène). Deux modes distincts :
 *  - `talking-head`  : Hedra Character-1 (avatar + audio TTS lip-sync)
 *  - `lifestyle`     : Kling v2 (avatar + prompt de scène, muet)
 *
 * Facturation : tarif spécifique par mode (video_ugc_talking / video_ugc_lifestyle)
 * facturé AVANT création du job. Retour = jobId pour polling comme pour
 * la vidéo Seedance normale.
 */
export async function generateUgcVideoPage(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as {
    productId?: string;
    mode?: 'talking-head' | 'lifestyle';
    avatarUrl?: string;
    script?: string;
    scenePrompt?: string;
    duration?: number;
    language?: string;
    country?: string;
    voice?: string;
  };

  if (!body.productId) {
    res.status(400).json({ error: 'productId is required' });
    return;
  }
  if (body.mode !== 'talking-head' && body.mode !== 'lifestyle') {
    res.status(400).json({ error: 'invalid_mode', message: 'mode doit être "talking-head" ou "lifestyle".' });
    return;
  }
  if (!body.avatarUrl || !body.avatarUrl.trim()) {
    res.status(400).json({ error: 'avatarUrl is required' });
    return;
  }
  // Validation stricte de l'avatar : doit être une URL http(s) — les
  // vendeurs ne peuvent envoyer que des URLs de notre bibliothèque
  // ou des uploads validés (pas de chemins locaux arbitraires).
  const avatarUrl = body.avatarUrl.trim();
  if (!validator.isURL(avatarUrl, { protocols: ['http', 'https'], require_protocol: true })) {
    res.status(400).json({ error: 'invalid_avatar_url', message: 'URL avatar invalide.' });
    return;
  }
  // Validation payload spécifique au mode.
  const script = (body.script || '').trim();
  const scenePrompt = (body.scenePrompt || '').trim();
  if (body.mode === 'talking-head') {
    if (!script) {
      res.status(400).json({ error: 'script_required', message: 'Le script est obligatoire pour talking-head.' });
      return;
    }
    if (script.length > 300) {
      res.status(400).json({ error: 'script_too_long', message: 'Script max 300 caractères.' });
      return;
    }
  } else {
    if (!scenePrompt) {
      res.status(400).json({ error: 'scenePrompt_required', message: 'Le prompt de scène est obligatoire pour lifestyle.' });
      return;
    }
    if (scenePrompt.length > 300) {
      res.status(400).json({ error: 'scenePrompt_too_long', message: 'Prompt max 300 caractères.' });
      return;
    }
  }

  const product = await Product.findOne({ _id: body.productId, storeId: store._id }).lean();
  if (!product) {
    res.status(404).json({ error: 'Product not found in this store' });
    return;
  }

  const kind = body.mode === 'talking-head' ? 'video_ugc_talking' : 'video_ugc_lifestyle';
  const charge = await chargeOrFail(req, res, kind);
  if (!charge) return;

  const job = await jobService.createJob({
    storeId: (store._id as { toString(): string }).toString(),
    ownerId: req.user!._id.toString(),
    // On reste sur kind='video' côté job pour réutiliser l'historique
    // AiGeneration + la Timeline live (mêmes 4 steps). Le mode UGC est
    // stocké dans input pour debug/analytics.
    kind: 'video',
    input: {
      productId: body.productId,
      ugcMode: body.mode,
      avatarUrl,
      duration: body.duration,
      language: body.language,
      chargeAmount: charge.amount,
    },
  });

  void jobService.runUgcVideoPipeline(job._id.toString(), {
    storeName: store.name,
    product: {
      name: product.name,
      description: product.description,
      images: product.images,
      price: product.price,
      category: product.tags?.[0],
    },
    language: body.language || store.settings?.language,
    country: body.country || store.settings?.country,
    avatarUrl,
    mode: body.mode,
    script: body.mode === 'talking-head' ? script : undefined,
    scenePrompt: body.mode === 'lifestyle' ? scenePrompt : undefined,
    duration: body.duration,
    voice: body.voice,
  });

  res.status(202).json({ jobId: job._id.toString(), charge });
}

/**
 * Génère 3 suggestions de prompts contextualisées au produit — gratuit
 * (0 token débité), pensé pour débloquer les vendeurs coincés devant la
 * textarea vide dans le Studio (poster / landing / video).
 *
 * Le kind cible change le ton :
 *  - `poster`  → prompts visuel produit statique
 *  - `landing` → prompts orientés hero visual / ambiance page produit
 *  - `video`   → prompts cinématiques (mouvement, angle caméra)
 *
 * Retourne toujours 3 items, chaîne courte (~10 mots). Fallback local si
 * le LLM échoue — la fonctionnalité doit rester utile même en cas de
 * fal-ai down.
 */
export async function suggestPrompt(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as { productId?: string; kind?: 'poster' | 'landing' | 'video' };
  if (!body.productId) {
    res.status(400).json({ error: 'productId is required' });
    return;
  }
  const kind = body.kind === 'landing' || body.kind === 'video' ? body.kind : 'poster';
  const product = await Product.findOne({ _id: body.productId, storeId: store._id }).lean();
  if (!product) {
    res.status(404).json({ error: 'Product not found in this store' });
    return;
  }

  const desc = (product.description || '').slice(0, 300);
  const category = product.tags?.[0] || 'produit';
  const brief =
    kind === 'video'
      ? `Suggest 3 short cinematic video prompts (max 15 words each) for an AI image-to-video generator, showcasing the product "${product.name}"${category ? ` (${category})` : ''}. Focus on camera angle, subtle motion, lighting, mood. NO people, NO text overlay.`
      : kind === 'landing'
      ? `Suggest 3 short hero-visual prompts (max 15 words each) for an AI landing page image generator, showcasing the product "${product.name}"${category ? ` (${category})` : ''}. Focus on ambiance, lifestyle context, mood.`
      : `Suggest 3 short poster prompts (max 15 words each) for an AI poster generator, showcasing the product "${product.name}"${category ? ` (${category})` : ''}. Focus on composition, color palette, mood.`;

  const fallback: string[] =
    kind === 'video'
      ? [
          `Rotation lente 360° sur ${product.name}, lumière studio douce, fond neutre`,
          `Dolly-in cinématique sur ${product.name}, ambiance premium, contre-jour chaud`,
          `Plan macro sur les détails de ${product.name}, focus doux, mood éditorial`,
        ]
      : kind === 'landing'
      ? [
          `${product.name} en scène lifestyle, lumière naturelle, ambiance minimaliste`,
          `${product.name} en héro visuel, palette pastel, contexte urbain moderne`,
          `${product.name} en gros plan éditorial, texture premium, fond dégradé`,
        ]
      : [
          `Composition centrée sur ${product.name}, palette chaude, style éditorial`,
          `${product.name} en flat-lay géométrique, palette contrastée, mood pop`,
          `Vue 3/4 de ${product.name}, dégradé pastel, style poster minimaliste`,
        ];

  const prompt = `${brief}

Product name: ${product.name}
${desc ? `Description: ${desc}` : ''}

Output EXACTLY 3 lines, one prompt per line, no numbering, no quotes, no preamble. Each prompt in French (the seller's language).`;

  let suggestions = fallback;
  try {
    const raw = (await runLLM(prompt)).trim();
    const parsed = raw
      .split(/\n+/)
      .map((line) => line.replace(/^["'\-\d.\s)]+|["'\s]+$/g, '').trim())
      .filter((line) => line.length > 5 && line.length < 200)
      .slice(0, 3);
    if (parsed.length === 3) suggestions = parsed;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[suggest-prompt] LLM failed, using fallback');
  }

  res.json({ suggestions, kind });
}
