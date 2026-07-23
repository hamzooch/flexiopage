/**
 * Platform-admin endpoints. All routes require role='admin' (enforced by
 * requireRole middleware on the router).
 *
 * Surface for now:
 *   - GET  /api/admin/overview         platform-wide KPIs
 *   - GET  /api/admin/users            list all sellers + counts
 *   - GET  /api/admin/stores           every store across the platform
 *   - GET  /api/admin/orders           every order, paginated
 *   - GET  /api/admin/wallets          every wallet
 *   - POST /api/admin/wallets/:userId/adjust   manual credit/debit
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { Store } from '../models/Store.model';
import { Product } from '../models/Product.model';
import { Order } from '../models/Order.model';
import { Wallet } from '../models/Wallet.model';
import { BotUsage } from '../modules/messenger-bot/models/BotUsage.model';
import { Complaint } from '../models/Complaint.model';
import { credit, debit, usdToTokens, usdToTokensRate } from '../services/wallet.service';
import { listActivities } from '../services/activity-log.service';
import { logAudit, listAudit } from '../services/audit-log.service';
import type { ActivityType } from '../models/ActivityLog.model';
import type { AuditAction } from '../models/AuditLog.model';
import {
  Settings,
  getSettings,
  invalidateSettingsCache,
  DEFAULT_AI_PRICING,
  DEFAULT_AUTH_SETTINGS,
  DEFAULT_PLATFORM_SETTINGS,
  type IAiPricing,
  type IAuthSettings,
  type IPlatformSettings,
} from '../models/Settings.model';
import { resendVerification } from '../services/auth.service';

const DEFAULT_LIMIT = 50;

/** GET /api/admin/overview — platform-wide stats. */
export async function getOverview(_req: AuthRequest, res: Response): Promise<void> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    userCount,
    storeCount,
    productCount,
    orderCount,
    paidCount,
    deliveredCount,
    last30Orders,
    walletAgg,
    commissionAgg,
    openComplaints,
    urgentComplaints,
    recentOrders,
    recentUsers,
    topStoresAgg,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Store.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.countDocuments({ paymentStatus: 'paid' }),
    Order.countDocuments({ fulfillmentStatus: 'fulfilled' }),
    Order.find({ createdAt: { $gte: since30d } })
      .select('total currency createdAt fulfillmentStatus paymentStatus')
      .lean(),
    Wallet.aggregate([
      {
        $group: {
          _id: '$currency',
          totalBalance: { $sum: '$balance' },
          totalAi: { $sum: '$aiBalance' },
          count: { $sum: 1 },
        },
      },
    ]),
    Wallet.aggregate([
      { $unwind: '$transactions' },
      { $match: { 'transactions.kind': 'commission' } },
      {
        $group: {
          _id: '$currency',
          total: { $sum: { $multiply: ['$transactions.amount', -1] } },
          count: { $sum: 1 },
        },
      },
    ]),
    Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] }, priority: 'urgent' }),
    Order.find()
      .populate('storeId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(6)
      .select('orderNumber total currency paymentStatus fulfillmentStatus customerName email storeId createdAt')
      .lean(),
    User.find({ role: 'user' })
      .sort({ createdAt: -1 })
      .limit(6)
      .select('email name createdAt emailVerified')
      .lean(),
    Order.aggregate([
      { $match: { createdAt: { $gte: since30d }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: '$storeId',
          orders: { $sum: 1 },
          gmv: { $sum: '$total' },
          currency: { $first: '$currency' },
        },
      },
      { $sort: { gmv: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          orders: 1,
          gmv: 1,
          currency: 1,
          name: '$store.name',
          slug: '$store.slug',
        },
      },
    ]),
  ]);

  // GMV per currency on last-30d orders
  const gmvByCurrency: Record<string, number> = {};
  for (const o of last30Orders) {
    const c = o.currency || 'USD';
    gmvByCurrency[c] = (gmvByCurrency[c] || 0) + (o.total || 0);
  }

  // Daily breakdown for the last 30 days (sparkline + line chart)
  const dayBuckets: { date: string; orders: number; revenue: number }[] = [];
  const dayMap = new Map<string, { orders: number; revenue: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const bucket = { orders: 0, revenue: 0 };
    dayMap.set(key, bucket);
    dayBuckets.push({ date: key, ...bucket });
  }
  for (const o of last30Orders) {
    const key = new Date(o.createdAt).toISOString().slice(0, 10);
    const b = dayMap.get(key);
    if (b) {
      b.orders += 1;
      if (o.paymentStatus === 'paid') b.revenue += o.total || 0;
    }
  }
  // Reflect mutated bucket values back into the array (same refs).
  for (const day of dayBuckets) {
    const m = dayMap.get(day.date);
    if (m) {
      day.orders = m.orders;
      day.revenue = m.revenue;
    }
  }

  res.json({
    overview: {
      users: userCount,
      stores: storeCount,
      products: productCount,
      orders: { total: orderCount, paid: paidCount, delivered: deliveredCount },
      gmv30d: gmvByCurrency,
      walletsByCurrency: walletAgg,
      commissionByCurrency: commissionAgg,
      complaints: { open: openComplaints, urgent: urgentComplaints },
      ordersByDay30d: dayBuckets,
      recentOrders,
      recentUsers,
      topStores30d: topStoresAgg,
    },
  });
}

/**
 * GET /api/admin/overview/rich?range=7d|30d|90d|12m
 *
 * Powers the new pro admin dashboard. Returns everything `getOverview` does
 * PLUS: signup timeseries, commission timeseries, geo breakdown, alerts, and
 * top stores enriched with currency-grouped GMV.
 */
type AdminRange = 'today' | 'yesterday' | '7d' | '30d' | '90d' | '12m';
interface AdminWindow { from: Date; to: Date; bucket: 'day' | 'month'; }

