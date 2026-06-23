/**
 * Delivery integration — pushes physical orders to MogaDelivery's
 * `order.created` webhook. Auth is HMAC-SHA256 over the raw JSON body, hex
 * encoded, sent in `X-Flexiopage-Signature`. The shared secret comes from
 * `FLEXIOPAGE_WEBHOOK_SECRET` (or per-store override). The legacy
 * `BOUTSHOP_WEBHOOK_SECRET` env var is still honored for in-flight
 * integrations and inbound `X-Boutshop-Signature` headers are still
 * accepted on the verify path.
 *
 * The MogaDelivery endpoint is `https://api.admin-mogadelivery.com/api/webhooks/flexiopage`
 * (prod, since 2026-05-17, finalised path after MD migration). Override per-store
 * via `integrations.delivery.baseUrl` or `MOGADELIVERY_WEBHOOK_URL` env.
 */
import crypto from 'crypto';
import type { IOrder } from '../models/Order.model';
import { Order } from '../models/Order.model';
import type { IStore } from '../models/Store.model';
import { logActivity } from './activity-log.service';

export type DeliveryProvider = 'mogadelivery' | 'yalidine' | 'noest' | 'aramex' | 'manual' | 'other';

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
// MogaDelivery (api.admin-mogadelivery.com/api/webhooks/flexiopage)
// ─────────────────────────────────────────────────────────────────────
class MogaDeliveryProvider implements DeliveryProviderImpl {
  id: DeliveryProvider = 'mogadelivery';
  private defaultUrl = 'https://api.admin-mogadelivery.com/api/webhooks/flexiopage';

  isConfigured(store: IStore): boolean {
    // Multi-pays : au moins un market MD activé avec storeIdMD + secret.
    const marketReady = (store.markets || []).some(
      (m) => m.delivery?.provider === 'mogadelivery'
        && m.delivery?.enabled !== false
        && m.delivery?.webhookSecret
        && m.delivery?.storeIdMD
    );
    if (marketReady) return true;
    // Legacy mono-pays : on exige un webhookSecret posé au niveau de la store.
    // L'env global n'est plus considéré comme une config valide.
    const cfg = store.integrations?.delivery;
    return !!(cfg?.enabled && cfg.webhookSecret);
  }

  /**
   * Trouve le market MD à utiliser pour cette commande. On essaye dans l'ordre :
   *   1. `order.marketCountry` (snapshot figé au checkout)
   *   2. `shippingAddress.country`
   *   3. le market `isDefault`
   *   4. le 1er market MD activé
   * Renvoie `null` si aucun market n'est défini ou aucun ne porte un secret MD.
   */
  private resolveMarket(order: IOrder, store: IStore): NonNullable<IStore['markets']>[number] | null {
    const markets = (store.markets || []).filter((m) => m.delivery?.provider === 'mogadelivery' && m.delivery?.enabled !== false);
    if (!markets.length) return null;
    const wanted = (order.marketCountry || order.shippingAddress?.country || '').toUpperCase();
    if (wanted) {
      const hit = markets.find((m) => m.country?.toUpperCase() === wanted);
      if (hit) return hit;
    }
    const def = markets.find((m) => m.isDefault) || markets[0];
    return def || null;
  }

