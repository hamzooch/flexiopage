import { LandingPage, ILandingPage, IPageSection, Direction, PageKind } from '../models/LandingPage.model';
import { slugify } from '../lib/slugify';

export interface CreatePageInput {
  storeId: string;
  name: string;
  slug?: string;
  kind?: PageKind;
  body?: string;
  sections?: IPageSection[];
  seoTitle?: string;
  seoDescription?: string;
  language?: string;
  country?: string;
  currency?: string;
  direction?: Direction;
}

export async function createPage(input: CreatePageInput): Promise<ILandingPage> {
  const baseSlug = input.slug?.trim() || slugify(input.name, 'page');
  let slug = baseSlug;
  let n = 0;
  while (await LandingPage.findOne({ storeId: input.storeId, slug })) {
    n++;
    slug = `${baseSlug}-${n}`;
  }
  return LandingPage.create({
    storeId: input.storeId,
    name: input.name.trim(),
    slug,
    kind: input.kind || 'landing',
    body: input.body,
    sections: input.sections ?? [],
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    language: input.language,
    country: input.country,
    currency: input.currency,
    direction: input.direction || 'ltr',
    isPublished: false,
  });
}

export async function updatePage(
  pageId: string,
  storeId: string,
  updates: Partial<
    Pick<
      ILandingPage,
      | 'name'
      | 'slug'
      | 'kind'
      | 'body'
      | 'sections'
      | 'seoTitle'
      | 'seoDescription'
      | 'ogImage'
      | 'isPublished'
      | 'language'
      | 'country'
      | 'currency'
      | 'direction'
    >
  >
): Promise<ILandingPage | null> {
  if (updates.isPublished) {
    (updates as Record<string, unknown>).publishedAt = new Date();
  }
  return LandingPage.findOneAndUpdate(
    { _id: pageId, storeId },
    { $set: updates },
    { new: true }
  );
}

/**
 * List pages for a store, optionally filtered by `kind`. The dashboard's
 * landing-pages list passes `kind=landing` so the seeded info pages
 * (Conditions, FAQ, Contact…) stay hidden from the marketing-pages flow
 * and are edited only via the store's footer settings.
 */
export async function getPagesByStore(
  storeId: string,
  filter?: { kind?: 'landing' | 'info' }
): Promise<ILandingPage[]> {
  const query: Record<string, unknown> = { storeId };
  if (filter?.kind) query.kind = filter.kind;
  return LandingPage.find(query).sort({ updatedAt: -1 }).lean<ILandingPage[]>();
}

export async function getPageById(pageId: string, storeId: string): Promise<ILandingPage | null> {
  return LandingPage.findOne({ _id: pageId, storeId }).lean<ILandingPage | null>();
}

export async function getPageBySlug(storeId: string, slug: string): Promise<ILandingPage | null> {
  return LandingPage.findOne({ storeId, slug, isPublished: true }).lean<ILandingPage | null>();
}

export async function deletePage(pageId: string, storeId: string): Promise<boolean> {
  const result = await LandingPage.deleteOne({ _id: pageId, storeId });
  return result.deletedCount > 0;
}
