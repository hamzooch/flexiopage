/**
 * Endpoints admin "quality of life" : audit logs, exports CSV, bulk actions,
 * commission override, reports MRR/GMV, health check. Sépare ces ajouts du
 * gros admin.controller.ts pour limiter le rebasage.
 */
import os from 'os';
import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { Store } from '../models/Store.model';
import { Order } from '../models/Order.model';
import { Wallet } from '../models/Wallet.model';
import { Complaint } from '../models/Complaint.model';
import { Product } from '../models/Product.model';
import { listAudit } from '../services/audit-log.service';
import { logAudit } from '../services/audit-log.service';
import type { AuditAction } from '../models/AuditLog.model';

// ─────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────

/** GET /api/admin/audit?limit=&cursor=&action=&actorId=&targetId= */
export async function listAuditLogs(req: AuthRequest, res: Response): Promise<void> {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const action = typeof req.query.action === 'string' ? (req.query.action as AuditAction) : undefined;
  const actorId = typeof req.query.actorId === 'string' ? req.query.actorId : undefined;
  const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : undefined;
  const { items, nextCursor } = await listAudit({ limit, cursor, action, actorId, targetId });
  res.json({ items, nextCursor });
}

// ─────────────────────────────────────────────────────────────────────
// STAFF DIRECTORY (pour le picker d'assignation des tickets)
// ─────────────────────────────────────────────────────────────────────

/** GET /api/admin/staff — list of admins/superadmins/supervisors assignable to a complaint. */
export async function listStaff(_req: AuthRequest, res: Response): Promise<void> {
  const staff = await User.find({ role: { $in: ['supervisor', 'admin', 'superadmin', 'owner'] } })
    .select('email name role')
    .sort({ name: 1 })
    .lean();
  res.json({ staff });
}

// ─────────────────────────────────────────────────────────────────────
// BULK USER ACTIONS
// ─────────────────────────────────────────────────────────────────────

type BulkUserAction = 'suspend' | 'unsuspend' | 'verify_email';

/**
 * POST /api/admin/users/bulk — body: { userIds: string[], action: BulkUserAction, reason? }
 *
 * Anti-foot-gun : on refuse de toucher au compte de l'admin qui agit, et on
 * refuse les rôles > admin sauf si l'acteur est superadmin/owner.
 */
export async function bulkUserAction(req: AuthRequest, res: Response): Promise<void> {
  const body = (req.body || {}) as { userIds?: unknown; action?: BulkUserAction; reason?: string };
  const ids = Array.isArray(body.userIds) ? body.userIds.filter((x) => typeof x === 'string') : [];
  const action = body.action;
  const reason = (body.reason || '').trim();

  if (!ids.length) { res.status(400).json({ error: 'userIds required' }); return; }
  if (ids.length > 200) { res.status(400).json({ error: 'max 200 users per call' }); return; }
  if (!['suspend', 'unsuspend', 'verify_email'].includes(action as string)) {
    res.status(400).json({ error: 'action invalide' });
    return;
  }

  const targets = await User.find({ _id: { $in: ids } }).select('email role').lean();
  const callerId = req.user?._id?.toString();
  const callerRole = req.user?.role;
  const cleanIds: mongoose.Types.ObjectId[] = [];
  const skipped: { email: string; reason: string }[] = [];

  for (const t of targets) {
    const tid = t._id.toString();
    if (tid === callerId) { skipped.push({ email: t.email, reason: 'toi-même' }); continue; }
    // Seul superadmin+ peut suspendre un admin / superadmin / owner.
    if (
      action !== 'verify_email' &&
      ['admin', 'superadmin', 'owner'].includes(t.role) &&
      callerRole !== 'superadmin' &&
      callerRole !== 'owner'
    ) {
      skipped.push({ email: t.email, reason: `rôle ${t.role} protégé` });
      continue;
    }
    cleanIds.push(t._id);
  }

  if (!cleanIds.length) {
    res.status(400).json({ error: 'Aucun utilisateur ciblable.', skipped });
    return;
  }

  let update: Record<string, unknown> = {};
  if (action === 'suspend') {
    update = { suspended: true, suspendedAt: new Date(), suspendedReason: reason || undefined };
  } else if (action === 'unsuspend') {
    update = { suspended: false, suspendedAt: undefined, suspendedReason: undefined };
  } else if (action === 'verify_email') {
    update = { emailVerified: true };
  }

  const result = await User.updateMany({ _id: { $in: cleanIds } }, { $set: update });
  await logAudit({
    action: 'user.bulk_update',
    req,
    targetType: 'user',
    summary: `Bulk ${action} sur ${cleanIds.length} compte(s)${reason ? ` · ${reason}` : ''}`,
    metadata: { action, count: cleanIds.length, ids: cleanIds.map(String), skipped, reason: reason || undefined },
  });
  res.json({ ok: true, updated: result.modifiedCount, skipped });
}

