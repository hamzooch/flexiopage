/**
 * Frontend type shape for product Collections. Mirrors
 * backend/src/models/Collection.model.ts but kept narrow — only the fields
 * the dashboard / storefront actually read.
 */

export type CollectionType = 'manual' | 'auto';

export interface CollectionRules {
  anyTags?: string[];
  minPrice?: number;
  maxPrice?: number;
  publishedOnly?: boolean;
}

export interface Collection {
  _id: string;
  storeId: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  type: CollectionType;
  productIds: string[];
  rules?: CollectionRules;
  sortOrder: number;
  isPublished: boolean;
  seoTitle?: string;
  seoDescription?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Trimmed product shape returned alongside a collection — enough to render
 * a product card grid without re-fetching the full catalog.
 */
export interface ProductLite {
  _id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  images?: string[];
  type?: 'physical' | 'digital';
  isPublished?: boolean;
  tags?: string[];
}
