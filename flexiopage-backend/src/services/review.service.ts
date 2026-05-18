/**
 * Review service. Public submit flips the verified flag automatically
 * by checking whether the same email has ever placed an order on this
 * store — no extra opt-in form for the buyer.
 */
import mongoose from 'mongoose';
import { Review, IReview } from '../models/Review.model';
import { Order } from '../models/Order.model';

export interface CreateReviewInput {
  storeId: string;
  productId: string;
  name: string;
  email?: string;
  rating: number;
  title?: string;
  content: string;
}

export async function createReview(input: CreateReviewInput): Promise<IReview> {
  const email = input.email?.trim().toLowerCase();
  let verified = false;
  if (email) {
    // Single index lookup; we don't care which order matched, just whether
    // ANY exists. Limits the buyer-claimed "verified" to people we have
    // ground-truth on.
    const matched = await Order.exists({
      storeId: new mongoose.Types.ObjectId(input.storeId),
      email,
    });
    verified = !!matched;
  }
  return Review.create({
    storeId: input.storeId,
    productId: input.productId,
    name: input.name.trim(),
    email,
    rating: Math.max(1, Math.min(5, input.rating)),
    title: input.title?.trim(),
    content: input.content.trim(),
    verified,
    isPublished: true,
  });
}

export async function listReviews(
  storeId: string,
  options?: { productId?: string; publishedOnly?: boolean }
): Promise<IReview[]> {
  const q: Record<string, unknown> = { storeId };
  if (options?.productId) q.productId = options.productId;
  if (options?.publishedOnly) q.isPublished = true;
  return Review.find(q).sort({ createdAt: -1 }).limit(200).lean<IReview[]>();
}

export async function setReviewPublished(
  reviewId: string,
  storeId: string,
  isPublished: boolean
): Promise<IReview | null> {
  return Review.findOneAndUpdate(
    { _id: reviewId, storeId },
    { $set: { isPublished } },
    { new: true }
  );
}

export async function deleteReview(reviewId: string, storeId: string): Promise<boolean> {
  const r = await Review.deleteOne({ _id: reviewId, storeId });
  return r.deletedCount > 0;
}

/** Aggregated rating for a product — used on the product page header. */
export async function getProductRatingSummary(
  storeId: string,
  productId: string
): Promise<{ avg: number; count: number }> {
  const rows = await Review.aggregate<{ _id: null; avg: number; count: number }>([
    {
      $match: {
        storeId: new mongoose.Types.ObjectId(storeId),
        productId: new mongoose.Types.ObjectId(productId),
        isPublished: true,
      },
    },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  if (rows.length === 0) return { avg: 0, count: 0 };
  return { avg: Math.round(rows[0].avg * 10) / 10, count: rows[0].count };
}
