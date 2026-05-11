/**
 * Google Sheets push — no OAuth, no Google client library.
 *
 * Workflow for the seller:
 *   1. Open Google Sheets, Extensions → Apps Script.
 *   2. Paste the snippet shown in the integrations page.
 *   3. Deploy → New deployment → Type "Web app", access "Anyone".
 *   4. Copy the /macros/s/.../exec URL into BoutShop.
 *
 * BoutShop posts a JSON payload here every time an order is created (COD)
 * or finalized as paid. The Apps Script appends one row per order.
 */
import { Store, type IStore } from '../models/Store.model';
import type { IOrder } from '../models/Order.model';

export type OrderEventType = 'order.created' | 'order.paid' | 'order.shipped' | 'order.cancelled';

interface BuildPayloadInput {
  order: IOrder;
  store: Pick<IStore, '_id' | 'name' | 'slug'> & { _id: unknown };
  event: OrderEventType;
}

function buildPayload({ order, store, event }: BuildPayloadInput): Record<string, unknown> {
  return {
    event,
    timestamp: new Date().toISOString(),
    store: {
      id: String(store._id),
      name: store.name,
      slug: store.slug,
    },
    order: {
      id: String(order._id),
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentMethod: order.paymentMethod,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      customer: {
        name: order.customerName,
        email: order.email,
        phone: order.customerPhone,
      },
      shippingAddress: order.shippingAddress,
      items: order.items.map((it) => ({
        name: it.name,
        sku: it.sku,
        quantity: it.quantity,
        price: it.price,
        productId: String(it.productId),
      })),
      notes: order.notes,
      createdAt: order.createdAt,
    },
  };
}

/**
 * Best-effort push to the seller's Apps Script webhook. Never throws —
 * failures are stored on the store doc so the merchant can see them.
 */
export async function pushOrderToSheets(input: BuildPayloadInput): Promise<{ ok: boolean; error?: string }> {
  const { store } = input;
  // Refresh the store so we have the latest webhook URL + enabled flag.
  const fresh = await Store.findById(store._id).select('integrations.googleSheets').lean();
  const gs = fresh?.integrations?.googleSheets;
  if (!gs?.enabled || !gs.webhookUrl) {
    return { ok: false, error: 'not_enabled' };
  }
  if (!/^https:\/\/script\.google\.com\/.+/.test(gs.webhookUrl) && !/^https?:\/\//.test(gs.webhookUrl)) {
    return { ok: false, error: 'invalid_webhook_url' };
  }

  const payload = buildPayload(input);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(gs.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const error = `HTTP ${res.status}`;
      await Store.updateOne(
        { _id: store._id },
        { $set: { 'integrations.googleSheets.lastError': error } }
      );
      return { ok: false, error };
    }
    await Store.updateOne(
      { _id: store._id },
      {
        $set: {
          'integrations.googleSheets.lastSyncAt': new Date(),
          'integrations.googleSheets.lastError': null,
        },
      }
    );
    return { ok: true };
  } catch (err) {
    const error = (err as Error).message || 'network_error';
    await Store.updateOne(
      { _id: store._id },
      { $set: { 'integrations.googleSheets.lastError': error } }
    );
    return { ok: false, error };
  }
}

/**
 * Send a test ping with a dummy order. Used by the "Test connection" button
 * in the integrations page.
 */
export async function testSheetsWebhook(webhookUrl: string, storeName: string): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (!webhookUrl?.trim()) return { ok: false, error: 'missing_url' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'test',
        timestamp: new Date().toISOString(),
        store: { name: storeName },
        order: {
          orderNumber: 'TEST-0001',
          customer: { name: 'Test Client', email: 'test@example.com', phone: '+33 6 00 00 00 00' },
          total: 99.0,
          currency: 'EUR',
          items: [{ name: 'Produit de test', quantity: 1, price: 99.0 }],
        },
      }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'network_error' };
  }
}
