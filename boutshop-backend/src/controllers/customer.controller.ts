import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Customer } from '../models/Customer.model';

export async function listCustomers(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const customers = await Customer.find({ storeId: store._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ customers });
}
