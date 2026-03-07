/**
 * Delivery integration — pushes physical orders to MogaDelivery's
 * `order.created` webhook. Auth is HMAC-SHA256 over the raw JSON body, hex
 * encoded, sent in `X-Boutshop-Signature`. The shared secret comes from
 * `BOUTSHOP_WEBHOOK_SECRET` (or per-store override).
 *
 * Spec: api.admin-mogadelivery.com/webhooks/boutshop
 *   - identifies the seller via `store_id` (root) + optional X-Boutshop-Store-Id header
 *   - matches products by SKU on the MogaDelivery side
 *   - 200 = accepted, 401 = bad signature, 400 = missing store_id
 */
import crypto from 'crypto';
import type { IOrder } from '../models/Order.model';
import { Order } from '../models/Order.model';
import type { IStore } from '../models/Store.model';

export type DeliveryProvider = 'mogadelivery' | 'manual' | 'other';

export interface DispatchResult {
  externalId: string;
  externalStatus: string;
  trackingUrl?: string;
  raw?: Record<string, unknown>;
}

export interface WebhookResult {
  /** Provider's external id (use to look up the order). */
  externalId?: string;
  /** Our order id when the provider echoes it back. */
  orderId?: string;
  /** Normalized status. */
  status:
    | 'pending'
    | 'assigned'
    | 'picked_up'
    | 'in_transit'
    | 'delivered'
    | 'returned'
    | 'cancelled'
    | 'failed';
  raw?: Record<string, unknown>;
}

interface DeliveryProviderImpl {
  id: DeliveryProvider;
  /** True when the provider has the API key and other required config. */
  isConfigured(store: IStore): boolean;
  dispatch(args: { order: IOrder; store: IStore }): Promise<DispatchResult>;
  parseWebhook(payload: Record<string, unknown>, headers: Record<string, string | undefined>, store?: IStore): Promise<WebhookResult>;
}

// ─────────────────────────────────────────────────────────────────────
// MogaDelivery (api.admin-mogadelivery.com/webhooks/boutshop)
// ─────────────────────────────────────────────────────────────────────
class MogaDeliveryProvider implements DeliveryProviderImpl {
  id: DeliveryProvider = 'mogadelivery';
  private defaultUrl = 'https://api.admin-mogadelivery.com/webhooks/boutshop';

  isConfigured(store: IStore): boolean {
    const cfg = store.integrations?.delivery;
    if (!cfg?.enabled) return false;
    return !!(cfg.webhookSecret || process.env.BOUTSHOP_WEBHOOK_SECRET);
  }

  private getConfig(store: IStore): { secret: string; url: string } {
    const cfg = store.integrations?.delivery;
    const secret = cfg?.webhookSecret || process.env.BOUTSHOP_WEBHOOK_SECRET || '';
    if (!secret) {
      throw new Error('BOUTSHOP_WEBHOOK_SECRET missing (set env or store.integrations.delivery.webhookSecret)');
    }
    const url = (cfg?.baseUrl || process.env.MOGADELIVERY_WEBHOOK_URL || this.defaultUrl).replace(/\/$/, '');
    return { secret, url };
  }

  /**
   * Build the order.created payload per MogaDelivery spec.
   * - `id` + `order_id` for anti-doublon
   * - `store_id` at root identifies the seller
   * - `line_items[].sku` is what MogaDelivery uses to match its own products
   */
  private buildBody(order: IOrder, store: IStore): Record<string, unknown> {
    const ship = order.shippingAddress || {};
    const country = ship.country || store.settings?.country || '';
    const phone = order.customerPhone || order.paymentPhone || '';
    const fullName = order.customerName || '';
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');
    const isCod = order.paymentMethod === 'cod' || order.paymentStatus !== 'paid';

    return {
      id: order.orderNumber,
      order_id: order.orderNumber,
      store_id: order.storeId.toString(),
      currency: order.currency,
      total: order.total,

      customer: {
        name: fullName || '-',
        first_name: firstName || '',
        last_name: lastName || '',
        phone,
        email: order.email,
      },

      shipping_address: {
        address1: ship.line1 || '',
        address2: ship.line2 || '',
        city: ship.city || '',
        state: ship.state || '',
        postal_code: ship.postalCode || '',
        country,
        country_code: country,
        phone,
      },

      line_items: order.items.map((it) => ({
        sku: it.sku || '',
        product_id: it.productId.toString(),
        variant_id: it.variantId,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
      })),

      // Useful extras (MogaDelivery accepts unknown fields)
      subtotal: order.subtotal,
      shipping: order.shippingCost,
      payment_status: order.paymentStatus,
      payment_method: order.paymentMethod,
      cod_amount: isCod ? order.total : 0,
      notes: order.notes || '',
      created_at: order.createdAt?.toISOString(),
    };
  }

