/**
 * Order finalization — runs once when an order transitions to `paid`.
 *
 * Responsibilities:
 *   1. Generate a secure download token (used at /d/<token>)
 *   2. Generate license keys for items whose product has a licenseKeyTemplate
 *   3. Compute downloadExpiresAt for time-limited access products
 *   4. Send the buyer the order confirmation email with the download link
 *
 * Idempotent: calling finalizePaidOrder twice on the same order is a no-op.
 */
import crypto from 'crypto';
import { Order, type IOrder, type IOrderItem } from '../models/Order.model';
import { Product } from '../models/Product.model';
import { Store } from '../models/Store.model';
import { sendOrderPaidEmail } from './email.service';
import { dispatchOrder } from './delivery.service';
import { notifyOrderCreated } from './notification.service';
import { pushOrderToSheets } from './sheets.service';
import { logActivity } from './activity-log.service';
import { creditSellerForPaidOrder } from './seller-earnings.service';

const TOKEN_BYTES = 24; // 32 base64url chars after encoding
const DEFAULT_EXPIRY_DAYS = 30;

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Render a license key from a template like "BOUT-{productSlug}-{random}".
 * Tokens supported:
 *   {random}      — 16-char base32 upper
 *   {productSlug} — slug of the product
 *   {orderNumber} — order number
 */
function renderLicenseKey(template: string, productSlug: string, orderNumber: string): string {
  const random = crypto
    .randomBytes(10)
    .toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, 16)
    .toUpperCase();
  return template
    .replace(/\{random\}/g, random)
    .replace(/\{productSlug\}/g, productSlug)
    .replace(/\{orderNumber\}/g, orderNumber);
}

/**
 * Mark an order as paid (idempotent), generate digital deliverables, and
 * email the buyer. Designed to be called from any payment provider's webhook.
 */
