/**
 * Marketplace côté vendeur — browse du catalogue + acquisition d'un produit
 * dans une boutique. L'acquisition ne débite RIEN au wallet ; le wholesale
 * est prélevé automatiquement à la 1re vente (voir seller-earnings.service).
 */
import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { MarketplaceProduct } from '../models/MarketplaceProduct.model';
import { VendorAcquisition } from '../models/VendorAcquisition.model';
import { Product } from '../models/Product.model';
import { slugify } from '../lib/slugify';
import { notifyRevalidate } from '../lib/revalidate';

// ── Browse global (tout utilisateur authentifié) ────────────────────

/** GET /api/marketplace/products?q=&category=&digitalKind= */
export async function listCatalog(req: AuthRequest, res: Response): Promise<void> {
  const q: Record<string, unknown> = { isActive: true };
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (search) q.title = { $regex: search, $options: 'i' };
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  if (category) q.category = category;
  const digitalKind = typeof req.query.digitalKind === 'string' ? req.query.digitalKind : '';
  if (digitalKind) q.digitalKind = digitalKind;

  const limit = Math.min(Number(req.query.limit) || 30, 100);
  // Les deliverables ne sont pas envoyés côté browse — juste titre, cover,
  // prix, description publique. Le vendeur ne "voit" les fichiers qu'après
  // avoir acquis le produit (ou côté client final via l'ordre).
  const items = await MarketplaceProduct.find(q)
    .select('-deliverableAssets')
    .sort({ 'stats.totalSales': -1, createdAt: -1 })
    .limit(limit)
    .lean();
  res.json({ items });
}

/** GET /api/marketplace/products/:id */
export async function getCatalogItem(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const product = await MarketplaceProduct.findOne({ _id: id, isActive: true })
    .select('-deliverableAssets')
    .lean();
  if (!product) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ product });
}

// ── Store-scoped (requireStoreAccess pose req.store) ────────────────

/**
 * GET /api/stores/:storeId/marketplace/acquisitions
 * Liste les produits marketplace acquis par ce vendeur, dans cette boutique.
 */
export async function listAcquisitions(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const items = await VendorAcquisition.find({ storeId: store._id })
    .populate<{ marketplaceProductId: { _id: mongoose.Types.ObjectId; title: string; coverImage?: string; currency: string; wholesalePrice: number } }>({
      path: 'marketplaceProductId',
      select: 'title coverImage currency wholesalePrice digitalKind',
    })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ items });
}

/**
 * POST /api/stores/:storeId/marketplace/acquire
 * body: { marketplaceProductId, retailPrice, publishNow? }
 *
 * Crée un Product dans la boutique (référence les deliverables marketplace)
 * + une VendorAcquisition en statut `active`. Zéro débit wallet.
 */
export async function acquire(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const vendorId = req.user!._id;
  const body = req.body as Record<string, unknown>;
  const marketplaceProductId = typeof body.marketplaceProductId === 'string' ? body.marketplaceProductId : '';
  const retailPrice = Number(body.retailPrice);
  const publishNow = body.publishNow !== false;

  if (!mongoose.isValidObjectId(marketplaceProductId)) {
    res.status(400).json({ error: 'marketplaceProductId invalide' });
    return;
  }
  if (!Number.isFinite(retailPrice) || retailPrice < 0) {
    res.status(400).json({ error: 'retailPrice invalide' });
    return;
  }

  const marketplace = await MarketplaceProduct.findOne({
    _id: marketplaceProductId,
    isActive: true,
  });
  if (!marketplace) {
    res.status(404).json({ error: 'Produit marketplace introuvable ou inactif' });
    return;
  }

  // Doublon (unique index storeId+marketplaceProductId) — on renvoie l'existant.
  const existing = await VendorAcquisition.findOne({
    storeId: store._id,
    marketplaceProductId: marketplace._id,
  });
  if (existing) {
    res.status(409).json({
      error: 'Ce produit est déjà présent dans cette boutique',
      acquisitionId: existing._id,
      vendorProductId: existing.vendorProductId,
    });
    return;
  }

  // 1) Créer le Product dans la boutique du vendeur.
  const slug = await uniqueProductSlug(store._id, marketplace.title);
  const product = await Product.create({
    storeId: store._id,
    name: marketplace.title,
    slug,
    description: marketplace.description,
    type: 'digital',
    digitalKind: marketplace.digitalKind,
    // MAJ auto : on référence les deliverables marketplace. Toute évolution
    // admin sera visible instantanément dans toutes les boutiques vendeur.
    // (Copie de surface — Mongoose duplique les objets mais on résout en
    // lecture depuis MarketplaceProduct côté ordre pour rester à jour.)
    digitalAssets: marketplace.deliverableAssets,
    price: retailPrice,
    cost: marketplace.wholesalePrice,
    currency: marketplace.currency,
    stock: 0,
    trackInventory: false,
    allowBackorder: true,
    images: marketplace.coverImage ? [marketplace.coverImage] : [],
    isPublished: publishNow,
    sourceMarketplaceId: marketplace._id,
    // sourceAcquisitionId renseigné juste après la création de l'acquisition.
  });

  // 2) Créer la VendorAcquisition (dette latente).
  const acquisition = await VendorAcquisition.create({
    vendorId,
    storeId: store._id,
    marketplaceProductId: marketplace._id,
    vendorProductId: product._id,
    retailPrice,
    currency: marketplace.currency,
    status: 'active',
    wholesaleOwed: marketplace.wholesalePrice,
  });

  // 3) Backfill de la ref sur le Product (chain acquisition→product→acquisition).
  product.sourceAcquisitionId = acquisition._id as mongoose.Types.ObjectId;
  await product.save();

  // 4) Stats catalogue.
  await MarketplaceProduct.updateOne(
    { _id: marketplace._id },
    { $inc: { 'stats.acquisitions': 1 } },
  );

  // 5) Revalidation du storefront vendeur (nouveau produit publié).
  if (publishNow) {
    notifyRevalidate([`store:${store.slug}`, `store:${store.slug}:products`]);
  }

  res.status(201).json({ acquisition, product });
}

async function uniqueProductSlug(
  storeId: mongoose.Types.ObjectId,
  title: string,
): Promise<string> {
  const base = slugify(title, 'product', { ascii: true });
  let candidate = base;
  let n = 2;
  while (await Product.exists({ storeId, slug: candidate })) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}
