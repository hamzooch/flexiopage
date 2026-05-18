/**
 * Subscriber service — dashboard CRUD + public subscribe entry point.
 *
 * Subscribe is idempotent: re-submitting the same email returns the
 * existing subscriber without creating a duplicate. This matters because
 * the welcome popup can flicker for users that clear cookies / change
 * device — we don't want their inbox to fill with thank-you emails or
 * duplicate rows.
 */
import { Subscriber, ISubscriber, SubscriberSource } from '../models/Subscriber.model';

export interface SubscribeInput {
  storeId: string;
  email: string;
  source?: SubscriberSource;
  name?: string;
  rewardCouponCode?: string;
  metadata?: Record<string, unknown>;
}

export async function subscribe(input: SubscribeInput): Promise<{ subscriber: ISubscriber; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email');
  }
  const existing = await Subscriber.findOne({ storeId: input.storeId, email });
  if (existing) {
    // Re-enable if previously unsubscribed (they came back willingly).
    if (existing.isUnsubscribed) {
      existing.isUnsubscribed = false;
      existing.unsubscribedAt = undefined;
      await existing.save();
    }
    return { subscriber: existing, created: false };
  }
  const subscriber = await Subscriber.create({
    storeId: input.storeId,
    email,
    source: input.source || 'newsletter_popup',
    name: input.name?.trim(),
    rewardCouponCode: input.rewardCouponCode?.trim().toUpperCase(),
    metadata: input.metadata,
  });
  return { subscriber, created: true };
}

export async function listSubscribers(
  storeId: string,
  options?: { search?: string; limit?: number; includeUnsubscribed?: boolean }
): Promise<ISubscriber[]> {
  const q: Record<string, unknown> = { storeId };
  if (!options?.includeUnsubscribed) q.isUnsubscribed = false;
  if (options?.search) {
    const term = options.search.trim();
    if (term) {
      // Email-only search — names are optional and frequently empty for newsletter signups.
      q.email = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
  }
  return Subscriber.find(q)
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 500)
    .lean<ISubscriber[]>();
}

export async function deleteSubscriber(subscriberId: string, storeId: string): Promise<boolean> {
  const r = await Subscriber.deleteOne({ _id: subscriberId, storeId });
  return r.deletedCount > 0;
}

export async function countSubscribers(storeId: string): Promise<{ total: number; thisMonth: number }> {
  const total = await Subscriber.countDocuments({ storeId, isUnsubscribed: false });
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const thisMonth = await Subscriber.countDocuments({
    storeId,
    isUnsubscribed: false,
    createdAt: { $gte: monthAgo },
  });
  return { total, thisMonth };
}

/** Format a subscriber list as a CSV string ready for download. */
export function subscribersToCsv(subs: ISubscriber[]): string {
  const header = 'email,name,source,reward_coupon,subscribed_at';
  const escape = (v?: string) => {
    if (!v) return '';
    return /["\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const rows = subs.map((s) =>
    [
      escape(s.email),
      escape(s.name),
      escape(s.source),
      escape(s.rewardCouponCode),
      s.createdAt.toISOString(),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}
