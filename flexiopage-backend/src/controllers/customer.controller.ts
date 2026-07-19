import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Customer } from '../models/Customer.model';
import { Order } from '../models/Order.model';
import { getCustomerReliability, getCustomerReliabilityBatch } from '../services/customerReliability.service';

export async function listCustomers(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
  const skip = parseInt(req.query.skip as string, 10) || 0;
  const search = String(req.query.search || '').trim();
  const filter: Record<string, unknown> = { storeId: store._id };
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: re }, { name: re }, { phone: re }];
  }
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).lean(),
    Customer.countDocuments(filter),
  ]);
  res.json({ customers, total, limit, skip });
}

/**
 * Fiabilité d'un client (score de retours) pour l'agent de confirmation.
 * Deux modes :
 *   - `?orderId=` : on lit le téléphone sur la commande de la boutique et on
 *     exclut cette commande des compteurs (mode principal, appelé depuis le
 *     détail d'une commande à confirmer).
 *   - `?phone=`   : recherche libre par numéro.
 */
export async function getReliability(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const orderId = String(req.query.orderId || '').trim();
  let phone = String(req.query.phone || '').trim();

  if (!phone && orderId) {
    const order = await Order.findOne({ _id: orderId, storeId: store._id })
      .select('customerPhone')
      .lean();
    if (!order) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }
    phone = order.customerPhone || '';
  }

  const reliability = await getCustomerReliability(store._id, phone, orderId || undefined);
  res.json({ reliability });
}

/**
 * Batch : renvoie un badge fiabilité pour chaque téléphone posté.
 * Utilisé par la liste des commandes pour afficher un badge inline sans
 * faire N+1 requêtes (~20 rows visibles = 1 seul appel).
 * Body : `{ phones: string[] }` (max 100).
 */
export async function getReliabilityBatch(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as { phones?: unknown };
  const phones = Array.isArray(body.phones) ? body.phones.filter((p): p is string => typeof p === 'string') : [];
  if (phones.length === 0) {
    res.json({ reliability: {} });
    return;
  }
  if (phones.length > 100) {
    res.status(400).json({ error: 'Max 100 phones par requête.' });
    return;
  }
  const reliability = await getCustomerReliabilityBatch(phones);
  res.json({ reliability });
}
