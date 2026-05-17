import mongoose from 'mongoose';
import { ActivityLog, ActivityType, IActivityLog } from '../models/ActivityLog.model';

interface LogActivityInput {
  type: ActivityType;
  message: string;
  userId?: string | mongoose.Types.ObjectId;
  storeId?: string | mongoose.Types.ObjectId;
  orderId?: string | mongoose.Types.ObjectId;
  actorId?: string | mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget. Logging a business event must never break the flow that
 * triggered it, so we swallow errors (just emit a structured log).
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await ActivityLog.create({
      type: input.type,
      message: input.message,
      userId: input.userId,
      storeId: input.storeId,
      orderId: input.orderId,
      actorId: input.actorId,
      metadata: input.metadata,
    });
  } catch (err) {
    console.warn('[activity-log] write failed', input.type, (err as Error).message);
  }
}

interface ListActivitiesInput {
  limit?: number;
  cursor?: string;
  type?: ActivityType;
}

interface ListActivitiesResult {
  items: IActivityLog[];
  nextCursor: string | null;
}

/** Cursor pagination by `_id` descending — cheap and stable. */
export async function listActivities(input: ListActivitiesInput = {}): Promise<ListActivitiesResult> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const filter: Record<string, unknown> = {};
  if (input.type) filter.type = input.type;
  if (input.cursor && mongoose.isValidObjectId(input.cursor)) {
    filter._id = { $lt: new mongoose.Types.ObjectId(input.cursor) };
  }
  const items = await ActivityLog.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('userId', 'email name')
    .populate('storeId', 'name slug')
    .lean();
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  return {
    items: trimmed as unknown as IActivityLog[],
    nextCursor: hasMore ? String(trimmed[trimmed.length - 1]._id) : null,
  };
}