// ─────────────────────────────────────────────────────────────────────
// COMMISSION OVERRIDE PAR STORE
// ─────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/admin/stores/:storeId/commission — body: { rate?: number|null, cap?: number|null }
 *
 * `rate` est un décimal (0.03 = 3 %). Null pour effacer l'override et revenir
 * à la politique globale. `cap` est le plafond absolu en devise de la store.
 */
export async function setStoreCommission(req: AuthRequest, res: Response): Promise<void> {
  const { storeId } = req.params;
  const body = (req.body || {}) as { rate?: number | null; cap?: number | null };
  const update: Record<string, unknown> = {};
  const unset: Record<string, unknown> = {};

  if (body.rate === null) {
    unset['commission.rate'] = '';
  } else if (typeof body.rate === 'number' && Number.isFinite(body.rate) && body.rate >= 0 && body.rate <= 1) {
    update['commission.rate'] = body.rate;
  } else if (body.rate !== undefined) {
    res.status(400).json({ error: 'rate must be 0..1 or null' });
    return;
  }

  if (body.cap === null) {
    unset['commission.cap'] = '';
  } else if (typeof body.cap === 'number' && Number.isFinite(body.cap) && body.cap >= 0) {
    update['commission.cap'] = body.cap;
  } else if (body.cap !== undefined) {
    res.status(400).json({ error: 'cap must be >= 0 or null' });
    return;
  }

  const mutation: Record<string, unknown> = {};
  if (Object.keys(update).length) mutation.$set = update;
  if (Object.keys(unset).length) mutation.$unset = unset;
  if (!Object.keys(mutation).length) {
    res.status(400).json({ error: 'No commission fields provided' });
    return;
  }

  const store = await Store.findByIdAndUpdate(storeId, mutation, { new: true })
    .select('name slug commission')
    .lean();
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }

  await logAudit({
    action: 'store.commission_override',
    req,
    targetId: storeId,
    targetType: 'store',
    summary: `Commission override · ${store.name}`,
    metadata: { rate: body.rate, cap: body.cap },
  });
  res.json({ store });
}

// ─────────────────────────────────────────────────────────────────────
// REPORTS MRR / GMV
// ─────────────────────────────────────────────────────────────────────

/** GET /api/admin/reports?months=12 — table mensuelle GMV / commande / signups / commission. */
export async function getReports(req: AuthRequest, res: Response): Promise<void> {
  const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 36);
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - (months - 1));
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const fmt = '%Y-%m';
  const [orderAgg, signupAgg, commissionAgg, storeAgg] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { month: { $dateToString: { date: '$createdAt', format: fmt } }, currency: '$currency' },
          orders: { $sum: 1 },
          paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          gmv: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
        },
      },
    ]),
    User.aggregate([
      { $match: { role: 'user', createdAt: { $gte: from } } },
      { $group: { _id: { $dateToString: { date: '$createdAt', format: fmt } }, signups: { $sum: 1 } } },
    ]),
    Wallet.aggregate([
      { $unwind: '$transactions' },
      { $match: { 'transactions.kind': 'commission', 'transactions.createdAt': { $gte: from } } },
      {
        $group: {
          _id: { month: { $dateToString: { date: '$transactions.createdAt', format: fmt } }, currency: '$currency' },
          commission: { $sum: { $multiply: ['$transactions.amount', -1] } },
        },
      },
    ]),
    Store.aggregate([
      { $match: { createdAt: { $gte: from } } },
      { $group: { _id: { $dateToString: { date: '$createdAt', format: fmt } }, stores: { $sum: 1 } } },
    ]),
  ]);

  // Build dense list of months
  const months_keys: string[] = [];
  const cursor = new Date(from);
  while (cursor <= now) {
    months_keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const signupMap = new Map<string, number>(
    signupAgg.map((r: { _id: string; signups: number }) => [r._id, r.signups])
  );
  const storeMap = new Map<string, number>(
    storeAgg.map((r: { _id: string; stores: number }) => [r._id, r.stores])
  );

  const rows = months_keys.map((m) => {
    const orderRows = orderAgg.filter((o: { _id: { month: string } }) => o._id.month === m);
    const commissionRows = commissionAgg.filter((c: { _id: { month: string } }) => c._id.month === m);
    const gmvByCurrency: Record<string, number> = {};
    const ordersByCurrency: Record<string, number> = {};
    for (const r of orderRows) {
      gmvByCurrency[r._id.currency || 'USD'] = (gmvByCurrency[r._id.currency || 'USD'] || 0) + r.gmv;
      ordersByCurrency[r._id.currency || 'USD'] = (ordersByCurrency[r._id.currency || 'USD'] || 0) + r.paid;
    }
    const commissionByCurrency: Record<string, number> = {};
    for (const r of commissionRows) {
      commissionByCurrency[r._id.currency || 'USD'] = (commissionByCurrency[r._id.currency || 'USD'] || 0) + r.commission;
    }
    return {
      month: m,
      signups: signupMap.get(m) || 0,
      newStores: storeMap.get(m) || 0,
      orders: Object.values(ordersByCurrency).reduce((a, b) => a + b, 0),
      gmvByCurrency,
      commissionByCurrency,
    };
  });

  res.json({ months: rows });
}

