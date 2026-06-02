/**
 * Wrapper WasenderAPI (https://wasenderapi.com) — WhatsApp Web via QR.
 *
 * Deux niveaux d'auth :
 *   - Personal Access Token (PAT) du vendeur, utilisé pour gérer les sessions
 *     (create/list/qr/status/disconnect).
 *   - Session API token (renvoyé à la création de la session), utilisé pour les
 *     opérations *sur* une session, en particulier `/api/send-message`.
 *
 * Les deux sont envoyés en `Authorization: Bearer ...`. Le token n'est jamais
 * loggé.
 *
 * Docs : https://wasenderapi.com/api-docs
 */
import axios, { AxiosError, type AxiosInstance } from 'axios';
import { logger } from '../../../lib/logger';
import { WASENDER_BASE_URL, WASENDER_TIMEOUT_MS, WHATSAPP_MEDIA_MAX_BYTES } from '../config/messengerBot.config';

/**
 * Statut normalisé d'une session Wasender côté FlexioPage.
 * - 'need_scan'   : QR à scanner (session créée mais pas connectée).
 * - 'connected'   : session active, prête à envoyer/recevoir.
 * - 'disconnected': session déconnectée (logout, expiration, ban…).
 * - 'unknown'     : statut renvoyé par Wasender non reconnu (à logguer).
 */
export type WasenderSessionStatus = 'need_scan' | 'connected' | 'disconnected' | 'unknown';

export interface WasenderSession {
  id: string;
  phoneNumber?: string;
  status: WasenderSessionStatus;
  apiToken?: string;
  raw?: unknown;
}

/** Erreur normalisée pour les appels Wasender (auth/4xx/5xx/timeout). */
export class WasenderApiError extends Error {
  status: number;
  code?: string;
  /** Vrai pour 401/403 (PAT invalide ou session token expiré). */
  isAuthError: boolean;
  raw?: unknown;
  constructor(message: string, opts: { status?: number; code?: string; raw?: unknown } = {}) {
    super(message);
    this.name = 'WasenderApiError';
    this.status = opts.status ?? 0;
    this.code = opts.code;
    this.isAuthError = this.status === 401 || this.status === 403;
    this.raw = opts.raw;
  }
}

function wasenderErrorFromAxios(err: unknown, fallback: string): WasenderApiError {
  const ax = err as AxiosError<{
    message?: string;
    error?: string;
    code?: string;
    help?: string;
    errors?: Record<string, string[]>;
  }>;
  const status = ax.response?.status ?? 0;
  const data = ax.response?.data;
  // Validation Laravel-style → expose chaque erreur explicitement plutôt que
  // de garder le résumé tronqué "(and N more errors)".
  let detail = '';
  if (data?.errors && typeof data.errors === 'object') {
    const lines = Object.entries(data.errors)
      .map(([field, msgs]) => `${field}: ${(Array.isArray(msgs) ? msgs : [String(msgs)]).join(', ')}`);
    if (lines.length) detail = lines.join(' | ');
  }
  const parts = [data?.message || data?.error, data?.help, detail].filter(Boolean);
  const msg = parts.length ? parts.join(' — ') : ax.message || fallback;
  return new WasenderApiError(msg, { status, code: data?.code, raw: data });
}

/**
 * Normalise un statut renvoyé par Wasender. La doc liste plusieurs libellés
 * (connected, disconnected, need_scan, qrcode, expired, banned…). On
 * mappe tout ce qui n'est pas connecté/à-scanner vers 'disconnected', pour
 * que l'UI reste simple.
 */
function normalizeStatus(raw: unknown): WasenderSessionStatus {
  const s = String(raw ?? '').toLowerCase();
  if (!s) return 'unknown';
  if (s === 'connected' || s === 'authenticated' || s === 'online') return 'connected';
  if (s === 'need_scan' || s === 'qrcode' || s === 'scan_qr' || s === 'pending' || s === 'qr') return 'need_scan';
  if (s === 'disconnected' || s === 'logged_out' || s === 'expired' || s === 'banned' || s === 'failure') return 'disconnected';
  return 'unknown';
}