function resolveAdminRange(range: AdminRange): AdminWindow {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  if (range === '12m') {
    const from = new Date(to);
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    return { from, to, bucket: 'month' };
  }
  // 'yesterday' = la journée d'hier entière [hier 00:00 → hier 23:59].
  if (range === 'yesterday') {
    const yEnd = new Date(now);
    yEnd.setDate(yEnd.getDate() - 1);
    yEnd.setHours(23, 59, 59, 999);
    const yStart = new Date(yEnd);
    yStart.setHours(0, 0, 0, 0);
    return { from: yStart, to: yEnd, bucket: 'day' };
  }
  // `today` = 1 day window starting at local midnight
  const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to, bucket: 'day' };
}

function denseSeries(
  from: Date,
  to: Date,
  bucket: 'day' | 'month',
  rows: Array<Record<string, unknown> & { _id: string }>,
  fields: readonly string[]
): Array<Record<string, number | string>> {
  const map = new Map<string, Record<string, number>>();
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = bucket === 'day'
      ? cursor.toISOString().slice(0, 10)
      : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const empty: Record<string, number> = {};
    for (const f of fields) empty[f] = 0;
    map.set(key, empty);
    if (bucket === 'day') cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const row of rows) {
    const cur = map.get(row._id);
    if (!cur) continue;
    for (const f of fields) cur[f] = Number(row[f]) || 0;
  }
  return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
}

export async function getOverviewRich(req: AuthRequest, res: Response): Promise<void> {
  const allowed: AdminRange[] = ['today', 'yesterday', '7d', '30d', '90d', '12m'];
  const raw = String(req.query.range || '30d');
  const range = (allowed as string[]).includes(raw) ? (raw as AdminRange) : '30d';
  const w = resolveAdminRange(range);
  const dateFormat = w.bucket === 'day' ? '%Y-%m-%d' : '%Y-%m';

  const [
    userCount,
    storeCount,
    productCount,
    orderCount,
    paidCount,
    deliveredCount,
    failedCount,
    revenueSeries,
    signupSeries,
    commissionSeries,
    paymentMix,
    geoBreakdown,
    topStoresRaw,
    walletAgg,
    commissionTotalAgg,
    openComplaints,
    urgentComplaints,
    recentOrders,
    recentUsers,
    failingPayments,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Store.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.countDocuments({ paymentStatus: 'paid' }),
    Order.countDocuments({ fulfillmentStatus: 'fulfilled' }),
    Order.countDocuments({ paymentStatus: 'failed' }),
    // Revenue + orders timeseries
    Order.aggregate([
      { $match: { createdAt: { $gte: w.from, $lte: w.to } } },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: dateFormat } },
          orders: { $sum: 1 },
          paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
        },
      },
    ]),
    // User signups timeseries
    User.aggregate([
      { $match: { role: 'user', createdAt: { $gte: w.from, $lte: w.to } } },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: dateFormat } },
          signups: { $sum: 1 },
        },
      },
    ]),
    // Commission collected timeseries — commission is stored as a negative
    // wallet transaction (kind='commission'); we negate to get the platform's gain.
    Wallet.aggregate([
      { $unwind: '$transactions' },
      { $match: { 'transactions.kind': 'commission', 'transactions.createdAt': { $gte: w.from, $lte: w.to } } },
      {
        $group: {
          _id: { $dateToString: { date: '$transactions.createdAt', format: dateFormat } },
          commission: { $sum: { $multiply: ['$transactions.amount', -1] } },
        },
      },
    ]),
    // Payment provider mix
    Order.aggregate([
      { $match: { createdAt: { $gte: w.from, $lte: w.to }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $ifNull: ['$paymentProvider', '$paymentMethod'] },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
    // Geographic breakdown — shippingAddress.country falls back to 'XX' when unset.
    Order.aggregate([
      { $match: { createdAt: { $gte: w.from, $lte: w.to }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $ifNull: ['$shippingAddress.country', 'XX'] },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 12 },
    ]),
    // Top 8 stores in window
    Order.aggregate([
      { $match: { createdAt: { $gte: w.from, $lte: w.to }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: '$storeId',
          orders: { $sum: 1 },
          gmv: { $sum: '$total' },
          currency: { $first: '$currency' },
        },
      },
      { $sort: { gmv: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          orders: 1,
          gmv: 1,
          currency: 1,
          name: '$store.name',
          slug: '$store.slug',
          logo: '$store.logo',
        },
      },
    ]),
    Wallet.aggregate([
      { $group: { _id: '$currency', totalBalance: { $sum: '$balance' }, totalAi: { $sum: '$aiBalance' }, count: { $sum: 1 } } },
    ]),
    Wallet.aggregate([
      { $unwind: '$transactions' },
      { $match: { 'transactions.kind': 'commission' } },
      { $group: { _id: '$currency', total: { $sum: { $multiply: ['$transactions.amount', -1] } }, count: { $sum: 1 } } },
    ]),
    Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] }, priority: 'urgent' }),
    Order.find().populate('storeId', 'name slug').sort({ createdAt: -1 }).limit(8)
      .select('orderNumber total currency paymentStatus fulfillmentStatus customerName email storeId createdAt')
      .lean(),
    User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(8)
      .select('email name createdAt emailVerified country')
      .lean(),
    Order.find({ paymentStatus: 'failed', createdAt: { $gte: w.from } })
      .populate('storeId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber total currency paymentStatus storeId customerName email createdAt')
      .lean(),
  ]);

  const revenueTs = denseSeries(
    w.from, w.to, w.bucket,
    revenueSeries as Array<Record<string, unknown> & { _id: string }>,
    ['orders', 'paid', 'revenue'],
  );
  const signupTs = denseSeries(
    w.from, w.to, w.bucket,
    signupSeries as Array<Record<string, unknown> & { _id: string }>,
    ['signups'],
  );
  const commissionTs = denseSeries(
    w.from, w.to, w.bucket,
    commissionSeries as Array<Record<string, unknown> & { _id: string }>,
    ['commission'],
  );

  res.json({
    range,
    window: { from: w.from.toISOString(), to: w.to.toISOString() },
    totals: {
      users: userCount,
      stores: storeCount,
      products: productCount,
      orders: { total: orderCount, paid: paidCount, delivered: deliveredCount, failed: failedCount },
      complaints: { open: openComplaints, urgent: urgentComplaints },
    },
    walletsByCurrency: walletAgg,
    commissionByCurrency: commissionTotalAgg,
    timeseries: {
      revenue: revenueTs,
      signups: signupTs,
      commission: commissionTs,
    },
    paymentMix,
    geo: geoBreakdown,
    topStores: topStoresRaw,
    recentOrders,
    recentUsers,
    alerts: {
      failedPayments: failingPayments,
    },
  });
}

