/**
 * Admin marketplace catalog — CRUD des produits digitaux mis à disposition
 * des vendeurs. Les mutations sont réservées à requireAdminWrite (admin+).
 * Voir marketplace-vendor.controller.ts pour l'acquisition côté vendeur.
 */
import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { MarketplaceProduct } from '../models/MarketplaceProduct.model';
import { VendorAcquisition } from '../models/VendorAcquisition.model';
import { slugify } from '../lib/slugify';
import { logAudit } from '../services/audit-log.service';

/** GET /api/admin/marketplace/products?q=&category=&isActive= */
export async function listProducts(req: AuthRequest, res: Response): Promise<void> {
  const q: Record<string, unknown> = {};
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (search) q.title = { $regex: search, $options: 'i' };
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  if (category) q.category = category;
  if (typeof req.query.isActive === 'string') {
    q.isActive = req.query.isActive === 'true';
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const items = await MarketplaceProduct.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ items });
}

/** GET /api/admin/marketplace/products/:id */
export async function getProduct(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const product = await MarketplaceProduct.findById(id).lean();
  if (!product) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  // Compte les acquisitions pour info rapide dans le detail admin.
  const acquisitions = await VendorAcquisition.countDocuments({ marketplaceProductId: id });
  res.json({ product, acquisitions });
}

/** POST /api/admin/marketplace/products */
export async function createProduct(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const digitalKind = typeof body.digitalKind === 'string' ? body.digitalKind : '';
  const wholesalePrice = Number(body.wholesalePrice);
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : '';

  if (!title || !digitalKind || !currency || !Number.isFinite(wholesalePrice) || wholesalePrice < 0) {
    res.status(400).json({ error: 'title, digitalKind, currency, wholesalePrice sont requis' });
    return;
  }

  const slug = await uniqueSlug(title);
  const product = await MarketplaceProduct.create({
    title,
    slug,
    description: typeof body.description === 'string' ? body.description : undefined,
    category: typeof body.category === 'string' ? body.category.trim() : undefined,
    digitalKind,
    coverImage: typeof body.coverImage === 'string' ? body.coverImage : undefined,
    previewAssets: Array.isArray(body.previewAssets) ? body.previewAssets : [],
    deliverableAssets: Array.isArray(body.deliverableAssets) ? body.deliverableAssets : [],
    wholesalePrice,
    suggestedRetailPrice:
      body.suggestedRetailPrice !== undefined ? Number(body.suggestedRetailPrice) : undefined,
    currency,
    isActive: body.isActive !== false,
    tags: Array.isArray(body.tags) ? body.tags : [],
    stats: { acquisitions: 0, totalSales: 0 },
  });

  await logAudit({
    action: 'marketplace.product_create',
    req,
    targetId: product._id,
    targetType: 'marketplace_product',
    summary: `Marketplace: created ${product.title}`,
    metadata: { wholesalePrice, currency },
  });

  res.status(201).json({ product });
}

/** PATCH /api/admin/marketplace/products/:id */
export async function updateProduct(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const product = await MarketplaceProduct.findById(id);
  if (!product) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const body = req.body as Record<string, unknown>;

  const before = { wholesalePrice: product.wholesalePrice, isActive: product.isActive };

  if (typeof body.title === 'string' && body.title.trim()) product.title = body.title.trim();
  if (typeof body.description === 'string') product.description = body.description;
  if (typeof body.category === 'string') product.category = body.category.trim();
  if (typeof body.digitalKind === 'string') {
    product.digitalKind = body.digitalKind as typeof product.digitalKind;
  }
  if (typeof body.coverImage === 'string') product.coverImage = body.coverImage;
  if (Array.isArray(body.previewAssets)) product.previewAssets = body.previewAssets as never;
  if (Array.isArray(body.deliverableAssets)) product.deliverableAssets = body.deliverableAssets as never;
  if (body.wholesalePrice !== undefined) {
    const wp = Number(body.wholesalePrice);
    if (!Number.isFinite(wp) || wp < 0) {
      res.status(400).json({ error: 'wholesalePrice invalide' });
      return;
    }
    product.wholesalePrice = wp;
  }
  if (body.suggestedRetailPrice !== undefined) {
    product.suggestedRetailPrice = Number(body.suggestedRetailPrice);
  }
  if (typeof body.currency === 'string' && body.currency.trim()) {
    product.currency = body.currency.trim().toUpperCase();
  }
  if (typeof body.isActive === 'boolean') product.isActive = body.isActive;
  if (Array.isArray(body.tags)) product.tags = body.tags as string[];

  await product.save();

  await logAudit({
    action: 'marketplace.product_update',
    req,
    targetId: product._id,
    targetType: 'marketplace_product',
    summary: `Marketplace: updated ${product.title}`,
    metadata: {
      before,
      after: { wholesalePrice: product.wholesalePrice, isActive: product.isActive },
    },
  });

  res.json({ product });
}

/**
 * DELETE /api/admin/marketplace/products/:id
 * On refuse la suppression si des acquisitions existent — sinon on casserait
 * la référence des Products vendeur qui pointent dessus. L'admin peut à la
 * place désactiver le produit (isActive=false), ce qui l'enlève du catalogue
 * sans toucher aux boutiques existantes.
 */
export async function deleteProduct(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const acquisitions = await VendorAcquisition.countDocuments({ marketplaceProductId: id });
  if (acquisitions > 0) {
    res.status(409).json({
      error: 'Produit déjà acquis par des vendeurs — désactivez-le au lieu de le supprimer',
      acquisitions,
    });
    return;
  }
  const product = await MarketplaceProduct.findByIdAndDelete(id);
  if (!product) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await logAudit({
    action: 'marketplace.product_delete',
    req,
    targetId: id,
    targetType: 'marketplace_product',
    summary: `Marketplace: deleted ${product.title}`,
  });
  res.json({ ok: true });
}

/** Génère un slug unique en suffixant -2, -3… si collision. */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title, 'marketplace-product', { ascii: true });
  let candidate = base;
  let n = 2;
  while (await MarketplaceProduct.exists({ slug: candidate })) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}
