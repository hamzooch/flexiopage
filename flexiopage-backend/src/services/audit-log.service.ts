import mongoose from 'mongoose';
import type { Request } from 'express';
import { AuditLog, type AuditAction, type IAuditLog } from '../models/AuditLog.model';
import type { AuthRequest } from '../middleware/auth.middleware';

interface LogAuditInput {
  action: AuditAction;
  req: AuthRequest | Request;
  targetId?: string | mongoose.Types.ObjectId;
  targetType?: IAuditLog['targetType'];
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget. An admin mutation must never fail just because we couldn't
 * write the audit row (we just log a warning so it shows up in stderr).
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const user = (input.req as AuthRequest).user;
    if (!user) return;
    const xff = input.req.headers['x-forwarded-for'];
    const ip =
      (typeof xff === 'string' ? xff.split(',')[0]?.trim() : Array.isArray(xff) ? xff[0] : undefined) ||
      input.req.socket?.remoteAddress ||
      undefined;
    await AuditLog.create({
      action: input.action,
      actorId: user._id,
      actorEmail: user.email,
      actorRole: user.role,
      targetId: input.targetId ? String(input.targetId) : undefined,
      targetType: input.targetType,
      summary: input.summary,
      metadata: input.metadata,
      ip,
    });
  } catch (err) {
    console.warn('[audit-log] write failed', input.action, (err as Error).message);
  }
}

interface ListAuditInput {
  limit?: number;
  cursor?: string;
  action?: AuditAction;
  actorId?: string;
  targetId?: string;
}

interface ListAuditResult {
  items: IAuditLog[];
  nextCursor: string | null;
}

export async function listAudit(input: ListAuditInput = {}): Promise<ListAuditResult> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const filter: Record<string, unknown> = {};
  if (input.action) filter.action = input.action;
  if (input.actorId && mongoose.isValidObjectId(input.actorId)) {
    filter.actorId = new mongoose.Types.ObjectId(input.actorId);
  }
  if (input.targetId) filter.targetId = input.targetId;
  if (input.cursor && mongoose.isValidObjectId(input.cursor)) {
    filter._id = { $lt: new mongoose.Types.ObjectId(input.cursor) };
  }
  const items = await AuditLog.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  return {
    items: trimmed as unknown as IAuditLog[],
    nextCursor: hasMore ? String(trimmed[trimmed.length - 1]._id) : null,
  };
}