  async dispatch({ order, store }: { order: IOrder; store: IStore }): Promise<DispatchResult> {
    const { secret, url } = this.getConfig(store);
    const rawBody = JSON.stringify(this.buildBody(order, store));
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Boutshop-Signature': signature,
        'X-Boutshop-Store-Id': order.storeId.toString(),
      },
      body: rawBody,
    });
    const text = await res.text();
    const json = (() => {
      try { return JSON.parse(text) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; }
    })();
    if (!res.ok) {
      const errMsg = typeof json?.error === 'string' ? json.error : (text.slice(0, 200) || res.statusText);
      throw new Error(`mogadelivery ${res.status}: ${errMsg}`);
    }
    // MogaDelivery's order.created webhook returns 200 OK and may not echo a
    // delivery id. Use the orderNumber as our externalId so subsequent status
    // webhooks can look the order up by `order_id`.
    const externalId = String(json.delivery_id || json.id || json.order_id || order.orderNumber);
    return {
      externalId,
      externalStatus: String(json.status || 'pending'),
      trackingUrl: typeof json.tracking_url === 'string' ? json.tracking_url : undefined,
      raw: json,
    };
  }

  /**
   * Parse and verify an inbound delivery-status webhook from MogaDelivery.
   * Accepted signature headers (HMAC-SHA256, hex over raw body):
   *   `X-Boutshop-Signature` (preferred), `X-Moga-Signature`, `X-Signature`.
   * Secret resolution: per-store webhookSecret → BOUTSHOP_WEBHOOK_SECRET env.
   * Expected fields: delivery_id, order_id (or external_order_id), status.
   */
  async parseWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined>,
    store?: IStore
  ): Promise<WebhookResult> {
    const secret =
      store?.integrations?.delivery?.webhookSecret || process.env.BOUTSHOP_WEBHOOK_SECRET;
    const signatureHeader =
      (headers['x-boutshop-signature'] as string) ||
      (headers['x-moga-signature'] as string) ||
      (headers['x-signature'] as string) ||
      '';
    if (secret && signatureHeader) {
      const provided = signatureHeader.replace(/^sha256=/i, '');
      const computed = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      const ok = provided.length === computed.length &&
        crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(computed, 'hex'));
      if (!ok) {
        throw new Error('Invalid mogadelivery webhook signature');
      }
    }

    const externalId = String(payload.delivery_id || payload.id || '');
    const status = String(payload.status || '').toLowerCase();
    const map: Record<string, WebhookResult['status']> = {
      pending: 'pending',
      created: 'pending',
      assigned: 'assigned',
      accepted: 'assigned',
      picked: 'picked_up',
      picked_up: 'picked_up',
      collected: 'picked_up',
      in_transit: 'in_transit',
      ongoing: 'in_transit',
      out_for_delivery: 'in_transit',
      delivered: 'delivered',
      returned: 'returned',
      cancelled: 'cancelled',
      canceled: 'cancelled',
      failed: 'failed',
    };
    const orderIdField = payload.order_id ?? payload.external_order_id ?? payload.id;
    return {
      externalId,
      orderId: typeof orderIdField === 'string' ? orderIdField : undefined,
      status: map[status] || 'pending',
      raw: payload,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────
const mogadelivery = new MogaDeliveryProvider();

const PROVIDERS: Record<DeliveryProvider, DeliveryProviderImpl> = {
  mogadelivery,
  manual: mogadelivery as unknown as DeliveryProviderImpl, // placeholder
  other: mogadelivery as unknown as DeliveryProviderImpl,
};

export function getDeliveryProvider(id?: DeliveryProvider): DeliveryProviderImpl | null {
  if (!id) return null;
  return PROVIDERS[id] || null;
}

/**
 * Map our normalized status to a fulfillmentStatus on the order.
 */
function mapToFulfillment(status: WebhookResult['status']): IOrder['fulfillmentStatus'] {
  switch (status) {
    case 'delivered':
      return 'fulfilled';
    case 'returned':
    case 'cancelled':
    case 'failed':
      return 'cancelled';
    case 'picked_up':
    case 'in_transit':
    case 'assigned':
      return 'partial';
    default:
      return 'unfulfilled';
  }
}

/**
 * Dispatch an order to the configured delivery provider. Idempotent: if the
 * order already has a delivery.externalId, this is a no-op (use redispatch
 * for that).
 */
export async function dispatchOrder(args: {
  order: IOrder;
  store: IStore;
}): Promise<{ ok: boolean; alreadyDispatched?: boolean; result?: DispatchResult; error?: string }> {
  const cfg = args.store.integrations?.delivery;
  if (!cfg?.enabled || !cfg.provider) {
    return { ok: false, error: 'Delivery integration disabled' };
  }
  const provider = getDeliveryProvider(cfg.provider);
  if (!provider || !provider.isConfigured(args.store)) {
    return { ok: false, error: `Provider ${cfg.provider} not configured` };
  }
  // Idempotent
  if (args.order.delivery?.externalId) {
    return { ok: true, alreadyDispatched: true };
  }
  try {
    const result = await provider.dispatch({ order: args.order, store: args.store });
    args.order.delivery = {
      provider: cfg.provider,
      externalId: result.externalId,
      externalStatus: result.externalStatus,
      trackingUrl: result.trackingUrl,
      providerResponse: result.raw,
      dispatchedAt: new Date(),
    };
    args.order.trackingNumber = result.externalId;
    args.order.trackingUrl = result.trackingUrl;
    await args.order.save();
    return { ok: true, result };
  } catch (err) {
    const msg = (err as Error).message || 'Dispatch failed';
    args.order.delivery = {
      ...(args.order.delivery || {}),
      provider: cfg.provider,
      error: msg,
    };
    await args.order.save();
    console.error(`[delivery] dispatch failed for order ${args.order.orderNumber}:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Apply a webhook update to the matching order.
 */
export async function applyDeliveryWebhook(args: {
  payload: Record<string, unknown>;
  headers: Record<string, string | undefined>;
  provider: DeliveryProvider;
}): Promise<{ ok: boolean; orderId?: string; status?: WebhookResult['status']; error?: string }> {
  const impl = getDeliveryProvider(args.provider);
  if (!impl) return { ok: false, error: 'Unknown provider' };

  // First parse without signature check to find the order
  const parsedNoCheck = await impl
    .parseWebhook(args.payload, args.headers)
    .catch(() => null);
  if (!parsedNoCheck) return { ok: false, error: 'Invalid webhook payload' };

  // Find the order by externalId or orderNumber
  let order: IOrder | null = null;
  if (parsedNoCheck.externalId) {
    order = await Order.findOne({ 'delivery.externalId': parsedNoCheck.externalId });
  }
  if (!order && parsedNoCheck.orderId) {
    order = await Order.findOne({ orderNumber: parsedNoCheck.orderId });
  }
  if (!order) return { ok: false, error: 'Order not found for webhook' };

  // Now do a SIGNED parse using the store's secret
  const { Store } = await import('../models/Store.model');
  const store = await Store.findById(order.storeId);
  if (store) {
    try {
      // Verifies signature; throws if invalid (only when secret is configured)
      await impl.parseWebhook(args.payload, args.headers, store);
    } catch (err) {
      console.warn('[delivery webhook] signature check failed:', (err as Error).message);
      return { ok: false, error: (err as Error).message };
    }
  }

  order.delivery = {
    ...(order.delivery || {}),
    externalStatus: parsedNoCheck.status,
    lastWebhook: parsedNoCheck.raw,
    lastSyncedAt: new Date(),
  };
  order.fulfillmentStatus = mapToFulfillment(parsedNoCheck.status);
  // For COD orders, the courier collects the cash on delivery → at that point
  // the order is effectively `paid`. Flip the paymentStatus so analytics and
  // dashboards show the right state.
  if (parsedNoCheck.status === 'delivered' && order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
    order.paymentStatus = 'paid';
  }
  await order.save();

  // Charge the seller's wallet commission once per order (idempotent).
  if (parsedNoCheck.status === 'delivered' && store?.ownerId) {
    try {
      const { chargeCommissionForOrder } = await import('./wallet.service');
      const result = await chargeCommissionForOrder({
        userId: store.ownerId,
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderTotal: order.total,
        orderCurrency: order.currency,
      });
      if (!result.alreadyApplied && result.amount > 0) {
        console.log(`[wallet] commission ${result.amount} ${order.currency} charged for ${order.orderNumber}, balance now ${result.balanceAfter}`);
      }
    } catch (err) {
      // Never block the webhook — wallet errors are non-fatal.
      console.error('[wallet] commission charge failed:', (err as Error).message);
    }
  }

  return { ok: true, orderId: order._id.toString(), status: parsedNoCheck.status };
}
