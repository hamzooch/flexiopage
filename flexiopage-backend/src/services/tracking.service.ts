import mongoose from 'mongoose';
import geoip from 'geoip-lite';
import { StoreEvent, type StoreEventType, type StoreEventSource } from '../models/StoreEvent.model';
import { Product } from '../models/Product.model';

export type TrackingRange = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<TrackingRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

function rangeStart(range: TrackingRange): Date {
  const d = new Date();
  d.setDate(d.getDate() - RANGE_DAYS[range]);
  return d;
}

export interface RecordEventInput {
  storeId: string;
  productId?: string;
  type: StoreEventType;
  sessionId: string;
  value?: number;
  currency?: string;
  device?: 'mobile' | 'desktop';
  source?: StoreEventSource;
  /**
   * IP brute du visiteur (ex: `req.ip`). Jamais stockée — on la convertit
   * immédiatement en pays + lat/lng via geoip-lite puis on la jette.
   */
  ip?: string;
}

/**
 * Résout une IP en pays + lat/lng approximatifs via geoip-lite (base locale,
 * pas d'appel réseau). Renvoie `null` si l'IP est privée, IPv6 inconnue, ou
 * introuvable dans la base. Le centroïde géoip-lite est volontairement "flou"
 * (centre pays/ville), parfait pour un globe — jamais pour tracer qui que ce soit.
 */
export function resolveGeo(
  ip?: string,
): { country: string; lat: number; lng: number } | null {
  if (!ip || typeof ip !== 'string') return null;
  // Strip possible "::ffff:" IPv4-mapped prefix.
  const clean = ip.replace(/^::ffff:/, '').trim();
  if (!clean) return null;
  try {
    const hit = geoip.lookup(clean);
    if (!hit || !hit.country || !Array.isArray(hit.ll) || hit.ll.length < 2) return null;
    const [lat, lng] = hit.ll;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { country: hit.country, lat, lng };
  } catch {
    return null;
  }
}

/**
 * Classe une chaîne (Referer ou utm_source) en source normalisée.
 * Ordre : on cherche les grandes plateformes par mots-clés, puis 'other',
 * puis 'direct' si vide. On accepte aussi bien un domaine ("t.co",
 * "facebook.com") qu'un utm_source ("fb_ads", "ig", "tiktok_ads").
 */
export function classifySource(raw?: string | null): StoreEventSource {
  if (!raw) return 'direct';
  const s = String(raw).toLowerCase();
  if (/facebook|fb\.com|fbclid|\bfb\b|fb_/.test(s)) return 'facebook';
  if (/instagram|\big\b|ig_/.test(s)) return 'instagram';
  if (/tiktok|tt_|tiktok_ads/.test(s)) return 'tiktok';
  if (/google\.|googleads|gclid|adwords|\bg_ads?\b/.test(s)) return 'google';
  if (/youtube|youtu\.be/.test(s)) return 'youtube';
  if (/twitter\.com|\bx\.com\b|t\.co|twitter_ads/.test(s)) return 'twitter';
  if (/snapchat|snap_/.test(s)) return 'snapchat';
  if (/whatsapp|wa\.me|whatsapp_/.test(s)) return 'whatsapp';
  return 'other';
}

/**
 * Classe un User-Agent en 'mobile' | 'desktop'. Volontairement simple : on ne
 * garde que la distinction téléphone/tablette vs ordinateur. Les tablettes sont
 * comptées comme « mobile ». Retourne undefined si l'UA est vide/illisible.
 */
export function deviceFromUserAgent(ua?: string): 'mobile' | 'desktop' | undefined {
  if (!ua || typeof ua !== 'string') return undefined;
  const s = ua.toLowerCase();
  const isMobile = /(android|iphone|ipad|ipod|iemobile|blackberry|bb10|windows phone|opera mini|mobile|tablet|silk|kindle|webos)/.test(s);
  return isMobile ? 'mobile' : 'desktop';
}

/**
 * Live visitor count for the seller's overview — Shopify-style. We count
 * distinct anonymous sessionIds that fired ANY storefront event in the last
 * `windowMin` minutes (default 5). Five minutes matches Shopify's window and
 * is short enough to feel "live" without dropping a visitor between page
 * navigations.
 */
export async function getLiveVisitors(
  storeId: string,
  windowMin = 5,
): Promise<{ count: number; windowMin: number }> {
  const oid = new mongoose.Types.ObjectId(storeId);
  const since = new Date(Date.now() - windowMin * 60 * 1000);
  const sessions = await StoreEvent.distinct('sessionId', {
    storeId: oid,
    createdAt: { $gte: since },
  });
  return { count: (sessions as string[]).length, windowMin };
}