/**
 * GET /api/admin/stores/:storeId/analytics?range=...
 *
 * Drill-down into a single store from the admin overview. Returns the same
 * rich payload owners get on /dashboard/analytics, plus the owner's identity.
 */
export async function getStoreDrilldown(req: AuthRequest, res: Response): Promise<void> {
  const { storeId } = req.params;
  if (!storeId) {
    res.status(400).json({ error: 'storeId required' });
    return;
  }
  const store = await Store.findById(storeId).populate('ownerId', 'email name').lean();
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  const { getStoreAnalyticsRich } = await import('../services/analytics.service');
  const allowed = ['today', 'yesterday', '7d', '30d', '90d', '12m'] as const;
  const raw = String(req.query.range || '30d');
  const range = (allowed as readonly string[]).includes(raw) ? (raw as typeof allowed[number]) : '30d';
  const analytics = await getStoreAnalyticsRich(storeId, range);
  res.json({
    store: {
      _id: store._id,
      name: store.name,
      slug: store.slug,
      logo: store.logo,
      isPublished: store.isPublished,
      storeType: store.storeType,
      createdAt: store.createdAt,
      owner: store.ownerId,
      settings: { currency: store.settings?.currency, country: store.settings?.country },
      commission: store.commission,
    },
    analytics,
  });
}

/** GET /api/admin/users?search=&limit= */
export async function listUsers(req: AuthRequest, res: Response): Promise<void> {
  const search = String(req.query.search || '').trim();
  const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 200);
  const skip = parseInt(String(req.query.skip || '0'), 10) || 0;
  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
      { whatsapp: { $regex: search, $options: 'i' } },
    ];
  }
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('email name role emailVerified createdAt whatsapp')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(),
    User.countDocuments(filter),
  ]);

  // Augment with counts (stores per user) — single aggregation
  const ids = users.map((u) => u._id);
  const storeCounts = await Store.aggregate([
    { $match: { ownerId: { $in: ids } } },
    { $group: { _id: '$ownerId', n: { $sum: 1 } } },
  ]);
  const countByOwner = new Map(storeCounts.map((c) => [c._id.toString(), c.n]));

  res.json({
    users: users.map((u) => ({
      ...u,
      storeCount: countByOwner.get(u._id.toString()) || 0,
    })),
    total,
    limit,
    skip,
  });
}

/** GET /api/admin/stores */
export async function listStores(req: AuthRequest, res: Response): Promise<void> {
  const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 200);
  const skip = parseInt(String(req.query.skip || '0'), 10) || 0;
  const [stores, total] = await Promise.all([
    Store.find()
      .populate('ownerId', 'email name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(),
    Store.countDocuments(),
  ]);
  res.json({ stores, total, limit, skip });
}

/** GET /api/admin/orders */
export async function listOrders(req: AuthRequest, res: Response): Promise<void> {
  const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 200);
  const skip = parseInt(String(req.query.skip || '0'), 10) || 0;
  const [orders, total] = await Promise.all([
    Order.find()
      .populate('storeId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(),
    Order.countDocuments(),
  ]);
  res.json({ orders, total, limit, skip });
}

/** GET /api/admin/wallets */
export async function listWallets(req: AuthRequest, res: Response): Promise<void> {
  const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 200);
  const wallets = await Wallet.find()
    .populate('userId', 'email name')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
  res.json({ wallets });
}

/** POST /api/admin/wallets/:userId/adjust — body: { amount, bucket?, reason }
 *
 *  Pour bucket='main' : amount en USD (positif=crédit, négatif=débit).
 *  Pour bucket='ai'   : amount en TOKENS directement (pas de conversion).
 *  C'est volontaire — l'admin ajuste manuellement à la valeur exacte,
 *  contrairement à /credit qui simule un paiement USD du vendeur. */
export async function adjustWallet(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const { amount, bucket, reason } = (req.body || {}) as {
    amount?: number;
    bucket?: 'main' | 'ai';
    reason?: string;
  };
  const value = Number(amount);
  if (!value || !Number.isFinite(value)) {
    res.status(400).json({ error: 'amount required (positive=credit, negative=debit)' });
    return;
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    res.status(400).json({ error: 'reason required (min 3 chars)' });
    return;
  }
  const target: 'main' | 'ai' = bucket === 'ai' ? 'ai' : 'main';

  if (value > 0) {
    const result = await credit({
      userId,
      amount: value,
      bucket: target,
      kind: 'adjustment',
      note: `[admin] ${reason.trim()}`,
    });
    await logAudit({
      action: 'wallet.adjust',
      req,
      targetId: userId,
      targetType: 'wallet',
      summary: `Crédit ${value} (${target}) · ${reason.trim()}`,
      metadata: { amount: value, bucket: target, reason: reason.trim() },
    });
    res.json({
      ok: true,
      bucket: target,
      balance: result.wallet.balance,
      aiBalance: result.wallet.aiBalance,
      transaction: result.transaction,
    });
  } else {
    const result = await debit({
      userId,
      amount: Math.abs(value),
      bucket: target,
      kind: 'adjustment',
      note: `[admin] ${reason.trim()}`,
    });
    await logAudit({
      action: 'wallet.adjust',
      req,
      targetId: userId,
      targetType: 'wallet',
      summary: `Débit ${Math.abs(value)} (${target}) · ${reason.trim()}`,
      metadata: { amount: value, bucket: target, reason: reason.trim() },
    });
    res.json({
      ok: true,
      bucket: target,
      balance: result.wallet.balance,
      aiBalance: result.wallet.aiBalance,
      transaction: result.transaction,
    });
  }
}

