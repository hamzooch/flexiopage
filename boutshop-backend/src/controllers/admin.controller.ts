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
import { Complaint } from '../models/Complaint.model';
import { credit, debit } from '../services/wallet.service';

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
    const c = o.currency || 'XOF';
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

/** GET /api/admin/users?search=&limit= */
export async function listUsers(req: AuthRequest, res: Response): Promise<void> {
  const search = String(req.query.search || '').trim();
  const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 200);
  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
    ];
  }
  const users = await User.find(filter)
    .select('email name role emailVerified createdAt')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

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
    total: await User.countDocuments(filter),
  });
}

/** GET /api/admin/stores */
export async function listStores(req: AuthRequest, res: Response): Promise<void> {
  const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 200);
  const stores = await Store.find()
    .populate('ownerId', 'email name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  res.json({ stores, total: await Store.countDocuments() });
}

/** GET /api/admin/orders */
export async function listOrders(req: AuthRequest, res: Response): Promise<void> {
  const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 200);
  const orders = await Order.find()
    .populate('storeId', 'name slug')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  res.json({ orders, total: await Order.countDocuments() });
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

/** POST /api/admin/wallets/:userId/adjust — body: { amount, bucket?, reason } */
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
  const u = await User.findByIdAndUpdate(userId, { $set: { role } }, { new: true })
    .select('email name role')
    .lean();
  if (!u) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
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
  const result = await credit({
    userId,
    amount: value,
    bucket,
    kind: bucket === 'ai' ? 'top_up_ai' : 'top_up',
    paymentReference: paymentReference?.trim() || undefined,
    note: note?.trim() || `[admin] Recharge ${bucket === 'ai' ? 'IA' : 'principal'}`,
  });
  res.json({
    ok: true,
    bucket,
    alreadyApplied: result.alreadyApplied,
    balance: result.wallet.balance,
    aiBalance: result.wallet.aiBalance,
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
    .select('email name role avatar emailVerified suspended suspendedReason suspendedAt lastLoginAt lastLoginIp passwordResetAt createdAt updatedAt')
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
