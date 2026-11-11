import {
  Product,
  IProduct,
  IProductVariant,
  IProductPageSettings,
  IProductBundle,
  IProductSupplier,
  IDigitalAsset,
  ICourseModule,
  DigitalKind,
  ProductTestStatus,
} from '../models/Product.model';
import mongoose from 'mongoose';
import validator from 'validator';
import { slugify } from '../lib/slugify';

/** Upsell / cross-sell row as accepted from the dashboard. */
export interface RelatedOfferInput {
  productId: string;
  label?: string;
  discountPct?: number;
  order?: number;
}

// Le `sanitizeMiddleware` global applique `validator.escape` sur toutes les
// strings du body à l'entrée (& → &amp;, / → &#x2F;, etc.). Les produits
// créés avant qu'on dé-escape à l'écriture ont donc leur nom / description
// stockés avec des entities HTML, ce qui s'affiche littéralement dans React
// (React ne décode pas les entities dans les text nodes). On dé-escape ici,
// à la sortie du service, pour que les produits legacy s'affichent
// correctement sans migration de données.
function decodeDisplayText<T extends IProduct | null>(product: T): T {
  if (!product) return product;
  const p = product as IProduct;
  if (typeof p.name === 'string') p.name = validator.unescape(p.name);
  if (typeof p.description === 'string') p.description = validator.unescape(p.description);
  if (typeof p.seoTitle === 'string') p.seoTitle = validator.unescape(p.seoTitle);
  if (typeof p.seoDescription === 'string') p.seoDescription = validator.unescape(p.seoDescription);
  if (Array.isArray(p.variants)) {
    for (const v of p.variants) {
      if (v && typeof v.name === 'string') v.name = validator.unescape(v.name);
    }
  }
  return product;
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
  digitalKind?: DigitalKind;
  digitalAssets?: IDigitalAsset[];
  courseModules?: ICourseModule[];
  licenseKeyTemplate?: string;
  accessType?: 'lifetime' | 'limited';
  accessDays?: number;
  downloadLimit?: number;
  weight?: number;
  weightUnit?: string;
  isPublished?: boolean;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  pageSettings?: IProductPageSettings;
  bundle?: IProductBundle;
  upsells?: RelatedOfferInput[];
  crossSells?: RelatedOfferInput[];
  suppliers?: IProductSupplier[];
  isTestCandidate?: boolean;
  testStatus?: ProductTestStatus;
  wowEffect?: number;
  problemSolving?: number;
  testNotes?: string;
}

