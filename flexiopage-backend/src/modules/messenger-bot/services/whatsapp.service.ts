/**
 * Wrapper WhatsApp Cloud API (Meta). Envoi de messages texte sortants.
 * Le token d'accès est passé EN CLAIR par l'appelant (déchiffré) — jamais loggé.
 * Docs : https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import axios, { type AxiosError } from 'axios';
import { logger } from '../../../lib/logger';
import { GRAPH_API_BASE } from '../config/messengerBot.config';

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
      const ax = err as AxiosError<{ error?: { message?: string } }>;
      logger.error(
        { metaError: ax.response?.data?.error || ax.message, status: ax.response?.status },
        '[whatsapp-bot] Cloud API send échec',
      );
      throw new Error(ax.response?.data?.error?.message || 'WhatsApp send failed');
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
