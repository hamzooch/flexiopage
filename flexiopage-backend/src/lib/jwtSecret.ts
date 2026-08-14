/**
 * Source unique du secret JWT, validée au chargement du module (= au boot).
 *
 * Avant, trois fichiers dupliquaient `process.env.JWT_SECRET ||
 * 'change-me-in-production'` : si la variable manquait en prod, le serveur
 * démarrait SILENCIEUSEMENT avec un secret public connu — n'importe qui
 * pouvait forger un token de n'importe quel compte. On préfère un crash
 * explicite au démarrage plutôt qu'une prod compromise qui « marche ».
 */
const FALLBACK_DEV_ONLY = 'change-me-in-production';
const MIN_LENGTH = 32;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === FALLBACK_DEV_ONLY || secret.length < MIN_LENGTH) {
      throw new Error(
        `[boot] JWT_SECRET manquant, placeholder ou trop court (< ${MIN_LENGTH} caractères) — ` +
          'refus de démarrer en production. Génère un secret : openssl rand -base64 48'
      );
    }
    return secret;
  }
  if (!secret) {
    // eslint-disable-next-line no-console
    console.warn('[boot] JWT_SECRET absent — fallback DEV utilisé (jamais en production).');
    return FALLBACK_DEV_ONLY;
  }
  return secret;
}

export const JWT_SECRET = resolveJwtSecret();
