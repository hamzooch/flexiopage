/**
 * Email service — Resend (recommandé, free tier 3k/mois) + console fallback.
 *
 * Configure via env :
 *   RESEND_API_KEY=re_…             — sinon les emails sont juste loggés
 *   EMAIL_FROM='FlexioPage <noreply@yourdomain.com>'
 *   FRONTEND_URL=https://yourapp.com  — pour les liens absolus
 */
import { Resend } from 'resend';

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

const DEFAULT_FROM = process.env.EMAIL_FROM || 'FlexioPage <onboarding@resend.dev>';

export async function sendEmail(args: SendEmailArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  const client = getClient();
  if (!client) {
    // Dev fallback — log to console so the seller can copy/paste the link locally
    console.log('\n📧 [email-mock] Would send email:');
    console.log(`   To:      ${args.to}`);
    console.log(`   Subject: ${args.subject}`);
    console.log(`   Body preview: ${(args.text || args.html).slice(0, 240).replace(/\n/g, ' ')}…\n`);
    return { ok: true, id: 'mock' };
  }
  try {
    const { data, error } = await client.emails.send({
      from: args.from || DEFAULT_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo,
    });
    if (error) {
      console.error('[email] resend error:', error);
      return { ok: false, error: typeof error === 'string' ? error : JSON.stringify(error) };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[email] send failed:', err);
    return { ok: false, error: (err as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Templates — French digital order confirmation
// ─────────────────────────────────────────────────────────────────────
export interface OrderEmailItem {
  name: string;
  quantity?: number;
  price: number;
  imageUrl?: string;
  licenseKey?: string;
}

export interface OrderEmailArgs {
  to: string;
  customerName?: string;
  storeName: string;
  orderNumber: string;
  total: number;
  currency: string;
  items: OrderEmailItem[];
  /** Token used to build https://app/d/<token>. */
  downloadToken: string;
  expiresAt?: Date;
  language?: string; // 'fr' | 'en' | 'ar'
}

function fmtPrice(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

function safeFrontendBase(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/** Order paid — sends the buyer their secure download link. */
export async function sendOrderPaidEmail(args: OrderEmailArgs): Promise<{ ok: boolean }> {
  const downloadUrl = `${safeFrontendBase()}/d/${args.downloadToken}`;
  const greeting = args.customerName ? `Bonjour ${args.customerName},` : 'Bonjour,';
  const expiryNote = args.expiresAt
    ? `<p style="margin:0 0 16px 0;color:#92400e;font-size:13px">⏳ Ton accès est valide jusqu'au <strong>${args.expiresAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>`
    : '';

  const itemsHtml = args.items
    .map(
      (it) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #f1f1f3">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:middle;width:60px">
              ${it.imageUrl ? `<img src="${it.imageUrl}" alt="" width="48" height="48" style="border-radius:8px;object-fit:cover;border:1px solid #eee" />` : '<div style="width:48px;height:48px;border-radius:8px;background:#fce7f3;display:inline-block"></div>'}
            </td>
            <td style="vertical-align:middle;color:#0f172a">
              <div style="font-weight:600;font-size:14px">${escape(it.name)}</div>
              ${it.licenseKey ? `<div style="margin-top:4px;font-family:ui-monospace,monospace;font-size:11px;color:#7c3aed;background:#faf5ff;padding:3px 8px;border-radius:4px;display:inline-block">${escape(it.licenseKey)}</div>` : ''}
            </td>
            <td style="vertical-align:middle;text-align:right;color:#0f172a;font-weight:600;font-size:14px">${fmtPrice(it.price, args.currency)}</td>
          </tr>
        </table>
      </td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Ta commande #${escape(args.orderNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.06)">
        <tr><td style="padding:36px 36px 0 36px;text-align:center">
          <div style="display:inline-block;width:56px;height:56px;background:linear-gradient(135deg,#ec4899,#7c3aed);border-radius:14px;line-height:56px;color:#fff;font-size:28px;font-weight:700">✓</div>
          <h1 style="margin:20px 0 8px 0;font-size:24px;color:#0f172a;letter-spacing:-0.02em">Merci pour ton achat&nbsp;!</h1>
          <p style="margin:0;font-size:14px;color:#64748b">${greeting}<br />Ta commande chez <strong style="color:#0f172a">${escape(args.storeName)}</strong> est confirmée.</p>
        </td></tr>
        <tr><td style="padding:28px 36px">
          ${expiryNote}
          <a href="${downloadUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#ec4899,#7c3aed);color:#fff;text-decoration:none;padding:16px 24px;border-radius:12px;font-weight:600;font-size:15px;box-shadow:0 8px 24px rgba(124,58,237,.35)">⚡ Accéder à mes téléchargements</a>
          <p style="margin:14px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;word-break:break-all">${downloadUrl}</p>
        </td></tr>
        <tr><td style="padding:0 36px 16px 36px">
          <h2 style="margin:24px 0 4px 0;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.08em">Détails de la commande</h2>
          <p style="margin:0 0 12px 0;font-size:13px;color:#94a3b8">N° ${escape(args.orderNumber)}</p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${itemsHtml}
            <tr><td style="padding:16px 0 0 0">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:14px;font-weight:700;color:#0f172a">Total</td>
                  <td style="text-align:right;font-size:18px;font-weight:800;color:#0f172a">${fmtPrice(args.total, args.currency)}</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 36px 36px 36px;background:#f8fafc;border-top:1px solid #f1f1f3">
          <p style="margin:0;font-size:12px;color:#64748b;text-align:center">Tu peux revenir sur cette page de téléchargement à tout moment via le lien ci-dessus. Une question&nbsp;? Réponds à cet email.</p>
          <p style="margin:12px 0 0 0;font-size:11px;color:#94a3b8;text-align:center">© ${new Date().getFullYear()} ${escape(args.storeName)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Bonjour,

Merci pour ton achat chez ${args.storeName}. Ta commande #${args.orderNumber} est confirmée.

Accède à tes téléchargements ici :
${downloadUrl}
${args.expiresAt ? `\nAccès valide jusqu'au ${args.expiresAt.toLocaleDateString('fr-FR')}` : ''}

${args.items.map((it) => `- ${it.name} (${fmtPrice(it.price, args.currency)})${it.licenseKey ? `\n  Clé : ${it.licenseKey}` : ''}`).join('\n')}

Total : ${fmtPrice(args.total, args.currency)}

Si tu as une question, réponds simplement à cet email.
`;

  return sendEmail({
    to: args.to,
    subject: `Ta commande #${args.orderNumber} chez ${args.storeName} ⚡`,
    html,
    text,
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────
// Verification email — sent at signup, also on "renvoyer" CTA
// ─────────────────────────────────────────────────────────────────────
export interface VerificationEmailArgs {
  to: string;
  name?: string;
  /** Raw token (URL-safe). Hashé côté DB, mais envoyé en clair dans le mail. */
  token: string;
}

/**
 * Envoie le mail « confirme ton adresse » au signup email/password.
 * Le lien contient le token raw — c'est le clic du seller qui valide,
 * pas le simple fait de recevoir le mail.
 */
export async function sendVerificationEmail(args: VerificationEmailArgs): Promise<{ ok: boolean }> {
  const verifyUrl = `${safeFrontendBase()}/verify-email?token=${encodeURIComponent(args.token)}`;
  const greeting = args.name ? `Salut ${escape(args.name)},` : 'Salut,';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Confirme ton adresse email</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.06)">
        <tr><td style="padding:36px 36px 0 36px;text-align:center">
          <div style="display:inline-block;width:56px;height:56px;background:linear-gradient(135deg,#f97316,#ec4899);border-radius:14px;line-height:56px;color:#fff;font-size:28px;font-weight:700">✉</div>
          <h1 style="margin:20px 0 8px 0;font-size:22px;color:#0f172a;letter-spacing:-0.02em">Confirme ton email</h1>
          <p style="margin:0;font-size:14px;color:#64748b">${greeting}<br />Un dernier clic pour activer ton compte FlexioPage.</p>
        </td></tr>
        <tr><td style="padding:28px 36px">
          <a href="${verifyUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;text-decoration:none;padding:16px 24px;border-radius:12px;font-weight:600;font-size:15px;box-shadow:0 8px 24px rgba(236,72,153,.30)">✓ Confirmer mon adresse</a>
          <p style="margin:14px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;word-break:break-all">Si le bouton ne marche pas, copie-colle ce lien :<br /><span style="color:#475569">${verifyUrl}</span></p>
        </td></tr>
        <tr><td style="padding:0 36px 28px 36px">
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.55">Ce lien expire dans <strong>24 heures</strong>. Si tu n'es pas à l'origine de cette inscription, ignore simplement cet email — aucun compte n'est activé tant que tu ne cliques pas.</p>
        </td></tr>
        <tr><td style="padding:24px 36px 32px 36px;background:#f8fafc;border-top:1px solid #f1f1f3;text-align:center">
          <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} FlexioPage — créer ta boutique en 60 secondes.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greeting.replace(/<[^>]+>/g, '')}

Confirme ton adresse email pour activer ton compte FlexioPage :
${verifyUrl}

Ce lien expire dans 24 heures. Si tu n'es pas à l'origine de cette inscription, ignore cet email.

— L'équipe FlexioPage
`;

  return sendEmail({
    to: args.to,
    subject: 'Confirme ton adresse email — FlexioPage',
    html,
    text,
    // L'expéditeur est `noreply@mail.flexiopage.com` (sous-domaine sans MX
    // entrant), donc les réponses se perdraient. On redirige vers le support
    // via SUPPORT_EMAIL — overridable au cas où on change d'adresse plus tard.
    replyTo: process.env.SUPPORT_EMAIL || 'support@flexiopage.com',
  });
}
