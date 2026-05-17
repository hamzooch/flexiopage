import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { CalculatorSnapshot } from '../models/CalculatorSnapshot.model';
import { calculate, sanitizeInputs } from '../services/cod-calculator.service';

/** GET /api/calculator/history — list this user's saved scenarios, newest first. */
export async function listHistory(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const snapshots = await CalculatorSnapshot.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ snapshots });
}

/** POST /api/calculator/save — persist a named scenario. Outputs are recomputed
 * server-side from the sanitized inputs so the client can't fudge them. */
export async function saveSnapshot(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const body = req.body as { name?: string; country?: string; inputs?: unknown };
  const name = (body.name || '').trim();
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  if (!body.inputs || typeof body.inputs !== 'object') {
    res.status(400).json({ error: 'inputs required' }); return;
  }
  const inputs = sanitizeInputs(body.inputs as Record<string, unknown>);
  const outputs = calculate(inputs);
  const snapshot = await CalculatorSnapshot.create({
    userId: req.user.id,
    name: name.slice(0, 120),
    country: body.country?.toString().toUpperCase().slice(0, 4) || undefined,
    inputs,
    outputs,
  });
  res.status(201).json({ snapshot });
}

/** DELETE /api/calculator/:id — remove a scenario the caller owns. */
export async function deleteSnapshot(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'invalid id' }); return;
  }
  const result = await CalculatorSnapshot.deleteOne({ _id: id, userId: req.user.id });
  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'not found' }); return;
  }
  res.json({ ok: true });
}
