/**
 * Admin controllers for the payout queue. Owners see all pending seller
 * payout requests, mark them paid once the money is transferred out-of-band,
 * or reject them (which refunds the frozen amount to the seller's wallet).
 */
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import { Payout } from '../models/Payout.model';
import { Wallet } from '../models/Wallet.model';
import { User } from '../models/User.model';

/** GET /api/admin/payouts — list payout requests. */
export async function listPayouts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, limit = 50, skip = 0 } = req.query;
    const query: Record<string, unknown> = {};
    if (status && typeof status === 'string') query.status = status;

    const payouts = await Payout.find(query)
      .sort({ requestedAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    // Attach user (name + email) so admin can identify sellers at a glance.
    const userIds = Array.from(new Set(payouts.map((p) => p.userId?.toString()).filter(Boolean)));
    const users = await User.find({ _id: { $in: userIds } }).select('name email').lean();
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    const items = payouts.map((p) => ({
      ...p,
      user: p.userId ? userById.get(p.userId.toString()) : undefined,
    }));

    res.json({ payouts: items });
  } catch (err) {
    console.error('[payouts-admin] listPayouts error:', err);
    res.status(500).json({ error: 'Failed to load payouts' });
  }
}

/**
 * PATCH /api/admin/payouts/:id — update a payout status.
 *   - status='paid'      → mark as paid, record wallet transaction
 *   - status='rejected'  → refund the frozen amount to the seller's wallet
 */
export async function updatePayout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, adminNote, externalRef } = (req.body || {}) as {
      status?: 'paid' | 'rejected';
      adminNote?: string;
      externalRef?: string;
    };
    if (!status || !['paid', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'status must be paid or rejected' });
      return;
    }

    const payout = await Payout.findById(id);
    if (!payout) {
      res.status(404).json({ error: 'Payout not found' });
      return;
    }
    if (payout.status !== 'pending') {
      res.status(400).json({ error: `Payout already ${payout.status}` });
      return;
    }

    const wallet = await Wallet.findOne({ userId: payout.userId });
    if (!wallet) {
      res.status(404).json({ error: 'Seller wallet not found' });
      return;
    }

    if (status === 'paid') {
      // The amount was already deducted at request time; log an audit entry.
      wallet.transactions.push({
        id: randomUUID(),
        kind: 'payout_debit',
        bucket: 'payout',
        amount: -payout.amount,
        balanceAfter: wallet.payoutBalance || 0,
        note: `Payout ${payout.method} · ${externalRef || 'no-ref'}${adminNote ? ' · ' + adminNote : ''}`,
        createdAt: new Date(),
      });
      await wallet.save();
      payout.status = 'paid';
    } else {
      // Refund the frozen amount back to payoutBalance.
      wallet.payoutBalance = (wallet.payoutBalance || 0) + payout.amount;
      await wallet.save();
      payout.status = 'rejected';
    }

    payout.processedBy = req.user?._id;
    payout.processedAt = new Date();
    if (adminNote) payout.adminNote = adminNote;
    if (externalRef) payout.externalRef = externalRef;
    await payout.save();

    res.json({ ok: true, payout });
  } catch (err) {
    console.error('[payouts-admin] updatePayout error:', err);
    res.status(500).json({ error: 'Failed to update payout' });
  }
}

/** GET /api/admin/payouts/stats — quick summary for the badge/overview. */
export async function getPayoutStats(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [pending, paid30d] = await Promise.all([
      Payout.find({ status: 'pending' }).lean(),
      Payout.find({
        status: 'paid',
        processedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }).lean(),
    ]);

    const pendingByCur = new Map<string, number>();
    for (const p of pending) pendingByCur.set(p.currency, (pendingByCur.get(p.currency) || 0) + p.amount);
    const paidByCur = new Map<string, number>();
    for (const p of paid30d) paidByCur.set(p.currency, (paidByCur.get(p.currency) || 0) + p.amount);

    res.json({
      pendingCount: pending.length,
      paid30dCount: paid30d.length,
      pendingByCurrency: Array.from(pendingByCur.entries()).map(([currency, amount]) => ({ currency, amount })),
      paid30dByCurrency: Array.from(paidByCur.entries()).map(([currency, amount]) => ({ currency, amount })),
    });
  } catch (err) {
    console.error('[payouts-admin] getPayoutStats error:', err);
    res.status(500).json({ error: 'Failed to load payout stats' });
  }
}
