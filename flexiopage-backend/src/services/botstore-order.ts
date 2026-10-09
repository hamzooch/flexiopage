/**
 * Commande passée depuis le chat Botstore d'une boutique.
 *
 * Les prix, le stock et les frais viennent du catalogue et des réglages du
 * store — jamais du texte du modèle. Une boutique digitale n'enregistre pas
 * de paiement à la livraison : le bot renvoie le client vers la fiche produit.
 */
import { logger } from '../lib/logger';
import { resolveBundlePricing } from '../lib/bundle';
import { resolveProductPricing } from '../lib/market';
import { Product, type IProduct } from '../models/Product.model';
import { Order } from '../models/Order.model';
import type { IStore } from '../models/Store.model';
import * as orderService from './order.service';
import { formatBuyerPhone, phoneKey } from '../utils/phone';

export interface CatalogVariant {
  name: string;
  price: number;
  stock: number;
  sku?: string;
}

export interface CatalogLine {
  id: string;
  name: string;
  slug: string;
  type: string;
  price: number;
  stock: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  sku?: string;
  variants: CatalogVariant[];
  pricing?: IProduct['pricing'];
  bundle?: IProduct['bundle'];
}

export interface OrderItemInput {
  product_name: string;
  variant_name?: string;
  quantity: number;
}

export interface PlaceOrderInput {
  items: OrderItemInput[];
  customer_name: string;
  customer_phone: string;
  customer_city: string;
  customer_address: string;
  notes?: string;
}

export interface BotstoreOrderCard {
  orderId: string;
  orderNumber: string;
  total: number;
  currency: string;
  shippingCost: number;
  items: Array<{ name: string; quantity: number; price: number }>;
}

export type PlaceOrderResult =
  | { ok: true; order: BotstoreOrderCard; reused: boolean }
  | { ok: false; error: string };

const RECENT_MS = 3 * 60 * 1000;

export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function toCatalogLine(product: IProduct): CatalogLine {
  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    type: product.type,
    price: product.price,
    stock: product.stock ?? 0,
    trackInventory: !!product.trackInventory,
    allowBackorder: !!product.allowBackorder,
    sku: product.sku,
    variants: (product.variants || []).map((variant) => ({
      name: variant.name,
      price: variant.price,
      stock: variant.stock ?? 0,
      sku: variant.sku,
    })),
    pricing: product.pricing,
    bundle: product.bundle,
  };
}

export function productPath(storeSlug: string, productSlug: string): string {
  return `/store/${storeSlug}/product/${productSlug}`;
}

export interface ProductMatch {
  product: CatalogLine;
  /** Morceau de la requête qui n'est pas le nom du produit (souvent la variante). */
  remainder: string;
}

export function matchCatalogProduct(
  products: CatalogLine[],
  query: string,
): { ok: true; match: ProductMatch } | { ok: false; error: string } {
  const needle = fold(query);
  if (!needle) return { ok: false, error: 'Nom de produit manquant.' };

  const exact = products.filter((product) => fold(product.name) === needle);
  if (exact.length === 1) return { ok: true, match: { product: exact[0], remainder: '' } };

  const contained = products
    .map((product) => {
      const name = fold(product.name);
      if (!name) return null;
      if (needle.includes(name)) return { product, remainder: needle.replace(name, '').trim() };
      if (name.includes(needle) && needle.length >= 3) return { product, remainder: '' };
      return null;
    })
    .filter((hit): hit is ProductMatch => !!hit);

  const unique = new Map<string, ProductMatch>();
  for (const hit of contained) unique.set(hit.product.id, hit);
  const hits = [...unique.values()];
  if (hits.length === 1) return { ok: true, match: hits[0] };
  if (hits.length > 1) {
    const names = hits.slice(0, 5).map((hit) => hit.product.name).join(', ');
    return { ok: false, error: `Plusieurs produits correspondent à « ${query.trim()} » : ${names}. Demande lequel.` };
  }
  return { ok: false, error: `Produit « ${query.trim()} » introuvable dans cette boutique.` };
}

interface ResolvedLine {
  productId: string;
  variantName?: string;
  name: string;
  quantity: number;
  price: number;
  sku?: string;
  trackInventory: boolean;
}

export function storeCommerce(store: IStore): { country: string; currency: string; shippingFee: number; physical: boolean } {
  const markets = (store.markets || []).filter((market) => market.enabled !== false);
  const market = markets.find((item) => item.isDefault) || markets[0];
  return {
    country: (market?.country || store.settings?.country || '').trim().toUpperCase(),
    currency: (market?.currency || store.settings?.currency || 'XOF').trim().toUpperCase(),
    shippingFee: Math.max(0, Number(market?.shippingFee ?? store.settings?.codForm?.shippingFee) || 0),
    physical: store.storeType !== 'digital',
  };
}

function wordsOf(value: string): string[] {
  return fold(value).split(' ').filter(Boolean);
}