// ─────────────────────────────────────────────────────────────────────
// CSV EXPORTS
// ─────────────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Strip newlines so each CSV row is one line.
  s = s.replace(/\r?\n|\r/g, ' ');
  if (s.includes(',') || s.includes('"')) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sendCsv(res: Response, filename: string, headers: string[], rows: unknown[][]): void {
  const csv = [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv); // BOM pour Excel
}

/** GET /api/admin/exports/:type — type ∈ users|orders|wallets|complaints|stores */
export async function exportCsv(req: AuthRequest, res: Response): Promise<void> {
  const type = String(req.params.type || '');
  const today = new Date().toISOString().slice(0, 10);

  if (type === 'users') {
    const users = await User.find({})
      .select('email name role emailVerified suspended createdAt lastLoginAt')
      .sort({ createdAt: -1 })
      .limit(50000)
      .lean();
    sendCsv(
      res,
      `users-${today}.csv`,
      ['email', 'name', 'role', 'emailVerified', 'suspended', 'createdAt', 'lastLoginAt'],
      users.map((u) => [u.email, u.name, u.role, u.emailVerified, u.suspended || false, u.createdAt?.toISOString(), u.lastLoginAt?.toISOString() || '']),
    );
    return;
  }

  if (type === 'orders') {
    const orders = await Order.find({})
      .populate('storeId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(50000)
      .lean();
    sendCsv(
      res,
      `orders-${today}.csv`,
      ['orderNumber', 'store', 'customer', 'email', 'total', 'currency', 'paymentStatus', 'fulfillmentStatus', 'country', 'createdAt'],
      orders.map((o) => [
        o.orderNumber,
        (o.storeId as unknown as { name?: string })?.name || '',
        o.customerName,
        o.email,
        o.total,
        o.currency,
        o.paymentStatus,
        o.fulfillmentStatus,
        o.shippingAddress?.country || '',
        o.createdAt?.toISOString(),
      ]),
    );
    return;
  }

  if (type === 'wallets') {
    const wallets = await Wallet.find({})
      .populate('userId', 'email name')
      .sort({ updatedAt: -1 })
      .lean();
    sendCsv(
      res,
      `wallets-${today}.csv`,
      ['email', 'name', 'currency', 'balance', 'aiBalance', 'txCount', 'updatedAt'],
      wallets.map((w) => [
        (w.userId as unknown as { email?: string })?.email || '',
        (w.userId as unknown as { name?: string })?.name || '',
        w.currency,
        w.balance,
        w.aiBalance,
        w.transactions?.length || 0,
        w.updatedAt?.toISOString(),
      ]),
    );
    return;
  }

  if (type === 'complaints') {
    const list = await Complaint.find({})
      .populate('userId', 'email name')
      .populate('assignedTo', 'email name')
      .sort({ createdAt: -1 })
      .limit(20000)
      .lean();
    sendCsv(
      res,
      `complaints-${today}.csv`,
      ['subject', 'user', 'category', 'priority', 'status', 'assignedTo', 'messages', 'createdAt', 'resolvedAt'],
      list.map((c) => [
        c.subject,
        (c.userId as unknown as { email?: string })?.email || '',
        c.category,
        c.priority,
        c.status,
        (c.assignedTo as unknown as { email?: string })?.email || '',
        c.messages?.length || 0,
        c.createdAt?.toISOString(),
        c.resolvedAt?.toISOString() || '',
      ]),
    );
    return;
  }

  if (type === 'stores') {
    const stores = await Store.find({})
      .populate('ownerId', 'email name')
      .sort({ createdAt: -1 })
      .limit(50000)
      .lean();
    sendCsv(
      res,
      `stores-${today}.csv`,
      ['name', 'slug', 'owner', 'storeType', 'currency', 'country', 'isPublished', 'createdAt'],
      stores.map((s) => [
        s.name,
        s.slug,
        (s.ownerId as unknown as { email?: string })?.email || '',
        s.storeType,
        s.settings?.currency || '',
        s.settings?.country || '',
        s.isPublished || false,
        s.createdAt?.toISOString(),
      ]),
    );
    return;
  }

  res.status(400).json({ error: 'type must be one of: users, orders, wallets, complaints, stores' });
}

// ─────────────────────────────────────────────────────────────────────
// DELIVERY CONFIG INSPECTOR (diag MogaDelivery)
// ─────────────────────────────────────────────────────────────────────

function maskSecret(s?: string): string | undefined {
  if (!s) return undefined;
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
}

/**
 * GET /api/admin/stores/:storeId/delivery-config — renvoie la config MD
 * (markets + intégration legacy) avec les secrets masqués. Utile pour
 * diagnostiquer un 401 sans aller en base.
 */
export async function getStoreDeliveryConfig(req: AuthRequest, res: Response): Promise<void> {
  const { storeId } = req.params;
  const store = await Store.findById(storeId).select('name slug markets integrations.delivery settings.country').lean();
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }
  res.json({
    store: { _id: store._id, name: store.name, slug: store.slug, country: store.settings?.country },
    markets: (store.markets || []).map((m) => ({
      country: m.country,
      currency: m.currency,
      isDefault: m.isDefault,
      enabled: m.enabled,
      delivery: m.delivery ? {
        provider: m.delivery.provider,
        enabled: m.delivery.enabled,
        storeIdMD: m.delivery.storeIdMD,
        boutiqueIdMD: m.delivery.boutiqueIdMD,
        baseUrl: m.delivery.baseUrl,
        webhookSecret: maskSecret(m.delivery.webhookSecret),
      } : null,
    })),
    integrations: {
      delivery: store.integrations?.delivery ? {
        provider: store.integrations.delivery.provider,
        enabled: store.integrations.delivery.enabled,
        autoDispatch: store.integrations.delivery.autoDispatch,
        baseUrl: store.integrations.delivery.baseUrl,
        webhookSecret: maskSecret(store.integrations.delivery.webhookSecret),
      } : null,
    },
    env: {
      FLEXIOPAGE_WEBHOOK_SECRET: maskSecret(process.env.FLEXIOPAGE_WEBHOOK_SECRET),
      BOUTSHOP_WEBHOOK_SECRET: maskSecret(process.env.BOUTSHOP_WEBHOOK_SECRET),
      MOGADELIVERY_WEBHOOK_URL: process.env.MOGADELIVERY_WEBHOOK_URL,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// HEALTH & MONITORING
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/health — snapshot santé plateforme :
 *   - état DB (ping + latency)
 *   - clés d'intégrations présentes (Stripe, Resend, Anthropic, Cloudinary…)
 *   - métriques runtime (uptime, mémoire, charge)
 *   - signaux d'alerte (paiements en échec 24h, complaints urgents)
 */
export async function getHealth(_req: AuthRequest, res: Response): Promise<void> {
  const start = Date.now();
  let dbLatency = -1;
  let dbOk = false;
  try {
    await mongoose.connection.db?.admin().ping();
    dbLatency = Date.now() - start;
    dbOk = mongoose.connection.readyState === 1;
  } catch {
    dbOk = false;
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [failedPayments, urgentComplaints, openTickets, recentOrders, totalUsers, totalStores, totalOrders] = await Promise.all([
    Order.countDocuments({ paymentStatus: 'failed', createdAt: { $gte: since24h } }),
    Complaint.countDocuments({ priority: 'urgent', status: { $in: ['open', 'in_progress'] } }),
    Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    Order.countDocuments({ createdAt: { $gte: since24h } }),
    User.estimatedDocumentCount(),
    Store.estimatedDocumentCount(),
    Order.estimatedDocumentCount(),
  ]);

  const integrations = {
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    resend: Boolean(process.env.RESEND_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
    s3: Boolean(process.env.AWS_S3_BUCKET || process.env.S3_BUCKET),
    mogadelivery: Boolean(process.env.MOGADELIVERY_BASE_URL),
    wasender: Boolean(process.env.WASENDER_API_KEY),
    googleSheets: Boolean(process.env.GOOGLE_SHEETS_API_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
  };

  const mem = process.memoryUsage();
  res.json({
    timestamp: new Date().toISOString(),
    db: { ok: dbOk, latencyMs: dbLatency, readyState: mongoose.connection.readyState },
    integrations,
    runtime: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memoryMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      loadAvg: os.loadavg(),
      cpus: os.cpus().length,
    },
    alerts: { failedPayments24h: failedPayments, urgentComplaints, openTickets },
    counters: {
      users: totalUsers,
      stores: totalStores,
      orders: totalOrders,
      newOrders24h: recentOrders,
      products: await Product.estimatedDocumentCount(),
    },
  });
}
