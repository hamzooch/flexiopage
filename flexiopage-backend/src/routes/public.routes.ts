/**
 * Public API for storefronts - no auth required.
 * Used by public store pages and landing pages.
 */
import { Router, Request, Response } from 'express';
import * as storeService from '../services/store.service';
import * as productService from '../services/product.service';
import * as pageService from '../services/page.service';
import * as orderService from '../services/order.service';
import * as collectionService from '../services/collection.service';
import * as couponService from '../services/coupon.service';
import * as subscriberService from '../services/subscriber.service';
import * as reviewService from '../services/review.service';
import * as abandonedCartService from '../services/abandoned-cart.service';
import { Product } from '../models/Product.model';
import { Order } from '../models/Order.model';
import { Store } from '../models/Store.model';
import { LandingPage } from '../models/LandingPage.model';
import { initOrderPayment, isMockMode, type Channel } from '../services/mobile-money.service';
import { dispatchOrder } from '../services/delivery.service';
import { notifyOrderCreated } from '../services/notification.service';
import { pushOrderToSheets } from '../services/sheets.service';
import { resolveBundlePricing } from '../lib/bundle';
import { resolveMarketForRequest, resolveProductPricing } from '../lib/market';
import { recordEvent } from '../services/tracking.service';
import mongoose from 'mongoose';

/**
 * Applique le pricing du market résolu sur un produit lean/serialisable.
 * Override `price`/`compareAtPrice`/`stock` racine avec la valeur du pays
 * pour que la storefront affiche directement le bon prix sans changer ses
 * lectures. `_pricingFallback` reste à true quand le produit n'a pas de
 * pricing[country] (utile au debug + à un éventuel badge "prix par défaut").
 */
interface PricingApplicable {
  price: number;
  compareAtPrice?: number;
  stock?: number;
  pricing?: Array<{
    country?: string;
    price?: number;
    compareAtPrice?: number;
    currency?: string;
    available?: boolean;
    stock?: number;
  }>;
  trackInventory?: boolean;
  allowBackorder?: boolean;
}

function applyMarketPricing<P extends PricingApplicable>(
  product: P,
  country: string,
  currency: string,
): P & { currency: string; _pricingFallback: boolean; _pricingAvailable: boolean } {
  const resolved = resolveProductPricing(
    product as unknown as Parameters<typeof resolveProductPricing>[0],
    country,
    currency,
  );
  return {
    ...product,
    price: resolved.price,
    compareAtPrice: resolved.compareAtPrice,
    stock: resolved.stock,
    currency: resolved.currency,
    _pricingFallback: resolved.fallbackUsed,
    _pricingAvailable: resolved.available,
  };
}

const router = Router();

/** Strip server-only secrets from the integrations object before exposing it. */
function publicSafeStore<T extends { integrations?: unknown; markets?: unknown }>(store: T): T {
  if (!store) return store;
  const out: Record<string, unknown> = { ...store };

  if (store.integrations) {
    const raw = store.integrations as {
      marketing?: Record<string, unknown>;
      delivery?: Record<string, unknown>;
      googleSheets?: Record<string, unknown>;
    };
    const safe: Record<string, unknown> = {};
    // Marketing — only public pixel IDs leave the server. Access tokens / test
    // event codes are server-side (Conversions API).
    if (raw.marketing) {
      const m = raw.marketing;
      safe.marketing = {
        facebookPixelId: m.facebookPixelId,
        googleAnalyticsId: m.googleAnalyticsId,
        tiktokPixelId: m.tiktokPixelId,
        snapchatPixelId: m.snapchatPixelId,
        googleAdsConversionId: m.googleAdsConversionId,
        googleAdsConversionLabel: m.googleAdsConversionLabel,
        customHeadCode: m.customHeadCode,
      };
    }
    out.integrations = safe;
  }

  // Markets — strip per-market delivery credentials (storeIdMD, webhookSecret,
  // boutiqueIdMD, baseUrl) before exposing. The storefront only needs the
  // country/currency/availability shape to render the country switcher.
  if (Array.isArray(store.markets)) {
    out.markets = store.markets.map((m) => {
      const market = m as {
        country?: string;
        currency?: string;
        isDefault?: boolean;
        enabled?: boolean;
        shippingFee?: number;
        delivery?: { provider?: string; enabled?: boolean };
      };
      return {
        country: market.country,
        currency: market.currency,
        isDefault: market.isDefault,
        enabled: market.enabled,
        shippingFee: market.shippingFee,
        delivery: market.delivery
          ? { provider: market.delivery.provider, enabled: market.delivery.enabled }
          : undefined,
      };
    });
  }

  return out as T;
}

/**
 * POST /api/public/track — anonymous storefront funnel event ingest.
 * Body: { storeId, productId?, type: 'product_view'|'add_to_cart', sessionId }
 * Fire-and-forget — always 204, never blocks the storefront. `purchase`
 * events are recorded server-side at order creation, not here.
 */
