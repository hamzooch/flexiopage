/**
 * Wrapper de la Meta Graph API (Send API) pour Messenger.
 *
 * Toutes les méthodes reçoivent le `pageAccessToken` EN CLAIR (déchiffré par
 * l'appelant via encryptionService). On ne logge jamais le token.
 */
import axios from 'axios';
import { logger } from '../../../lib/logger';
import { GRAPH_API_BASE } from '../config/messengerBot.config';
import { metaErrorFromAxios } from './metaErrors';

export interface QuickReplyOption {
  title: string;
  payload: string;
  image_url?: string;
}

export interface CarouselProduct {
  title: string;
  subtitle?: string;
  image_url?: string;
  buttons?: Array<{ type: 'web_url' | 'postback'; title: string; url?: string; payload?: string }>;
}

export class MessengerService {
  private endpoint(token: string): string {
    return `${GRAPH_API_BASE}/me/messages?access_token=${encodeURIComponent(token)}`;
  }

  private async post(token: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      const res = await axios.post(this.endpoint(token), body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10_000,
      });
      return res.data;
    } catch (err) {
      // Ne jamais logger le token — uniquement l'erreur Meta.
      const apiErr = metaErrorFromAxios(err, 'Messenger send failed');
      logger.error(
        { metaError: apiErr.message, status: apiErr.status, code: apiErr.metaCode },
        '[messenger-bot] Graph API send échec',
      );
      throw apiErr;
    }
  }

  /** Envoie un message texte simple. */
  async sendMessage(args: { pageAccessToken: string; recipientPsid: string; message: string }): Promise<unknown> {
    return this.post(args.pageAccessToken, {
      recipient: { id: args.recipientPsid },
      messaging_type: 'RESPONSE',
      message: { text: args.message },
    });
  }

  /** Indicateur "en train d'écrire" (typing_on) — best-effort. */
  async sendTypingIndicator(args: { pageAccessToken: string; recipientPsid: string; on?: boolean }): Promise<void> {
    try {
      await this.post(args.pageAccessToken, {
        recipient: { id: args.recipientPsid },
        sender_action: args.on === false ? 'typing_off' : 'typing_on',
      });
    } catch {
      // l'indicateur de frappe n'est pas critique
    }
  }

  /** Récupère le profil public du client (nom, photo). */
  async getUserProfile(args: { pageAccessToken: string; psid: string }): Promise<{
    first_name?: string;
    last_name?: string;
    profile_pic?: string;
  }> {
    try {
      const url = `${GRAPH_API_BASE}/${encodeURIComponent(args.psid)}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(args.pageAccessToken)}`;
      const res = await axios.get(url, { timeout: 10_000 });
      return res.data || {};
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[messenger-bot] getUserProfile échec');
      return {};
    }
  }

  /** Envoie un texte + boutons de réponse rapide. */
  async sendQuickReplies(args: {
    pageAccessToken: string;
    recipientPsid: string;
    text: string;
    options: QuickReplyOption[];
  }): Promise<unknown> {
    return this.post(args.pageAccessToken, {
      recipient: { id: args.recipientPsid },
      messaging_type: 'RESPONSE',
      message: {
        text: args.text,
        quick_replies: args.options.slice(0, 13).map((o) => ({
          content_type: 'text',
          title: o.title.slice(0, 20),
          payload: o.payload,
          image_url: o.image_url,
        })),
      },
    });
  }

  /** Envoie un carrousel produits (template générique). */
  async sendCarousel(args: {
    pageAccessToken: string;
    recipientPsid: string;
    products: CarouselProduct[];
  }): Promise<unknown> {
    return this.post(args.pageAccessToken, {
      recipient: { id: args.recipientPsid },
      messaging_type: 'RESPONSE',
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: args.products.slice(0, 10).map((p) => ({
              title: p.title.slice(0, 80),
              subtitle: p.subtitle?.slice(0, 80),
              image_url: p.image_url,
              buttons: p.buttons?.slice(0, 3),
            })),
          },
        },
      },
    });
  }
}

export const messengerService = new MessengerService();