type StaffRole = 'owner' | 'superadmin' | 'admin' | 'supervisor' | 'user';
const STAFF_ROLES: StaffRole[] = ['owner', 'superadmin', 'admin', 'supervisor', 'user'];

/** PATCH /api/admin/users/:userId/role — superadmin or owner. */
export async function updateUserRole(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const { role } = (req.body || {}) as { role?: StaffRole };
  if (!STAFF_ROLES.includes(role as StaffRole)) {
    res.status(400).json({ error: `role must be one of: ${STAFF_ROLES.join(', ')}` });
    return;
  }
  // Only superadmin or owner can change roles at all.
  if (req.user?.role !== 'superadmin' && req.user?.role !== 'owner') {
    res.status(403).json({ error: 'Only superadmin or owner can change roles' });
    return;
  }
  // Only an owner can grant the "owner" role (privilege-escalation guard).
  if (role === 'owner' && req.user?.role !== 'owner') {
    res.status(403).json({ error: 'Only an owner can grant the owner role' });
    return;
  }
  const before = await User.findById(userId).select('role').lean();
  const u = await User.findByIdAndUpdate(userId, { $set: { role } }, { new: true })
    .select('email name role')
    .lean();
  if (!u) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  await logAudit({
    action: 'user.role_change',
    req,
    targetId: userId,
    targetType: 'user',
    summary: `${u.email} : ${before?.role || '?'} → ${role}`,
    metadata: { before: before?.role, after: role },
  });
  res.json({ user: u });
}

/**
 * POST /api/admin/wallets/:userId/credit — superadmin only.
 * Body: { amount, target?: 'main' | 'ai', paymentReference?, note? }
 *
 * Direct top-up (positive amount only). Different from /adjust which allows
 * negative debits and is open to plain admins. Use this to fund a seller's
 * main or AI balance after they've paid by Wave / OM / bank.
 */
export async function creditWallet(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const { amount, target, paymentReference, note } = (req.body || {}) as {
    amount?: number;
    target?: 'main' | 'ai';
    paymentReference?: string;
    note?: string;
  };
  const value = Number(amount);
  if (!value || value <= 0) {
    res.status(400).json({ error: 'amount must be positive' });
    return;
  }
  const bucket: 'main' | 'ai' = target === 'ai' ? 'ai' : 'main';
  // L'admin saisit le montant payé en USD ; pour le bucket AI on crédite
  // l'équivalent en tokens (1 USD = settings.aiPricing.usdToTokens).
  const creditAmount = bucket === 'ai' ? await usdToTokens(value) : value;
  const rate = bucket === 'ai' ? await usdToTokensRate() : 1;
  const result = await credit({
    userId,
    amount: creditAmount,
    bucket,
    kind: bucket === 'ai' ? 'top_up_ai' : 'top_up',
    paymentReference: paymentReference?.trim() || undefined,
    note:
      note?.trim() ||
      (bucket === 'ai'
        ? `[admin] Recharge IA · ${value} USD → ${creditAmount} tokens`
        : '[admin] Recharge principal'),
  });
  if (!result.alreadyApplied) {
    await logAudit({
      action: 'wallet.credit',
      req,
      targetId: userId,
      targetType: 'wallet',
      summary: bucket === 'ai'
        ? `Top-up IA ${value} USD → ${creditAmount} tokens`
        : `Top-up principal ${creditAmount} USD`,
      metadata: { amount: value, bucket, credited: creditAmount, paymentReference },
    });
  }
  res.json({
    ok: true,
    bucket,
    alreadyApplied: result.alreadyApplied,
    balance: result.wallet.balance,
    aiBalance: result.wallet.aiBalance,
    credited: creditAmount,
    rate,
    transaction: result.transaction,
  });
}

/**
 * GET /api/admin/users/:userId — full detail screen for one seller, including
 * counts (stores, orders, products) and a wallet snapshot.
 */
export async function getUserDetail(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const user = await User.findById(userId)
    .select('email name role avatar emailVerified suspended suspendedReason suspendedAt lastLoginAt lastLoginIp passwordResetAt createdAt updatedAt whatsapp')
    .lean();
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const [stores, productCount, orderCount, paidOrders, deliveredOrders, wallet] = await Promise.all([
    Store.find({ ownerId: user._id }).select('name slug storeType isPublished settings.currency settings.country createdAt').lean(),
    Product.countDocuments({ storeId: { $in: await Store.find({ ownerId: user._id }).distinct('_id') } }),
    Order.countDocuments({ storeId: { $in: await Store.find({ ownerId: user._id }).distinct('_id') } }),
    Order.countDocuments({ storeId: { $in: await Store.find({ ownerId: user._id }).distinct('_id') }, paymentStatus: 'paid' }),
    Order.countDocuments({ storeId: { $in: await Store.find({ ownerId: user._id }).distinct('_id') }, fulfillmentStatus: 'fulfilled' }),
    Wallet.findOne({ userId: user._id }).lean(),
  ]);
  res.json({
    user,
    stats: {
      stores: stores.length,
      products: productCount,
      orders: orderCount,
      paidOrders,
      deliveredOrders,
    },
    stores,
    wallet: wallet
      ? { balance: wallet.balance, aiBalance: wallet.aiBalance, currency: wallet.currency, txCount: wallet.transactions?.length || 0 }
      : null,
  });
}