router.post('/track', (req: Request, res: Response): void => {
  const body = req.body as {
    storeId?: string;
    productId?: string;
    type?: string;
    sessionId?: string;
  };
  const type =
    body.type === 'add_to_cart' ? 'add_to_cart'
    : body.type === 'product_view' ? 'product_view'
    : body.type === 'page_view' ? 'page_view'
    : null;
  const validStore = body.storeId && mongoose.Types.ObjectId.isValid(body.storeId);
  if (type && validStore && body.sessionId) {
    void recordEvent({
      storeId: body.storeId!,
      productId: body.productId && mongoose.Types.ObjectId.isValid(body.productId) ? body.productId : undefined,
      type,
      sessionId: body.sessionId,
    });
  }
  res.status(204).end();
});

/**
 * GET /api/public/stores — minimal index used by the frontend sitemap.ts
 * to surface every published seller shop on Google. Returns only slugs
 * and lastUpdated for store + their published landing pages — no
 * private data, no expensive joins.
 */
router.get('/stores', async (_req: Request, res: Response): Promise<void> => {
  const stores = await Store.find({ isPublished: true })
    .select('_id slug updatedAt')
    .sort({ updatedAt: -1 })
    .limit(5000)
    .lean();

  const storeIds = stores.map((s) => s._id);
  const pages = await LandingPage.find({ storeId: { $in: storeIds }, isPublished: true })
    .select('slug storeId updatedAt')
    .lean();

  // Group landing pages by their parent storeId so each store gets its page list.
  const pagesByStoreId = new Map<string, Array<{ slug: string; updatedAt: Date }>>();
  for (const p of pages) {
    const id = String(p.storeId);
    const arr = pagesByStoreId.get(id) || [];
    arr.push({ slug: p.slug, updatedAt: p.updatedAt });
    pagesByStoreId.set(id, arr);
  }

  res.json({
    stores: stores.map((s) => ({
      slug: s.slug,
      updatedAt: s.updatedAt,
      pages: pagesByStoreId.get(String(s._id)) || [],
    })),
  });
});

/**
 * Public store resolution by slug.
 *
 * Réponses :
 *   - 200 { store, market }       boutique publiée → payload complet
 *   - 200 { unpublished: true,    boutique existe mais en brouillon →
 *           store: minimal }      payload réduit (name, slug, logo, ownerId)
 *                                 pour permettre au frontend d'afficher un
 *                                 message "boutique en préparation" + un CTA
 *                                 vers le dashboard si le viewer est l'owner.
 *   - 404 { error }               aucune boutique avec ce slug.
 *
 * Sécurité : on N'INCLUT JAMAIS settings/integrations/theme dans le payload
 * brouillon — seul le minimum d'infos visuelles passe (le owner peut tout
 * voir via /api/stores/:id derrière son auth).
 */
function draftStorePayload(store: { _id: unknown; name: string; slug: string; logo?: string; storeType?: string; ownerId: unknown }) {
  return {
    _id: String(store._id),
    name: store.name,
    slug: store.slug,
    logo: store.logo,
    storeType: store.storeType,
    ownerId: String(store.ownerId),
  };
}

router.get('/store-by-slug/:slug', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlugIncludingDraft(req.params.slug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  if (!store.isPublished) {
    res.json({ unpublished: true, store: draftStorePayload(store) });
    return;
  }
  const market = resolveMarketForRequest(req, store);
  res.json({
    store: publicSafeStore(store),
    market: { country: market.country, currency: market.currency, source: market.source },
  });
});

router.get('/store-by-subdomain/:subdomain', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySubdomainIncludingDraft(req.params.subdomain);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  if (!store.isPublished) {
    res.json({ unpublished: true, store: draftStorePayload(store) });
    return;
  }
  const market = resolveMarketForRequest(req, store);
  res.json({
    store: publicSafeStore(store),
    market: { country: market.country, currency: market.currency, source: market.source },
  });
});

/** Resolve store by custom domain (used by middleware when Host !== app domain). */
router.get('/store-by-domain', async (req: Request, res: Response): Promise<void> => {
  const domain = String(req.query.domain || '').toLowerCase();
  if (!domain) {
    res.status(400).json({ error: 'domain required' });
    return;
  }
  const store = await storeService.getStoreByCustomDomain(domain);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const market = resolveMarketForRequest(req, store);
  res.json({
    store: publicSafeStore(store),
    market: { country: market.country, currency: market.currency, source: market.source },
  });
});

/** Public products for a store (published only) */
router.get('/stores/:storeSlug/products', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const market = resolveMarketForRequest(req, store);
  const { products } = await productService.getProductsByStore(store._id.toString(), { publishedOnly: true });
  const priced = products.map((p) => applyMarketPricing(p, market.country, market.currency));
  res.json({
    products: priced,
    market: { country: market.country, currency: market.currency, source: market.source },
  });
});

