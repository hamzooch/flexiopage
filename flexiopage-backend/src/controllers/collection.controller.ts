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
