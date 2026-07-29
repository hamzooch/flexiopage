/**
 * Announcements CRUD — visible under /api/admin/announcements.
 * Send flow is delegated to announcement.service; controller stays thin.
 */
import { Request, Response } from 'express';
import { Announcement, type AnnouncementAudience, type AnnouncementStatus } from '../models/Announcement.model';
import { resolveAudience, sendAnnouncement } from '../services/announcement.service';
import type { AuthRequest } from '../middleware/auth.middleware';

const VALID_AUDIENCE: AnnouncementAudience[] = ['all', 'sellers', 'active', 'staff', 'verified'];

interface CreateBody {
  title?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  audience?: AnnouncementAudience;
  scheduledAt?: string; // ISO
  action?: 'draft' | 'schedule' | 'send_now';
}

/** GET /api/admin/announcements — list all, most recent first. */
export async function listAnnouncements(req: Request, res: Response): Promise<void> {
  try {
    const status = String(req.query.status || '') as AnnouncementStatus | '';
    const filter: Record<string, unknown> = {};
    if (status && ['draft', 'scheduled', 'sending', 'sent', 'cancelled'].includes(status)) {
      filter.status = status;
    }
    const [items, counts] = await Promise.all([
      Announcement.find(filter)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Announcement.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);
    const byStatus: Record<string, number> = {};
    for (const c of counts) byStatus[c._id] = c.count;
    res.json({ items, counts: byStatus });
  } catch (err) {
    console.error('[announcements] list error:', err);
    res.status(500).json({ error: 'Failed to load announcements' });
  }
}

/** GET /api/admin/announcements/:id — single item with full stats. */
export async function getAnnouncement(req: Request, res: Response): Promise<void> {
  try {
    const doc = await Announcement.findById(req.params.id)
      .populate('createdBy', 'name email')
      .lean();
    if (!doc) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    res.json({ announcement: doc });
  } catch (err) {
    console.error('[announcements] get error:', err);
    res.status(500).json({ error: 'Failed to load announcement' });
  }
}

/**
 * POST /api/admin/announcements — create.
 * Body may include action='draft' (default), 'schedule' (needs scheduledAt),
 * or 'send_now' (fires immediately, don't wait for the cron).
 */
export async function createAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as CreateBody;
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!body.title?.trim() || !body.bodyHtml?.trim()) {
      res.status(400).json({ error: 'title and bodyHtml required' });
      return;
    }
    const audience: AnnouncementAudience =
      body.audience && VALID_AUDIENCE.includes(body.audience) ? body.audience : 'all';
    const action = body.action || 'draft';
    let status: AnnouncementStatus = 'draft';
    let scheduledAt: Date | undefined;

    if (action === 'schedule') {
      if (!body.scheduledAt) {
        res.status(400).json({ error: 'scheduledAt required when action=schedule' });
        return;
      }
      scheduledAt = new Date(body.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        res.status(400).json({ error: 'Invalid scheduledAt date' });
        return;
      }
      if (scheduledAt.getTime() < Date.now() - 60_000) {
        res.status(400).json({ error: 'scheduledAt must be in the future' });
        return;
      }
      status = 'scheduled';
    }

    const doc = await Announcement.create({
      title: body.title.trim(),
      subject: body.subject?.trim() || undefined,
      bodyHtml: body.bodyHtml,
      bodyText: body.bodyText?.trim() || undefined,
      audience,
      status,
      scheduledAt,
      createdBy: userId,
    });

    if (action === 'send_now') {
      // Non-bloquant : lance en background, retourne tout de suite. L'UI peut
      // poll /api/admin/announcements/:id pour voir le status = sent + stats.
      void sendAnnouncement(String(doc._id)).catch((err) =>
        console.error('[announcements] send_now failed:', err),
      );
    }

    res.status(201).json({ announcement: doc });
  } catch (err) {
    console.error('[announcements] create error:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
}

/**
 * PATCH /api/admin/announcements/:id — update draft/scheduled fields.
 * Verrouillé une fois envoyé (impossible d'éditer un envoi passé) et
 * pendant un envoi actif (status=sending).
 */
export async function updateAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const doc = await Announcement.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    if (doc.status === 'sent' || doc.status === 'sending') {
      res.status(409).json({ error: `Cannot edit an announcement with status=${doc.status}` });
      return;
    }
    const body = req.body as Partial<CreateBody>;
    if (body.title !== undefined) doc.title = body.title.trim();
    if (body.subject !== undefined) doc.subject = body.subject.trim() || undefined;
    if (body.bodyHtml !== undefined) doc.bodyHtml = body.bodyHtml;
    if (body.bodyText !== undefined) doc.bodyText = body.bodyText.trim() || undefined;
    if (body.audience !== undefined && VALID_AUDIENCE.includes(body.audience)) {
      doc.audience = body.audience;
    }
    if (body.scheduledAt !== undefined) {
      const d = new Date(body.scheduledAt);
      if (!Number.isNaN(d.getTime())) {
        doc.scheduledAt = d;
        doc.status = 'scheduled';
      }
    }
    await doc.save();
    res.json({ announcement: doc });
  } catch (err) {
    console.error('[announcements] update error:', err);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
}

/** POST /api/admin/announcements/:id/send-now — force immediate send. */
export async function sendAnnouncementNow(req: Request, res: Response): Promise<void> {
  try {
    const doc = await Announcement.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    if (doc.status === 'sent') {
      res.status(409).json({ error: 'Already sent' });
      return;
    }
    if (doc.status === 'sending') {
      res.status(409).json({ error: 'Currently sending — wait for completion' });
      return;
    }
    void sendAnnouncement(String(doc._id)).catch((err) =>
      console.error('[announcements] send-now failed:', err),
    );
    res.json({ ok: true, message: 'Envoi lancé en arrière-plan' });
  } catch (err) {
    console.error('[announcements] send-now error:', err);
    res.status(500).json({ error: 'Failed to trigger send' });
  }
}

/** POST /api/admin/announcements/:id/cancel — cancel a scheduled announcement. */
export async function cancelAnnouncement(req: Request, res: Response): Promise<void> {
  try {
    const doc = await Announcement.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    if (doc.status === 'sent' || doc.status === 'sending') {
      res.status(409).json({ error: 'Cannot cancel a sent/sending announcement' });
      return;
    }
    doc.status = 'cancelled';
    await doc.save();
    res.json({ announcement: doc });
  } catch (err) {
    console.error('[announcements] cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel' });
  }
}

/** DELETE /api/admin/announcements/:id — hard delete (drafts only). */
export async function deleteAnnouncement(req: Request, res: Response): Promise<void> {
  try {
    const doc = await Announcement.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    if (doc.status === 'sending' || doc.status === 'sent') {
      res.status(409).json({ error: 'Cannot delete a sent/sending announcement — keep the audit trail' });
      return;
    }
    await Announcement.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[announcements] delete error:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
}

/**
 * GET /api/admin/announcements/audience-preview?audience=xxx — count how
 * many users will receive the email, without actually sending.
 */
export async function previewAudience(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.query.audience || 'all') as AnnouncementAudience;
    const audience: AnnouncementAudience = VALID_AUDIENCE.includes(raw) ? raw : 'all';
    const list = await resolveAudience(audience);
    res.json({ audience, count: list.length });
  } catch (err) {
    console.error('[announcements] audience preview error:', err);
    res.status(500).json({ error: 'Failed to preview audience' });
  }
}