/** Public single product by store slug + product slug.
 *  Also resolves the configured cross-sell products in one shot so the
 *  storefront can render the "Tu aimeras aussi" block without a 2nd round-trip. */
router.get('/stores/:storeSlug/products/:productSlug', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const product = await productService.getProductBySlug(store._id.toString(), req.params.productSlug);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const market = resolveMarketForRequest(req, store);
  const pricedProduct = applyMarketPricing(product, market.country, market.currency);

  // ── Cross-sells — return a trimmed shape (just enough to render small cards).
  // Filter out unpublished + missing targets so the seller can wire dead links
  // without breaking the storefront. Order respects the seller-defined `order`
  // field (lower first), then falls back to insertion order.
  let crossSells: Array<{
    _id: string;
    name: string;
    slug: string;
    price: number;
    compareAtPrice?: number;
    image?: string;
    label?: string;
    discountPct?: number;
  }> = [];
  const offers = (product.crossSells || []).filter((o) => o?.productId);
  if (offers.length > 0) {
    const ids = offers.map((o) => o.productId);
    const docs = await Product.find({
      _id: { $in: ids },
      storeId: store._id,
      isPublished: true,
    })
      .select('_id name slug price compareAtPrice images pricing stock')
      .lean<
        Array<{
          _id: unknown;
          name: string;
          slug: string;
          price: number;
          compareAtPrice?: number;
          images?: string[];
          pricing?: Array<{ country?: string; price?: number; compareAtPrice?: number; currency?: string; available?: boolean; stock?: number }>;
          stock?: number;
        }>
      >();
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    crossSells = offers
      .map((o) => {
        const d = byId.get(String(o.productId));
        if (!d) return null;
        const priced = applyMarketPricing(d, market.country, market.currency);
        return {
          _id: String(d._id),
          name: d.name,
          slug: d.slug,
          price: priced.price,
          compareAtPrice: priced.compareAtPrice,
          image: d.images?.[0],
          label: o.label,
          discountPct: o.discountPct,
          order: o.order ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(({ order: _o, ...rest }) => { void _o; return rest; });
  }

  res.json({
    product: pricedProduct,
    crossSells,
    market: { country: market.country, currency: market.currency, source: market.source },
  });
});

/**
 * POST /api/public/stores/:storeSlug/abandoned-cart — capture a
 * partially-filled COD form. Called on blur / page-hide from the COD
 * form so the seller can chase warm leads manually.
 *
 * Body: { sessionId, productSlug?, name?, phone?, email?, city?, country? }
 * Always returns 204 — never blocks the buyer.
 */
router.post('/stores/:storeSlug/abandoned-cart', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    sessionId?: string;
    productSlug?: string;
    productName?: string;
    productPrice?: number;
    name?: string;
    phone?: string;
    email?: string;
    city?: string;
    country?: string;
  };
  if (!body.sessionId?.trim()) {
    res.status(204).end();
    return;
  }
  // Only capture once the buyer has filled enough to be worth chasing:
  // at minimum a phone or an email.
  if (!body.phone?.trim() && !body.email?.trim()) {
    res.status(204).end();
    return;
  }
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(204).end();
    return;
  }
  try {
    await abandonedCartService.upsertAbandonedCart({
      storeId: store._id.toString(),
      sessionId: body.sessionId,
      productSlug: body.productSlug,
      productName: body.productName,
      productPrice: body.productPrice,
      name: body.name,
      phone: body.phone,
      email: body.email,
      city: body.city,
      country: body.country,
    });
  } catch {
    // Fire-and-forget — never block.
  }
  res.status(204).end();
});

/**
 * GET /api/public/stores/:storeSlug/products/:productSlug/reviews —
 * published reviews + aggregated rating summary for a product.
 */
router.get('/stores/:storeSlug/products/:productSlug/reviews', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const product = await productService.getProductBySlug(store._id.toString(), req.params.productSlug);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const [reviews, summary] = await Promise.all([
    reviewService.listReviews(store._id.toString(), {
      productId: product._id.toString(),
      publishedOnly: true,
    }),
    reviewService.getProductRatingSummary(store._id.toString(), product._id.toString()),
  ]);
  res.json({ reviews, summary });
});

/**
 * POST /api/public/stores/:storeSlug/products/:productSlug/reviews —
 * submit a review. Auto-flips `verified` if the email matches an existing
 * order on the store. No auth required (anonymous customers).
 */
