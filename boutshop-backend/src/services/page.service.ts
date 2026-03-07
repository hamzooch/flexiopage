import { LandingPage, ILandingPage, IPageSection, Direction } from '../models/LandingPage.model';

export interface CreatePageInput {
  storeId: string;
  name: string;
  slug?: string;
  sections?: IPageSection[];
  seoTitle?: string;
  seoDescription?: string;
  language?: string;
  country?: string;
  currency?: string;
  direction?: Direction;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createPage(input: CreatePageInput): Promise<ILandingPage> {
  const baseSlug = input.slug?.trim() || slugify(input.name) || 'page';
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

export async function getPagesByStore(storeId: string): Promise<ILandingPage[]> {
  return LandingPage.find({ storeId }).sort({ updatedAt: -1 }).lean();
}

export async function getPageById(pageId: string, storeId: string): Promise<ILandingPage | null> {
  return LandingPage.findOne({ _id: pageId, storeId }).lean();
}

export async function getPageBySlug(storeId: string, slug: string): Promise<ILandingPage | null> {
  return LandingPage.findOne({ storeId, slug, isPublished: true }).lean();
}

export async function deletePage(pageId: string, storeId: string): Promise<boolean> {
  const result = await LandingPage.deleteOne({ _id: pageId, storeId });
  return result.deletedCount > 0;
}
