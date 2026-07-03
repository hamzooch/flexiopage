/**
 * Endpoints admin "quality of life" : audit logs, exports CSV, bulk actions,
 * commission override, reports MRR/GMV, health check. Sépare ces ajouts du
 * gros admin.controller.ts pour limiter le rebasage.
 */
import os from 'os';
import crypto from 'crypto';
import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User.model';
import { Store } from '../models/Store.model';
import { Order } from '../models/Order.model';
import { Wallet } from '../models/Wallet.model';
import { Complaint } from '../models/Complaint.model';
import { Product } from '../models/Product.model';
import { WebhookLog } from '../models/WebhookLog.model';
import { BotConfig } from '../modules/messenger-bot/models/BotConfig.model';
import { dispatchOrder } from '../services/delivery.service';
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
 * PATCH /api/admin/stores/:storeId/delivery-config — body :
 *   { webhookSecret?: string|null, baseUrl?: string|null, enabled?: boolean }
 *
 * Permet à un admin de fixer/corriger le secret HMAC MD d'une boutique sans
 * passer par le compte seller. `null` efface le champ.
 */
export async function patchStoreDeliveryConfig(req: AuthRequest, res: Response): Promise<void> {
  const { storeId } = req.params;
  const body = (req.body || {}) as {
    webhookSecret?: string | null;
    baseUrl?: string | null;
    enabled?: boolean;
  };
  const set: Record<string, unknown> = {};
  const unset: Record<string, unknown> = {};

  if (body.webhookSecret !== undefined) {
    if (body.webhookSecret === null || body.webhookSecret === '') {
      unset['integrations.delivery.webhookSecret'] = '';
    } else if (typeof body.webhookSecret === 'string' && body.webhookSecret.trim().length >= 8) {
      set['integrations.delivery.webhookSecret'] = body.webhookSecret.trim();
    } else {
      res.status(400).json({ error: 'webhookSecret must be at least 8 chars or null to clear' });
      return;
    }
  }
  if (body.baseUrl !== undefined) {
    if (body.baseUrl === null || body.baseUrl === '') {
      unset['integrations.delivery.baseUrl'] = '';
    } else if (typeof body.baseUrl === 'string' && /^https?:\/\//.test(body.baseUrl)) {
      set['integrations.delivery.baseUrl'] = body.baseUrl.trim();
    } else {
      res.status(400).json({ error: 'baseUrl must be a http(s) URL or null to clear' });
      return;
    }
  }
  if (typeof body.enabled === 'boolean') {
    set['integrations.delivery.enabled'] = body.enabled;
    // Quand on active, par défaut le provider est mogadelivery — sinon les
    // checks downstream (`provider === 'mogadelivery'`) cassent.
    set['integrations.delivery.provider'] = 'mogadelivery';
  }

  const mutation: Record<string, unknown> = {};
  if (Object.keys(set).length) mutation.$set = set;
  if (Object.keys(unset).length) mutation.$unset = unset;
  if (!Object.keys(mutation).length) {
    res.status(400).json({ error: 'No delivery fields provided' });
    return;
  }

  const store = await Store.findByIdAndUpdate(storeId, mutation, { new: true })
    .select('name slug integrations.delivery')
    .lean();
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }

  await logAudit({
    action: 'store.delivery_config',
    req,
    targetId: storeId,
    targetType: 'store',
    summary: `Config delivery mise à jour pour ${store.name}`,
    metadata: {
      fields: Object.keys(body),
      enabled: body.enabled,
      hasSecret: typeof body.webhookSecret === 'string' && body.webhookSecret.length > 0,
      baseUrl: body.baseUrl,
    },
  });

  res.json({
    ok: true,
    store: {
      _id: store._id,
      name: store.name,
      slug: store.slug,
      delivery: store.integrations?.delivery ? {
        provider: store.integrations.delivery.provider,
        enabled: store.integrations.delivery.enabled,
        baseUrl: store.integrations.delivery.baseUrl,
        webhookSecret: store.integrations.delivery.webhookSecret
          ? maskSecret(store.integrations.delivery.webhookSecret)
          : undefined,
      } : null,
    },
  });
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
// DELIVERY OVERVIEW / WEBHOOK LOGS / TROUBLESHOOTING (cross-store)
// ─────────────────────────────────────────────────────────────────────

