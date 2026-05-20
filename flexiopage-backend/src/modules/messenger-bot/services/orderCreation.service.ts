/**
 * Pont entre le tool `create_order` de Claude et la création de commande
 * Flexiopage. Réutilise `orderService.createOrder` existant (aucune
 * duplication). Calcule les frais de livraison depuis la config du bot.
 */
import { logger } from '../../../lib/logger';
import * as orderService from '../../../services/order.service';
import { Store } from '../../../models/Store.model';
import { BotConfig, type IBotConfig } from '../models/BotConfig.model';
import { BotUsage } from '../models/BotUsage.model';
import type { IConversation } from '../models/Conversation.model';
import { catalogService } from './catalog.service';
import type { CatalogProduct } from '../prompts/promptBuilders';

export interface CreateOrderToolInput {
  product_name: string;
  product_id?: string;
  quantity: number;
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

    const product = catalogService.findProduct(catalog, { id: input.product_id, name: input.product_name });
    if (!product) {
      return { ok: false, error: `Produit "${input.product_name}" introuvable dans le catalogue.` };
    }
    if (typeof product.stock === 'number' && product.stock <= 0) {
      return { ok: false, error: `Produit "${product.name}" en rupture de stock.` };
    }

    const quantity = Math.max(1, Math.min(Number(input.quantity) || 1, 99));
    const store = await Store.findById(config.vendor_id).select('settings.currency').lean();
    const currency = store?.settings?.currency || 'MAD';
    const subtotal = product.price * quantity;
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
        items: [
          {
            productId: product.id || String(config.vendor_id),
            name: product.name,
            quantity,
            price: product.price,
          },
        ],
        subtotal,
        shippingCost: shippingFee,
        currency,
        paymentMethod: 'cod',
        notes: input.notes?.trim() || 'Commande via Messenger Bot',
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
