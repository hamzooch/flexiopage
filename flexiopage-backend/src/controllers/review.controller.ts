/**
 * Authenticated review controller — list, moderate, delete from the dashboard.
 * Public submit lives in public.routes.ts.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as reviewService from '../services/review.service';

export async function listReviews(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
  const reviews = await reviewService.listReviews(store._id.toString(), { productId });
  res.json({ reviews });
}

export async function updateReview(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as { isPublished?: boolean };
  if (typeof body.isPublished !== 'boolean') {
    res.status(400).json({ error: 'isPublished (boolean) required' });
    return;
  }
  const updated = await reviewService.setReviewPublished(req.params.reviewId, store._id.toString(), body.isPublished);
  if (!updated) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }
  res.json({ review: updated });
}

export async function deleteReview(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const ok = await reviewService.deleteReview(req.params.reviewId, store._id.toString());
  if (!ok) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }
  res.status(204).end();
}