/** Variante reconnue par son nom entier, même au milieu d'une phrase (« taille M », « le noir »). */
export function matchVariant(product: CatalogLine, hint: string): CatalogVariant | undefined {
  const needle = fold(hint);
  if (!needle) return undefined;
  const exact = product.variants.filter((variant) => fold(variant.name) === needle);
  if (exact.length === 1) return exact[0];
  const words = new Set(wordsOf(hint));
  const hits = product.variants.filter((variant) => {
    const parts = wordsOf(variant.name);
    return parts.length > 0 && parts.every((part) => words.has(part));
  });
  if (!hits.length) return undefined;
  const ranked = [...hits].sort((a, b) => wordsOf(b.name).length - wordsOf(a.name).length);
  const top = wordsOf(ranked[0].name).length;
  const tied = ranked.filter((variant) => wordsOf(variant.name).length === top);
  return tied.length === 1 ? tied[0] : undefined;
}

export interface VariantChoice {
  label: string;
  message: string;
}

function variantInStock(product: CatalogLine, variant: CatalogVariant): boolean {
  if (!product.trackInventory || product.allowBackorder) return true;
  return variant.stock > 0;
}

/**
 * Boutons à afficher quand un seul produit à variantes est en jeu et que le
 * client n'a pas encore nommé la sienne.
 */
export function variantChoices(args: {
  products: CatalogLine[];
  userText: string;
  reply: string;
}): VariantChoice[] {
  const blob = fold(`${args.userText}\n${args.reply}`);
  const mentioned = args.products.filter(
    (product) => product.variants.length > 0 && fold(product.name).length > 0 && blob.includes(fold(product.name)),
  );
  if (mentioned.length !== 1) return [];
  const product = mentioned[0];
  if (matchVariant(product, args.userText)) return [];
  const available = product.variants.filter((variant) => variantInStock(product, variant));
  const prices = new Set(available.map((variant) => variant.price));
  return available.map((variant) => ({
    label: prices.size > 1 ? `${variant.name} · ${variant.price}` : variant.name,
    message: `${product.name} — ${variant.name}`,
  }));
}

/** Résout les lignes au prix catalogue. Aucune écriture. */
export function resolveOrderLines(args: {
  store: IStore;
  products: CatalogLine[];
  items: OrderItemInput[];
}): { ok: true; lines: ResolvedLine[]; currency: string; shippingFee: number; country: string } | { ok: false; error: string } {
  const commerce = storeCommerce(args.store);
  if (!commerce.physical) {
    const links = args.products
      .filter((product) => product.type === 'digital')
      .slice(0, 5)
      .map((product) => `${product.name} : ${productPath(args.store.slug, product.slug)}`)
      .join(' · ');
    return {
      ok: false,
      error: `Cette boutique se paie en ligne, pas à la livraison. Envoie le client vers la fiche : ${links || 'la page produit'}.`,
    };
  }
  if (!args.items.length) return { ok: false, error: 'Aucun produit dans la commande.' };
  if (args.items.length > 8) return { ok: false, error: '8 produits maximum par commande.' };

  const lines: ResolvedLine[] = [];
  const errors: string[] = [];
  for (const item of args.items) {
    const found = matchCatalogProduct(args.products, item.product_name || '');
    if (!found.ok) {
      errors.push(found.error);
      continue;
    }
    const product = found.match.product;
    if (product.type !== 'physical') {
      errors.push(
        `« ${product.name} » se paie en ligne : ${productPath(args.store.slug, product.slug)}`,
      );
      continue;
    }
    const qty = Math.max(1, Math.min(Math.floor(Number(item.quantity) || 1), 99));
    let variant: CatalogVariant | undefined;
    if (product.variants.length > 0) {
      variant = matchVariant(
        product,
        [item.variant_name, found.match.remainder, item.product_name].filter(Boolean).join(' '),
      );
      if (!variant) {
        const names = product.variants.filter((entry) => variantInStock(product, entry)).map((entry) => entry.name);
        const listed = (names.length ? names : product.variants.map((entry) => entry.name)).join(', ');
        errors.push(`« ${product.name} » a des variantes : ${listed}. Demande laquelle, avec ces noms exacts.`);
        continue;
      }
    }
    const countryPricing = resolveProductPricing(product, commerce.country, commerce.currency);
    if (!countryPricing.available) {
      errors.push(`« ${product.name} » n'est pas disponible dans ce pays.`);
      continue;
    }
    const stock = variant ? variant.stock : countryPricing.stock;
    if (product.trackInventory && !product.allowBackorder && stock < qty) {
      errors.push(`« ${variant ? `${product.name} — ${variant.name}` : product.name} » : ${stock} en stock, ${qty} demandés.`);
      continue;
    }
    const basePrice = variant ? variant.price : countryPricing.price;
    const pricing = resolveBundlePricing(basePrice, product.bundle, qty);
    lines.push({
      productId: product.id,
      variantName: variant?.name,
      name: variant ? `${product.name} — ${variant.name}` : product.name,
      quantity: qty,
      price: pricing.unitPrice,
      sku: variant?.sku || product.sku,
      trackInventory: product.trackInventory,
    });
  }
  if (errors.length) return { ok: false, error: errors.join(' ') };
  return {
    ok: true,
    lines,
    currency: commerce.currency,
    shippingFee: commerce.shippingFee,
    country: commerce.country || 'MA',
  };
}