/**
 * PATCH /api/admin/users/:userId — body { name?, role?, emailVerified?, suspended?, suspendedReason? }
 * Single endpoint for general user updates from the admin detail page.
 */
export async function patchUser(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const body = (req.body || {}) as Partial<{
    name: string;
    role: StaffRole;
    emailVerified: boolean;
    suspended: boolean;
    suspendedReason: string;
  }>;
  if (req.user && req.user._id.toString() === userId) {
    if (body.role && body.role !== req.user.role) {
      res.status(400).json({ error: "Tu ne peux pas changer ton propre rôle." });
      return;
    }
    if (body.suspended === true) {
      res.status(400).json({ error: "Tu ne peux pas te suspendre toi-même." });
      return;
    }
  }
  // Role changes are reserved to superadmin or owner (the dedicated /role
  // endpoint also enforces this; this is a defence-in-depth check).
  if (body.role && req.user?.role !== 'superadmin' && req.user?.role !== 'owner') {
    res.status(403).json({ error: 'Only superadmin or owner can change roles' });
    return;
  }
  // Only an owner can grant the "owner" role.
  if (body.role === 'owner' && req.user?.role !== 'owner') {
    res.status(403).json({ error: 'Only an owner can grant the owner role' });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') updates.name = body.name.trim();
  if (body.role && STAFF_ROLES.includes(body.role)) updates.role = body.role;
  if (typeof body.emailVerified === 'boolean') updates.emailVerified = body.emailVerified;
  if (typeof body.suspended === 'boolean') {
    updates.suspended = body.suspended;
    if (body.suspended) {
      updates.suspendedAt = new Date();
      if (typeof body.suspendedReason === 'string') updates.suspendedReason = body.suspendedReason.trim() || undefined;
    } else {
      updates.suspendedAt = undefined;
      updates.suspendedReason = undefined;
    }
  } else if (typeof body.suspendedReason === 'string') {
    updates.suspendedReason = body.suspendedReason.trim() || undefined;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' });
    return;
  }
  const u = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
    .select('email name role emailVerified suspended suspendedReason suspendedAt lastLoginAt')
    .lean();
  if (!u) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  // Pick the most descriptive action available for audit clarity.
  let action: AuditAction = 'user.update';
  let summary = `Modif ${u.email}`;
  if (typeof body.suspended === 'boolean') {
    action = body.suspended ? 'user.suspend' : 'user.unsuspend';
    summary = body.suspended
      ? `Suspension ${u.email}${body.suspendedReason ? ` · ${body.suspendedReason}` : ''}`
      : `Réactivation ${u.email}`;
  } else if (body.role && body.role !== undefined) {
    action = 'user.role_change';
    summary = `${u.email} → rôle ${body.role}`;
  }
  await logAudit({
    action,
    req,
    targetId: userId,
    targetType: 'user',
    summary,
    metadata: { changes: updates },
  });
  res.json({ user: u });
}

/**
 * POST /api/admin/users/:userId/reset-password
 * Admin generates a temp password (or accepts one in body), hashes it,
 * stores `passwordResetAt`. Returns the temp password ONCE so the admin
 * can hand it to the user out-of-band.
 */
export async function resetUserPassword(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const provided = ((req.body || {}) as { newPassword?: string }).newPassword;
  let temp = provided?.trim();
  if (!temp) {
    // Generate a memorable but strong-ish temp password.
    temp = crypto.randomBytes(8).toString('base64url').slice(0, 12) + '!9';
  }
  if (temp.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  const hash = await bcrypt.hash(temp, 10);
  const u = await User.findByIdAndUpdate(
    userId,
    { $set: { password: hash, passwordResetAt: new Date() } },
    { new: true }
  ).select('email name');
  if (!u) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  await logAudit({
    action: 'user.reset_password',
    req,
    targetId: userId,
    targetType: 'user',
    summary: `Reset password ${u.email}`,
  });
  res.json({
    ok: true,
    email: u.email,
    temporaryPassword: temp,
    note: 'Cette valeur ne sera pas réaffichée. Donne-la à l\'utilisateur via un canal sécurisé.',
  });
}

/** DELETE /api/admin/users/:userId — hard delete + cleanup of stores/orders/wallet. */
export async function deleteUser(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  if (req.user && req.user._id.toString() === userId) {
    res.status(400).json({ error: 'Tu ne peux pas supprimer ton propre compte ici.' });
    return;
  }
  const user = await User.findById(userId).select('email').lean();
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const stores = await Store.find({ ownerId: userId }).distinct('_id');
  await Promise.all([
    Order.deleteMany({ storeId: { $in: stores } }),
    Product.deleteMany({ storeId: { $in: stores } }),
    Store.deleteMany({ ownerId: userId }),
    Wallet.deleteOne({ userId }),
    User.deleteOne({ _id: userId }),
  ]);
  await logAudit({
    action: 'user.delete',
    req,
    targetId: userId,
    targetType: 'user',
    summary: `Suppression compte ${user.email} (+ ${stores.length} stores, orders, produits, wallet)`,
    metadata: { storesDeleted: stores.length },
  });
  res.json({ ok: true, email: user.email });
}

/**
 * POST /api/admin/users — superadmin or owner. Create a staff account directly
 * (admin, supervisor, superadmin) without going through the public signup flow.
 *
 * Body: { email, password, name, role }
 * Allowed roles: 'user' | 'supervisor' | 'admin' | 'superadmin' | 'owner'
 *   - 'owner' requires the caller to be owner (anti-escalation).
 *   - 'superadmin' requires the caller to be superadmin or owner — already
 *     enforced because this route is gated by requireSuperAdmin.
 */
export async function createUser(req: AuthRequest, res: Response): Promise<void> {
  const { email, password, name, role } = (req.body || {}) as {
    email?: string;
    password?: string;
    name?: string;
    role?: StaffRole;
  };

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = (name || '').trim();
  const cleanRole: StaffRole = (STAFF_ROLES.includes(role as StaffRole) ? role : 'user') as StaffRole;

  if (!cleanEmail || !cleanName || !password) {
    res.status(400).json({ error: 'email, name and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }
  if (cleanRole === 'owner' && req.user?.role !== 'owner') {
    res.status(403).json({ error: 'Only an owner can create another owner' });
    return;
  }

  const existing = await User.findOne({ email: cleanEmail });
  if (existing) {
    res.status(409).json({ error: 'A user with this email already exists' });
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: cleanEmail,
    password: hash,
    name: cleanName,
    role: cleanRole,
    emailVerified: true,
  });

  await logAudit({
    action: 'user.create',
    req,
    targetId: String(user._id),
    targetType: 'user',
    summary: `Création ${user.email} (${user.role})`,
    metadata: { email: user.email, role: user.role },
  });
  res.status(201).json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
  });
}

/**
 * GET /api/admin/settings/ai-pricing — read the AI generation price grid
 * (USD prices + USD→currency rate table). Returns defaults if the
 * Settings doc hasn't been initialised yet.
 */
export async function getAiPricing(_req: AuthRequest, res: Response): Promise<void> {
  const s = await getSettings();
  res.json({
    aiPricing: s.aiPricing,
    defaults: DEFAULT_AI_PRICING,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy,
  });
}

/**
 * PUT /api/admin/settings/ai-pricing — superadmin only. Replace prices
 * and/or rates. Values must be positive numbers; bad inputs are silently
 * dropped so a typo can't crash the whole grid.
 */
export async function updateAiPricing(req: AuthRequest, res: Response): Promise<void> {
  const body = (req.body || {}) as Partial<IAiPricing>;

  const cleanPrices: Partial<IAiPricing['prices']> = {};
  if (body.prices && typeof body.prices === 'object') {
    for (const [k, v] of Object.entries(body.prices)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) {
        cleanPrices[k as keyof IAiPricing['prices']] = n;
      }
    }
  }

  const cleanRates: Record<string, number> = {};
  if (body.rates && typeof body.rates === 'object') {
    for (const [k, v] of Object.entries(body.rates)) {
      const n = Number(v);
      const code = k.toUpperCase();
      if (!Number.isFinite(n) || n <= 0) continue;
      if (code === 'USD' && n !== 1) continue;
      cleanRates[code] = n;
    }
  }

  const update: Record<string, unknown> = { updatedBy: req.user?._id };
  if (Object.keys(cleanPrices).length > 0) {
    for (const [k, v] of Object.entries(cleanPrices)) {
      update[`aiPricing.prices.${k}`] = v;
    }
  }
  if (Object.keys(cleanRates).length > 0) {
    update['aiPricing.rates'] = cleanRates;
  }
  // Le ratio USD→tokens : modifié séparément des `prices` (qui sont les
  // coûts par génération), mais stocké au même endroit.
  if (body.usdToTokens !== undefined) {
    const r = Number(body.usdToTokens);
    if (Number.isFinite(r) && r > 0) {
      update['aiPricing.usdToTokens'] = r;
    }
  }

  await Settings.updateOne({ key: 'global' }, { $set: update }, { upsert: true });
  invalidateSettingsCache();
  const fresh = await getSettings(true);
  await logAudit({
    action: 'settings.ai_pricing',
    req,
    targetType: 'settings',
    summary: 'Tarifs AI mis à jour',
    metadata: { update },
  });
  res.json({ aiPricing: fresh.aiPricing, updatedAt: fresh.updatedAt });
}

/**
 * GET /api/admin/settings/auth — read the auth-related toggles
 * (kill-switch vérification email pour l'instant, extensible).
 */
export async function getAuthSettings(_req: AuthRequest, res: Response): Promise<void> {
  const s = await getSettings();
  res.json({
    auth: s.auth || DEFAULT_AUTH_SETTINGS,
    defaults: DEFAULT_AUTH_SETTINGS,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy,
  });
}

/**
 * PATCH /api/admin/settings/auth — superadmin only. Merge partiel des
 * toggles auth. Invalide le cache pour que la modif prenne effet immédiatement
 * sur les prochains signups.
 */
export async function updateAuthSettings(req: AuthRequest, res: Response): Promise<void> {
  const body = (req.body || {}) as Partial<IAuthSettings>;
  const update: Record<string, unknown> = { updatedBy: req.user?._id };
  if (typeof body.emailVerificationEnabled === 'boolean') {
    update['auth.emailVerificationEnabled'] = body.emailVerificationEnabled;
  }
  await Settings.updateOne({ key: 'global' }, { $set: update }, { upsert: true });
  invalidateSettingsCache();
  const fresh = await getSettings(true);
  await logAudit({
    action: 'settings.auth',
    req,
    targetType: 'settings',
    summary: 'Réglages auth mis à jour',
    metadata: { update },
  });
  res.json({ auth: fresh.auth, updatedAt: fresh.updatedAt });
}

/**
 * GET /api/admin/settings/platform — commission + payout minimums.
 * Ces réglages contrôlent le modèle chariow-style : la plateforme retient
 * une commission sur chaque vente en ligne et le vendeur ne peut demander
 * un versement qu'à partir du seuil défini pour sa devise.
 */
export async function getPlatformSettings(_req: AuthRequest, res: Response): Promise<void> {
  const s = await getSettings();
  res.json({
    platform: s.platform || DEFAULT_PLATFORM_SETTINGS,
    defaults: DEFAULT_PLATFORM_SETTINGS,
    updatedAt: s.updatedAt,
  });
}

/**
 * PATCH /api/admin/settings/platform — superadmin only. Merge partiel :
 *   { commissionRate?, payoutMinimums? }
 * commissionRate: 0..1 (0.15 = 15%). Rejette valeurs hors bornes.
 * payoutMinimums: { XOF: 5000, USD: 8, ... } — merge par devise, pas remplacement.
 */
export async function updatePlatformSettings(req: AuthRequest, res: Response): Promise<void> {
  const body = (req.body || {}) as Partial<IPlatformSettings>;
  const update: Record<string, unknown> = { updatedBy: req.user?._id };

  if (typeof body.commissionRate === 'number') {
    if (body.commissionRate < 0 || body.commissionRate > 1) {
      res.status(400).json({ error: 'commissionRate must be between 0 and 1' });
      return;
    }
    update['platform.commissionRate'] = body.commissionRate;
  }

  if (body.payoutMinimums && typeof body.payoutMinimums === 'object') {
    // Merge par devise — on ne remplace pas tout le mapping, on met à jour
    // les devises fournies. Rejette les valeurs négatives.
    const current = await getSettings();
    const merged: Record<string, number> = {
      ...(current.platform?.payoutMinimums || DEFAULT_PLATFORM_SETTINGS.payoutMinimums),
    };
    for (const [cur, val] of Object.entries(body.payoutMinimums)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: `Invalid minimum for ${cur}: must be >= 0` });
        return;
      }
      merged[cur.toUpperCase()] = Math.round(n);
    }
    update['platform.payoutMinimums'] = merged;
  }

  await Settings.updateOne({ key: 'global' }, { $set: update }, { upsert: true });
  invalidateSettingsCache();
  const fresh = await getSettings(true);
  await logAudit({
    action: 'settings.platform',
    req,
    targetType: 'settings',
    summary: 'Réglages plateforme (commission / payouts) mis à jour',
    metadata: { update },
  });
  res.json({ platform: fresh.platform, updatedAt: fresh.updatedAt });
}

