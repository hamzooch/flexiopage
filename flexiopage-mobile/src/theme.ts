/**
 * Palette alignée 1:1 sur la plateforme web (flexiopage-frontend, thème clair).
 * Source : src/app/globals.css (CSS variables, converties HSL → hex).
 * Marque = orange `hsl(22 92% 52%)` (le « F. » du logo), fond clair froid,
 * texte anthracite.
 */
export const colors = {
  bg: '#f6f7f9', // --background 220 23% 97%
  card: '#ffffff', // --card 0 0% 100%
  border: '#ebe6e0', // --border 30 20% 90% (gris chaud)
  text: '#0f172a', // --foreground 222 47% 11%
  muted: '#64748b', // --muted-foreground 215 16% 47%
  primary: '#f56714', // --primary 22 92% 52% (orange de marque)
  primaryText: '#ffffff', // --primary-foreground
  accent: '#ffe8d1', // --accent 32 100% 94% (pêche clair, fonds de badge)
  danger: '#ef4444', // --destructive 0 84% 60%
  success: '#16a34a',
  warning: '#d97706',
};

/** Couleur d'un badge selon le statut. */
export function statusColor(status?: string): string {
  switch (status) {
    case 'paid':
    case 'confirmed':
    case 'fulfilled':
      return colors.success;
    case 'pending':
    case 'unfulfilled':
    case 'no_answer':
    case 'callback':
      return colors.warning;
    case 'failed':
    case 'cancelled':
    case 'declined':
    case 'refunded':
      return colors.danger;
    default:
      return colors.muted;
  }
}

export function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
