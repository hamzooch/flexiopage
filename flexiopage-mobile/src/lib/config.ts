import Constants from 'expo-constants';

/**
 * Base URL of the FlexioPage backend (the same Express API the web
 * dashboard talks to). Override per-environment via app.json → expo.extra.apiUrl
 * (or an EAS build profile env var). Defaults to localhost for the simulator.
 *
 * ⚠️ Sur un téléphone PHYSIQUE, "localhost" pointe vers le téléphone lui-même,
 * pas vers ta machine. Mets l'IP LAN de ton Mac (ex: http://192.168.1.20:5000)
 * dans expo.extra.apiUrl, ou lance le backend derrière un tunnel.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; webUrl?: string };

export const API_URL = extra.apiUrl || 'http://localhost:5000';

/**
 * URL du dashboard web responsive affiché dans l'app (WebView wrapper).
 * L'app mobile = ton interface web mobile, packagée en APK. Toute mise à jour
 * du web se reflète instantanément dans l'app, sans rebuild.
 */
export const WEB_URL = extra.webUrl || 'https://flexiopage.com/dashboard';

/** Hôtes qui restent DANS l'app (le reste s'ouvre dans le navigateur système). */
export const INTERNAL_HOSTS = ['flexiopage.com', 'api.flexiopage.com'];
