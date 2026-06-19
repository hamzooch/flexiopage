/**
 * Authenticated collection controller — seller dashboard endpoints.
 *
 * Public listing & per-slug endpoints are wired separately in public.routes.ts
 * because they don't need auth (storefront pages call them directly).
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as collectionService from '../services/collection.service';
import type { ICollectionRules } from '../models/Collection.model';
import { notifyRevalidate } from '../lib/revalidate';

interface CollectionBody {
  name?: string;
  description?: string;
  image?: string;
  type?: 'manual' | 'auto';
  productIds?: string[];
  rules?: ICollectionRules;
  sortOrder?: number;
  isPublished?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

export async function listCollections(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const collections = await collectionService.listCollections(store._id.toString());
  res.json({ collections });
}

export async function createCollection(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as CollectionBody;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Collection name is required' });
    return;
  }
  const collection = await collectionService.createCollection({
    storeId: store._id.toString(),
    name: body.name.trim(),
    description: body.description,
    image: body.image,
    type: body.type || 'manual',
    productIds: body.productIds,
    rules: body.rules,
    sortOrder: body.sortOrder,
    isPublished: body.isPublished,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
  });
  notifyRevalidate([`store:${store.slug}`, `collection:${store.slug}:${collection.slug}`]);
  res.status(201).json({ collection });
}

export async function getCollection(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const collection = await collectionService.getCollectionById(req.params.collectionId, store._id.toString());
  if (!collection) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  // Resolve products too — saves a roundtrip for the dashboard editor.
  const products = await collectionService.resolveCollectionProducts(collection, { publishedOnly: false });
  res.json({ collection, products });
}

export async function updateCollection(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as CollectionBody;
  const updated = await collectionService.updateCollection(
    req.params.collectionId,
    store._id.toString(),
    {
      name: body.name?.trim(),
      description: body.description,
      image: body.image,
      type: body.type,
      productIds: body.productIds,
      rules: body.rules,
      sortOrder: body.sortOrder,
      isPublished: body.isPublished,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
    }
  );
  if (!updated) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  notifyRevalidate([`store:${store.slug}`, `collection:${store.slug}:${updated.slug}`]);
  res.json({ collection: updated });
}

export async function deleteCollection(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const ok = await collectionService.deleteCollection(req.params.collectionId, store._id.toString());
  if (!ok) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  notifyRevalidate(`store:${store.slug}`);
  res.status(204).end();
}

/**
 * GET /api/stores/:storeId/products/:productId/collections
 * Liste les IDs des collections MANUELLES qui contiennent ce produit —
 * utilisé par la page d'édition produit pour pré-cocher les checkboxes.
 */
export async function getProductCollections(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const collectionIds = await collectionService.listCollectionsForProduct(
    store._id.toString(),
    req.params.productId,
  );
  res.json({ collectionIds });
}

/**
 * POST /api/stores/:storeId/products/:productId/collections
 * Body : { collectionIds: string[] }
 * Définit l'appartenance du produit aux collections manuelles ciblées.
 * Le diff est calculé côté serveur — pas besoin que le client envoie
 * d'opérations add/remove explicites.
 */
export async function setProductCollections(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = (req.body || {}) as { collectionIds?: unknown };
  const list = Array.isArray(body.collectionIds)
    ? body.collectionIds.filter((x): x is string => typeof x === 'string')
    : [];
  const updated = await collectionService.setProductCollections(
    store._id.toString(),
    req.params.productId,
    list,
  );
  // Revalide la home + toutes les pages collection touchées (la revalid
  // par slug réveille la page collection publique correspondante).
  const tags = [`store:${store.slug}`, ...updated.map((c) => `collection:${store.slug}:${c.slug}`)];
  notifyRevalidate(tags);
  res.json({ collections: updated });
}
