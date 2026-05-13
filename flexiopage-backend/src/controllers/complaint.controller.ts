/**
 * Complaint endpoints — both seller-facing (/api/complaints) and admin-facing
 * (/api/admin/complaints) live here for consolidation. Routing decides which
 * is which.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Complaint, type ComplaintCategory, type ComplaintPriority, type ComplaintStatus } from '../models/Complaint.model';

const VALID_STATUS: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_CATEGORY: ComplaintCategory[] = ['order', 'payment', 'wallet', 'account', 'delivery', 'other'];
const VALID_PRIORITY: ComplaintPriority[] = ['low', 'normal', 'high', 'urgent'];

// ─────────────────────────────────────────────────────────────────────
// SELLER endpoints
// ─────────────────────────────────────────────────────────────────────

/** POST /api/complaints — body: { subject, category?, message, orderId?, storeId? } */
export async function createComplaint(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const body = (req.body || {}) as {
    subject?: string;
    category?: ComplaintCategory;
    message?: string;
    orderId?: string;
    storeId?: string;
  };
  if (!body.subject?.trim() || !body.message?.trim()) {
    res.status(400).json({ error: 'subject and message required' });
    return;
  }
  const category: ComplaintCategory = VALID_CATEGORY.includes(body.category!) ? body.category! : 'other';
  const c = await Complaint.create({
    userId: req.user._id,
    subject: body.subject.trim(),
    category,
    priority: 'normal',
    status: 'open',
    orderId: body.orderId || undefined,
    storeId: body.storeId || undefined,
    messages: [
      {
        authorId: req.user._id,
        authorName: req.user.name,
        authorRole: req.user.role,
        body: body.message.trim(),
        createdAt: new Date(),
      },
    ],
  });
  res.status(201).json({ complaint: c });
}

/** GET /api/complaints — list complaints opened by the authenticated seller. */
export async function listMyComplaints(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const list = await Complaint.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ complaints: list });
}

/** GET /api/complaints/:id — fetch own complaint detail. */
export async function getMyComplaint(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const c = await Complaint.findOne({ _id: req.params.id, userId: req.user._id }).lean();
  if (!c) { res.status(404).json({ error: 'Complaint not found' }); return; }
  res.json({ complaint: c });
}

/** POST /api/complaints/:id/messages — seller adds a reply to their thread. */
export async function postMyMessage(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const body = ((req.body || {}) as { message?: string }).message?.trim();
  if (!body) { res.status(400).json({ error: 'message required' }); return; }
  const c = await Complaint.findOne({ _id: req.params.id, userId: req.user._id });
  if (!c) { res.status(404).json({ error: 'Complaint not found' }); return; }
  if (c.status === 'closed') {
    res.status(400).json({ error: 'Complaint is closed; ouvre une nouvelle réclamation.' });
    return;
  }
  c.messages.push({
    authorId: req.user._id,
    authorName: req.user.name,
    authorRole: req.user.role,
    body,
    createdAt: new Date(),
  });
  // If admin had marked it resolved and the seller follows up, reopen it.
  if (c.status === 'resolved') c.status = 'in_progress';
  await c.save();
  res.json({ complaint: c });
}

// ─────────────────────────────────────────────────────────────────────
// ADMIN endpoints
// ─────────────────────────────────────────────────────────────────────

/** GET /api/admin/complaints?status=&category=&search= */
export async function listComplaintsAdmin(req: AuthRequest, res: Response): Promise<void> {
  const filter: Record<string, unknown> = {};
  const status = String(req.query.status || '');
  if (VALID_STATUS.includes(status as ComplaintStatus)) filter.status = status;
  const category = String(req.query.category || '');
  if (VALID_CATEGORY.includes(category as ComplaintCategory)) filter.category = category;
  const search = String(req.query.search || '').trim();
  if (search) filter.subject = { $regex: search, $options: 'i' };

  const complaints = await Complaint.find(filter)
    .populate('userId', 'email name')
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
  const counts = await Complaint.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  res.json({
    complaints,
    counts: counts.reduce((acc: Record<string, number>, c: { _id: string; n: number }) => {
      acc[c._id] = c.n;
      return acc;
    }, {}),
  });
}

/** GET /api/admin/complaints/:id */
export async function getComplaintAdmin(req: AuthRequest, res: Response): Promise<void> {
  const c = await Complaint.findById(req.params.id)
    .populate('userId', 'email name')
    .populate('assignedTo', 'email name')
    .lean();
  if (!c) { res.status(404).json({ error: 'Complaint not found' }); return; }
  res.json({ complaint: c });
}

/** PATCH /api/admin/complaints/:id — body: { status?, priority?, assignedTo? } */
export async function patchComplaintAdmin(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const body = (req.body || {}) as {
    status?: ComplaintStatus;
    priority?: ComplaintPriority;
    assignedTo?: string | null;
  };
  const updates: Record<string, unknown> = {};
  if (body.status && VALID_STATUS.includes(body.status)) {
    updates.status = body.status;
    if (body.status === 'resolved') updates.resolvedAt = new Date();
    if (body.status === 'closed') updates.closedAt = new Date();
    // When picking up a ticket, default-assign to the acting admin if none.
    if (body.status === 'in_progress') updates.assignedTo = req.user._id;
  }
  if (body.priority && VALID_PRIORITY.includes(body.priority)) updates.priority = body.priority;
  if (body.assignedTo !== undefined) {
    updates.assignedTo = body.assignedTo || undefined;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No changes' });
    return;
  }
  const c = await Complaint.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true })
    .populate('userId', 'email name')
    .populate('assignedTo', 'email name')
    .lean();
  if (!c) { res.status(404).json({ error: 'Complaint not found' }); return; }
  res.json({ complaint: c });
}

/** POST /api/admin/complaints/:id/messages — admin reply. */
export async function postAdminMessage(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const body = ((req.body || {}) as { message?: string }).message?.trim();
  if (!body) { res.status(400).json({ error: 'message required' }); return; }
  const c = await Complaint.findById(req.params.id);
  if (!c) { res.status(404).json({ error: 'Complaint not found' }); return; }
  c.messages.push({
    authorId: req.user._id,
    authorName: req.user.name,
    authorRole: req.user.role,
    body,
    createdAt: new Date(),
  });
  // Replying picks up the ticket if it was still open.
  if (c.status === 'open') c.status = 'in_progress';
  if (!c.assignedTo) c.assignedTo = req.user._id;
  await c.save();
  res.json({ complaint: c });
}
