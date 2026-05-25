import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as productService from '../services/product.service';
import { generateProductDescription as runProductDescription } from '../services/product-ai.service';
import { chargeAiGeneration, getOrCreateWallet, aiCostInCurrency } from '../services/wallet.service';
import { extractProductFromUrl, ImportError } from '../services/product-import.service';
import { persistRemoteImage } from '../services/storage.service';
import { logger } from '../lib/logger';

const MAX_IMPORT_IMAGES = 8;

export async function createProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const storeId = store._id.toString();
  const body = req.body;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Product name is required' });
    return;
  }
  if (typeof body.price !== 'number' || body.price < 0) {
    res.status(400).json({ error: 'Valid price is required' });
    return;
  }
  const product = await productService.createProduct({
    storeId,
    name: body.name.trim(),
    description: body.description,
    type: body.type || 'physical',
    price: body.price,
    compareAtPrice: body.compareAtPrice,
    cost: body.cost,
    shippingCost: body.shippingCost,
    packagingCost: body.packagingCost,
    marketingCost: body.marketingCost,
    paymentFeePct: body.paymentFeePct,
    paymentFeeFixed: body.paymentFeeFixed,
    sku: body.sku,
    barcode: body.barcode,
    stock: body.stock ?? 0,
    trackInventory: body.trackInventory ?? true,
    allowBackorder: body.allowBackorder ?? false,
    variants: body.variants,
    images: body.images,
    digitalFileUrl: body.digitalFileUrl,
    digitalFileName: body.digitalFileName,
    weight: body.weight,
    weightUnit: body.weightUnit,
    isPublished: body.isPublished ?? false,
    tags: Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean)
      : undefined,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
  });
  res.status(201).json({ product });
}

/**
 * POST /api/stores/:storeId/products/import-preview
 * Extrait les infos d'un lien AliExpress/Alibaba/Amazon SANS créer le produit.
 * Renvoie des URLs d'images externes (téléchargées seulement à la création).
 */
export async function importProductPreview(req: AuthRequest, res: Response): Promise<void> {
  const url = (req.body?.url ?? '').toString().trim();
  if (!url) {
    res.status(400).json({ error: 'URL requise' });
    return;
  }
  try {
    const preview = await extractProductFromUrl(url);
    res.json({ preview });
  } catch (err) {
    const e = err as ImportError;
    res.status(e.statusCode || 500).json({ error: e.message || "Échec de l'import" });
  }
}

/**
 * POST /api/stores/:storeId/products/import
 * Crée le produit à partir de l'aperçu édité par le vendeur. Les images
 * externes (http) sont rapatriées dans notre stockage (pas de hotlink).
 */
export async function importCreateProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const storeId = store._id.toString();
  const body = req.body;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Product name is required' });
    return;
  }
  if (typeof body.price !== 'number' || body.price < 0) {
    res.status(400).json({ error: 'Valid price is required' });
    return;
  }

  // Rapatrie les images externes ; on ignore proprement celles qui échouent.
  const rawImages: string[] = Array.isArray(body.images)
    ? body.images.filter((u: unknown): u is string => typeof u === 'string')
    : [];
  const images: string[] = [];
  for (const url of rawImages.slice(0, MAX_IMPORT_IMAGES)) {
    try {
      images.push(await persistRemoteImage(url, `products/${storeId}`));
    } catch (err) {
      logger.warn({ err: (err as Error).message, url }, '[product-import] image non rapatriée — ignorée');
    }
  }

  const product = await productService.createProduct({
    storeId,
    name: body.name.trim(),
    description: body.description,
    type: body.type === 'digital' ? 'digital' : 'physical',
    price: body.price,
    compareAtPrice: body.compareAtPrice,
    sku: body.sku,
    stock: body.stock ?? 0,
    images,
    isPublished: body.isPublished ?? false,
    tags: Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean)
      : undefined,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
  });
  res.status(201).json({ product });
}

export async function listProducts(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const publishedOnly = req.query.published === 'true';
  const products = await productService.getProductsByStore(store._id.toString(), { publishedOnly });
  res.json({ products });
}

export async function getProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const productId = req.params.productId;
  const product = await productService.getProductById(productId, store._id.toString());
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json({ product });
}

export async function updateProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const productId = req.params.productId;
  const body = req.body;
  const updated = await productService.updateProduct(productId, store._id.toString(), {
    name: body.name,
    description: body.description,
    type: body.type,
    price: body.price,
    compareAtPrice: body.compareAtPrice,
    cost: body.cost,
    shippingCost: body.shippingCost,
    packagingCost: body.packagingCost,
    marketingCost: body.marketingCost,
    paymentFeePct: body.paymentFeePct,
    paymentFeeFixed: body.paymentFeeFixed,
    sku: body.sku,
    barcode: body.barcode,
    stock: body.stock,
    trackInventory: body.trackInventory,
    allowBackorder: body.allowBackorder,
    variants: body.variants,
    images: body.images,
    digitalFileUrl: body.digitalFileUrl,
    digitalFileName: body.digitalFileName,
    weight: body.weight,
    weightUnit: body.weightUnit,
    isPublished: body.isPublished,
    tags: Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean)
      : undefined,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    pageSettings: body.pageSettings,
    bundle: body.bundle,
  });
  if (!updated) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json({ product: updated });
}

export async function deleteProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const deleted = await productService.deleteProduct(req.params.productId, store._id.toString());
  if (!deleted) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json({ message: 'Product deleted' });
}

/**
 * POST /api/stores/:storeId/products/generate-description
 *
 * Generate a punchy, locally-voiced product description from the
 * (sparse) info the seller already typed. Charged from the wallet's
 * `text_only` bucket — same plumbing as the AI landing page.
 *
 * Body: { name, category?, keywords?, language?, country?, tone?, price?, currency? }
 */
export async function generateProductDescription(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const store = req.store;
  const body = req.body as {
    name?: string;
    category?: string;
    keywords?: string;
    language?: string;
    country?: string;
    tone?: 'engaging' | 'professional' | 'luxury' | 'youthful' | 'minimal';
    price?: number;
    currency?: string;
  };
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Product name is required' });
    return;
  }

  // Charge the AI wallet first — same pattern as the landing-page endpoints,
  // so the seller never pays for a failed call.
  let charge: { amount: number; balanceAfter: number; currency: string } | null = null;
  try {
    charge = await chargeAiGeneration({ userId: req.user._id, kind: 'text_only' });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    let cost = 0;
    try {
      const wallet = await getOrCreateWallet(req.user._id);
      cost = await aiCostInCurrency('text_only', wallet.currency);
    } catch { /* ignore */ }
    res.status(e.statusCode || 402).json({
      error: e.message,
      code: e.code || 'insufficient_ai_balance',
      cost,
    });
    return;
  }

  try {
    const result = await runProductDescription({
      name: body.name.trim(),
      category: body.category?.trim(),
      keywords: body.keywords?.trim(),
      language: body.language || store?.settings?.language,
      country: body.country || store?.settings?.country,
      tone: body.tone,
      price: typeof body.price === 'number' ? body.price : undefined,
      currency: body.currency || store?.settings?.currency,
    });
    res.json({ description: result.description, charge });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode || 500).json({
      error: e.message || 'Description generation failed',
    });
  }
}
