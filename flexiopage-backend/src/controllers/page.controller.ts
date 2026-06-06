import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as pageService from '../services/page.service';
import { LANDING_TEMPLATES } from '../data/landing-templates';
import { getSectionsFromTemplate, generateLandingWithAI } from '../services/ai-landing.service';
import { generateLandingFromProduct, generateLandingFromImage } from '../services/fal-landing.service';
import { generatePoster, type PosterTheme, type PosterFormat } from '../services/poster.service';
import { generateLandingImage } from '../services/landing-image.service';
import { Product } from '../models/Product.model';
import * as jobService from '../services/generation-job.service';
import { chargeAiGeneration, aiCostInCurrency } from '../services/wallet.service';
import { getOrCreateWallet } from '../services/wallet.service';
import type { AiKind } from '../models/Settings.model';
import validator from 'validator';
import { notifyRevalidate } from '../lib/revalidate';

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
      type: product.type,
      images: product.images,
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
  let productCtx: { name: string; description?: string; price?: number; type?: 'physical' | 'digital'; images?: string[] } | undefined;
  let pBefore: number | undefined;
  let pAfter: number | undefined;
  if (body.productId) {
    const product = await Product.findOne({ _id: body.productId, storeId: store._id }).lean();
    if (product) {
      productCtx = {
        name: product.name,
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
      },
      theme: body.theme,
      format: body.format,
      language: body.language || store.settings?.language,
      country: body.country || store.settings?.country,
      currency: body.currency || store.settings?.currency,
    });
    res.json({ poster, charge });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
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
      },
      language: body.language || store.settings?.language,
      country: body.country || store.settings?.country,
      currency: body.currency || store.settings?.currency,
    });
    res.json({ result, charge });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode || 500).json({ error: e.message || 'Landing image generation failed' });
  }
}