/**
 * POST /api/admin/users/:userId/resend-verification — admin renvoie le mail
 * de vérification au nom de l'utilisateur cible. Cas typique : Resend a raté,
 * le seller appelle le support, l'admin clique « Renvoyer » depuis le panel.
 *
 * Réutilise `resendVerification` du service auth (même throttle 1/min).
 */
export async function adminResendVerification(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  try {
    const result = await resendVerification(userId);
    await logAudit({
      action: 'user.resend_verification',
      req,
      targetId: userId,
      targetType: 'user',
      summary: `Renvoi mail de vérification pour user ${userId}`,
    });
    res.json(result);
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string; retryAfter?: number };
    if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
    res.status(e.statusCode || 500).json({
      error: e.message || 'Renvoi échoué.',
      code: e.code,
      retryAfter: e.retryAfter,
    });
  }
}

/** GET /api/admin/activity — platform-wide event feed (cursor-paginated). */
export async function listActivity(req: AuthRequest, res: Response): Promise<void> {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const type = typeof req.query.type === 'string' ? (req.query.type as ActivityType) : undefined;
  const { items, nextCursor } = await listActivities({ limit, cursor, type });
  res.json({ items, nextCursor });
}

/**
 * GET /api/admin/ai-consumption
 *
 * Vue d'ensemble de toute la conso IA de la plateforme sur une plage.
 * Deux sources agrégées :
 *   - `BotUsage` (mensuel, par vendeur) : messages_count + tokens_input/output +
 *     cost_usd RÉEL en dollars pour le chatbot uniquement.
 *   - `Wallet.transactions` avec `kind='ai_generation'` (par débit,
 *     append-only) : couvre TOUTES les features IA (bot, landing, product-
 *     description, images), montant en tokens (négatif = débit).
 *
 * Query params : `?from=YYYY-MM-DD&to=YYYY-MM-DD` (défaut : 30 derniers jours).
 * Réponse : totals plateforme + top consommateurs + série temporelle.
 */