router.post('/stores/:storeSlug/products/:productSlug/reviews', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const product = await productService.getProductBySlug(store._id.toString(), req.params.productSlug);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const body = req.body as { name?: string; email?: string; rating?: number; title?: string; content?: string };
  if (!body.name?.trim() || !body.content?.trim()) {
    res.status(400).json({ error: 'Name and content are required' });
    return;
  }
  const rating = Math.max(1, Math.min(5, Number(body.rating) || 0));
  if (!rating) {
    res.status(400).json({ error: 'Rating must be 1-5' });
    return;
  }
  const review = await reviewService.createReview({
    storeId: store._id.toString(),
    productId: product._id.toString(),
    name: body.name,
    email: body.email,
    rating,
    title: body.title,
    content: body.content,
  });
  res.status(201).json({ review });
});

/**
 * POST /api/public/stores/:storeSlug/subscribe — newsletter signup from
 * the welcome popup. Idempotent: re-subscribing the same email just
 * returns the existing row (no duplicate, no extra reward).
 *
 * Body: { email: string, name?: string, metadata?: object }
 */
router.post('/stores/:storeSlug/subscribe', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const body = req.body as { email?: string; name?: string; metadata?: Record<string, unknown> };
  if (!body.email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  // Echo back the configured reward (if any) so the popup can show it
  // immediately. We don't send an email — sellers wire that to their ESP.
  const rewardCouponCode = store.settings?.newsletter?.rewardCouponCode?.trim() || undefined;
  try {
    const result = await subscriberService.subscribe({
      storeId: store._id.toString(),
      email: body.email,
      name: body.name,
      source: 'newsletter_popup',
      rewardCouponCode,
      metadata: body.metadata,
    });
    res.status(result.created ? 201 : 200).json({
      ok: true,
      alreadySubscribed: !result.created,
      rewardCouponCode,
      successMessage: store.settings?.newsletter?.successMessage,
    });
  } catch (err: unknown) {
    const msg = (err as Error).message || 'Subscribe failed';
    res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/public/stores/:storeSlug/coupons/validate — live coupon check
 * called by the COD form while the buyer is typing. Returns the discount
 * amount if valid, otherwise an error message. Doesn't consume the coupon —
 * consumption happens server-side at checkout creation.
 *
 * Body: { code: string, subtotal: number, productIds?: string[] }
 */
router.post('/stores/:storeSlug/coupons/validate', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const body = req.body as { code?: string; subtotal?: number; productIds?: string[] };
  const code = String(body.code || '').trim();
  const subtotal = Number(body.subtotal);
  if (!code) {
    res.status(400).json({ error: 'Code is required' });
    return;
  }
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    res.status(400).json({ error: 'Valid subtotal is required' });
    return;
  }
  const result = await couponService.validateCoupon({
    storeId: store._id.toString(),
    code,
    subtotal,
    productIds: Array.isArray(body.productIds) ? body.productIds : undefined,
  });
  if (!result.ok) {
    res.status(200).json({ ok: false, reason: result.reason, message: result.message });
    return;
  }
  // Only echo back what the client needs to display the applied discount.
  res.json({
    ok: true,
    code: result.coupon.code,
    type: result.coupon.type,
    value: result.coupon.value,
    discountAmount: result.discountAmount,
    description: result.coupon.description,
  });
});

/** Public collections list for a store (published only). */
router.get('/stores/:storeSlug/collections', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const collections = await collectionService.listCollections(store._id.toString(), { publishedOnly: true });
  res.json({ collections });
});

/** Public collection page — returns the collection + its resolved products. */
router.get('/stores/:storeSlug/collections/:collectionSlug', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const collection = await collectionService.getCollectionBySlug(store._id.toString(), req.params.collectionSlug);
  if (!collection) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  const products = await collectionService.resolveCollectionProducts(collection, { publishedOnly: true });
  res.json({ store: publicSafeStore(store), collection, products });
});

/** Public landing page by store slug + page slug */
router.get('/stores/:storeSlug/pages/:pageSlug', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const page = await pageService.getPageBySlug(store._id.toString(), req.params.pageSlug);
  if (!page) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  res.json({ store, page });
});

/**
 * Customer download portal — accessed via /api/public/downloads/:token.
 * Returns the order summary + the digital deliverables (assets, license keys,
 * course modules) belonging to each line item. The token replaces auth.
 */