/**
 * Calcule un verdict de config delivery (OK/warn/KO) pour une boutique, en
 * miroir de la logique de dispatch (market prioritaire, sinon legacy mono-pays).
 */
function deliveryVerdict(store: {
  markets?: Array<{ country?: string; delivery?: { provider?: string; enabled?: boolean; storeIdMD?: string; webhookSecret?: string } }>;
  integrations?: { delivery?: { enabled?: boolean; webhookSecret?: string } };
}): { kind: 'ok' | 'warn' | 'ko' | 'off'; reason: string; source: 'market' | 'legacy' | 'none'; connected: boolean } {
  const marketsMD = (store.markets || []).filter((m) => m.delivery?.provider === 'mogadelivery' && m.delivery?.enabled !== false);
  const marketReady = marketsMD.filter((m) => m.delivery?.storeIdMD && m.delivery?.webhookSecret);
  const legacy = store.integrations?.delivery;
  const hasCreds = marketReady.length > 0 || !!legacy?.webhookSecret;
  // Master switch : c'est `integrations.delivery.enabled` que dispatchOrder
  // teste pour autoriser un envoi (mono comme multi-pays).
  const connected = !!legacy?.enabled;
  const source: 'market' | 'legacy' | 'none' = marketReady.length ? 'market' : (legacy?.webhookSecret ? 'legacy' : 'none');

  // Misconfig hard (toujours signalée, même déconnectée).
  if (marketsMD.length && !marketReady.length) {
    return { kind: 'ko', reason: 'Marché MD activé mais storeIdMD ou webhookSecret manquant', source: 'market', connected };
  }
  if (!hasCreds) {
    return { kind: 'ko', reason: 'Aucune config MD (ni market, ni integration)', source: 'none', connected };
  }
  // Déconnexion douce : identifiants présents mais master switch coupé.
  if (!connected) {
    return { kind: 'off', reason: 'Déconnecté — identifiants conservés, réactivable en 1 clic', source, connected };
  }
  // Connecté.
  if (!marketReady.length && legacy && !legacy.webhookSecret) {
    return { kind: 'ko', reason: 'Integration activée mais webhookSecret vide → 401 garanti', source: 'legacy', connected };
  }
  if (marketReady.length) {
    return { kind: 'ok', reason: `${marketReady.length} marché(s) MD prêt(s)`, source: 'market', connected };
  }
  return { kind: 'warn', reason: 'Legacy mono-pays — ObjectId Mongo envoyé comme store_id', source: 'legacy', connected };
}

/**
 * GET /api/admin/delivery/overview — toutes les boutiques avec une config
 * delivery, leur verdict (OK/warn/KO) et les stats de dispatch des 7 derniers
 * jours. Les boutiques en problème remontent en premier.
 */
export async function getDeliveryOverview(_req: AuthRequest, res: Response): Promise<void> {
  const stores = await Store.find({
    $or: [
      { 'markets.delivery.provider': 'mogadelivery' },
      { 'integrations.delivery.enabled': true },
      { 'integrations.delivery.provider': 'mogadelivery' },
    ],
  }).select('name slug markets integrations.delivery settings.country').lean();

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stats = await WebhookLog.aggregate([
    { $match: { direction: 'outbound', createdAt: { $gte: since } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$storeId',
        total: { $sum: 1 },
        errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        lastAt: { $first: '$createdAt' },
        lastStatus: { $first: '$status' },
        lastHttp: { $first: '$httpStatus' },
        lastError: { $first: '$error' },
      },
    },
  ]);
  const statById = new Map(stats.map((s) => [String(s._id), s]));

  const rows = stores.map((store) => {
    const verdict = deliveryVerdict(store);
    const st = statById.get(String(store._id));
    return {
      storeId: String(store._id),
      name: store.name,
      slug: store.slug,
      country: store.settings?.country,
      ...verdict,
      marketsCount: (store.markets || []).length,
      legacyEnabled: !!store.integrations?.delivery?.enabled,
      legacyHasSecret: !!store.integrations?.delivery?.webhookSecret,
      dispatch7d: st
        ? { total: st.total, errors: st.errors, lastAt: st.lastAt, lastStatus: st.lastStatus, lastHttp: st.lastHttp, lastError: st.lastError }
        : null,
    };
  });
  const rank: Record<string, number> = { ko: 0, warn: 1, ok: 2, off: 3 };
  rows.sort((a, b) => (rank[a.kind] - rank[b.kind]) || ((b.dispatch7d?.errors || 0) - (a.dispatch7d?.errors || 0)));

  res.json({ stores: rows, generatedAt: new Date().toISOString() });
}

