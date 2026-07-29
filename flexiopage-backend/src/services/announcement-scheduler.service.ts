/**
 * Scheduler cron pour les annonces programmées.
 *
 * Toutes les 2 minutes, on cherche les Announcements en status `scheduled`
 * dont `scheduledAt` est déjà passé, et on lance leur envoi via
 * sendAnnouncement(). Le verrou `sending` empêche qu'une seconde exécution
 * du cron (ou un clic manuel simultané) ne relance le même envoi.
 *
 * Même pattern que security-monitor / abandon-orders : setInterval + unref.
 */
import { logger } from '../lib/logger';
import { Announcement } from '../models/Announcement.model';
import { sendAnnouncement } from './announcement.service';

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 min

let checkTimer: NodeJS.Timeout | null = null;

async function sweep(): Promise<void> {
  const now = new Date();
  const due = await Announcement.find({
    status: 'scheduled',
    scheduledAt: { $lte: now },
  })
    .select('_id title scheduledAt')
    .lean();
  if (due.length === 0) return;
  logger.info({ count: due.length }, '[announcement-scheduler] found due announcements');
  for (const ann of due) {
    try {
      await sendAnnouncement(String(ann._id));
    } catch (err) {
      logger.error(
        { err, id: ann._id, title: ann.title },
        '[announcement-scheduler] send failed',
      );
    }
  }
}

/** Called once at server boot. */
export function startAnnouncementScheduler(): void {
  if (checkTimer) return;
  // Première passe 45 s après démarrage — laisse Mongo warm-up.
  setTimeout(() => {
    void sweep().catch((err) => logger.error({ err }, '[announcement-scheduler] initial sweep failed'));
  }, 45_000);
  checkTimer = setInterval(() => {
    void sweep().catch((err) => logger.error({ err }, '[announcement-scheduler] cycle crashed'));
  }, CHECK_INTERVAL_MS);
  checkTimer.unref?.();
  logger.info({ intervalMs: CHECK_INTERVAL_MS }, '[announcement-scheduler] started');
}