router.get('/downloads/:token', async (req: Request, res: Response): Promise<void> => {
  const token = req.params.token;
  if (!token || token.length < 16) {
    res.status(400).json({ error: 'Invalid token' });
    return;
  }
  const order = await orderService.getOrderByDownloadToken(token);
  if (!order) {
    res.status(404).json({ error: 'Download link not found' });
    return;
  }
  // Access expiry
  const now = new Date();
  if (order.downloadExpiresAt && order.downloadExpiresAt < now) {
    res.status(410).json({ error: 'Download link expired', expiresAt: order.downloadExpiresAt });
    return;
  }

  // Fetch the products fresh so the seller can update assets after the sale
  // and the customer immediately sees the new files.
  const productIds = Array.from(new Set(order.items.map((i) => i.productId.toString())));
  const products = await Product.find({ _id: { $in: productIds } })
    .select('name slug type images digitalKind digitalAssets courseModules digitalFileUrl digitalFileName accessType accessDays')
    .lean();
  const productById = new Map(products.map((p) => [p._id.toString(), p]));

  // Look up store name for the portal header.
  const store = await storeService.getStoreById(order.storeId.toString());

  const items = order.items.map((it) => {
    const p = productById.get(it.productId.toString());
    // Build a unified asset list — prefer new digitalAssets, fall back to
    // legacy digitalFileUrl so old products keep working.
    let assets = p?.digitalAssets && p.digitalAssets.length > 0
      ? p.digitalAssets
      : p?.digitalFileUrl
        ? [{
            id: 'legacy',
            name: p.digitalFileName || 'Téléchargement',
            url: p.digitalFileUrl,
            kind: 'file' as const,
            order: 0,
          }]
        : [];
    return {
      orderItemId: (it as { _id?: { toString(): string } })._id?.toString(),
      name: it.name,
      productSlug: p?.slug,
      productImage: p?.images?.[0],
      digitalKind: p?.digitalKind || 'download',
      assets,
      courseModules: p?.courseModules || [],
      licenseKey: it.licenseKey,
    };
  });

  res.json({
    order: {
      orderNumber: order.orderNumber,
      email: order.email,
      customerName: order.customerName,
      total: order.total,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      downloadExpiresAt: order.downloadExpiresAt,
    },
    store: store ? { name: store.name, slug: store.slug } : null,
    items,
  });
});

/**
 * POST /api/public/checkout/init — create an order + start payment.
 * Body: { storeSlug, productSlug, quantity?, email, customerName?, phone, channel? }
 * Returns: { orderId, checkoutUrl, mockMode }
 *
 * The buyer is redirected to checkoutUrl. After payment, the provider hits
 * /api/webhooks/<provider>; finalizePaidOrder generates the download token
 * and emails the buyer the link to /d/<token>.
 */
router.post('/checkout/init', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    storeSlug?: string;
    productSlug?: string;
    quantity?: number;
    email?: string;
    customerName?: string;
    phone?: string;
    channel?: Channel;
  };
  if (!body.storeSlug || !body.productSlug || !body.email) {
    res.status(400).json({ error: 'storeSlug, productSlug, email required' });
    return;
  }
  const store = await storeService.getStoreBySlug(body.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  // Online payment is available to BOTH digital and physical stores.
  // (Digital = online only; physical = online OR COD via /checkout/cod.)
  // Prefer POST /api/payment/initiate for the country/method-routed flow;
  // this endpoint stays for the simple single-product digital path.
  const product = await productService.getProductBySlug(store._id.toString(), body.productSlug);
  if (!product || !product.isPublished) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const quantity = Math.max(1, Math.min(body.quantity || 1, 99));
  const subtotal = product.price * quantity;

  let order;
  try {
    order = await orderService.createOrder({
      storeId: store._id.toString(),
      email: body.email.trim().toLowerCase(),
      customerName: body.customerName?.trim() || undefined,
      customerPhone: body.phone?.trim() || undefined,
      items: [
        {
          productId: product._id.toString(),
          name: product.name,
          quantity,
          price: product.price,
        },
      ],
      subtotal,
      shippingCost: 0,
      tax: 0,
      discount: 0,
      currency: store.settings?.currency || 'USD',
      paymentMethod: body.channel === 'card' ? 'card' : 'mobile_money',
    });
  } catch (err) {
    res.status(500).json({ error: 'Order creation failed: ' + (err as Error).message });
    return;
  }

  // Save phone on the order for the provider call
  if (body.phone) {
    order.paymentPhone = body.phone.trim();
    await order.save();
  }

  try {
    const init = await initOrderPayment(order, { phone: body.phone, channel: body.channel });
    order.paymentReference = init.reference;
    order.paymentProvider = init.provider;
    await order.save();
    res.json({
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      checkoutUrl: init.checkoutUrl,
      provider: init.provider,
      mockMode: isMockMode(),
    });
  } catch (err) {
    res.status(502).json({ error: 'Payment init failed: ' + (err as Error).message });
  }
});

/**
 * POST /api/public/checkout/cod — cash-on-delivery checkout for physical stores.
 *
 * Body: {
 *   storeSlug,
 *   items: [{ productSlug, variantId?, quantity }],   // 1..N items
 *   email, customerName, customerPhone,
 *   shippingAddress: { line1, line2?, city, state?, postalCode?, country },
 *   notes?
 * }
 *
 * Flow:
 *   1. Validate store is physical
 *   2. Resolve products, check stock, compute subtotal
 *   3. Create order (paymentMethod='cod', paymentStatus='pending')
 *   4. Decrement stock for tracked products
 *   5. Best-effort dispatch to MogaDelivery (autoDispatch=true)
 *   6. Return { orderId, orderNumber, total, currency }
 */
