import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Customer } from '../models/Customer.model';

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
