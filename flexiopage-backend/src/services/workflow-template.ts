/**
 * Texte du scénario « finaliser la commande ». Pur : pas de Mongo, pour
 * pouvoir vérifier le rendu et les délais sans base.
 */

export const DEFAULT_SUBJECT = 'Ta commande {{product}} t\'attend';

export const DEFAULT_BODY = `Bonjour{{firstName}},

Tu as commencé une commande chez {{storeName}} et le paiement n'a pas été terminé.

{{product}} — {{amount}}

{{link}}

Si tu as déjà payé, tu peux ignorer ce message.`;

const PLACEHOLDER = /\{\{\s*(firstName|product|amount|link|storeName)\s*\}\}/g;

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, key: string) => vars[key] ?? '');
}

export function clampDelayMinutes(value: unknown, fallback = 20): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(240, Math.max(5, Math.round(n)));
}

export function clampDelayHours(value: unknown, fallback = 24): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(72, Math.max(1, Math.round(n)));
}

/** Adresse utilisable pour une relance. Les placeholders COD sont écartés. */
export function isDeliverableEmail(email: string | undefined | null): boolean {
  const value = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  if (value.endsWith('@flexiopage.local')) return false;
  return true;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Premier prénom pour le bonjour, ou chaîne vide. */
export function firstNameOf(customerName?: string): string {
  const name = (customerName || '').trim().split(/\s+/)[0];
  return name || '';
}