/**
 * GET /api/admin/delivery/logs?storeId=&direction=&status=&limit=&cursor=
 * Journal des échanges webhook (sortants + entrants), pagination par cursor
 * (createdAt décroissant). Aucun secret n'est stocké dans ce journal.
 */
export async function getWebhookLogs(req: AuthRequest, res: Response): Promise<void> {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.storeId === 'string' && mongoose.isValidObjectId(req.query.storeId)) filter.storeId = req.query.storeId;
  if (req.query.direction === 'inbound' || req.query.direction === 'outbound') filter.direction = req.query.direction;
  if (req.query.status === 'success' || req.query.status === 'error') filter.status = req.query.status;
  if (typeof req.query.cursor === 'string' && req.query.cursor) {
    const d = new Date(req.query.cursor);
    if (!Number.isNaN(d.getTime())) filter.createdAt = { $lt: d };
  }

  const docs = await WebhookLog.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  const storeIds = [...new Set(page.map((i) => i.storeId).filter(Boolean).map(String))];
  const stores = storeIds.length ? await Store.find({ _id: { $in: storeIds } }).select('name slug').lean() : [];
  const nameById = new Map(stores.map((s) => [String(s._id), s.name]));

  res.json({
    items: page.map((i) => ({
      _id: String(i._id),
      storeId: i.storeId ? String(i.storeId) : undefined,
      storeName: i.storeId ? nameById.get(String(i.storeId)) : undefined,
      orderNumber: i.orderNumber,
      direction: i.direction,
      event: i.event,
      status: i.status,
      httpStatus: i.httpStatus,
      storeIdSent: i.storeIdSent,
      secretSource: i.secretSource,
      signatureValid: i.signatureValid,
      error: i.error,
      requestBody: i.requestBody,
      responseBody: i.responseBody,
      createdAt: i.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
  });
}

/**
 * Empreinte SHA-256 de la VRAIE clé HMAC (32 octets décodés si secret 64-hex,
 * sinon octets UTF-8). Permet de comparer le secret avec MD sans l'exposer —
 * c'est l'outil qui tranche un 401 « secret désynchronisé ».
 */
function secretFingerprint(secret?: string): { isHex64: boolean; len: number; preview: string; fingerprint: string } | null {
  if (!secret) return null;
  const isHex64 = /^[a-f0-9]{64}$/i.test(secret);
  const key = isHex64 ? Buffer.from(secret.toLowerCase(), 'hex') : Buffer.from(secret, 'utf8');
  return {
    isHex64,
    len: secret.length,
    preview: maskSecret(secret) as string,
    fingerprint: crypto.createHash('sha256').update(key).digest('hex'),
  };
}

/**
 * GET /api/admin/stores/:storeId/delivery/fingerprint — empreintes des secrets
 * (markets + legacy + env) pour comparer avec MD sans révéler la clé.
 */
export async function getStoreDeliveryFingerprint(req: AuthRequest, res: Response): Promise<void> {
  const { storeId } = req.params;
  const store = await Store.findById(storeId).select('name markets integrations.delivery').lean();
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }

  const sources: Array<{ source: string; country?: string; isHex64: boolean; len: number; preview: string; fingerprint: string }> = [];
  for (const m of store.markets || []) {
    const fp = secretFingerprint(m.delivery?.webhookSecret);
    if (fp) sources.push({ source: 'market', country: m.country, ...fp });
  }
  const legacyFp = secretFingerprint(store.integrations?.delivery?.webhookSecret);
  if (legacyFp) sources.push({ source: 'legacy', ...legacyFp });
  const envFp = secretFingerprint(process.env.FLEXIOPAGE_WEBHOOK_SECRET);
  if (envFp) sources.push({ source: 'env:FLEXIOPAGE_WEBHOOK_SECRET', ...envFp });

  res.json({
    store: { _id: String(store._id), name: store.name },
    algo: 'sha256(clé HMAC) — clé = Buffer.from(secret,"hex") si 64-hex, sinon utf8',
    sources,
  });
}

/**
 * POST /api/admin/stores/:storeId/orders/:orderId/redispatch — relance un
 * dispatch (efface le marqueur d'idempotence puis ré-appelle dispatchOrder).
 */
export async function redispatchOrder(req: AuthRequest, res: Response): Promise<void> {
  const { storeId, orderId } = req.params;
  if (!mongoose.isValidObjectId(orderId)) { res.status(400).json({ error: 'Invalid orderId' }); return; }
  const order = await Order.findById(orderId);
  if (!order || String(order.storeId) !== String(storeId)) { res.status(404).json({ error: 'Order not found for this store' }); return; }
  const store = await Store.findById(storeId);
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }

  // Efface le marqueur d'idempotence pour forcer une nouvelle tentative.
  if (order.delivery) {
    order.delivery.externalId = undefined as unknown as string;
    order.delivery.error = undefined as unknown as string;
  }
  const result = await dispatchOrder({ order, store });

  await logAudit({
    action: 'store.delivery_redispatch',
    req,
    targetId: storeId,
    targetType: 'store',
    summary: `Redispatch ${order.orderNumber} → ${result.ok ? 'OK' : 'échec'}`,
    metadata: { orderId, orderNumber: order.orderNumber, ok: result.ok, error: result.error },
  });

  res.json({ ok: result.ok, alreadyDispatched: result.alreadyDispatched, error: result.error, result: result.result });
}

