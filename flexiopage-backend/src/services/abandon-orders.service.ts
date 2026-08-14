/**
 * Cart abandonment sweeper — flips `pending` orders that never received a
 * `paid` webhook into `abandoned` after a grace window.
 *
 * The window (15 min) is long enough that Wave/OM OTP SMS delays or a buyer
 * reading the T&C at checkout don't get false-positived, and short enough
 * that the admin dashboard stays uncluttered.
 *
 * The frontend order list hides `abandoned` by default (there's a toggle),
 * so this job is what keeps the seller-facing UI clean — without deleting
 * data. The abandonment rate remains queryable for later analysis
 * (`abandoned / (paid + abandoned)`) which is one of the most valuable
 * conversion metrics for a digital storefront.
 *
 * Runs every 5 min via a plain setInterval (same pattern as
 * security-monitor). No Redis / BullMQ needed — the query is a single
 * `updateMany` that's cheap and idempotent even under load, and the flip
 * doesn't have to fire at exactly minute N+15 to be useful.
 */
import { logger } from '../lib/logger';
import { Order } from '../models/Order.model';

/** How long a pending order can sit before it's considered abandoned. */
const GRACE_WINDOW_MS = 15 * 60 * 1000; // 15 min
/** How often we sweep. Short-enough that a payment stuck 20+ min shows as
 *  abandoned within a minute or two — not exactly on the 15-min mark. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

let sweepTimer: NodeJS.Timeout | null = null;

/** Run one sweep. Exposed for the admin "abandon now" button + tests. */
export async function sweepAbandonedOrders(): Promise<{ scanned: number; flipped: number }> {
  const cutoff = new Date(Date.now() - GRACE_WINDOW_MS);
  // COD orders live their whole life as `pending` until the seller marks them
  // paid on delivery — sweeping them would silently erase real orders from the
  // dashboard KPIs (analytics excludes `abandoned`).
  const filter = {
    paymentStatus: 'pending' as const,
    paymentMethod: { $ne: 'cod' as const },
    createdAt: { $lt: cutoff },
  };
  const scanned = await Order.countDocuments(filter);
  if (scanned === 0) return { scanned: 0, flipped: 0 };

  const res = await Order.updateMany(filter, {
    $set: { paymentStatus: 'abandoned' as const },
  });
  const flipped = res.modifiedCount ?? 0;
  if (flipped > 0) {
    logger.info({ scanned, flipped, cutoff }, '[abandon] swept pending → abandoned');
  }
  return { scanned, flipped };
}

/** Called once at server boot. */
export function startAbandonOrdersJob(): void {
  if (sweepTimer) return;
  // First sweep 30 s after boot so we don't hammer Mongo during warm-up.
  setTimeout(() => {
    void sweepAbandonedOrders().catch((err) =>
      logger.error({ err }, '[abandon] initial sweep failed'),
    );
  }, 30_000);
  sweepTimer = setInterval(() => {
    void sweepAbandonedOrders().catch((err) =>
      logger.error({ err }, '[abandon] sweep cycle crashed'),
    );
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
  logger.info(
    { graceWindowMs: GRACE_WINDOW_MS, sweepIntervalMs: SWEEP_INTERVAL_MS },
    '[abandon] cart-abandonment sweeper started',
  );
}
