import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as cartService from '../services/abandoned-cart.service';

export async function listAbandonedCarts(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const carts = await cartService.listAbandonedCarts(store._id.toString(), {
    includeRecovered: req.query.includeRecovered === 'true',
  });
  res.json({ carts });
}

export async function deleteAbandonedCart(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const ok = await cartService.deleteAbandonedCart(req.params.cartId, store._id.toString());
  if (!ok) {
    res.status(404).json({ error: 'Cart not found' });
    return;
  }
  res.status(204).end();
}