export class WasenderService {
  private http(token: string): AxiosInstance {
    return axios.create({
      baseURL: WASENDER_BASE_URL,
      timeout: WASENDER_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  }

  /** Tente de retrouver un id et un status dans une réponse arbitraire. */
  private adaptSession(raw: unknown): WasenderSession {
    const obj = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
    const data = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
    const id = String(data.id ?? data.session_id ?? data.sessionId ?? data.uuid ?? '');
    const phoneNumber = (data.phone_number || data.phoneNumber || data.number || undefined) as string | undefined;
    const status = normalizeStatus(data.status ?? data.session_status ?? data.connection_status);
    const apiToken = (data.api_key || data.api_token || data.token || data.bearer_token || undefined) as string | undefined;
    return { id, phoneNumber, status, apiToken, raw };
  }

  /**
   * POST /api/whatsapp-sessions — crée une session WhatsApp côté Wasender.
   * `pat` = personal access token du vendeur.
   *
   * Champs requis par Wasender : `name`, `phone_number`, `account_protection`,
   * `webhook_url` (publique — localhost rejeté).
   */
  async createSession(args: {
    pat: string;
    name: string;
    phoneNumber: string;
    webhookUrl: string;
    webhookSecret?: string;
    accountProtection?: boolean;
  }): Promise<WasenderSession> {
    try {
      const body: Record<string, unknown> = {
        name: args.name,
        phone_number: args.phoneNumber,
        webhook_url: args.webhookUrl,
        // Anti-ban activé par défaut — protège le compte d'une déconnexion
        // rapide en cas de comportement suspect.
        account_protection: args.accountProtection ?? true,
      };
      if (args.webhookSecret) body.webhook_secret = args.webhookSecret;
      const res = await this.http(args.pat).post('/api/whatsapp-sessions', body);
      return this.adaptSession(res.data);
    } catch (err) {
      const e = wasenderErrorFromAxios(err, 'Wasender createSession failed');
      logger.error({ status: e.status, code: e.code, message: e.message }, '[wasender] createSession échec');
      throw e;
    }
  }

  /** GET /api/whatsapp-sessions/{id}/qrcode — renvoie le QR (data URI ou string). */
  async getQrCode(args: { pat: string; sessionId: string }): Promise<{ qr: string | null; status: WasenderSessionStatus; raw: unknown }> {
    try {
      const res = await this.http(args.pat).get(`/api/whatsapp-sessions/${encodeURIComponent(args.sessionId)}/qrcode`);
      const data = (res.data && typeof res.data === 'object' ? (res.data as Record<string, unknown>) : {}) as Record<string, unknown>;
      const payload = (data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : data) as Record<string, unknown>;
      const qr = String(payload.qr || payload.qrcode || payload.qr_code || payload.image || '') || null;
      const status = normalizeStatus(payload.status);
      return { qr, status, raw: res.data };
    } catch (err) {
      throw wasenderErrorFromAxios(err, 'Wasender getQrCode failed');
    }
  }

  /**
   * GET /api/whatsapp-sessions/{id} — statut de la session. On utilise cet
   * endpoint (et non /api/status) car ce dernier exige le session token et nous
   * voulons sonder avec le PAT pendant le scan QR.
   */
  async getSessionStatus(args: { pat: string; sessionId: string }): Promise<WasenderSession> {
    try {
      const res = await this.http(args.pat).get(`/api/whatsapp-sessions/${encodeURIComponent(args.sessionId)}`);
      return this.adaptSession(res.data);
    } catch (err) {
      throw wasenderErrorFromAxios(err, 'Wasender getSessionStatus failed');
    }
  }

  /** POST /api/whatsapp-sessions/{id}/disconnect — logout de la session. */
  async disconnectSession(args: { pat: string; sessionId: string }): Promise<void> {
    try {
      await this.http(args.pat).post(`/api/whatsapp-sessions/${encodeURIComponent(args.sessionId)}/disconnect`, {});
    } catch (err) {
      throw wasenderErrorFromAxios(err, 'Wasender disconnectSession failed');
    }
  }

  /**
   * POST /api/send-message — envoie un message texte via la session.
   * `sessionToken` = api_token renvoyé par createSession.
   * `to` = numéro destinataire au format international (avec ou sans +).
   */
  async sendText(args: { sessionToken: string; to: string; message: string }): Promise<unknown> {
    try {
      const res = await this.http(args.sessionToken).post('/api/send-message', { to: args.to, text: args.message });
      return res.data;
    } catch (err) {
      const e = wasenderErrorFromAxios(err, 'Wasender sendText failed');
      logger.error({ status: e.status, code: e.code }, '[wasender] send-message échec');
      throw e;
    }
  }

  /**
   * POST /api/send-message — envoie un message média (image/audio/video/document)
   * via URL publique. Le binaire n'est pas hébergé localement.
   */
  async sendMedia(args: {
    sessionToken: string;
    to: string;
    mediaType: 'image' | 'audio' | 'video' | 'document';
    mediaUrl: string;
    caption?: string;
    fileName?: string;
  }): Promise<unknown> {
    try {
      const body: Record<string, unknown> = { to: args.to };
      // Wasender accepte des clés dédiées par type (`imageUrl`, `audioUrl`, …) +
      // un éventuel `text` pour la légende.
      const keyByType = {
        image: 'imageUrl',
        audio: 'audioUrl',
        video: 'videoUrl',
        document: 'documentUrl',
      } as const;
      body[keyByType[args.mediaType]] = args.mediaUrl;
      if (args.caption) body.text = args.caption;
      if (args.fileName) body.fileName = args.fileName;
      const res = await this.http(args.sessionToken).post('/api/send-message', body);
      return res.data;
    } catch (err) {
      const e = wasenderErrorFromAxios(err, 'Wasender sendMedia failed');
      logger.error({ status: e.status, code: e.code, mediaType: args.mediaType }, '[wasender] sendMedia échec');
      throw e;
    }
  }

  /**
   * Télécharge un média entrant. Wasender expose en général l'URL signée
   * directement dans le payload webhook (champ `mediaUrl`) — pas besoin
   * d'authentification sur cette URL. On garde la taille max sous la limite
   * vision (5 Mo) pour rester aligné avec le canal Meta.
   */
  async fetchMediaFromUrl(args: { url: string }): Promise<{ base64: string; mimeType: string; sizeBytes: number } | null> {
    try {
      const bin = await axios.get<ArrayBuffer>(args.url, {
        responseType: 'arraybuffer',
        timeout: WASENDER_TIMEOUT_MS,
        maxContentLength: WHATSAPP_MEDIA_MAX_BYTES,
        maxBodyLength: WHATSAPP_MEDIA_MAX_BYTES,
      });
      const mimeType = String(bin.headers['content-type'] || '').split(';')[0] || '';
      const buf = Buffer.from(bin.data);
      return { base64: buf.toString('base64'), mimeType, sizeBytes: buf.byteLength };
    } catch (err) {
      logger.warn({ err: (err as Error).message, url: args.url }, '[wasender] fetchMediaFromUrl échec');
      return null;
    }
  }
}

export const wasenderService = new WasenderService();