export async function finalizePaidOrder(orderId: string, providerData?: {
  paymentReference?: string;
  paymentProvider?: string;
  webhookData?: Record<string, unknown>;
}): Promise<{ ok: true; alreadyDone: boolean; order: IOrder }> {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // Already finalized — idempotent return.
  if (order.paymentStatus === 'paid' && order.downloadToken) {
    return { ok: true, alreadyDone: true, order };
  }

  // Load all products in the order (for license templates + access type)
  const productIds = Array.from(new Set(order.items.map((i) => i.productId.toString())));
  const products = await Product.find({ _id: { $in: productIds } })
    .select('name slug licenseKeyTemplate accessType accessDays digitalKind images')
    .lean();
  const productById = new Map(products.map((p) => [p._id.toString(), p]));

  // Generate license keys per item where applicable
  const itemsUpdated: IOrderItem[] = order.items.map((it) => {
    const p = productById.get(it.productId.toString());
    if (it.licenseKey || !p?.licenseKeyTemplate) return it;
    const key = renderLicenseKey(p.licenseKeyTemplate, p.slug, order.orderNumber);
    return { ...(it as unknown as Record<string, unknown>), licenseKey: key } as IOrderItem;
  });

  // Compute the longest expiry across items (so the token covers everything)
  let downloadExpiresAt: Date | undefined;
  for (const it of order.items) {
    const p = productById.get(it.productId.toString());
    if (p?.accessType === 'limited' && p.accessDays && p.accessDays > 0) {
      const candidate = new Date(Date.now() + p.accessDays * 24 * 60 * 60 * 1000);
      if (!downloadExpiresAt || candidate > downloadExpiresAt) downloadExpiresAt = candidate;
    }
  }
  // Even for lifetime products we keep a generous TTL on the token so it's
  // not stolen forever — the buyer can re-request a fresh link by email.
  if (!downloadExpiresAt) {
    downloadExpiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  }

  // Decide if this is a digital-only order (so we can mark as fulfilled
  // immediately) vs a physical order that needs dispatch to a courier.
  const hasPhysical = products.some((p) => p.type === 'physical');

  // Persist
  order.paymentStatus = 'paid';
  // Physical orders stay 'unfulfilled' until the delivery provider confirms.
  order.fulfillmentStatus = hasPhysical ? 'unfulfilled' : 'fulfilled';
  order.items = itemsUpdated as typeof order.items;
  if (!order.downloadToken) order.downloadToken = generateToken();
  order.downloadExpiresAt = downloadExpiresAt;
  if (providerData?.paymentReference) order.paymentReference = providerData.paymentReference;
  if (providerData?.paymentProvider) {
    order.paymentProvider = providerData.paymentProvider as IOrder['paymentProvider'];
  }
  if (providerData?.webhookData) order.paymentWebhookData = providerData.webhookData;
  await order.save();
  void logActivity({
    type: 'order.paid',
    message: `Paiement reçu pour ${order.orderNumber} (${order.total} ${order.currency})`,
    storeId: order.storeId,
    orderId: order._id,
    metadata: { total: order.total, currency: order.currency, provider: providerData?.paymentProvider },
  });

  // Credit the seller's payout balance for online-paid orders (best-effort —
  // seller-earnings failure never blocks the buyer's confirmation flow).
  try {
    const credited = await creditSellerForPaidOrder(order);
    if (credited > 0) {
      console.log(`[order-finalize] credited seller ${credited} ${order.currency} for ${order.orderNumber}`);
    }
  } catch (err) {
    console.error('[order-finalize] seller credit failed (non-fatal):', (err as Error).message);
  }

  // Auto-dispatch to delivery provider when the order has at least one
  // physical item AND a carrier (integrations.delivery) OR MogaDelivery 3PL
  // (integrations.logistics) is enabled. Best-effort, never blocks the email.
  if (hasPhysical) {
    try {
      const fullStore = await Store.findById(order.storeId);
      const carrierAuto = !!(fullStore?.integrations?.delivery?.enabled
        && fullStore.integrations.delivery.autoDispatch !== false);
      const logisticsAuto = !!(fullStore?.integrations?.logistics?.enabled
        && fullStore.integrations.logistics.provider === 'mogadelivery'
        && (fullStore.integrations.logistics.autoForward ?? true));
      if (fullStore && (carrierAuto || logisticsAuto)) {
        const dispatch = await dispatchOrder({ order, store: fullStore });
        if (dispatch.ok) {
          console.log(`[order-finalize] dispatched ${order.orderNumber} → ${dispatch.result?.externalId}`);
        } else {
          console.warn(`[order-finalize] dispatch skipped for ${order.orderNumber}: ${dispatch.error}`);
        }
      } else if (fullStore) {
        console.warn(`[order-finalize] no delivery/logistics integration enabled for ${order.orderNumber}`);
      }
    } catch (err) {
      console.error('[order-finalize] dispatch error (non-fatal):', (err as Error).message);
    }
  }

  // Push to Google Sheets (best-effort).
  try {
    const fullStore = await Store.findById(order.storeId).select('_id name slug').lean();
    if (fullStore) {
      await pushOrderToSheets({ order, store: fullStore, event: 'order.paid' });
    }
  } catch (err) {
    console.error('[order-finalize] sheets push failed (non-fatal):', (err as Error).message);
  }

  // In-app bell notification (best-effort).
  try {
    const storeForNotif = await Store.findById(order.storeId).select('ownerId').lean();
    if (storeForNotif?.ownerId) {
      await notifyOrderCreated({
        userId: storeForNotif.ownerId,
        storeId: order.storeId,
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        total: order.total,
        currency: order.currency,
        customerName: order.customerName,
      });
    }
  } catch (err) {
    console.error('[order-finalize] notification failed (non-fatal):', (err as Error).message);
  }

  // Send confirmation email (best-effort — never block the webhook on email)
  try {
    const store = await Store.findById(order.storeId).select('name').lean();
    await sendOrderPaidEmail({
      to: order.email,
      customerName: order.customerName,
      storeName: store?.name || 'Boutique',
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      downloadToken: order.downloadToken!,
      expiresAt: order.downloadExpiresAt,
      items: itemsUpdated.map((it) => {
        const p = productById.get(it.productId.toString());
        return {
          name: it.name,
          quantity: it.quantity,
          price: it.price,
          imageUrl: p?.images?.[0],
          licenseKey: it.licenseKey,
        };
      }),
    });
  } catch (err) {
    console.error('[order-finalize] email send failed (non-fatal):', (err as Error).message);
  }

  return { ok: true, alreadyDone: false, order };
}
