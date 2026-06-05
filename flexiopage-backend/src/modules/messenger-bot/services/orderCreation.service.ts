/**
 * Pont entre le tool `create_order` de Claude et la création de commande
 * Flexiopage. Réutilise `orderService.createOrder` existant (aucune
 * duplication). Calcule les frais de livraison depuis la config du bot.
 */
import { logger } from '../../../lib/logger';
import * as orderService from '../../../services/order.service';
import { notifyOrderCreated } from '../../../services/notification.service';
import { Store } from '../../../models/Store.model';
import { BotConfig, type IBotConfig } from '../models/BotConfig.model';
import { BotUsage } from '../models/BotUsage.model';
import type { IConversation } from '../models/Conversation.model';
import { catalogService } from './catalog.service';
import type { CatalogProduct } from '../prompts/promptBuilders';

export interface CreateOrderToolItem {
  product_name: string;
  product_id?: string;
  quantity: number;
}

export interface CreateOrderToolInput {
  /** Tableau de produits commandés — préféré dès qu'il y a >= 2 produits. */
  items?: CreateOrderToolItem[];
  /** Legacy single-product fields, gardés pour la rétro-compat. */
  product_name?: string;
  product_id?: string;
  quantity?: number;
  customer_name: string;
  customer_phone: string;
  customer_city: string;
  customer_address: string;
  notes?: string;
}

export interface CreateOrderOutcome {
  ok: boolean;
  error?: string;
  orderId?: string;
  orderNumber?: string;
  total?: number;
  currency?: string;
  shippingFee?: number;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export class OrderCreationService {
  /** Frais de livraison pour une ville (match exact insensible à la casse, sinon défaut). */
  shippingFeeFor(config: IBotConfig, city: string): number {
    const q = (city || '').trim().toLowerCase();
    const hit = (config.shipping_fees || []).find((s) => s.city.trim().toLowerCase() === q);
    return hit ? hit.fee : config.default_shipping_fee ?? 30;
  }

  async createFromBot(args: {
    config: IBotConfig;
    conversation: IConversation;
    catalog: CatalogProduct[];
    input: CreateOrderToolInput;
  }): Promise<CreateOrderOutcome> {
    const { config, conversation, catalog, input } = args;

    // Normalise l'input vers un tableau d'items, qu'on parte de `items[]`
    // (nouveau format multi-produits) ou des champs legacy (product_name +
    // quantity).
    const rawItems: CreateOrderToolItem[] =
      Array.isArray(input.items) && input.items.length > 0
        ? input.items
        : input.product_name
          ? [{ product_name: input.product_name, product_id: input.product_id, quantity: input.quantity || 1 }]
          : [];

    if (rawItems.length === 0) {
      return { ok: false, error: 'Aucun produit fourni. Renseigne items[] ou product_name + quantity.' };
    }

    // Résout chaque item du catalogue + vérifie le stock. On accumule toutes
    // les erreurs au lieu d'échouer sur la première — message plus clair pour
    // le bot qui peut redemander précisément ce qui cloche.
    const resolved: Array<{ product: CatalogProduct; quantity: number }> = [];
    const errors: string[] = [];
    for (const it of rawItems) {
      const found = catalogService.findProduct(catalog, { id: it.product_id, name: it.product_name });
      if (!found) {
        errors.push(`Produit "${it.product_name}" introuvable dans le catalogue.`);
        continue;
      }
      const qty = Math.max(1, Math.min(Number(it.quantity) || 1, 99));
      if (typeof found.stock === 'number' && found.stock < qty) {
        errors.push(`"${found.name}" : stock insuffisant (${found.stock} dispo, ${qty} demandés).`);
        continue;
      }
      resolved.push({ product: found, quantity: qty });
    }
    if (errors.length && !resolved.length) {
      return { ok: false, error: errors.join(' ') };
    }
    if (errors.length) {
      // Au moins un produit OK + au moins un en erreur → on signale l'erreur
      // pour que Claude redemande, plutôt que de créer une commande partielle.
      return { ok: false, error: errors.join(' ') };
    }

    const store = await Store.findById(config.vendor_id).select('settings.currency').lean();
    const currency = store?.settings?.currency || 'MAD';
    const subtotal = resolved.reduce((sum, r) => sum + r.product.price * r.quantity, 0);
    const shippingFee = this.shippingFeeFor(config, input.customer_city);

    let order;
    try {
      order = await orderService.createOrder({
        storeId: String(config.vendor_id),
        email: `cod-${input.customer_phone.replace(/\D/g, '')}@flexiopage.local`,
        customerName: input.customer_name.trim(),
        customerPhone: input.customer_phone.trim(),
        shippingAddress: {
          line1: input.customer_address.trim(),
          city: input.customer_city.trim(),
          country: config.country,
        },
        items: resolved.map((r) => ({
          productId: r.product.id || String(config.vendor_id),
          name: r.product.name,
          quantity: r.quantity,
          price: r.product.price,
        })),
        subtotal,
        shippingCost: shippingFee,
        currency,
        paymentMethod: 'cod',
        notes: input.notes?.trim() || `Commande via Messenger Bot${resolved.length > 1 ? ` (${resolved.length} produits)` : ''}`,
      });
    } catch (err) {
      logger.error({ err: (err as Error).message }, '[messenger-bot] createOrder échec');
      return { ok: false, error: 'Erreur lors de la création de la commande.' };
    }

    // Met à jour la conversation + compteurs.
    conversation.order_id = order._id;
    conversation.status = 'completed';
    conversation.intent = 'order';
    conversation.customer_name = input.customer_name.trim();
    conversation.customer_phone = input.customer_phone.trim();
    conversation.customer_city = input.customer_city.trim();
    conversation.customer_address = input.customer_address.trim();
    await conversation.save();

    await BotConfig.updateOne({ _id: config._id }, { $inc: { total_orders_created: 1 } });
    await BotUsage.updateOne(
      { vendor_id: config.vendor_id, period: currentPeriod() },
      { $inc: { orders_created: 1 }, $setOnInsert: { bot_config_id: config._id } },
      { upsert: true },
    );

    // Notification cloche dashboard (best-effort, identique au flow COD
    // storefront — pour qu'un order arrivé via Messenger/WhatsApp Bot soit
    // visible immédiatement par le vendeur sans rafraîchir manuellement).
    try {
      const storeForNotif = await Store.findById(config.vendor_id).select('ownerId').lean();
      if (storeForNotif?.ownerId) {
        await notifyOrderCreated({
          userId: storeForNotif.ownerId,
          storeId: config.vendor_id,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          total: order.total,
          currency: order.currency,
          customerName: order.customerName,
        });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[messenger-bot] notification dashboard échec (non-fatal)');
    }

    return {
      ok: true,
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      total: order.total,
      currency,
      shippingFee,
    };
  }
}

export const orderCreationService = new OrderCreationService();