export async function createProduct(input: CreateProductInput): Promise<IProduct> {
  // Products are unlimited under the commission-per-sale model. The seller is
  // billed when an order is delivered, not for each catalogue item.
  const baseSlug = slugify(input.name, 'product');
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

export type ProductListView = 'live' | 'draft' | 'low' | 'out' | 'sku';

const MISSING_SKU = {
  type: { $ne: 'digital' },
  $and: [
    { $or: [{ sku: { $exists: false } }, { sku: null }, { sku: '' }] },
    {
      $or: [
        { variants: { $exists: false } },
        { variants: { $size: 0 } },
        { variants: { $elemMatch: { $or: [{ sku: { $exists: false } }, { sku: null }, { sku: '' }] } } },
      ],
    },
  ],
};

export async function getProductsByStore(
  storeId: string,
  options?: {
    publishedOnly?: boolean;
    limit?: number;
    skip?: number;
    search?: string;
    testCandidatesOnly?: boolean;
    testStatus?: ProductTestStatus;
    /** Vue catalogue vendeur : en ligne, brouillon, stock, SKU manquant. */
    view?: ProductListView;
  }
): Promise<{ products: IProduct[]; total: number }> {
  const and: Record<string, unknown>[] = [{ storeId }];
  if (options?.publishedOnly || options?.view === 'live') and.push({ isPublished: true });
  if (options?.view === 'draft') and.push({ isPublished: { $ne: true } });
  if (options?.view === 'low') {
    and.push({
      type: { $ne: 'digital' },
      trackInventory: { $ne: false },
      stock: { $gt: 0, $lte: 5 },
    });
  }
  if (options?.view === 'out') {
    and.push({
      type: { $ne: 'digital' },
      trackInventory: { $ne: false },
      $or: [{ stock: { $lte: 0 } }, { stock: { $exists: false } }, { stock: null }],
    });
  }
  if (options?.view === 'sku') and.push(MISSING_SKU);
  if (options?.testCandidatesOnly) and.push({ isTestCandidate: true });
  if (options?.testStatus) and.push({ testStatus: options.testStatus });
  if (options?.search) {
    const re = new RegExp(options.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    and.push({ $or: [{ name: re }, { slug: re }, { sku: re }] });
  }
  const q: Record<string, unknown> = and.length === 1 ? and[0] : { $and: and };
  const limit = options?.limit ?? 1000; // legacy callers : pas de limite stricte
  const skip = options?.skip ?? 0;

  // Pipeline de test : les potentiels winning products (wow + problem solving
  // élevés) remontent en tête pour guider le vendeur sur quoi tester en premier.
  if (options?.testCandidatesOnly) {
    // Aggregation ne caste pas les strings → ObjectId comme find() : on force.
    const storeOid = mongoose.isValidObjectId(storeId)
      ? new mongoose.Types.ObjectId(storeId)
      : storeId;
    const match: Record<string, unknown> = Array.isArray(q.$and)
      ? {
          $and: (q.$and as Record<string, unknown>[]).map((clause) =>
            Object.prototype.hasOwnProperty.call(clause, 'storeId') ? { ...clause, storeId: storeOid } : clause,
          ),
        }
      : { ...q, storeId: storeOid };
    const facet = await Product.aggregate<{
      products: IProduct[];
      total: Array<{ n: number }>;
    }>([
      { $match: match },
      {
        $addFields: {
          winningScore: {
            $add: [
              { $multiply: [{ $ifNull: ['$wowEffect', 0] }, 0.55] },
              { $multiply: [{ $ifNull: ['$problemSolving', 0] }, 0.45] },
            ],
          },
        },
      },
      { $sort: { winningScore: -1, wowEffect: -1, problemSolving: -1, updatedAt: -1 } },
      {
        $facet: {
          products: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'n' }],
        },
      },
    ]);
    const products = (facet[0]?.products || []) as IProduct[];
    const total = facet[0]?.total?.[0]?.n ?? 0;
    for (const p of products) decodeDisplayText(p);
    return { products, total };
  }

  const [products, total] = await Promise.all([
    Product.find(q)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean<IProduct[]>(),
    Product.countDocuments(q),
  ]);
  for (const p of products) decodeDisplayText(p);
  return { products, total };
}

export async function getProductById(productId: string, storeId: string): Promise<IProduct | null> {
  return decodeDisplayText(await Product.findOne({ _id: productId, storeId }).lean<IProduct | null>());
}

export async function getProductBySlug(storeId: string, slug: string): Promise<IProduct | null> {
  return decodeDisplayText(await Product.findOne({ storeId, slug, isPublished: true }).lean<IProduct | null>());
}

/**
 * True if a digital product actually has something to deliver to the buyer
 * after payment. Sellers occasionally publish a digital product then forget
 * to attach the file / drive link / course modules, and the buyer ends up on
 * an empty download portal after paying — this predicate is the guard used
 * at checkout time to refuse the sale.
 *
 * Rules per `digitalKind` (defaults to 'download' when unset):
 *   - download   → needs at least one digitalAsset or the legacy digitalFileUrl
 *   - course     → needs at least one courseModule
 *   - license    → needs a licenseKeyTemplate (key generated per sale)
 *   - membership → seller grants access manually, no on-file content required
 *   - service    → real-world service, no on-file content required
 *
 * Physical products always return true — this predicate only gates digital.
 */
export function hasDigitalContent(product: Pick<
  IProduct,
  'type' | 'digitalKind' | 'digitalAssets' | 'digitalFileUrl' | 'courseModules' | 'licenseKeyTemplate'
>): boolean {
  if (product.type !== 'digital') return true;
  const kind = product.digitalKind || 'download';
  switch (kind) {
    case 'download':
      return (
        (product.digitalAssets?.length ?? 0) > 0 ||
        !!product.digitalFileUrl?.trim()
      );
    case 'course':
      return (product.courseModules?.length ?? 0) > 0;
    case 'license':
      return !!product.licenseKeyTemplate?.trim();
    case 'membership':
    case 'service':
      return true;
    default:
      return false;
  }
}

export async function deleteProduct(productId: string, storeId: string): Promise<boolean> {
  const result = await Product.deleteOne({ _id: productId, storeId });
  return result.deletedCount > 0;
}