router.post('/checkout/cod', async (req: Request, res: Response): Promise<void> => {
  type CodItem = { productSlug?: string; variantId?: string; quantity?: number };
  const body = req.body as {
    storeSlug?: string;
    items?: CodItem[];
    email?: string;
    customerName?: string;
    customerPhone?: string;
    shippingAddress?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
    notes?: string;
    /** Anonymous funnel session id — correlates the purchase to add_to_cart. */
    sessionId?: string;
    /** Optional promo code the buyer typed into the COD form. */
    couponCode?: string;
  };

  // ── Validate input ────────────────────────────────────────────────
  if (!body.storeSlug || !body.email || !body.customerName || !body.customerPhone) {
    res.status(400).json({ error: 'storeSlug, email, customerName, customerPhone required' });
    return;
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: 'items[] required (at least 1)' });
    return;
  }
  const ship = body.shippingAddress || {};
  // City is optional — sellers can hide it from the COD form. Line1 + country
  // are the minimum the courier needs to attempt a delivery.
  if (!ship.line1 || !ship.country) {
    res.status(400).json({ error: 'shippingAddress.line1, .country required' });
    return;
  }

  const store = await storeService.getStoreBySlug(body.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  if (store.storeType !== 'physical') {
    res.status(400).json({
      error: 'Cash on delivery is only for physical stores. Use /api/public/checkout/init.',
      code: 'cod_requires_physical_store',
    });
    return;
  }

  // ── Resolve buyer market (cookie → CF-IPCountry → default market). The
  // shipping address country is the buyer's declared country ; on l'utilise
  // en priorité car c'est ce que le seller va voir et ce qui pilote la
  // livraison. Si le shipping.country matche un market activé, on bascule.
  const codMarket = (() => {
    const declared = (ship.country || '').trim().toUpperCase();
    if (declared) {
      const m = (store.markets || []).find(
        (x) => x.enabled !== false && (x.country || '').toUpperCase() === declared,
      );
      if (m) return { country: declared, currency: (m.currency || '').toUpperCase(), market: m };
    }
    const fallback = resolveMarketForRequest(req, store);
    return { country: fallback.country, currency: fallback.currency, market: fallback.market };
  })();

  // ── Resolve products + check stock ────────────────────────────────
  type ResolvedItem = {
    productId: string;
    variantId?: string;
    name: string;
    quantity: number;
    price: number;
    sku?: string;
    productDoc: { _id: unknown; trackInventory: boolean; allowBackorder: boolean; stock: number };
  };
  const resolved: ResolvedItem[] = [];
  for (const it of body.items) {
    if (!it.productSlug) {
      res.status(400).json({ error: 'items[].productSlug required' });
      return;
    }
    const qty = Math.max(1, Math.min(it.quantity || 1, 99));
    const product = await productService.getProductBySlug(store._id.toString(), it.productSlug);
    if (!product || !product.isPublished) {
      res.status(404).json({ error: `Product not found: ${it.productSlug}` });
      return;
    }
    if (product.type !== 'physical') {
      res.status(400).json({ error: `Product is not physical: ${it.productSlug}` });
      return;
    }
    // ── Variant lookup ────────────────────────────────────────────
    // Client sends `variantId` matching either the variant's `_id` (when
    // we eventually expose it) or its `name`. We match on both so the
    // legacy/simpler "send the name" client path also works.
    let variant: typeof product.variants[number] | undefined;
    if (it.variantId && Array.isArray(product.variants) && product.variants.length > 0) {
      variant = product.variants.find(
        (v) => String((v as { _id?: unknown })._id || '') === it.variantId
          || v.name === it.variantId
      );
      if (!variant) {
        res.status(404).json({
          error: `Variant not found on product ${product.name}: ${it.variantId}`,
          code: 'variant_not_found',
        });
        return;
      }
    }

    // Per-country pricing : si product.pricing[market.country] existe, c'est
    // lui qui pilote (prix + stock + disponibilité). Sinon on retombe sur les
    // champs racine (compat boutiques mono-pays). Le variant garde sa
    // priorité finale s'il est sélectionné.
    const countryPricing = resolveProductPricing(product, codMarket.country, codMarket.currency);
    if (!countryPricing.available) {
      res.status(409).json({
        error: `Product not available in ${codMarket.country}: ${product.name}`,
        productSlug: it.productSlug,
        code: 'market_unavailable',
      });
      return;
    }

    // Effective stock + price — variant wins when present, sinon country pricing.
    const effectiveStock = variant ? (variant.stock ?? 0) : countryPricing.stock;
    const effectiveBasePrice = (variant?.price !== undefined ? variant.price : countryPricing.price) as number;

    // Stock check (only when trackInventory and no backorder)
    if (product.trackInventory && !product.allowBackorder && effectiveStock < qty) {
      res.status(409).json({
        error: `Out of stock: ${product.name}${variant ? ' / ' + variant.name : ''} (only ${effectiveStock} left)`,
        productSlug: it.productSlug,
        variantId: variant ? String((variant as { _id?: unknown })._id || variant.name) : undefined,
        available: effectiveStock,
        code: 'out_of_stock',
      });
      return;
    }
    // Apply the quantity-tier bundle: when qty matches a tier, the effective
    // unit price becomes tier.totalPrice / qty. Computed server-side — the
    // client's price is never trusted. Variant price replaces product.price
    // before bundle resolution.
    const pricing = resolveBundlePricing(effectiveBasePrice, product.bundle, qty);
    resolved.push({
      productId: product._id.toString(),
      variantId: variant ? String((variant as { _id?: unknown })._id || variant.name) : it.variantId,
      name: variant ? `${product.name} — ${variant.name}` : product.name,
      quantity: qty,
      price: pricing.unitPrice,
      sku: variant?.sku || product.sku,
      productDoc: {
        _id: product._id,
        trackInventory: product.trackInventory,
        allowBackorder: product.allowBackorder,
        stock: product.stock,
      },
    });
  }

  const subtotal = resolved.reduce((s, it) => s + it.price * it.quantity, 0);
  // Shipping fee : market.shippingFee (per-country) gagne sur le legacy
  // codForm.shippingFee global. Toujours côté serveur — jamais le client.
  const marketShippingFee = codMarket.market?.shippingFee;
  const shippingCost = Math.max(
    0,
    Number(marketShippingFee ?? store.settings?.codForm?.shippingFee) || 0,
  );

  // ── Coupon (optional) — server-side re-validation, never trust the client.
  // If a code is passed but fails any gate we return 422 instead of silently
  // dropping it so the buyer knows their code didn't apply.
  let discount = 0;
  let appliedCouponId: string | undefined;
  let appliedCouponCode: string | undefined;
  if (body.couponCode?.trim()) {
    const validation = await couponService.validateCoupon({
      storeId: store._id.toString(),
      code: body.couponCode,
      subtotal,
      productIds: resolved.map((r) => r.productId),
    });
    if (!validation.ok) {
      res.status(422).json({ error: validation.message, code: 'coupon_invalid', reason: validation.reason });
      return;
    }
    discount = validation.discountAmount;
    appliedCouponId = String(validation.coupon._id);
    appliedCouponCode = validation.coupon.code;
  }

  // ── Create order ─────────────────────────────────────────────────
  let order;
  try {
    order = await orderService.createOrder({
      storeId: store._id.toString(),
      email: body.email.trim().toLowerCase(),
      customerName: body.customerName.trim(),
      customerPhone: body.customerPhone.trim(),
      shippingAddress: {
        line1: ship.line1!.trim(),
        line2: ship.line2?.trim(),
        city: ship.city?.trim(),
        state: ship.state?.trim(),
        postalCode: ship.postalCode?.trim(),
        country: ship.country!.trim(),
      },
      items: resolved.map((it) => ({
        productId: it.productId,
        variantId: it.variantId,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        sku: it.sku,
      })),
      subtotal,
      shippingCost,
      tax: 0,
      discount,
      couponCode: appliedCouponCode,
      currency: codMarket.currency || store.settings?.currency || 'USD',
      marketCountry: codMarket.country || undefined,
      paymentMethod: 'cod',
      notes: body.notes?.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Order creation failed: ' + (err as Error).message });
    return;
  }

  // ── Consume coupon atomically (after order is persisted). If the bump
  // fails because the cap was reached between validation and consumption,
  // we just log — the order is already valid, the next buyer will get the
  // "max uses reached" error. Cheap trade-off for not blocking checkout.
  if (appliedCouponId) {
    const consumed = await couponService.consumeCoupon(appliedCouponId);
    if (!consumed) {
      console.warn('[checkout/cod] coupon consumption raced and lost', { appliedCouponCode });
    }
  }

  // ── Decrement stock (best-effort, after order is persisted) ──────
  await Promise.all(
    resolved
      .filter((it) => it.productDoc.trackInventory)
      .map((it) =>
        Product.updateOne({ _id: it.productDoc._id }, { $inc: { stock: -it.quantity } })
      )
  );

  // ── Mark any matching abandoned cart row as recovered. Non-fatal,
  // never blocks the checkout response. ──────────────────────────
  void abandonedCartService.markRecovered(store._id.toString(), {
    email: body.email,
    phone: body.customerPhone,
  });

  // ── Funnel tracking: record the purchase server-side (reliable) ──
  if (body.sessionId) {
    void recordEvent({
      storeId: store._id.toString(),
      productId: resolved[0]?.productId,
      type: 'purchase',
      sessionId: body.sessionId,
      value: subtotal,
      currency: store.settings?.currency || 'USD',
    });
  }

  // ── Best-effort push to Google Sheets ────────────────────────────
  try {
    await pushOrderToSheets({
      order,
      store: { _id: store._id, name: store.name, slug: store.slug },
      event: 'order.created',
    });
  } catch (err) {
    console.error('[checkout cod] sheets push error (non-fatal):', (err as Error).message);
  }

  // ── Best-effort dispatch to MogaDelivery ─────────────────────────
  // We do NOT await finalizePaidOrder (that path is for `paid` orders);
  // COD orders dispatch immediately because the courier collects cash.
  // Trigger conditions: either a configured last-mile carrier
  // (`integrations.delivery`) OR a MogaDelivery 3PL fallback under
  // `integrations.logistics`. `dispatchOrder` handles the synth-config for
  // the logistics path internally.
  const carrierAuto = !!(store.integrations?.delivery?.enabled
    && store.integrations.delivery.autoDispatch !== false);
  const logisticsAuto = !!(store.integrations?.logistics?.enabled
    && store.integrations.logistics.provider === 'mogadelivery'
    && (store.integrations.logistics.autoForward ?? true));
  let dispatchInfo: { ok: boolean; externalId?: string; error?: string } = { ok: false };
  if (carrierAuto || logisticsAuto) {
    try {
      const result = await dispatchOrder({ order, store });
      dispatchInfo = result.ok
        ? { ok: true, externalId: result.result?.externalId }
        : { ok: false, error: result.error };
      if (!result.ok) {
        console.warn(`[checkout cod] dispatch skipped for ${order.orderNumber}: ${result.error}`);
      } else {
        console.log(`[checkout cod] dispatched ${order.orderNumber} → ${result.result?.externalId}`);
      }
    } catch (err) {
      dispatchInfo = { ok: false, error: (err as Error).message };
      console.error('[checkout cod] dispatch error (non-fatal):', (err as Error).message);
    }
  } else {
    console.warn(`[checkout cod] no delivery/logistics integration enabled for ${order.orderNumber} (store ${store._id})`);
  }

  // Best-effort in-app notification — never blocks the order response.
  if (store.ownerId) {
    try {
      await notifyOrderCreated({
        userId: store.ownerId,
        storeId: store._id,
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        total: order.total,
        currency: order.currency,
        customerName: order.customerName,
      });
    } catch (err) {
      console.error('[notification] order.created failed (non-fatal):', (err as Error).message);
    }
  }

  res.json({
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    total: order.total,
    currency: order.currency,
    paymentMethod: 'cod',
    dispatch: dispatchInfo,
  });
});

/**
 * GET /api/public/orders/:orderId/cod-summary
 * Public summary used by the COD thank-you page. Includes shipping address,
 * items, total — no payment info needed (COD = pay on delivery).
 */
router.get('/orders/:orderId/cod-summary', async (req: Request, res: Response): Promise<void> => {
  const order = await Order.findById(req.params.orderId)
    .select('orderNumber paymentMethod paymentStatus fulfillmentStatus total currency subtotal shippingCost customerName customerPhone email shippingAddress items createdAt storeId delivery')
    .lean();
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (order.paymentMethod !== 'cod') {
    res.status(400).json({ error: 'Not a COD order' });
    return;
  }
  const store = await storeService.getStoreById(order.storeId.toString());
  res.json({
    order: {
      orderNumber: order.orderNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      total: order.total,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      email: order.email,
      shippingAddress: order.shippingAddress,
      items: order.items,
      createdAt: order.createdAt,
      delivery: order.delivery
        ? {
            provider: order.delivery.provider,
            externalStatus: order.delivery.externalStatus,
            trackingUrl: order.delivery.trackingUrl,
          }
        : undefined,
    },
    store: store
      ? {
          name: store.name,
          slug: store.slug,
          logo: store.logo,
          favicon: store.favicon,
          customDomain: store.customDomain,
          customDomainVerified: store.customDomainVerified,
          // On expose la config thanksPage pour que le frontend applique
          // les overrides de texte (titre, sous-titre, message, CTA).
          thanksPage: store.settings?.thanksPage,
        }
      : null,
  });
});

/**
 * GET /api/public/orders/:orderId/status
 * Polled by the thank-you page. Returns minimal status + downloadToken
 * (only when paid) so the frontend can redirect to /d/<token>.
 */
router.get('/orders/:orderId/status', async (req: Request, res: Response): Promise<void> => {
  const order = await Order.findById(req.params.orderId).select('paymentStatus downloadToken total currency orderNumber email').lean();
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({
    orderId: req.params.orderId,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    downloadToken: order.paymentStatus === 'paid' ? order.downloadToken : undefined,
    total: order.total,
    currency: order.currency,
    mockMode: isMockMode(),
  });
});

export default router;
