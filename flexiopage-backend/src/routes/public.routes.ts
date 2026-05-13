/**
 * Public API for storefronts - no auth required.
 * Used by public store pages and landing pages.
 */
import { Router, Request, Response } from 'express';
import * as storeService from '../services/store.service';
import * as productService from '../services/product.service';
import * as pageService from '../services/page.service';
import * as orderService from '../services/order.service';
import { Product } from '../models/Product.model';
import { Order } from '../models/Order.model';
import { Store } from '../models/Store.model';
import { LandingPage } from '../models/LandingPage.model';
import { initOrderPayment, isMockMode, type Channel } from '../services/mobile-money.service';
import { dispatchOrder } from '../services/delivery.service';
import { pushOrderToSheets } from '../services/sheets.service';

const router = Router();

/** Strip server-only secrets from the integrations object before exposing it. */
function publicSafeStore<T extends { integrations?: Record<string, unknown> }>(store: T): T {
  if (!store?.integrations) return store;
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
      googleAdsConversionId: m.googleAdsConversionId,
      googleAdsConversionLabel: m.googleAdsConversionLabel,
      customHeadCode: m.customHeadCode,
    };
  }
  return { ...store, integrations: safe } as T;
}

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

/** Resolve store by slug (e.g. myshop) or custom domain - caller can use Host header */
router.get('/store-by-slug/:slug', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.slug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  res.json({ store: publicSafeStore(store) });
});

router.get('/store-by-subdomain/:subdomain', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySubdomain(req.params.subdomain);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  res.json({ store: publicSafeStore(store) });
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
  res.json({ store: publicSafeStore(store) });
});

/** Public products for a store (published only) */
router.get('/stores/:storeSlug/products', async (req: Request, res: Response): Promise<void> => {
  const store = await storeService.getStoreBySlug(req.params.storeSlug);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const products = await productService.getProductsByStore(store._id.toString(), { publishedOnly: true });
  res.json({ products });
});

/** Public single product by store slug + product slug */
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
  res.json({ product });
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
  // Online payment is reserved for digital stores. Physical stores use COD only.
  if (store.storeType === 'physical') {
    res.status(400).json({
      error: 'Physical stores use cash on delivery. Use POST /api/public/checkout/cod.',
      code: 'physical_store_cod_only',
    });
    return;
  }
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
  if (!ship.line1 || !ship.city || !ship.country) {
    res.status(400).json({ error: 'shippingAddress.line1, .city, .country required' });
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
    // Stock check (only when trackInventory and no backorder)
    if (product.trackInventory && !product.allowBackorder && product.stock < qty) {
      res.status(409).json({
        error: `Out of stock: ${product.name} (only ${product.stock} left)`,
        productSlug: it.productSlug,
        available: product.stock,
        code: 'out_of_stock',
      });
      return;
    }
    resolved.push({
      productId: product._id.toString(),
      variantId: it.variantId,
      name: product.name,
      quantity: qty,
      price: product.price,
      sku: product.sku,
      productDoc: {
        _id: product._id,
        trackInventory: product.trackInventory,
        allowBackorder: product.allowBackorder,
        stock: product.stock,
      },
    });
  }

  const subtotal = resolved.reduce((s, it) => s + it.price * it.quantity, 0);
  const shippingCost = 0; // Flat-fee policy TBD per store; courier sets the real fee.

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
        city: ship.city!.trim(),
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
      discount: 0,
      currency: store.settings?.currency || 'USD',
      paymentMethod: 'cod',
      notes: body.notes?.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Order creation failed: ' + (err as Error).message });
    return;
  }

  // ── Decrement stock (best-effort, after order is persisted) ──────
  await Promise.all(
    resolved
      .filter((it) => it.productDoc.trackInventory)
      .map((it) =>
        Product.updateOne({ _id: it.productDoc._id }, { $inc: { stock: -it.quantity } })
      )
  );

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
  let dispatchInfo: { ok: boolean; externalId?: string; error?: string } = { ok: false };
  if (store.integrations?.delivery?.enabled && store.integrations.delivery.autoDispatch !== false) {
    try {
      const result = await dispatchOrder({ order, store });
      dispatchInfo = result.ok
        ? { ok: true, externalId: result.result?.externalId }
        : { ok: false, error: result.error };
      if (!result.ok) {
        console.warn(`[checkout cod] dispatch skipped for ${order.orderNumber}: ${result.error}`);
      }
    } catch (err) {
      dispatchInfo = { ok: false, error: (err as Error).message };
      console.error('[checkout cod] dispatch error (non-fatal):', (err as Error).message);
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
    store: store ? { name: store.name, slug: store.slug } : null,
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
