import { Product, IProduct, IProductVariant, IProductPageSettings, IProductBundle } from '../models/Product.model';
import mongoose from 'mongoose';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface CreateProductInput {
  storeId: string;
  name: string;
  description?: string;
  type?: 'physical' | 'digital';
  price: number;
  compareAtPrice?: number;
  cost?: number;
  shippingCost?: number;
  packagingCost?: number;
  marketingCost?: number;
  paymentFeePct?: number;
  paymentFeeFixed?: number;
  sku?: string;
  barcode?: string;
  stock?: number;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  variants?: IProductVariant[];
  images?: string[];
  digitalFileUrl?: string;
  digitalFileName?: string;
  weight?: number;
  weightUnit?: string;
  isPublished?: boolean;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  pageSettings?: IProductPageSettings;
  bundle?: IProductBundle;
}

export async function createProduct(input: CreateProductInput): Promise<IProduct> {
  // Products are unlimited under the commission-per-sale model. The seller is
  // billed when an order is delivered, not for each catalogue item.
  const baseSlug = slugify(input.name);
  let slug = baseSlug;
  let n = 0;
  while (await Product.findOne({ storeId: input.storeId, slug })) {
    n++;
    slug = `${baseSlug}-${n}`;
  }
  return Product.create({
    ...input,
    slug,
    stock: input.stock ?? 0,
    trackInventory: input.trackInventory ?? true,
    allowBackorder: input.allowBackorder ?? false,
    variants: input.variants ?? [],
    images: input.images ?? [],
  });
}

export async function updateProduct(
  productId: string,
  storeId: string,
  updates: Partial<Omit<CreateProductInput, 'storeId'>>
): Promise<IProduct | null> {
  return Product.findOneAndUpdate(
    { _id: productId, storeId },
    { $set: updates },
    { new: true }
  );
}

export async function getProductsByStore(
  storeId: string,
  options?: { publishedOnly?: boolean; limit?: number; skip?: number; search?: string }
): Promise<{ products: IProduct[]; total: number }> {
  const q: Record<string, unknown> = { storeId };
  if (options?.publishedOnly) q.isPublished = true;
  if (options?.search) {
    const re = new RegExp(options.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ name: re }, { slug: re }];
  }
  const [products, total] = await Promise.all([
    Product.find(q)
      .sort({ updatedAt: -1 })
      .limit(options?.limit ?? 1000) // legacy callers : pas de limite stricte
      .skip(options?.skip ?? 0)
      .lean<IProduct[]>(),
    Product.countDocuments(q),
  ]);
  return { products, total };
}

export async function getProductById(productId: string, storeId: string): Promise<IProduct | null> {
  return Product.findOne({ _id: productId, storeId }).lean<IProduct | null>();
}

export async function getProductBySlug(storeId: string, slug: string): Promise<IProduct | null> {
  return Product.findOne({ storeId, slug, isPublished: true }).lean<IProduct | null>();
}

export async function deleteProduct(productId: string, storeId: string): Promise<boolean> {
  const result = await Product.deleteOne({ _id: productId, storeId });
  return result.deletedCount > 0;
}