export async function getAiConsumption(req: AuthRequest, res: Response): Promise<void> {
  // Fenêtre par défaut : 30 derniers jours (UTC). Le vendeur admin peut
  // resserrer ou élargir via ?from=&to=.
  const toDate = req.query.to ? new Date(String(req.query.to)) : new Date();
  const fromDate = req.query.from
    ? new Date(String(req.query.from))
    : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Borne haute inclusive : on ajoute 1 jour et on prend `<` dans le match.
  const toExclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
  toExclusive.setUTCHours(0, 0, 0, 0);
  fromDate.setUTCHours(0, 0, 0, 0);

  // Périodes YYYY-MM couvertes par la fenêtre (pour BotUsage).
  const monthsInRange: string[] = [];
  {
    const cur = new Date(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1);
    const end = new Date(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1);
    while (cur <= end) {
      monthsInRange.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`);
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }

  // ── 1) Totals bot uniquement (source la plus précise en USD réel). ──
  const botTotalsAgg = await BotUsage.aggregate([
    { $match: { period: { $in: monthsInRange } } },
    {
      $group: {
        _id: null,
        messages: { $sum: '$messages_count' },
        tokensIn: { $sum: '$tokens_input' },
        tokensOut: { $sum: '$tokens_output' },
        costUsd: { $sum: '$cost_usd' },
        conversations: { $sum: '$conversations_count' },
        ordersCreated: { $sum: '$orders_created' },
      },
    },
  ]);
  const botTotals = botTotalsAgg[0] || {
    messages: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, conversations: 0, ordersCreated: 0,
  };

  // ── 2) Toutes les générations IA (bot + landing + product + images) via
  //       le ledger wallet. Amount = tokens débités (négatif). ─────────
  const walletAgg = await Wallet.aggregate([
    { $unwind: '$transactions' },
    {
      $match: {
        'transactions.kind': 'ai_generation',
        'transactions.createdAt': { $gte: fromDate, $lt: toExclusive },
      },
    },
    {
      $group: {
        _id: null,
        generations: { $sum: 1 },
        tokensDebited: { $sum: { $abs: '$transactions.amount' } },
      },
    },
  ]);
  const walletTotals = walletAgg[0] || { generations: 0, tokensDebited: 0 };

  // ── 3) Top 20 consommateurs (par tokens débités du wallet). Aggregation
  //       lookup user pour récupérer email + name. ────────────────────
  const topUsersAgg = await Wallet.aggregate([
    { $unwind: '$transactions' },
    {
      $match: {
        'transactions.kind': 'ai_generation',
        'transactions.createdAt': { $gte: fromDate, $lt: toExclusive },
      },
    },
    {
      $group: {
        _id: '$userId',
        tokens: { $sum: { $abs: '$transactions.amount' } },
        count: { $sum: 1 },
        lastAt: { $max: '$transactions.createdAt' },
      },
    },
    { $sort: { tokens: -1 } },
    { $limit: 20 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        email: '$user.email',
        name: { $ifNull: ['$user.fullName', '$user.name'] },
        tokens: 1,
        count: 1,
        lastAt: 1,
      },
    },
  ]);

  // ── 4) Série temporelle par jour (wallet transactions). Utile pour un
  //       petit graphique de tendance. ────────────────────────────────
  const timeseriesAgg = await Wallet.aggregate([
    { $unwind: '$transactions' },
    {
      $match: {
        'transactions.kind': 'ai_generation',
        'transactions.createdAt': { $gte: fromDate, $lt: toExclusive },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$transactions.createdAt', timezone: 'UTC' },
        },
        tokens: { $sum: { $abs: '$transactions.amount' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', tokens: 1, count: 1 } },
  ]);

  // ── 5) Répartition par « feature » via un heuristique sur `note`. Le
  //       `kind` transaction est toujours 'ai_generation' — on catégorise
  //       via le texte de la note posée par le service qui débite. ─────
  const byFeatureAgg = await Wallet.aggregate([
    { $unwind: '$transactions' },
    {
      $match: {
        'transactions.kind': 'ai_generation',
        'transactions.createdAt': { $gte: fromDate, $lt: toExclusive },
      },
    },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $regexMatch: { input: { $ifNull: ['$transactions.note', ''] }, regex: /chatbot/i } }, then: 'chatbot' },
              { case: { $regexMatch: { input: { $ifNull: ['$transactions.note', ''] }, regex: /landing/i } }, then: 'landing' },
              { case: { $regexMatch: { input: { $ifNull: ['$transactions.note', ''] }, regex: /product|description/i } }, then: 'product_description' },
              { case: { $regexMatch: { input: { $ifNull: ['$transactions.note', ''] }, regex: /image/i } }, then: 'images' },
            ],
            default: 'other',
          },
        },
        tokens: { $sum: { $abs: '$transactions.amount' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { tokens: -1 } },
    { $project: { _id: 0, feature: '$_id', tokens: 1, count: 1 } },
  ]);

  res.json({
    range: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    // Totaux bot en USD réel (source Anthropic pricing) + tokens débités du
    // wallet (couvre tous les features IA facturés au vendeur).
    totals: {
      bot: {
        messages: botTotals.messages,
        conversations: botTotals.conversations,
        tokensIn: botTotals.tokensIn,
        tokensOut: botTotals.tokensOut,
        costUsd: Number(botTotals.costUsd.toFixed(4)),
        ordersCreated: botTotals.ordersCreated,
      },
      wallet: {
        generations: walletTotals.generations,
        tokensDebited: walletTotals.tokensDebited,
      },
    },
    topUsers: topUsersAgg,
    byFeature: byFeatureAgg,
    timeseries: timeseriesAgg,
  });
}

/**
 * Liste des fournisseurs IA externes utilisés par FlexioPage + statut de
 * configuration (env vars présentes). Ne retourne JAMAIS les valeurs des
 * clés — uniquement un boolean `configured` pour chaque, plus les modèles
 * par défaut qui sont non sensibles.
 *
 * Utilisé par la page /admin/ai-providers pour offrir un dashboard unique
 * de suivi (avec liens vers les consoles Anthropic / OpenAI / OpenRouter /
 * FAL, où le vrai suivi de conso $$$ se fait).
 */
export async function getAiProviders(_req: AuthRequest, res: Response): Promise<void> {
  res.json({
    providers: [
      {
        id: 'anthropic',
        envVar: 'ANTHROPIC_API_KEY',
        configured: !!process.env.ANTHROPIC_API_KEY,
      },
      {
        id: 'openrouter',
        envVar: 'OPENROUTER_API_KEY',
        configured: !!process.env.OPENROUTER_API_KEY,
        primaryModel: process.env.OPENROUTER_MODEL_PRIMARY || null,
        fallbackModel: process.env.OPENROUTER_MODEL_FALLBACK || null,
      },
      {
        id: 'openai',
        envVar: 'OPENAI_API_KEY',
        configured: !!process.env.OPENAI_API_KEY,
      },
      {
        id: 'fal',
        envVar: 'FAL_KEY',
        configured: !!process.env.FAL_KEY,
        llmModel: process.env.FAL_LLM_MODEL || null,
        imageModel: process.env.FAL_IMAGE_MODEL || null,
        avatarModel: process.env.FAL_AVATAR_MODEL || null,
        imagesEnabled: process.env.LANDING_AI_IMAGES_ENABLED !== 'false',
      },
    ],
    checkedAt: new Date().toISOString(),
  });
}