export interface GlobePoint {
  /** Anonymous, stable ID so React can key points without flicker. */
  id: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2 when geoip resolved a country. */
  country?: string;
  /** ISO timestamp — frontend uses it to drive pulse animations. */
  ts: string;
}

export interface LiveGlobePayload {
  /** Points oranges : visiteurs présents dans la fenêtre `visitorsWindowMin`. */
  visitors: GlobePoint[];
  /** Points verts : commandes fraîches sur la fenêtre `ordersWindowMin`. */
  orders: GlobePoint[];
  visitorsWindowMin: number;
  ordersWindowMin: number;
}

/**
 * Feeds the dashboard "live globe" widget. One aggregation per call, only
 * the tiny indexed slice (last ~30 min) — safe to poll every 15-30s.
 *
 * Deux séries séparées :
 *  - visitors : une ligne par session active avec géo connue
 *    (last-known lat/lng pour cette session dans la fenêtre)
 *  - orders   : chaque event `purchase` géolocalisé de la fenêtre commandes
 *
 * On jette silencieusement les events sans lat/lng (visiteurs locaux /
 * IP privée / bases geoip-lite avant cette feature) — on ne devine pas
 * une position pour afficher quand même un point.
 */
export async function getLiveGlobe(
  storeId: string,
  opts: { visitorsWindowMin?: number; ordersWindowMin?: number } = {},
): Promise<LiveGlobePayload> {
  const visitorsWindowMin = opts.visitorsWindowMin ?? 5;
  const ordersWindowMin = opts.ordersWindowMin ?? 30;
  const oid = new mongoose.Types.ObjectId(storeId);
  const sinceVisitors = new Date(Date.now() - visitorsWindowMin * 60 * 1000);
  const sinceOrders = new Date(Date.now() - ordersWindowMin * 60 * 1000);

  // Visitors: dédoublonne par sessionId, garde le dernier event géolocalisé.
  // On prend le plus récent pour que le point suive si la session a navigué.
  const visitorsAgg = await StoreEvent.aggregate<{
    _id: string;
    lat: number;
    lng: number;
    country?: string;
    ts: Date;
  }>([
    {
      $match: {
        storeId: oid,
        createdAt: { $gte: sinceVisitors },
        type: { $in: ['page_view', 'product_view', 'add_to_cart'] },
        lat: { $ne: null, $exists: true },
        lng: { $ne: null, $exists: true },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$sessionId',
        lat: { $first: '$lat' },
        lng: { $first: '$lng' },
        country: { $first: '$country' },
        ts: { $first: '$createdAt' },
      },
    },
    { $limit: 250 },
  ]);

  const ordersAgg = await StoreEvent.find({
    storeId: oid,
    type: 'purchase',
    createdAt: { $gte: sinceOrders },
    lat: { $ne: null, $exists: true },
    lng: { $ne: null, $exists: true },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('_id lat lng country createdAt')
    .lean();

  return {
    visitors: visitorsAgg.map((v) => ({
      id: v._id,
      lat: v.lat,
      lng: v.lng,
      country: v.country || undefined,
      ts: v.ts.toISOString(),
    })),
    orders: ordersAgg
      .filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number')
      .map((o) => ({
        id: o._id.toString(),
        lat: o.lat as number,
        lng: o.lng as number,
        country: o.country || undefined,
        ts: (o.createdAt as Date).toISOString(),
      })),
    visitorsWindowMin,
    ordersWindowMin,
  };
}

/** Fire-and-forget event ingest — never throws into the request path. */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  if (!input.storeId || !input.sessionId || !input.type) return;
  try {
    const geo = resolveGeo(input.ip);
    await StoreEvent.create({
      storeId: input.storeId,
      productId: input.productId || undefined,
      type: input.type,
      sessionId: String(input.sessionId).slice(0, 64),
      device: input.device,
      source: input.source,
      country: geo?.country,
      lat: geo?.lat,
      lng: geo?.lng,
      value: typeof input.value === 'number' ? input.value : undefined,
      currency: input.currency,
    });
  } catch {
    // Tracking must never break the storefront.
  }
}

export interface TrackingStats {
  range: TrackingRange;
  totals: {
    /** Any storefront page hit (landing, info page, product). */
    pageViews: number;
    productViews: number;
    addToCart: number;
    purchases: number;
    abandonedCarts: number;
    /** % of product views that started an order. */
    viewToCartRate: number;
    /** % of started orders that completed. */
    cartToPurchaseRate: number;
    /** % of product views that became an order. */
    conversionRate: number;
  };
  products: Array<{
    productId: string;
    name: string;
    views: number;
    addToCart: number;
    purchases: number;
  }>;
  /** Origine des vues de pages. `unknown` = événement sans source enregistrée. */
  sources: Array<{ source: string; views: number }>;
  devices: { mobile: number; desktop: number; unknown: number };
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** Aggregate the storefront funnel for the seller's "Suivi" dashboard. */
export async function getTrackingStats(
  storeId: string,
  range: TrackingRange,
): Promise<TrackingStats> {
  const oid = new mongoose.Types.ObjectId(storeId);
  const start = rangeStart(range);

  // Totals by event type.
  const byType = await StoreEvent.aggregate<{ _id: StoreEventType; count: number }>([
    { $match: { storeId: oid, createdAt: { $gte: start } } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);
  const counts: Record<StoreEventType, number> = {
    page_view: 0,
    product_view: 0,
    add_to_cart: 0,
    purchase: 0,
  };
  for (const r of byType) counts[r._id] = r.count;

  // Abandoned carts: sessions that started an order but never completed one.
  // Two boundary choices matter here:
  //   1. We require carts to be at least 24h old before counting them as
  //      abandoned — otherwise every fresh visitor (still in their session)
  //      inflates the number. 24h is the industry-standard "grace period"
  //      before a cart is considered dead.
  //   2. We accept purchases up to NOW (no upper bound), so a cart from
  //      day 1 of a 90-day window that converts today is correctly excluded.
  const graceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [cartSessions, purchaseSessions] = await Promise.all([
    StoreEvent.distinct('sessionId', { storeId: oid, type: 'add_to_cart', createdAt: { $gte: start, $lte: graceCutoff } }),
    StoreEvent.distinct('sessionId', { storeId: oid, type: 'purchase', createdAt: { $gte: start } }),
  ]);
  const purchasedSet = new Set(purchaseSessions as string[]);
  const abandonedCarts = (cartSessions as string[]).filter((s) => !purchasedSet.has(s)).length;

  // Per-product funnel.
  const byProduct = await StoreEvent.aggregate<{
    _id: mongoose.Types.ObjectId;
    views: number;
    addToCart: number;
    purchases: number;
  }>([
    { $match: { storeId: oid, createdAt: { $gte: start }, productId: { $ne: null } } },
    {
      $group: {
        _id: '$productId',
        views: { $sum: { $cond: [{ $eq: ['$type', 'product_view'] }, 1, 0] } },
        addToCart: { $sum: { $cond: [{ $eq: ['$type', 'add_to_cart'] }, 1, 0] } },
        purchases: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, 1, 0] } },
      },
    },
    { $sort: { views: -1, addToCart: -1 } },
    { $limit: 50 },
  ]);

  const visitMatch = { storeId: oid, createdAt: { $gte: start }, type: 'page_view' as const };
  const [bySource, byDevice] = await Promise.all([
    StoreEvent.aggregate<{ _id: string; count: number }>([
      { $match: visitMatch },
      { $group: { _id: { $ifNull: ['$source', 'unknown'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    StoreEvent.aggregate<{ _id: string; count: number }>([
      { $match: visitMatch },
      { $group: { _id: { $ifNull: ['$device', 'unknown'] }, count: { $sum: 1 } } },
    ]),
  ]);
  const devices = { mobile: 0, desktop: 0, unknown: 0 };
  for (const row of byDevice) {
    if (row._id === 'mobile' || row._id === 'desktop') devices[row._id] = row.count;
    else devices.unknown += row.count;
  }

  const productIds = byProduct.map((p) => p._id);
  const productDocs = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).select('name').lean()
    : [];
  const nameById = new Map(productDocs.map((p) => [p._id.toString(), p.name]));

  const products = byProduct.map((p) => ({
    productId: p._id.toString(),
    name: nameById.get(p._id.toString()) || 'Produit supprimé',
    views: p.views,
    addToCart: p.addToCart,
    purchases: p.purchases,
  }));

  return {
    range,
    totals: {
      pageViews: counts.page_view,
      productViews: counts.product_view,
      addToCart: counts.add_to_cart,
      purchases: counts.purchase,
      abandonedCarts,
      viewToCartRate: pct(counts.add_to_cart, counts.product_view),
      cartToPurchaseRate: pct(counts.purchase, counts.add_to_cart),
      conversionRate: pct(counts.purchase, counts.product_view),
    },
    products,
    sources: bySource.map((row) => ({ source: row._id || 'unknown', views: row.count })),
    devices,
  };
}
