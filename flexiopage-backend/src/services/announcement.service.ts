/**
 * Announcement service — résolution audience → destinataires + envoi batch.
 *
 * L'envoi passe par sendEmail() (Resend en prod, console en dev) et respecte
 * un throttle pour ne pas dépasser la limite Resend (10 emails/sec sur le
 * plan gratuit). En cas d'échec sur un destinataire, on continue avec les
 * autres et on collecte les erreurs dans stats.errors.
 */
import { Announcement, type IAnnouncement } from '../models/Announcement.model';
import { User } from '../models/User.model';
import { Store } from '../models/Store.model';
import { sendEmail } from './email.service';
import { logger } from '../lib/logger';

/** Envoi max par seconde pour rester sous la limite Resend free tier. */
const THROTTLE_PER_SECOND = 8;

/** Résout l'audience → liste d'objets { email, name? } à emailer. */
export async function resolveAudience(audience: IAnnouncement['audience']): Promise<Array<{ email: string; name?: string }>> {
  const base: Record<string, unknown> = { email: { $exists: true, $ne: '' } };
  switch (audience) {
    case 'verified':
      base.emailVerified = true;
      break;
    case 'active': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      base.lastLoginAt = { $gte: thirtyDaysAgo };
      break;
    }
    case 'staff':
      base.role = { $in: ['owner', 'superadmin', 'admin', 'supervisor'] };
      break;
    case 'sellers': {
      const ownerIds = await Store.distinct('ownerId');
      base._id = { $in: ownerIds };
      break;
    }
    case 'all':
    default:
      // Pas de filtre supplémentaire au-delà du "email présent". Volontairement
      // on exclut les comptes suspended qui n'ont plus rien à recevoir.
      base.suspended = { $ne: true };
      break;
  }
  const users = await User.find(base).select('email name').lean();
  const seen = new Set<string>();
  const out: Array<{ email: string; name?: string }> = [];
  for (const u of users) {
    const email = u.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: u.name?.trim() || undefined });
  }
  return out;
}

/**
 * Envoie une annonce à toute son audience. Idempotent au niveau du statut :
 * si l'annonce n'est plus `scheduled` ou `sending`, l'envoi est abandonné.
 * Utilisé à la fois par le cron scheduler et par le bouton "Envoyer
 * maintenant" de l'admin.
 */
export async function sendAnnouncement(announcementId: string): Promise<void> {
  const doc = await Announcement.findById(announcementId);
  if (!doc) throw new Error(`Announcement ${announcementId} not found`);
  if (doc.status === 'sent') {
    logger.info({ id: announcementId }, '[announcement] already sent — skip');
    return;
  }
  if (doc.status === 'cancelled') {
    logger.info({ id: announcementId }, '[announcement] cancelled — skip');
    return;
  }

  // Lock — évite qu'un second worker ou un second clic ne relance l'envoi
  // pendant qu'on émet. On check → set atomically avec updateOne + condition.
  const locked = await Announcement.updateOne(
    { _id: doc._id, status: { $in: ['scheduled', 'draft'] } },
    { $set: { status: 'sending' } },
  );
  if (locked.modifiedCount === 0) {
    logger.info({ id: announcementId }, '[announcement] could not acquire lock — another worker owns it');
    return;
  }

  const recipients = await resolveAudience(doc.audience);
  logger.info(
    { id: announcementId, audience: doc.audience, count: recipients.length },
    '[announcement] resolved audience',
  );

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const subject = doc.subject?.trim() || doc.title;
  const bodyHtml = wrapWithTemplate(doc.title, doc.bodyHtml);
  const bodyText = doc.bodyText || stripHtml(doc.bodyHtml);

  // Throttling naïf par batch — regroupe THROTTLE_PER_SECOND destinataires
  // en parallèle puis dort ~1 s avant le batch suivant.
  for (let i = 0; i < recipients.length; i += THROTTLE_PER_SECOND) {
    const batch = recipients.slice(i, i + THROTTLE_PER_SECOND);
    const results = await Promise.allSettled(
      batch.map((r) =>
        sendEmail({
          to: r.email,
          subject,
          html: bodyHtml,
          text: bodyText,
        }),
      ),
    );
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.ok) {
        sent += 1;
      } else {
        failed += 1;
        const msg = res.status === 'fulfilled' ? res.value.error || 'unknown' : String(res.reason);
        if (errors.length < 20) errors.push(msg);
      }
    }
    if (i + THROTTLE_PER_SECOND < recipients.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  await Announcement.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: 'sent',
        sentAt: new Date(),
        stats: { targeted: recipients.length, sent, failed, errors },
      },
    },
  );
  logger.info({ id: announcementId, sent, failed, targeted: recipients.length }, '[announcement] send complete');
}

/**
 * Wrap le HTML libre du body dans une template email cohérente avec le reste
 * de la plateforme (header logo + footer), pour que les vendeurs
 * reconnaissent tout de suite un email FlexioPage.
 */
function wrapWithTemplate(title: string, innerHtml: string): string {
  const safeTitle = title.replace(/[<>"]/g, '');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.06)">
        <tr><td style="padding:28px 36px 12px 36px;text-align:left;background:linear-gradient(135deg,#f97316,#dc2626)">
          <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.02em">FlexioPage</div>
          <div style="color:rgba(255,255,255,.85);font-size:12px;margin-top:2px">Annonce plateforme</div>
        </td></tr>
        <tr><td style="padding:28px 36px 16px 36px">
          <h1 style="margin:0 0 16px 0;font-size:22px;color:#0f172a;letter-spacing:-0.01em">${safeTitle}</h1>
          <div style="font-size:15px;line-height:1.6;color:#334155">
            ${innerHtml}
          </div>
        </td></tr>
        <tr><td style="padding:20px 36px 32px 36px;background:#f8fafc;border-top:1px solid #f1f1f3">
          <p style="margin:0;font-size:12px;color:#64748b;text-align:center">
            Tu reçois cet email en tant que vendeur inscrit sur FlexioPage.<br />
            <a href="https://flexiopage.com" style="color:#f97316;text-decoration:none">flexiopage.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
