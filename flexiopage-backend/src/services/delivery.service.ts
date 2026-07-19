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
import * as soap from 'soap';
import mongoose from 'mongoose';
import type { IOrder, ConfirmationStatus } from '../models/Order.model';
import { Order } from '../models/Order.model';
import { Product } from '../models/Product.model';
import type { IStore } from '../models/Store.model';
import { logActivity } from './activity-log.service';
import { logWebhook } from '../models/WebhookLog.model';

export type DeliveryProvider = 'mogadelivery' | 'bestdelivery' | 'manual' | 'other';

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
  /**
   * Statut de confirmation (centre d'appel MogaDelivery) quand il est présent
   * dans le payload. `undefined` = pas de valeur d'appel reconnue → on NE
   * touche PAS le confirmationStatus côté FlexioPage.
   */
  confirmation?: ConfirmationStatus;
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
    // Modèle secret plateforme : la signature dépend du secret env (partagé
    // avec MD), plus d'un secret par-boutique. Une boutique est « configurée »
    // dès que ce secret existe ET qu'elle a une cible MD : un market activé
    // avec un storeIdMD, ou l'intégration delivery activée (routage sur l'ObjectId).
    const hasPlatformSecret = !!(process.env.FLEXIOPAGE_WEBHOOK_SECRET || process.env.BOUTSHOP_WEBHOOK_SECRET);
    if (!hasPlatformSecret) return false;
    const marketReady = (store.markets || []).some(
      (m) => m.delivery?.provider === 'mogadelivery'
        && m.delivery?.enabled !== false
        && m.delivery?.storeIdMD
    );
    if (marketReady) return true;
    return !!store.integrations?.delivery?.enabled;
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
   * Résout (secret, URL, store_id) pour cette commande.
   *
   * Modèle « secret plateforme » (validé MD 2026-06-27, type Shopify) : on
   * signe TOUJOURS avec le secret plateforme unique `FLEXIOPAGE_WEBHOOK_SECRET`
   * (posé en env, partagé avec MD). Le secret est découplé de l'identité
   * boutique → plus de secret par-boutique, donc plus de désync (fini les 401
   * récurrents). Le `store_id` sert UNIQUEMENT au routage côté MD, qui résout
   * sur `(platform, store_id)` : on envoie le `storeIdMD` du marché s'il est
   * posé, sinon l'ObjectId Mongo de la boutique.
   */
  private getConfig(order: IOrder, store: IStore): { secret: string; url: string; storeIdMD: string; source: 'market' | 'legacy' } {
    const secret = process.env.FLEXIOPAGE_WEBHOOK_SECRET || process.env.BOUTSHOP_WEBHOOK_SECRET || '';
    if (!secret) {
      throw new Error(
        'MogaDelivery: secret plateforme manquant — pose `FLEXIOPAGE_WEBHOOK_SECRET` en env ' +
        '(exactement la même valeur que celle transmise à MogaDelivery).'
      );
    }
    const market = this.resolveMarket(order, store);
    const cfg = store.integrations?.delivery;
    const storeIdMD = market?.delivery?.storeIdMD || order.storeId.toString();
    const source: 'market' | 'legacy' = market?.delivery?.storeIdMD ? 'market' : 'legacy';
    const url = (market?.delivery?.baseUrl || cfg?.baseUrl || process.env.MOGADELIVERY_WEBHOOK_URL || this.defaultUrl).replace(/\/$/, '');
    return { secret, url, storeIdMD, source };
  }

  /**
   * Build the order.created payload per MogaDelivery spec.
   * - `id` + `order_id` for anti-doublon
   * - `store_id` at root identifies the seller
   * - `line_items[].sku` is what MogaDelivery uses to match its own products
   */
  /**
   * Public storefront URL for a product, so MogaDelivery's confirmation agents
   * can open the product page. Prefers the product's own `productUrl`; falls
   * back to the canonical storefront route `/store/{storeSlug}/product/{slug}`
   * on the main frontend (works for every store, custom domains included).
   */
  private buildProductUrl(
    store: IStore,
    product?: { slug?: string; productUrl?: string }
  ): string {
    if (product?.productUrl && /^https?:\/\//i.test(product.productUrl)) {
      return product.productUrl;
    }
    if (!store?.slug || !product?.slug) return '';
    const front = (process.env.FRONTEND_URL || 'https://flexiopage.com')
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');
    return `${front}/store/${store.slug}/product/${product.slug}`;
  }

  private buildBody(
    order: IOrder,
    store: IStore,
    storeIdMD: string,
    productUrlById: Map<string, string> = new Map()
  ): Record<string, unknown> {
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
        // Public storefront URL so MD's confirmation agents can view the product.
        product_url: productUrlById.get(it.productId.toString()) || '',
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

    // Resolve a public storefront URL per product so MD's confirmation agents
    // can open the product page. One lookup for all line items.
    const productUrlById = new Map<string, string>();
    try {
      const productIds = (order.items || []).map((it) => it.productId);
      const products = await Product.find({ _id: { $in: productIds } })
        .select('slug productUrl')
        .lean();
      for (const p of products as Array<{ _id: any; slug?: string; productUrl?: string }>) {
        const url2 = this.buildProductUrl(store, p);
        if (url2) productUrlById.set(String(p._id), url2);
      }
    } catch {
      /* non-fatal: dispatch still works without product_url */
    }

    const requestBody = this.buildBody(order, store, storeIdMD, productUrlById);
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

    // Debug optionnel — activé seulement via DEBUG_MOGADELIVERY=true. Ne logge
    // JAMAIS de fragment de secret (le secret plateforme est sensible) ; juste
    // de quoi tracer le routage et le corps signé.
    const debugMD = process.env.DEBUG_MOGADELIVERY === 'true';
    if (debugMD) {
      console.log('[mogadelivery dispatch]', {
        url,
        source,
        storeIdMD,
        marketCountry: order.marketCountry,
        shippingCountry: order.shippingAddress?.country,
        orderNumber: order.orderNumber,
        bodyLen: rawBody.length,
      });
    }

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
    if (debugMD) {
      console.log('[mogadelivery dispatch response]', { status: res.status, body: text.slice(0, 400) });
    }
    const json = (() => {
      try { return JSON.parse(text) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; }
    })();
    if (!res.ok) {
      const errMsg = typeof json?.error === 'string' ? json.error : (text.slice(0, 200) || res.statusText);
      void logWebhook({
        storeId: order.storeId,
        orderId: order._id,
        orderNumber: order.orderNumber,
        direction: 'outbound',
        event: 'order.created',
        status: 'error',
        httpStatus: res.status,
        storeIdSent: storeIdMD,
        secretSource: source,
        error: `${res.status}: ${errMsg}`,
        requestBody: requestBody,
        responseBody: text,
      });
      // Sur 401 on enrichit le message avec le contexte (source du secret, prefix,
      // storeIdMD envoyé) — ça permet de comparer avec ce que MD a en base sans
      // déduire à l'aveugle. Le secret complet n'est jamais exposé.
      if (res.status === 401) {
        throw new Error(
          `mogadelivery 401: ${errMsg} — store_id envoyé "${storeIdMD}", secret source "${source}" ` +
          `(${secret.slice(0, 4)}…${secret.slice(-4)}, len=${secret.length}). ` +
          `Vérifie que ce secret correspond à celui que MogaDelivery a en base pour cette boutique.`
        );
      }
      throw new Error(`mogadelivery ${res.status}: ${errMsg}`);
    }
    // MogaDelivery's order.created webhook returns 200 OK and may not echo a
    // delivery id. Use the orderNumber as our externalId so subsequent status
    // webhooks can look the order up by `order_id`.
    const externalId = String(json.delivery_id || json.id || json.order_id || order.orderNumber);
    void logWebhook({
      storeId: order.storeId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      direction: 'outbound',
      event: 'order.created',
      status: 'success',
      httpStatus: res.status,
      storeIdSent: storeIdMD,
      secretSource: source,
      requestBody: requestBody,
      responseBody: text,
    });
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

    const externalId = String(payload.delivery_id ?? payload.deliveryId ?? payload.id ?? '');

    // MogaDelivery envoie DEUX enums (centre d'appel "OrderStatus" + logistique
    // "ShippingStatus") et, selon la version/config, ils arrivent sous des noms
    // de champ variables (status, order_status, shipping_status, statut…). On lit
    // donc plusieurs clés candidates pour CHAQUE enum plutôt que le seul
    // `payload.status` — sinon tout retombait sur "pending" (d'où « seul Livré
    // remonte »). On accepte aussi les valeurs françaises.
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = (payload as Record<string, unknown>)[k];
        if (typeof v === 'string' && v.trim()) return v.trim().toLowerCase();
        if (typeof v === 'number') return String(v);
      }
      return '';
    };
    const shippingRaw = pick(
      'shipping_status', 'shippingStatus', 'delivery_status', 'deliveryStatus',
      'tracking_status', 'statut_livraison', 'livraison', 'status', 'statut', 'state', 'etat',
    );
    const orderRaw = pick(
      'order_status', 'orderStatus', 'call_status', 'callStatus',
      'confirmation_status', 'confirmationStatus', 'statut_commande', 'statut_confirmation', 'statut_appel',
    );

    // Livraison → pipeline normalisé (EN + FR). Valeur inconnue → 'pending'.
    const deliveryMap: Record<string, WebhookResult['status']> = {
      pending: 'pending', created: 'pending', new: 'pending', nouveau: 'pending', en_attente: 'pending',
      notreachable: 'pending', not_reachable: 'pending', callback: 'pending',
      confirmed: 'assigned', confirme: 'assigned', assigned: 'assigned', accepted: 'assigned',
      prepared: 'assigned', valide: 'assigned',
      picked: 'picked_up', picked_up: 'picked_up', collected: 'picked_up',
      ramasse: 'picked_up', ramassage: 'picked_up', collecte: 'picked_up',
      in_transit: 'in_transit', ongoing: 'in_transit', out_for_delivery: 'in_transit',
      reprogrammed: 'in_transit', en_cours: 'in_transit', encours: 'in_transit',
      en_transit: 'in_transit', en_livraison: 'in_transit',
      delivered: 'delivered', livre: 'delivered', 'livré': 'delivered', livree: 'delivered', 'livrée': 'delivered',
      returned: 'returned', retour: 'returned', retourne: 'returned', 'retourné': 'returned', 'retournée': 'returned',
      cancelled: 'cancelled', canceled: 'cancelled', annule: 'cancelled', 'annulé': 'cancelled', annulee: 'cancelled', 'annulée': 'cancelled',
      failed: 'failed', echec: 'failed', 'échec': 'failed', echoue: 'failed',
    };

    // Centre d'appel → confirmationStatus. On ne mappe PAS 'cancelled' ici pour
    // ne pas transformer une annulation logistique en « refusé » de confirmation.
    const confirmMap: Record<string, ConfirmationStatus> = {
      pending: 'pending', created: 'pending', new: 'pending', nouveau: 'pending', en_attente: 'pending',
      confirmed: 'confirmed', confirme: 'confirmed', 'confirmé': 'confirmed', valid: 'confirmed', valide: 'confirmed', 'validé': 'confirmed', validated: 'confirmed', ok: 'confirmed',
      no_answer: 'no_answer', noanswer: 'no_answer', notreachable: 'no_answer', not_reachable: 'no_answer', unreachable: 'no_answer', injoignable: 'no_answer', pas_de_reponse: 'no_answer', sans_reponse: 'no_answer',
      callback: 'callback', call_back: 'callback', rappel: 'callback', a_rappeler: 'callback', reprogramme: 'callback', 'reprogrammé': 'callback', reprogrammed: 'callback', reporte: 'callback', 'reporté': 'callback',
      declined: 'declined', refused: 'declined', refuse: 'declined', 'refusé': 'declined', rejected: 'declined', rejete: 'declined', 'rejeté': 'declined',
    };

    const deliveryStatus = deliveryMap[shippingRaw || orderRaw] || 'pending';
    // Confirmation : depuis le champ centre d'appel ; sinon depuis un champ unique
    // SEULEMENT si sa valeur est explicitement une valeur d'appel (jamais un
    // statut purement logistique comme delivered/cancelled).
    const confirmSrc = orderRaw || (confirmMap[shippingRaw] ? shippingRaw : '');
    const confirmation = confirmMap[confirmSrc];

    const orderIdField =
      payload.order_id ?? payload.external_order_id ?? payload.orderId ?? payload.reference ?? payload.id;
    return {
      externalId,
      orderId: orderIdField != null ? String(orderIdField) : undefined,
      status: deliveryStatus,
      confirmation: confirmation || undefined,
      raw: payload,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Best Delivery (Tunisie) — SOAP, api.best-delivery.net/serviceShipments.php
// ─────────────────────────────────────────────────────────────────────
//
// Différences majeures avec MogaDelivery :
//   - Protocole SOAP (Document/Literal), pas REST/JSON.
//   - Auth Basic : login + pwd du compte expéditeur, dans chaque requête.
//   - AUCUN webhook : la sync de statut se fait en POLLING (TrackShipmentStatus),
//     branché en phase 2. Ici on ne gère que le dispatch (CreatePickup).
//   - Zone Tunisie : le champ `gouvernerat` est requis.
//
// ⚠️ Le wrapping exact de l'argument SOAP `pickup` et les noms de champs sont à
// confirmer contre le sandbox Best Delivery (pas de creds de test au moment du
// code). Le mapping ci-dessous suit le WSDL serviceShipments.
class BestDeliveryProvider implements DeliveryProviderImpl {
  id: DeliveryProvider = 'bestdelivery';
  private defaultWsdl = 'https://api.best-delivery.net/serviceShipments.php?wsdl';

  isConfigured(store: IStore): boolean {
    const cfg = store.integrations?.delivery;
    return !!(cfg?.enabled && cfg.provider === 'bestdelivery' && cfg.login && cfg.pwd);
  }

  async dispatch({ order, store }: { order: IOrder; store: IStore }): Promise<DispatchResult> {
    const cfg = store.integrations?.delivery;
    const login = cfg?.login || '';
    const pwd = cfg?.pwd || '';
    if (!login || !pwd) {
      throw new Error('Best Delivery : login/pwd du compte expéditeur manquants (Réglages → Livraison).');
    }
    const addr = order.shippingAddress || {};
    const gouvernerat = addr.state || addr.city || '';
    if (!gouvernerat) {
      throw new Error('Best Delivery : governorat (shippingAddress.state) requis pour créer le colis.');
    }

    // Champs CreatePickup (cf. WSDL `pickup`). On n'envoie que ce qui est
    // pertinent pour une création depuis FlexioPage ; le reste est géré par BD.
    const pickup = {
      login,
      pwd,
      nom: order.customerName || order.email,
      gouvernerat,
      ville: addr.city || gouvernerat,
      adresse: [addr.line1, addr.line2].filter(Boolean).join(', ') || '-',
      tel: order.customerPhone || '',
      tel2: '',
      designation: order.items.map((i) => i.name).join(', ').slice(0, 250) || 'Commande',
      nb_article: order.items.reduce((s, i) => s + (i.quantity || 0), 0) || 1,
      prix: order.total,
      echange: 0,
      msg: order.notes || '',
    };

    const wsdl = cfg?.baseUrl || this.defaultWsdl;
    const client = await soap.createClientAsync(wsdl);
    // L'opération est générée dynamiquement depuis le WSDL — non typée.
    const [result] = await (client as unknown as {
      CreatePickupAsync: (args: Record<string, unknown>) => Promise<[Record<string, unknown>]>;
    }).CreatePickupAsync({ pickup });

    const hasErrors = Number(result?.HasErrors) === 1 || result?.HasErrors === true;
    if (hasErrors) {
      throw new Error(`bestdelivery: ${result?.ErrorsTxt || 'CreatePickup a échoué'}`);
    }
    const externalId = String(result?.CodeBarre || '');
    if (!externalId) {
      throw new Error(`bestdelivery: réponse sans CodeBarre (${JSON.stringify(result).slice(0, 200)})`);
    }
    return {
      externalId,
      externalStatus: 'pending',
      trackingUrl: typeof result?.Url === 'string' ? result.Url : undefined,
      raw: result,
    };
  }

  async parseWebhook(): Promise<WebhookResult> {
    // Best Delivery n'expose pas de webhook entrant — la synchro de statut se
    // fait par polling (TrackShipmentStatus), prévu en phase 2.
    throw new Error('Best Delivery : pas de webhook entrant (modèle pull/polling).');
  }
}

// ─────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────
const mogadelivery = new MogaDeliveryProvider();
const bestdelivery = new BestDeliveryProvider();

// New providers (Yalidine, Noest, Aramex) currently route through the same
// generic handler — replace each with a real implementation later.
const PROVIDERS: Record<DeliveryProvider, DeliveryProviderImpl> = {
  mogadelivery,
  bestdelivery,
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
    // Détection "pluie d'échecs" : si > seuil orders ont fait échouer leur
    // dispatch sur la dernière heure pour ce store, on ping le vendeur.
    // Best-effort — jamais bloquant même si la détection foire.
    void maybeAlertDispatchStorm(args.order.storeId, providerId).catch((e) => {
      console.error('[delivery] storm detection failed:', (e as Error).message);
    });
    return { ok: false, error: msg };
  }
}

