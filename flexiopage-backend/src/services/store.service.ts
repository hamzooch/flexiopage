import { Store, IStore, StoreType } from '../models/Store.model';
import mongoose from 'mongoose';

export interface CreateStoreInput {
  name: string;
  slug?: string;
  description?: string;
  ownerId: mongoose.Types.ObjectId;
  storeType: StoreType;
  theme?: Record<string, unknown>;
  /** Optional locale defaults — used to pre-fill landing page generation. */
  currency?: string;
  language?: string;
  country?: string;
}

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
function directionFor(lang?: string): 'ltr' | 'rtl' {
  if (!lang) return 'ltr';
  return RTL_LANGS.has(lang.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createStore(input: CreateStoreInput): Promise<IStore> {
  // Stores are unlimited under the commission-per-sale model. Sellers pay only
  // when an order is delivered (debited from the wallet), so capping store
  // creation no longer fits the business model.
  const baseSlug = input.slug?.trim() || slugify(input.name);
  let slug = baseSlug;
  let subdomain = baseSlug;
  let n = 0;
  while (await Store.findOne({ $or: [{ slug }, { subdomain }] })) {
    n++;
    slug = `${baseSlug}-${n}`;
    subdomain = slug;
  }
  const lang = input.language?.trim().toLowerCase() || undefined;
  return Store.create({
    ownerId: input.ownerId,
    name: input.name.trim(),
    slug,
    subdomain,
    storeType: input.storeType,
    description: input.description?.trim(),
    theme: input.theme || undefined,
    settings: {
      currency: input.currency?.trim().toUpperCase() || 'USD',
      timezone: 'UTC',
      maintenanceMode: false,
      language: lang,
      country: input.country?.trim().toUpperCase() || undefined,
      direction: directionFor(lang),
    },
  });
}

export async function updateStore(
  storeId: string,
  updates: Partial<Pick<IStore, 'name' | 'description' | 'logo' | 'favicon' | 'customDomain' | 'theme' | 'settings' | 'integrations' | 'isPublished'>>
): Promise<IStore | null> {
  return Store.findByIdAndUpdate(
    storeId,
    { $set: updates },
    { new: true }
  );
}

export async function getStoresByOwner(ownerId: string): Promise<IStore[]> {
  return Store.find({ ownerId }).sort({ updatedAt: -1 }).lean<IStore[]>();
}

export async function getStoreById(storeId: string): Promise<IStore | null> {
  return Store.findById(storeId).lean<IStore | null>();
}

export async function getStoreBySlug(slug: string): Promise<IStore | null> {
  return Store.findOne({ slug, isPublished: true }).lean<IStore | null>();
}

export async function getStoreBySubdomain(subdomain: string): Promise<IStore | null> {
  return Store.findOne({ subdomain, isPublished: true }).lean<IStore | null>();
}

export async function getStoreByCustomDomain(domain: string): Promise<IStore | null> {
  return Store.findOne({ customDomain: domain, isPublished: true }).lean<IStore | null>();
}
