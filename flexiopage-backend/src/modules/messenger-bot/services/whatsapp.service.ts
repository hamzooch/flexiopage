/**
 * Wrapper WhatsApp Cloud API (Meta). Envoi de messages texte sortants.
 * Le token d'accès est passé EN CLAIR par l'appelant (déchiffré) — jamais loggé.
 * Docs : https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import axios from 'axios';
import { logger } from '../../../lib/logger';
import { GRAPH_API_BASE, WHATSAPP_MEDIA_MAX_BYTES } from '../config/messengerBot.config';
import { metaErrorFromAxios } from './metaErrors';

export class WhatsAppService {
  /** Envoie un message texte à un numéro (wa_id, format international sans +). */
  async sendText(args: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    message: string;
  }): Promise<unknown> {
    try {
      const res = await axios.post(
        `${GRAPH_API_BASE}/${args.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: args.to,
          type: 'text',
          text: { preview_url: false, body: args.message },
        },
        { headers: { Authorization: `Bearer ${args.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10_000 },
      );
      return res.data;
    } catch (err) {
      const apiErr = metaErrorFromAxios(err, 'WhatsApp send failed');
      logger.error(
        { metaError: apiErr.message, status: apiErr.status, code: apiErr.metaCode },
        '[whatsapp-bot] Cloud API send échec',
      );
      throw apiErr;
    }
  }

  /**
   * Récupère un média entrant : GET /{media_id} → URL signée, puis download
   * binaire (Bearer requis sur les deux appels). Retourne null si échec ou
   * média trop gros (maxContentLength) — l'appelant retombe alors sur un
   * message de repli localisé.
   */
  async fetchMedia(args: { mediaId: string; accessToken: string }): Promise<
    { base64: string; mimeType: string; sizeBytes: number } | null
  > {
    try {
      const meta = await axios.get(`${GRAPH_API_BASE}/${args.mediaId}`, {
        headers: { Authorization: `Bearer ${args.accessToken}` },
        timeout: 8_000,
      });
      const url = (meta.data as { url?: string }).url;
      const mimeType = (meta.data as { mime_type?: string }).mime_type || '';
      if (!url) return null;

      const bin = await axios.get<ArrayBuffer>(url, {
        headers: { Authorization: `Bearer ${args.accessToken}` },
        responseType: 'arraybuffer',
        timeout: 12_000,
        maxContentLength: WHATSAPP_MEDIA_MAX_BYTES,
        maxBodyLength: WHATSAPP_MEDIA_MAX_BYTES,
      });
      const buf = Buffer.from(bin.data);
      return { base64: buf.toString('base64'), mimeType, sizeBytes: buf.byteLength };
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, mediaId: args.mediaId },
        '[whatsapp-bot] fetchMedia échec',
      );
      return null;
    }
  }

  /** Marque un message entrant comme lu (best-effort). */
  async markRead(args: { phoneNumberId: string; accessToken: string; messageId: string }): Promise<void> {
    try {
      await axios.post(
        `${GRAPH_API_BASE}/${args.phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', status: 'read', message_id: args.messageId },
        { headers: { Authorization: `Bearer ${args.accessToken}`, 'Content-Type': 'application/json' }, timeout: 8_000 },
      );
    } catch {
      // non critique
    }
  }
}

export const whatsappService = new WhatsAppService();