// ─────────────────────────────────────────────────────────────────────
// STORE LIMITS — comptes autorisés à dépasser la limite par défaut
// ─────────────────────────────────────────────────────────────────────

function defaultStoreLimit(): number {
  return Number(process.env.STORE_LIMIT_PER_USER) || 4;
}

/**
 * GET /api/admin/store-limits — liste les comptes avec un override de limite
 * de boutiques (storeLimit posé), + leur nombre de boutiques actuel et la
 * limite globale par défaut.
 */
export async function getStoreLimits(_req: AuthRequest, res: Response): Promise<void> {
  const users = await User.find({ storeLimit: { $exists: true, $ne: null } })
    .select('email name role storeLimit')
    .sort({ updatedAt: -1 })
    .lean();

  const ids = users.map((u) => u._id);
  const counts = ids.length
    ? await Store.aggregate([
        { $match: { ownerId: { $in: ids } } },
        { $group: { _id: '$ownerId', n: { $sum: 1 } } },
      ])
    : [];
  const countById = new Map(counts.map((c) => [String(c._id), c.n as number]));

  res.json({
    defaultLimit: defaultStoreLimit(),
    users: users.map((u) => ({
      _id: String(u._id),
      email: u.email,
      name: u.name,
      role: u.role,
      storeLimit: u.storeLimit,
      currentStores: countById.get(String(u._id)) || 0,
    })),
  });
}

/**
 * PATCH /api/admin/users/:userId/store-limit — body { storeLimit: number|null }.
 * `null` (ou vide) réinitialise au défaut global. Sinon entier 0–1000.
 */
export async function setUserStoreLimit(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) { res.status(400).json({ error: 'Invalid userId' }); return; }

  const raw = (req.body || {}).storeLimit;
  let storeLimit: number | null;
  if (raw === null || raw === undefined || raw === '') {
    storeLimit = null;
  } else {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      res.status(400).json({ error: 'storeLimit doit être un entier 0–1000, ou null pour réinitialiser au défaut.' });
      return;
    }
    storeLimit = n;
  }

  const mutation = storeLimit === null ? { $unset: { storeLimit: '' } } : { $set: { storeLimit } };
  const user = await User.findByIdAndUpdate(userId, mutation, { new: true }).select('email name role storeLimit').lean();
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  await logAudit({
    action: 'user.update',
    req,
    targetId: userId,
    targetType: 'user',
    summary: `Limite boutiques ${storeLimit === null ? 'réinitialisée (défaut)' : `→ ${storeLimit}`} pour ${user.email}`,
    metadata: { storeLimit },
  });

  const currentStores = await Store.countDocuments({ ownerId: userId });
  res.json({
    ok: true,
    user: {
      _id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      storeLimit: user.storeLimit ?? null,
      currentStores,
    },
  });
}