  /**
   * Résout (secret, URL, storeIdMD) pour cette commande. Priorité au market
   * MD lorsqu'il est posé (modèle multi-pays MD), fallback sur l'intégration
   * legacy mono-pays + env.
   */
  private getConfig(order: IOrder, store: IStore): { secret: string; url: string; storeIdMD: string; source: 'market' | 'legacy' } {
    const market = this.resolveMarket(order, store);
    if (market) {
      // Modèle multi-pays : on EXIGE storeIdMD + webhookSecret du marché.
      // Pas de fallback env ici — sinon MD rejette en 401 silencieusement et
      // c'est imbittable à debug. Mieux vaut un message explicite côté seller.
      if (!market.delivery?.storeIdMD || !market.delivery?.webhookSecret) {
        throw new Error(
          `MogaDelivery: marché ${market.country} mal configuré — storeIdMD et webhookSecret requis. ` +
          `Va dans Réglages → Livraison de la boutique et complète les deux champs (ou refais l'onboarding MD).`
        );
      }
      const url = (market.delivery.baseUrl || process.env.MOGADELIVERY_WEBHOOK_URL || this.defaultUrl).replace(/\/$/, '');
      return {
        secret: market.delivery.webhookSecret,
        url,
        storeIdMD: market.delivery.storeIdMD,
        source: 'market',
      };
    }
    // Pas de markets[] configurés : modèle legacy mono-pays. On EXIGE le secret
    // posé au niveau de la store (integrations.delivery.webhookSecret). L'env
    // n'est plus utilisée comme fallback silencieux — MD signe désormais par
    // store côté eux, donc utiliser un secret global mène à un 401 garanti.
    const cfg = store.integrations?.delivery;
    if (!cfg?.webhookSecret) {
      throw new Error(
        `MogaDelivery: secret HMAC manquant pour cette boutique. ` +
        `Va dans Réglages → Livraison et colle le secret fourni par MogaDelivery dans "Secret webhook". ` +
        `Le secret global FLEXIOPAGE_WEBHOOK_SECRET n'est plus utilisé — MD attend un secret par boutique.`
      );
    }
    const url = (cfg.baseUrl || process.env.MOGADELIVERY_WEBHOOK_URL || this.defaultUrl).replace(/\/$/, '');
    // Legacy mono-pays : on garde l'ObjectId Mongo comme identifiant côté MD
    // (compat ascendante — MD V1 inbound continue de matcher dessus pour les
    // boutiques pré-migration multi-pays).
    return { secret: cfg.webhookSecret, url, storeIdMD: order.storeId.toString(), source: 'legacy' };
  }

