/**
 * Abandoned-cart service. Capture is upsert by (storeId, sessionId)
 * so the same buyer typing in and out doesn't spam rows. The COD
 * checkout endpoint calls `markRecovered()` after a successful order.
 */
import { AbandonedCart, IAbandonedCart } from '../models/AbandonedCart.model';

export interface UpsertCartInput {
  storeId: string;
  sessionId: string;
  productSlug?: string;
  productName?: string;
  productPrice?: number;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
}

export async function upsertAbandonedCart(input: UpsertCartInput): Promise<IAbandonedCart> {
  // We're intentionally not requiring phone/email — partial captures are
  // still valuable (the seller sees which product was almost converted).
  return AbandonedCart.findOneAndUpdate(
    { storeId: input.storeId, sessionId: input.sessionId },
    {
      $set: {
        productSlug: input.productSlug,
        productName: input.productName,
        productPrice: input.productPrice,
        name: input.name?.trim(),
        phone: input.phone?.trim(),
        email: input.email?.trim().toLowerCase(),
        city: input.city?.trim(),
        country: input.country?.trim().toUpperCase(),
      },
      $setOnInsert: {
        storeId: input.storeId,
        sessionId: input.sessionId,
        recovered: false,
      },
    },
    { upsert: true, new: true }
  );
}

export async function listAbandonedCarts(
  storeId: string,
  options?: { includeRecovered?: boolean; limit?: number }
): Promise<IAbandonedCart[]> {
  const q: Record<string, unknown> = { storeId };
  if (!options?.includeRecovered) q.recovered = false;
  return AbandonedCart.find(q)
    .sort({ updatedAt: -1 })
    .limit(options?.limit ?? 200)
    .lean<IAbandonedCart[]>();
}

export async function deleteAbandonedCart(cartId: string, storeId: string): Promise<boolean> {
  const r = await AbandonedCart.deleteOne({ _id: cartId, storeId });
  return r.deletedCount > 0;
}

/**
 * Flip `recovered=true` on any abandoned cart matching the buyer's
 * phone or email when a real order lands. Best-effort: failure here
 * is non-fatal for the checkout flow.
 */
export async function markRecovered(
  storeId: string,
  { email, phone }: { email?: string; phone?: string }
): Promise<void> {
  const ors: Record<string, unknown>[] = [];
  if (email) ors.push({ email: email.toLowerCase() });
  if (phone) ors.push({ phone });
  if (ors.length === 0) return;
  await AbandonedCart.updateMany(
    { storeId, recovered: false, $or: ors },
    { $set: { recovered: true, recoveredAt: new Date() } }
  );
}