/**
 * GET /api/admin/stores/:storeId/bot-limits — limites de messages du/des bot(s)
 * de la boutique (un doc par canal Messenger/WhatsApp).
 */
export async function getStoreBotLimits(req: AuthRequest, res: Response): Promise<void> {
  const { storeId } = req.params;
  if (!mongoose.isValidObjectId(storeId)) { res.status(400).json({ error: 'Invalid storeId' }); return; }
  const bots = await BotConfig.find({ vendor_id: storeId })
    .select('channel messages_limit messages_limit_max conversations_limit')
    .lean();
  res.json({
    bots: bots.map((b) => ({
      channel: b.channel,
      messages_limit: b.messages_limit ?? null,
      messages_limit_max: b.messages_limit_max ?? null,
    })),
  });
}

/**
 * PATCH /api/admin/stores/:storeId/bot-limits — body {
 *   messages_limit_max: number,   // plafond (obligatoire), entier 0–1_000_000
 *   messages_limit?: number,      // optionnel : force aussi la limite courante
 *   channel?: 'messenger'|'whatsapp'  // optionnel : cible un seul canal
 * }
 * Applique le plafond admin ; la limite courante de l'owner est re-bornée au
 * nouveau plafond. Sans `channel`, s'applique à tous les bots de la boutique.
 */
export async function setStoreBotLimits(req: AuthRequest, res: Response): Promise<void> {
  const { storeId } = req.params;
  if (!mongoose.isValidObjectId(storeId)) { res.status(400).json({ error: 'Invalid storeId' }); return; }

  const body = (req.body || {}) as { messages_limit_max?: unknown; messages_limit?: unknown; channel?: unknown };
  const cap = Number(body.messages_limit_max);
  if (!Number.isInteger(cap) || cap < 0 || cap > 1_000_000) {
    res.status(400).json({ error: 'messages_limit_max doit être un entier 0–1 000 000.' });
    return;
  }
  let forcedLimit: number | undefined;
  if (body.messages_limit !== undefined && body.messages_limit !== null && body.messages_limit !== '') {
    const n = Number(body.messages_limit);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      res.status(400).json({ error: 'messages_limit doit être un entier 0–1 000 000.' });
      return;
    }
    forcedLimit = Math.min(n, cap);
  }
  const filter: Record<string, unknown> = { vendor_id: storeId };
  if (body.channel === 'messenger' || body.channel === 'whatsapp') filter.channel = body.channel;

  const bots = await BotConfig.find(filter).select('channel messages_limit messages_limit_max');
  if (!bots.length) { res.status(404).json({ error: 'Aucun bot pour cette boutique.' }); return; }

  for (const b of bots) {
    b.messages_limit_max = cap;
    // Limite courante : soit forcée par l'admin, soit re-bornée au plafond.
    b.messages_limit = forcedLimit !== undefined ? forcedLimit : Math.min(b.messages_limit ?? cap, cap);
    await b.save();
  }

  await logAudit({
    action: 'store.bot_limit',
    req,
    targetId: storeId,
    targetType: 'store',
    summary: `Plafond messages bot → ${cap}${forcedLimit !== undefined ? ` (limite forcée ${forcedLimit})` : ''} (${body.channel || 'tous canaux'})`,
    metadata: { messages_limit_max: cap, messages_limit: forcedLimit ?? null, channel: body.channel || 'all' },
  });

  res.json({
    ok: true,
    bots: bots.map((b) => ({ channel: b.channel, messages_limit: b.messages_limit, messages_limit_max: b.messages_limit_max })),
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