  /**
   * Build the order.created payload per MogaDelivery spec.
   * - `id` + `order_id` for anti-doublon
   * - `store_id` at root identifies the seller
   * - `line_items[].sku` is what MogaDelivery uses to match its own products
   */
  private buildBody(order: IOrder, store: IStore, storeIdMD: string): Record<string, unknown> {
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
      // Modèle MD multi-pays : c'est le storeIdMD du marché qui identifie la
      // Boutique côté MD, pas notre ObjectId Mongo (fallback en legacy).
      store_id: storeIdMD,
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

  /**
   * Dérive la clé HMAC depuis le secret partagé. Convention standard :
   * si le secret est un blob hex (64 chars [0-9a-f]), on le décode en
   * Buffer (32 bytes binaires) — c'est ce que MogaDelivery valide en
   * premier dans leur middleware HMAC. Sinon on garde la string telle
   * quelle (Node encode en UTF-8). Évite les mismatches subtils où une
   * partie utilise « 9b0b… » comme 64 bytes ASCII et l'autre comme
   * 32 bytes binaires : deux HMAC totalement différents pour le même body.
   */
  private hmacKey(secret: string): string | Buffer {
    return /^[a-f0-9]{64}$/i.test(secret) ? Buffer.from(secret, 'hex') : secret;
  }

  async dispatch({ order, store }: { order: IOrder; store: IStore }): Promise<DispatchResult> {
    const { secret, url, storeIdMD, source } = this.getConfig(order, store);
    const requestBody = this.buildBody(order, store, storeIdMD);
    const rawBody = JSON.stringify(requestBody);
    const signature = crypto.createHmac('sha256', this.hmacKey(secret)).update(rawBody).digest('hex');
    // Garde-trace : on stocke le payload exact qu'on transmet AVANT l'appel.
    // En cas de mismatch côté provider (nom de produit, SKU, etc.), on peut
    // prouver ce qu'on a envoyé. Sauvegarde silencieuse — un échec d'écriture
    // ici ne doit pas bloquer le dispatch.
    order.delivery = {
      ...(order.delivery || {}),
      provider: 'mogadelivery',
      providerRequest: requestBody as unknown as Record<string, unknown>,
    };
    try { await order.save(); } catch { /* silencieux — info debug uniquement */ }

    // TEMP DEBUG — remove after MogaDelivery 401 is resolved
    console.log('[mogadelivery dispatch DEBUG]', {
      url,
      source,
      storeIdMD,
      marketCountry: order.marketCountry,
      shippingCountry: order.shippingAddress?.country,
      mongoStoreId: order.storeId.toString(),
      orderNumber: order.orderNumber,
      secretFirst4: secret.slice(0, 4),
      secretLast4: secret.slice(-4),
      secretLen: secret.length,
      signature,
      bodyLen: rawBody.length,
      bodyPreview: rawBody.slice(0, 300),
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Flexiopage-Signature': signature,
        'X-Flexiopage-Store-Id': storeIdMD,
      },
      body: rawBody,
    });
    const text = await res.text();
    console.log('[mogadelivery dispatch DEBUG response]', { status: res.status, body: text.slice(0, 400) });
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
   *   `X-Flexiopage-Signature` (preferred), `X-Boutshop-Signature` (legacy),
   *   `X-Moga-Signature`, `X-Signature`.
   * Secret resolution: per-store webhookSecret → FLEXIOPAGE_WEBHOOK_SECRET
   *   env → BOUTSHOP_WEBHOOK_SECRET (legacy fallback).
   * Expected fields: delivery_id, order_id (or external_order_id), status.
   */
  async parseWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined>,
    store?: IStore
  ): Promise<WebhookResult> {
    // Multi-pays : on accepte la signature si elle matche le secret de
    // n'importe quel marché MD activé OU le secret legacy/env. Le bon
    // secret est celui qui correspond au pays de la commande côté MD,
    // mais MD n'envoie pas toujours le pays dans l'inbound — on essaye tout.
    const candidateSecrets: string[] = [];
    if (store?.markets?.length) {
      for (const m of store.markets) {
        if (m.delivery?.provider === 'mogadelivery' && m.delivery?.webhookSecret) {
          candidateSecrets.push(m.delivery.webhookSecret);
        }
      }
    }
    if (store?.integrations?.delivery?.webhookSecret) candidateSecrets.push(store.integrations.delivery.webhookSecret);
    if (process.env.FLEXIOPAGE_WEBHOOK_SECRET) candidateSecrets.push(process.env.FLEXIOPAGE_WEBHOOK_SECRET);
    if (process.env.BOUTSHOP_WEBHOOK_SECRET) candidateSecrets.push(process.env.BOUTSHOP_WEBHOOK_SECRET);
    const signatureHeader =
      (headers['x-flexiopage-signature'] as string) ||
      (headers['x-boutshop-signature'] as string) ||
      (headers['x-moga-signature'] as string) ||
      (headers['x-signature'] as string) ||
      '';
    if (candidateSecrets.length && signatureHeader) {
      const provided = signatureHeader.replace(/^sha256=/i, '');
      const rawForHash = JSON.stringify(payload);
      // Tolérant aux deux conventions HMAC (cf. hmacKey côté dispatch) :
      // standard hex-decoded EN PREMIER, puis fallback ASCII si le premier
      // ne matche pas. Symétrique au fix MogaDelivery — accepte les senders
      // legacy le temps qu'ils migrent, sans rejeter les bons.
      const candidates: Array<string | Buffer> = [];
      for (const s of candidateSecrets) {
        if (/^[a-f0-9]{64}$/i.test(s)) candidates.push(Buffer.from(s, 'hex'));
        candidates.push(s);
      }
      const matched = candidates.some((key) => {
        const computed = crypto.createHmac('sha256', key).update(rawForHash).digest('hex');
        return provided.length === computed.length
          && crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(computed, 'hex'));
      });
      if (!matched) {
        throw new Error('Invalid mogadelivery webhook signature');
      }
    }