/**
 * Seuil et fenêtre pour la détection de « pluie d'échecs dispatch » +
 * throttle in-memory pour éviter de spammer le vendeur (max 1 notif/heure
 * par store). Suffisant pour une instance mono-noeud ; en cluster il
 * faudrait un flag Redis mais on garde simple pour l'instant.
 */
const DISPATCH_STORM_THRESHOLD = 5;
const DISPATCH_STORM_WINDOW_MS = 60 * 60 * 1000;
const dispatchStormNotifiedAt: Map<string, number> = new Map();

async function maybeAlertDispatchStorm(
  storeId: mongoose.Types.ObjectId | string,
  provider: string,
): Promise<void> {
  const storeIdStr = String(storeId);
  const now = Date.now();
  const lastAt = dispatchStormNotifiedAt.get(storeIdStr) || 0;
  if (now - lastAt < DISPATCH_STORM_WINDOW_MS) return; // déjà notifié dans l'heure

  const since = new Date(now - DISPATCH_STORM_WINDOW_MS);
  // Compte + top erreurs par message. On regarde uniquement les orders
  // avec un error posé, updatedAt récent — pas d'externalId (sinon le
  // dispatch a fini par passer et l'erreur n'est plus pertinente).
  const rows = await Order.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        storeId: new mongoose.Types.ObjectId(storeIdStr),
        'delivery.provider': provider,
        'delivery.error': { $exists: true, $ne: null },
        'delivery.externalId': { $in: [null, undefined] },
        updatedAt: { $gte: since },
      },
    },
    { $group: { _id: '$delivery.error', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
  if (totalCount < DISPATCH_STORM_THRESHOLD) return;

  // Marque le store comme notifié avant l'appel notification pour éviter
  // une double notif en concurrence si 2 dispatch failed en même temps.
  dispatchStormNotifiedAt.set(storeIdStr, now);

  const { notifyDispatchStorm } = await import('./notification.service');
  const store = await (await import('../models/Store.model')).Store.findById(storeIdStr).select('ownerId').lean();
  if (!store?.ownerId) return;
  await notifyDispatchStorm({
    userId: store.ownerId,
    storeId: storeIdStr,
    count: totalCount,
    topErrors: rows.map((r) => ({ error: r._id, count: r.count })),
    provider,
  });
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

  // Premier parse : sert à retrouver la commande. Note : parseWebhook applique
  // DÉJÀ la signature quand un secret plateforme (env) est posé — donc une
  // mauvaise signature échoue ici. On journalise ce rejet en `inbound/error`
  // au lieu de le laisser disparaître silencieusement : sans ça, un webhook MD
  // à signature invalide n'apparaît nulle part et on croit à tort que « MD
  // n'a rien envoyé ». On remonte aussi le vrai motif (signature vs payload).
  let parsedNoCheck: WebhookResult | null = null;
  try {
    parsedNoCheck = await impl.parseWebhook(args.payload, args.headers);
  } catch (err) {
    const message = (err as Error).message || 'Invalid webhook payload';
    const isSignature = /signature/i.test(message);
    const p = args.payload as Record<string, unknown>;
    void logWebhook({
      orderNumber: typeof p.order_id === 'string' ? p.order_id : undefined,
      direction: 'inbound',
      event: typeof p.status === 'string' ? p.status : 'unknown',
      status: 'error',
      signatureValid: isSignature ? false : undefined,
      error: message,
      responseBody: args.payload,
    });
    return { ok: false, error: message };
  }
  if (!parsedNoCheck) return { ok: false, error: 'Invalid webhook payload' };

  // Find the order by externalId or orderNumber
  let order: IOrder | null = null;
  if (parsedNoCheck.externalId) {
    order = await Order.findOne({ 'delivery.externalId': parsedNoCheck.externalId });
  }
  if (!order && parsedNoCheck.orderId) {
    order = await Order.findOne({ orderNumber: parsedNoCheck.orderId });
  }
  if (!order) {
    void logWebhook({
      orderNumber: parsedNoCheck.orderId,
      direction: 'inbound',
      event: parsedNoCheck.status,
      status: 'error',
      error: 'Order not found for webhook',
      responseBody: args.payload,
    });
    return { ok: false, error: 'Order not found for webhook' };
  }

  // Now do a SIGNED parse using the store's secret
  const { Store } = await import('../models/Store.model');
  const store = await Store.findById(order.storeId);
  if (store) {
    try {
      // Verifies signature; throws if invalid (only when secret is configured)
      await impl.parseWebhook(args.payload, args.headers, store);
    } catch (err) {
      console.warn('[delivery webhook] signature check failed:', (err as Error).message);
      void logWebhook({
        storeId: order.storeId,
        orderId: order._id,
        orderNumber: order.orderNumber,
        direction: 'inbound',
        event: parsedNoCheck.status,
        status: 'error',
        signatureValid: false,
        error: (err as Error).message,
        responseBody: args.payload,
      });
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

  // ── Synchro du statut de confirmation (centre d'appel MogaDelivery) ──────
  // On ne l'applique QUE si MD a renvoyé une valeur d'appel reconnue, pour ne
  // jamais écraser une confirmation posée à la main par l'agent avec un simple
  // événement logistique. Pas d'auto-annulation/restock ici (géré par le
  // fulfillmentStatus + l'endpoint manuel) — on synchronise le libellé.
  const previousConfirmation = order.confirmationStatus;
  const confirmationChanged =
    !!parsedNoCheck.confirmation && parsedNoCheck.confirmation !== previousConfirmation;
  if (confirmationChanged) {
    order.confirmationStatus = parsedNoCheck.confirmation;
    order.confirmedAt = new Date();
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      at: new Date(),
      confirmationStatus: parsedNoCheck.confirmation,
      note: "Synchro MogaDelivery (centre d'appel)",
    });
  }

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

  // Notification dédiée quand le statut de confirmation change côté MD.
  if (store?.ownerId && confirmationChanged && parsedNoCheck.confirmation) {
    const CONF_LABEL: Record<ConfirmationStatus, string> = {
      pending: 'à confirmer',
      confirmed: 'confirmée',
      no_answer: 'sans réponse',
      callback: 'à rappeler',
      declined: 'refusée',
    };
    try {
      const { createNotification } = await import('./notification.service');
      await createNotification({
        userId: store.ownerId,
        storeId: order.storeId,
        type: 'order.status_changed',
        title: `Commande ${order.orderNumber} — appel : ${CONF_LABEL[parsedNoCheck.confirmation]}`,
        body: 'Statut de confirmation mis à jour par MogaDelivery (centre d\'appel).',
        link: `/dashboard/orders?storeId=${order.storeId}`,
        meta: { orderId: order._id.toString(), confirmationStatus: parsedNoCheck.confirmation },
      });
    } catch (err) {
      console.error('[delivery webhook] confirmation notif failed (non-fatal):', (err as Error).message);
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

  void logWebhook({
    storeId: order.storeId,
    orderId: order._id,
    orderNumber: order.orderNumber,
    direction: 'inbound',
    event: parsedNoCheck.status,
    status: 'success',
    signatureValid: store ? true : undefined,
    responseBody: parsedNoCheck.raw,
  });
  return { ok: true, orderId: order._id.toString(), status: parsedNoCheck.status };
}
