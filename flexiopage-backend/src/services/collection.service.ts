/**
 * Service layer for Collection — handles slug generation, CRUD, and the
 * crucial `resolveProducts` helper that returns the actual product set for
 * a collection (either the explicit productIds for manual, or the result
 * of the Mongo query built from `rules` for auto).
 */
import mongoose, { FilterQuery } from 'mongoose';
import { Collection, ICollection, ICollectionRules } from '../models/Collection.model';
import { Product, IProduct } from '../models/Product.model';
import { slugify } from '../lib/slugify';

export interface CreateCollectionInput {
  storeId: string;
  name: string;
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

export async function createCollection(input: CreateCollectionInput): Promise<ICollection> {
  const baseSlug = slugify(input.name, 'collection');
  let slug = baseSlug;
  let n = 0;
  while (await Collection.findOne({ storeId: input.storeId, slug })) {
    n++;
    slug = `${baseSlug}-${n}`;
  }
  return Collection.create({
    storeId: input.storeId,
    name: input.name.trim(),
    slug,
    description: input.description,
    image: input.image,
    type: input.type || 'manual',
    productIds: (input.productIds || []).map((id) => new mongoose.Types.ObjectId(id)),
    rules: input.rules,
    sortOrder: input.sortOrder ?? 0,
    isPublished: input.isPublished ?? true,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  });
}

export type UpdateCollectionInput = Partial<Omit<CreateCollectionInput, 'storeId'>>;

export async function updateCollection(
  collectionId: string,
  storeId: string,
  updates: UpdateCollectionInput
): Promise<ICollection | null> {
  const $set: Record<string, unknown> = { ...updates };
  if (Array.isArray(updates.productIds)) {
    $set.productIds = updates.productIds.map((id) => new mongoose.Types.ObjectId(id));
  }
  return Collection.findOneAndUpdate(
    { _id: collectionId, storeId },
    { $set },
    { new: true }
  );
}

export async function listCollections(
  storeId: string,
  options?: { publishedOnly?: boolean }
): Promise<ICollection[]> {
  const q: FilterQuery<ICollection> = { storeId };
  if (options?.publishedOnly) q.isPublished = true;
  return Collection.find(q).sort({ sortOrder: 1, createdAt: -1 }).lean<ICollection[]>();
}

export async function getCollectionById(collectionId: string, storeId: string): Promise<ICollection | null> {
  return Collection.findOne({ _id: collectionId, storeId }).lean<ICollection | null>();
}

export async function getCollectionBySlug(storeId: string, slug: string): Promise<ICollection | null> {
  return Collection.findOne({ storeId, slug, isPublished: true }).lean<ICollection | null>();
}

export async function deleteCollection(collectionId: string, storeId: string): Promise<boolean> {
  const r = await Collection.deleteOne({ _id: collectionId, storeId });
  return r.deletedCount > 0;
}

/**
 * Resolve the product set for a collection — handles both manual and auto.
 *
 * Manual: returns the products listed in `productIds` preserving the seller's
 * chosen order. Missing/deleted ids are silently dropped.
 *
 * Auto: builds a Mongo query from `rules` and returns matches sorted by
 * most-recently-updated (so freshly added products surface first).
 */
export async function resolveCollectionProducts(
  collection: ICollection,
  options?: { publishedOnly?: boolean }
): Promise<IProduct[]> {
  const publishedOnly = options?.publishedOnly ?? true;

  if (collection.type === 'manual') {
    const ids = collection.productIds || [];
    if (ids.length === 0) return [];
    const q: FilterQuery<IProduct> = { _id: { $in: ids }, storeId: collection.storeId };
    if (publishedOnly) q.isPublished = true;
    const docs = await Product.find(q).lean<IProduct[]>();
    // Restore the seller's chosen order from the original ids array.
    const order = new Map(ids.map((id, i) => [String(id), i]));
    return docs.sort((a, b) =>
      (order.get(String(a._id)) ?? Infinity) - (order.get(String(b._id)) ?? Infinity)
    );
  }

  // ── Auto collection ────────────────────────────────────────────
  const rules = collection.rules || {};
  const q: FilterQuery<IProduct> = { storeId: collection.storeId };
  if (publishedOnly && rules.publishedOnly !== false) q.isPublished = true;
  if (rules.anyTags && rules.anyTags.length > 0) q.tags = { $in: rules.anyTags };
  if (typeof rules.minPrice === 'number' || typeof rules.maxPrice === 'number') {
    const price: Record<string, number> = {};
    if (typeof rules.minPrice === 'number') price.$gte = rules.minPrice;
    if (typeof rules.maxPrice === 'number') price.$lte = rules.maxPrice;
    q.price = price;
  }
  return Product.find(q).sort({ updatedAt: -1 }).lean<IProduct[]>();
}

/**
 * Définit l'appartenance d'un produit à un set précis de collections
 * MANUELLES. Calcule le diff côté serveur : ajoute le produit aux
 * collections cibles qui ne le contenaient pas, retire le produit des
 * collections manuelles non sélectionnées qui le contenaient. Les
 * collections automatiques (règles) sont ignorées — elles se résolvent
 * à la lecture.
 *
 * Retourne la liste à jour des collections du store pour que le client
 * puisse synchroniser son état sans refaire un GET.
 */
export async function setProductCollections(
  storeId: string,
  productId: string,
  targetCollectionIds: string[],
): Promise<ICollection[]> {
  const all = await Collection.find({ storeId });
  const targets = new Set(targetCollectionIds.map(String));
  const tasks: Promise<unknown>[] = [];
  for (const col of all) {
    if (col.type !== 'manual') continue;
    const id = String(col._id);
    const has = (col.productIds || []).some((p) => String(p) === productId);
    const wanted = targets.has(id);
    if (wanted && !has) {
      tasks.push(
        Collection.updateOne({ _id: col._id }, { $addToSet: { productIds: productId } }),
      );
    } else if (!wanted && has) {
      tasks.push(
        Collection.updateOne({ _id: col._id }, { $pull: { productIds: productId } }),
      );
    }
  }
  await Promise.all(tasks);
  return Collection.find({ storeId }).sort({ sortOrder: 1, name: 1 }).lean<ICollection[]>();
}

/**
 * Liste les IDs des collections manuelles contenant ce produit. Utilisé
 * par la page d'édition produit pour pré-cocher les bonnes cases.
 */
export async function listCollectionsForProduct(
  storeId: string,
  productId: string,
): Promise<string[]> {
  const docs = await Collection.find({ storeId, type: 'manual', productIds: productId })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }[]>();
  return docs.map((d) => String(d._id));
}