    const externalId = String(payload.delivery_id || payload.id || '');
    const status = String(payload.status || '').toLowerCase();
    // MogaDelivery has two consecutive enums: OrderStatus (call-center phase,
    // before shipping) and ShippingStatus (logistics phase). We collapse them
    // both into our linear pipeline. See integration spec doc.
    const map: Record<string, WebhookResult['status']> = {
      // OrderStatus (pre-shipping)
      pending: 'pending',
      created: 'pending',
      notreachable: 'pending',     // buyer unreachable — still actionable, not terminal
      not_reachable: 'pending',
      callback: 'pending',          // agent will retry — keep pending
      confirmed: 'assigned',        // order validated, ready for fulfillment

      // ShippingStatus (post-shipping)
      assigned: 'assigned',
      accepted: 'assigned',
      prepared: 'assigned',         // packed, awaiting courier pickup
      picked: 'picked_up',
      picked_up: 'picked_up',
      collected: 'picked_up',
      in_transit: 'in_transit',
      ongoing: 'in_transit',
      out_for_delivery: 'in_transit',
      reprogrammed: 'in_transit',   // delivery rescheduled — still en route
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

// New providers (Yalidine, Noest, Aramex) currently route through the same
// generic handler — replace each with a real implementation later.
const PROVIDERS: Record<DeliveryProvider, DeliveryProviderImpl> = {
  yalidine: mogadelivery as unknown as DeliveryProviderImpl,
  noest: mogadelivery as unknown as DeliveryProviderImpl,
  aramex: mogadelivery as unknown as DeliveryProviderImpl,
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
  // Primary path: explicit last-mile carrier under `integrations.delivery`.
  // Fallback: seller picked MogaDelivery as their 3PL fulfillment provider
  // under `integrations.logistics` instead — same outbound endpoint, same
  // SKU-matching contract, so we route through the MogaDelivery dispatcher
  // by synthesising an effective delivery config from the logistics block.
  const directCfg = args.store.integrations?.delivery;
  const logCfg = args.store.integrations?.logistics;
  let providerId: DeliveryProvider;
  if (directCfg?.enabled && directCfg.provider) {
    providerId = directCfg.provider;
  } else if (logCfg?.enabled && logCfg.provider === 'mogadelivery' && (logCfg.autoForward ?? true)) {
    providerId = 'mogadelivery';
    // Mutate the store object in memory so isConfigured() sees the synth
    // config without persisting it. The actual provider impl reads from
    // store.integrations.delivery.
    args.store.integrations = {
      ...args.store.integrations,
      delivery: {
        provider: 'mogadelivery',
        enabled: true,
        apiKey: logCfg.apiKey,
        baseUrl: logCfg.baseUrl,
        webhookSecret: logCfg.webhookSecret,
        autoDispatch: logCfg.autoForward ?? true,
      },
    };
  } else {
    return { ok: false, error: 'Delivery integration disabled' };
  }
  const provider = getDeliveryProvider(providerId);
  if (!provider || !provider.isConfigured(args.store)) {
    return { ok: false, error: `Provider ${providerId} not configured` };
  }
  // Idempotent
  if (args.order.delivery?.externalId) {
    return { ok: true, alreadyDispatched: true };
  }
  try {
    const result = await provider.dispatch({ order: args.order, store: args.store });
    args.order.delivery = {
      provider: providerId,
      externalId: result.externalId,
      externalStatus: result.externalStatus,
      trackingUrl: result.trackingUrl,
      providerResponse: result.raw,
      dispatchedAt: new Date(),
    };
    args.order.trackingNumber = result.externalId;
    args.order.trackingUrl = result.trackingUrl;
    await args.order.save();
    void logActivity({
      type: 'delivery.dispatched',
      message: `${args.order.orderNumber} envoyé à ${providerId} (${result.externalId})`,
      storeId: args.order.storeId,
      orderId: args.order._id,
      metadata: {
        provider: providerId,
        externalId: result.externalId,
        // Snapshot des items pour repérer un mismatch d'un coup d'œil dans
        // l'historique admin (sans avoir à dépiler le payload complet).
        itemsSent: args.order.items.map((it) => ({ name: it.name, sku: it.sku, quantity: it.quantity })),
        requestBody: args.order.delivery?.providerRequest,
        responseBody: result.raw,
      },
    });
    return { ok: true, result };
  } catch (err) {
    const msg = (err as Error).message || 'Dispatch failed';
    args.order.delivery = {
      ...(args.order.delivery || {}),
      provider: providerId,
      error: msg,
    };
    await args.order.save();
    console.error(`[delivery] dispatch failed for order ${args.order.orderNumber}:`, msg);
    void logActivity({
      type: 'delivery.dispatch_failed',
      message: `Échec dispatch ${args.order.orderNumber} vers ${providerId} : ${msg}`,
      storeId: args.order.storeId,
      orderId: args.order._id,
      metadata: {
        provider: providerId,
        error: msg,
        itemsSent: args.order.items.map((it) => ({ name: it.name, sku: it.sku, quantity: it.quantity })),
        requestBody: args.order.delivery?.providerRequest,
      },
    });
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

  const previousStatus = order.delivery?.externalStatus;
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

  // In-app notification on each status transition (only when it actually
  // changed, so we don't spam the bell for duplicate webhook deliveries).
  if (store?.ownerId && previousStatus !== parsedNoCheck.status) {
    try {
      const { notifyOrderStatusChanged } = await import('./notification.service');
      await notifyOrderStatusChanged({
        userId: store.ownerId,
        storeId: order.storeId,
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        status: parsedNoCheck.status,
      });
    } catch (err) {
      console.error('[delivery webhook] notification failed (non-fatal):', (err as Error).message);
    }
  }

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
        storeId: store._id,
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
