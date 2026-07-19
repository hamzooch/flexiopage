/**
 * Notifications automatiques envoyées au client par WhatsApp aux moments
 * clés du cycle de vie d'une commande (création, confirmation, dispatch).
 *
 * Design :
 *   - Opt-in par store via `settings.clientNotifications` (chaque trigger
 *     activable indépendamment) — désactivé par défaut, jamais surprise.
 *   - Réutilise la session WasenderAPI déjà connectée par le vendeur pour
 *     son chatbot Claude (BotConfig avec whatsapp_provider='wasender').
 *     Pas besoin d'une deuxième connexion QR à scanner.
 *   - Best-effort : chaque envoi est try/catch, un échec n'interrompt
 *     jamais le flow métier (création commande, dispatch, etc.).
 *   - Anti-spam : idempotence par (orderId, trigger) — si le service est
 *     ré-appelé (ex: bug retry), le 2e envoi est skippé.
 *
 * Templates : chaque trigger a un template avec placeholders :
 *   - {{customerName}}, {{orderNumber}}, {{storeName}}
 *   - {{total}}, {{currency}}, {{trackingUrl}}
 */
import type mongoose from 'mongoose';
import { logger } from '../lib/logger';
import { Order } from '../models/Order.model';
import { Store } from '../models/Store.model';
import { BotConfig } from '../modules/messenger-bot/models/BotConfig.model';
import { encryptionService } from '../modules/messenger-bot/services/encryption.service';
import { wasenderService } from '../modules/messenger-bot/services/wasender.service';

export type ClientNotifTrigger = 'orderCreated' | 'confirmed' | 'dispatched';

/** Templates par défaut si le vendeur n'a pas customisé — français+français
 *  simple pour couvrir le marché principal FlexioPage. */
export const DEFAULT_TEMPLATES: Record<ClientNotifTrigger, string> = {
  orderCreated:
    "Bonjour {{customerName}} 👋\nMerci pour ta commande sur {{storeName}} !\nNuméro de commande : {{orderNumber}}\nTotal : {{total}} {{currency}}\n\nOn te confirme sous 24h par téléphone 📞",
  confirmed:
    "Bonjour {{customerName}} ✅\nTa commande {{orderNumber}} est confirmée !\nLivraison en 24-72h. On te tient au courant dès qu'elle part 📦",
  dispatched:
    "Bonjour {{customerName}} 🚚\nTon colis {{orderNumber}} part chez le coursier !\nIl te contactera au téléphone pour livrer.\nPrépare {{total}} {{currency}} (paiement à la livraison).",
};

/**
 * Remplace les placeholders {{name}} par les valeurs — tolère les valeurs
 * absentes (remplacées par une string vide plutôt que le placeholder brut,
 * pour ne pas envoyer "Bonjour {{customerName}}" au client si le nom manque).
 */
function fillTemplate(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}

/**
 * Envoie la notif si le trigger est actif dans la config store, et si un
 * numéro client est connu. Idempotence : marque `clientNotifSent[trigger]`
 * sur l'Order après succès pour éviter les doubles envois sur retry.
 */
export async function sendClientNotification(args: {
  orderId: string | mongoose.Types.ObjectId;
  trigger: ClientNotifTrigger;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const order = await Order.findById(args.orderId);
    if (!order) return { sent: false, reason: 'order not found' };

    // Idempotence : chaque trigger est envoyé une seule fois par commande.
    // On stocke le flag directement dans un sous-doc `metadata` pour ne pas
    // polluer le schéma principal.
    const meta = (order.metadata as Record<string, unknown> | undefined) || {};
    const sentMap = (meta.clientNotifSent as Record<string, boolean> | undefined) || {};
    if (sentMap[args.trigger]) {
      return { sent: false, reason: 'already sent' };
    }

    // Trouve un numéro utilisable — WhatsApp si dispo (digital stores),
    // sinon customerPhone. WasenderAPI attend un E.164 sans +.
    const rawPhone = order.customerWhatsapp?.trim() || order.customerPhone?.trim();
    if (!rawPhone) return { sent: false, reason: 'no phone' };
    const wasenderTo = rawPhone.replace(/[^\d]/g, ''); // strip +, spaces, dashes

    // Config store — le trigger doit être activé.
    const store = await Store.findById(order.storeId).select('name settings.clientNotifications').lean();
    if (!store) return { sent: false, reason: 'store not found' };
    const cfg = store.settings?.clientNotifications;
    if (!cfg?.enabled) return { sent: false, reason: 'client notifs disabled' };
    const triggerCfg = cfg[args.trigger];
    if (!triggerCfg?.enabled) return { sent: false, reason: `trigger ${args.trigger} disabled` };

    // Config WasenderAPI — on réutilise la session du chatbot vendeur.
    const botConfig = await BotConfig.findOne({
      vendor_id: order.storeId,
      channel: 'whatsapp',
      whatsapp_provider: 'wasender',
    })
      .select('wasender_session_token_encrypted status')
      .lean();
    if (!botConfig?.wasender_session_token_encrypted) {
      return { sent: false, reason: 'wasender session not connected' };
    }

    // Compose le message final.
    const template = triggerCfg.template?.trim() || DEFAULT_TEMPLATES[args.trigger];
    const message = fillTemplate(template, {
      customerName: order.customerName || 'client',
      orderNumber: order.orderNumber,
      storeName: store.name,
      total: order.total,
      currency: order.currency,
      trackingUrl: order.delivery?.trackingUrl || '',
    });

    // Envoi + marque idempotence en cas de succès.
    const sessionToken = encryptionService.decrypt(botConfig.wasender_session_token_encrypted);
    await wasenderService.sendText({ sessionToken, to: wasenderTo, message });

    sentMap[args.trigger] = true;
    order.metadata = { ...meta, clientNotifSent: sentMap };
    order.markModified('metadata');
    await order.save();

    logger.info({ orderId: String(order._id), trigger: args.trigger }, '[client-notif] envoyée');
    return { sent: true };
  } catch (err) {
    // Best-effort : jamais bloquant, on log et on rend la main.
    logger.error({ err: (err as Error).message, trigger: args.trigger }, '[client-notif] échec');
    return { sent: false, reason: (err as Error).message };
  }
}
