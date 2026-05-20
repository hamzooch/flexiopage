/**
 * Statistiques du bot (vendeur authentifié). Scopé par ?storeId=.
 */
import type { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { Conversation } from '../models/Conversation.model';
import { BotConfig } from '../models/BotConfig.model';
import { BotUsage } from '../models/BotUsage.model';
import { getOwnedStoreId } from '../utils/vendorAuth';

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function overview(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const oid = new mongoose.Types.ObjectId(storeId);

  const [config, byStatus, ordersCreated] = await Promise.all([
    BotConfig.findOne({ vendor_id: storeId }).lean(),
    Conversation.aggregate<{ _id: string; count: number }>([
      { $match: { vendor_id: oid } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Conversation.countDocuments({ vendor_id: oid, order_id: { $ne: null } }),
  ]);

  const statusCounts: Record<string, number> = {};
  let total = 0;
  for (const r of byStatus) { statusCounts[r._id] = r.count; total += r.count; }
  const conversionRate = total > 0 ? Math.round((ordersCreated / total) * 1000) / 10 : 0;

  res.json({
    totalConversations: total,
    byStatus: statusCounts,
    ordersCreated,
    conversionRate, // % conversations → commande
    plan: config?.plan || null,
    conversationsLimit: config?.conversations_limit ?? null,
    conversationsUsedThisMonth: config?.conversations_used_this_month ?? null,
    totalOrdersCreated: config?.total_orders_created ?? 0,
    totalTokensConsumed: config?.total_tokens_consumed ?? 0,
  });
}

export async function conversationStats(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }
  const oid = new mongoose.Types.ObjectId(storeId);

  // 14 derniers jours.
  const since = new Date(); since.setDate(since.getDate() - 14);
  const [byDay, byIntent] = await Promise.all([
    Conversation.aggregate([
      { $match: { vendor_id: oid, created_at: { $gte: since } } },
      { $group: { _id: { $dateToString: { date: '$created_at', format: '%Y-%m-%d' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Conversation.aggregate([
      { $match: { vendor_id: oid } },
      { $group: { _id: '$intent', count: { $sum: 1 } } },
    ]),
  ]);
  res.json({ byDay, byIntent });
}

export async function usageStats(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) { res.status(403).json({ error: 'storeId requis et doit t’appartenir.' }); return; }

  const usage = await BotUsage.find({ vendor_id: storeId }).sort({ period: -1 }).limit(12).lean();
  const current = usage.find((u) => u.period === currentPeriod()) || null;
  res.json({ current, history: usage });
}
