import crypto from 'crypto';
import { Order, IOrder } from '../models/Order.model';
import { Customer } from '../models/Customer.model';
import { Product } from '../models/Product.model';
import { logActivity } from './activity-log.service';

/** Random opaque 32-char URL-safe token used as the customer download key. */
function generateDownloadToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Random base32 segment used inside license-key templates. */
function randomLicenseSegment(len = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * Render a product's licenseKeyTemplate, replacing {random}, {productSlug},
 * {orderNumber}. Returns undefined when the product has no template.
 */
function renderLicenseKey(template: string | undefined, ctx: { productSlug?: string; orderNumber: string }): string | undefined {
  if (!template?.trim()) return undefined;
  return template
    .replace(/\{random\}/g, randomLicenseSegment(16))
    .replace(/\{productSlug\}/g, (ctx.productSlug || 'item').slice(0, 24).toUpperCase())
    .replace(/\{orderNumber\}/g, ctx.orderNumber);
}

export interface CreateOrderInput {
  storeId: string;
  email: string;
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: IOrder['shippingAddress'];
  items: Array<{
    productId: string;
    variantId?: string;
    name: string;
    quantity: number;
    price: number;
    sku?: string;
    digitalFileUrl?: string;
  }>;
  subtotal: number;
  shippingCost?: number;
  tax?: number;
  discount?: number;
  couponCode?: string;
  paymentMethod?: 'stripe' | 'manual' | 'other' | 'mobile_money' | 'card' | 'cod';
  /** Optional currency override (defaults to 'USD' from the order schema). */
  currency?: string;
  /**
   * Pays du market résolu au moment du checkout. Sert au routage outbound
   * MogaDelivery (un dashboard MD par pays). Snapshot — pas recalculé.
   */
  marketCountry?: string;
  notes?: string;
}

async function nextOrderNumber(storeId: string): Promise<string> {
  const last = await Order.findOne({ storeId })
    .sort({ createdAt: -1 })
    .select('orderNumber')
    .lean();
  const num = last?.orderNumber ? parseInt(last.orderNumber.replace(/\D/g, ''), 10) + 1 : 1001;
  return `ORD-${num}`;
}

export async function createOrder(input: CreateOrderInput): Promise<IOrder> {
  const orderNumber = await nextOrderNumber(input.storeId);
  const total =
    input.subtotal +
    (input.shippingCost ?? 0) +
    (input.tax ?? 0) -
    (input.discount ?? 0);

  let customerId;
  const existing = await Customer.findOne({
    storeId: input.storeId,
    email: input.email.toLowerCase(),
  });
  if (existing) {
    customerId = existing._id;
  } else {
    const customer = await Customer.create({
      storeId: input.storeId,
      email: input.email.toLowerCase(),
      name: input.customerName,
      phone: input.customerPhone,
      address: input.shippingAddress,
    });
    customerId = customer._id;
  }

  // Pre-fetch products referenced by the items so we can generate license keys
  // and detect digital deliverables / access limits.
  const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
  const products = await Product.find({ _id: { $in: productIds } })
    .select('slug type digitalKind digitalAssets digitalFileUrl licenseKeyTemplate accessType accessDays')
    .lean();
  const productById = new Map(products.map((p) => [p._id.toString(), p]));

  const items = input.items.map((i) => {
    const p = productById.get(i.productId);
    const licenseKey = p?.type === 'digital'
      ? renderLicenseKey(p.licenseKeyTemplate, { productSlug: p.slug, orderNumber })
      : undefined;
    return {
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      total: i.quantity * i.price,
      sku: i.sku,
      digitalFileUrl: i.digitalFileUrl ?? p?.digitalFileUrl,
      licenseKey,
    };
  });

  // Order has at least one digital deliverable → mint a download token.
  const hasDigital = products.some(
    (p) =>
      p.type === 'digital' &&
      ((p.digitalAssets && p.digitalAssets.length > 0) ||
        !!p.digitalFileUrl ||
        !!p.licenseKeyTemplate ||
        p.digitalKind === 'service' ||
        p.digitalKind === 'membership')
  );
  const downloadToken = hasDigital ? generateDownloadToken() : undefined;
  // Compute access-expires from the most restrictive product if any has limited access.
  let downloadExpiresAt: Date | undefined;
  if (downloadToken) {
    let minDays: number | undefined;
    for (const p of products) {
      if (p.accessType === 'limited' && typeof p.accessDays === 'number' && p.accessDays > 0) {
        minDays = minDays ? Math.min(minDays, p.accessDays) : p.accessDays;
      }
    }
    if (minDays) {
      downloadExpiresAt = new Date(Date.now() + minDays * 24 * 60 * 60 * 1000);
    }
  }

  const order = await Order.create({
    storeId: input.storeId,
    orderNumber,
    customerId,
    email: input.email,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    shippingAddress: input.shippingAddress,
    items,
    subtotal: input.subtotal,
    shippingCost: input.shippingCost ?? 0,
    tax: input.tax ?? 0,
    discount: input.discount ?? 0,
    total,
    currency: input.currency || 'USD',
    marketCountry: input.marketCountry,
    paymentStatus: 'pending',
    paymentMethod: input.paymentMethod ?? 'manual',
    fulfillmentStatus: 'unfulfilled',
    couponCode: input.couponCode,
    notes: input.notes,
    downloadToken,
    downloadExpiresAt,
  });
  void logActivity({
    type: 'order.created',
    message: `Commande ${order.orderNumber} créée (${order.total} ${order.currency}, ${order.paymentMethod})`,
    storeId: order.storeId,
    orderId: order._id,
    metadata: { total: order.total, currency: order.currency, paymentMethod: order.paymentMethod, items: items.length },
  });
  return order;
}

/** Look up an order by its public download token (for the customer portal). */
export async function getOrderByDownloadToken(token: string): Promise<IOrder | null> {
  return Order.findOne({ downloadToken: token }).lean<IOrder | null>();
}

export async function updateOrderPayment(
  orderId: string,
  storeId: string,
  updates: { paymentStatus: IOrder['paymentStatus']; stripePaymentIntentId?: string }
): Promise<IOrder | null> {
  return Order.findOneAndUpdate(
    { _id: orderId, storeId },
    { $set: updates },
    { new: true }
  );
}

export async function updateOrderFulfillment(
  orderId: string,
  storeId: string,
  updates: { fulfillmentStatus: IOrder['fulfillmentStatus']; trackingNumber?: string; trackingUrl?: string }
): Promise<IOrder | null> {
  return Order.findOneAndUpdate(
    { _id: orderId, storeId },
    { $set: updates },
    { new: true }
  );
}

export async function getOrdersByStore(
  storeId: string,
  options?: { limit?: number; skip?: number }
): Promise<{ orders: IOrder[]; total: number }> {
  const filter = { storeId };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(options?.limit ?? 50)
      .skip(options?.skip ?? 0)
      .populate('customerId', 'email name phone')
      .lean<IOrder[]>(),
    Order.countDocuments(filter),
  ]);
  return { orders, total };
}

export async function getOrderById(orderId: string, storeId: string): Promise<IOrder | null> {
  return Order.findOne({ _id: orderId, storeId })
    .populate('customerId')
    .populate('items.productId', 'name images')
    .lean<IOrder | null>();
}