function sameLines(
  orderItems: Array<{ productId?: unknown; name?: string; quantity?: number }>,
  lines: ResolvedLine[],
): boolean {
  if (orderItems.length !== lines.length) return false;
  const left = orderItems
    .map((item) => `${String(item.productId || '')}:${item.quantity}:${fold(item.name || '')}`)
    .sort()
    .join('|');
  const right = lines
    .map((line) => `${line.productId}:${line.quantity}:${fold(line.name)}`)
    .sort()
    .join('|');
  return left === right;
}

export async function placeBotstoreOrder(args: {
  store: IStore;
  products: CatalogLine[];
  input: PlaceOrderInput;
}): Promise<PlaceOrderResult> {
  const name = args.input.customer_name?.trim() || '';
  const city = args.input.customer_city?.trim() || '';
  const address = args.input.customer_address?.trim() || '';
  const phone = formatBuyerPhone(args.input.customer_phone);
  if (name.length < 2) return { ok: false, error: 'Nom du client trop court.' };
  if (!phone) return { ok: false, error: 'Numéro de téléphone invalide. Redemande-le.' };
  if (city.length < 2) return { ok: false, error: 'Ville manquante.' };
  if (address.length < 4) return { ok: false, error: 'Adresse trop courte.' };

  const resolved = resolveOrderLines({
    store: args.store,
    products: args.products,
    items: args.input.items || [],
  });
  if (!resolved.ok) return resolved;

  const key = phoneKey(phone);
  if (key) {
    const recent = await Order.findOne({
      storeId: args.store._id,
      customerPhoneKey: key,
      notes: /Botstore/,
      createdAt: { $gte: new Date(Date.now() - RECENT_MS) },
    })
      .sort({ createdAt: -1 })
      .select('orderNumber total currency shippingCost items')
      .lean();
    if (recent && sameLines(recent.items || [], resolved.lines)) {
      return {
        ok: true,
        reused: true,
        order: {
          orderId: String(recent._id),
          orderNumber: recent.orderNumber,
          total: recent.total,
          currency: recent.currency,
          shippingCost: recent.shippingCost || 0,
          items: (recent.items || []).map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      };
    }
  }

  const subtotal = resolved.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const digits = phone.replace(/\D/g, '');
  let order;
  try {
    order = await orderService.createOrder({
      storeId: args.store._id.toString(),
      email: `botstore-${digits}@flexiopage.local`,
      customerName: name,
      customerPhone: phone,
      customerWhatsapp: phone,
      shippingAddress: {
        line1: address,
        city,
        country: resolved.country,
      },
      items: resolved.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantName,
        name: line.name,
        quantity: line.quantity,
        price: line.price,
        sku: line.sku,
      })),
      subtotal,
      shippingCost: resolved.shippingFee,
      currency: resolved.currency,
      marketCountry: resolved.country,
      paymentMethod: 'cod',
      notes: args.input.notes?.trim()
        ? `Commande via Botstore. ${args.input.notes.trim()}`.slice(0, 500)
        : 'Commande via Botstore',
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, storeSlug: args.store.slug }, '[botstore] createOrder échec');
    return { ok: false, error: 'La commande n\'a pas pu être enregistrée. Propose de réessayer.' };
  }

  await Promise.all(
    resolved.lines
      .filter((line) => line.trackInventory)
      .map((line) => Product.updateOne({ _id: line.productId, storeId: args.store._id }, { $inc: { stock: -line.quantity } })),
  );

  try {
    const { pushOrderToSheets } = await import('./sheets.service');
    await pushOrderToSheets({
      order,
      store: { _id: args.store._id, name: args.store.name, slug: args.store.slug },
      event: 'order.created',
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[botstore] sheets (non bloquant)');
  }

  const carrierAuto = !!(args.store.integrations?.delivery?.enabled && args.store.integrations.delivery.autoDispatch !== false);
  const logisticsAuto = !!(
    args.store.integrations?.logistics?.enabled
    && args.store.integrations.logistics.provider === 'mogadelivery'
    && (args.store.integrations.logistics.autoForward ?? true)
  );
  if (carrierAuto || logisticsAuto) {
    try {
      const { dispatchOrder } = await import('./delivery.service');
      await dispatchOrder({ order, store: args.store });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[botstore] dispatch (non bloquant)');
    }
  }

  if (args.store.ownerId) {
    try {
      const { notifyOrderCreated } = await import('./notification.service');
      await notifyOrderCreated({
        userId: args.store.ownerId,
        storeId: args.store._id,
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        total: order.total,
        currency: order.currency,
        customerName: order.customerName,
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[botstore] notification (non bloquant)');
    }
  }

  return {
    ok: true,
    reused: false,
    order: {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      shippingCost: order.shippingCost || 0,
      items: resolved.lines.map((line) => ({ name: line.name, quantity: line.quantity, price: line.price })),
    },
  };
}
