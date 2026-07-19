/**
 * Helpers that emit in-app notifications surfaced in the seller's bell
 * dropdown. Each event source (checkout, delivery webhook, team add/remove)
 * imports this service and calls the relevant `notify*` function.
 *
 * Notifications are best-effort: callers wrap the call in try/catch so
 * a notification failure NEVER blocks the underlying business operation
 * (creating an order, applying a webhook, etc.).
 */

import mongoose from 'mongoose';
import { Notification, type NotificationType } from '../models/Notification.model';

interface CreateArgs {
  userId: mongoose.Types.ObjectId | string;
  storeId?: mongoose.Types.ObjectId | string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  meta?: Record<string, unknown>;
}

export async function createNotification(args: CreateArgs) {
  const notif = await Notification.create({
    userId: args.userId,
    storeId: args.storeId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
    meta: args.meta,
    read: false,
  });
  // Fan-out vers le bot Telegram vendeur (best-effort, jamais bloquant). Couvre
  // TOUS les types de notif (commande, livraison, solde, équipe). Import différé
  // pour éviter tout cycle de dépendances.
  try {
    const { sendToUser } = await import('./telegram.service');
    await sendToUser(args.userId, { title: args.title, body: args.body, link: args.link });
  } catch {
    /* non-fatal */
  }
  return notif;
}

// ─── Event-specific helpers ────────────────────────────────────────────
// Keep the call sites readable: instead of every source assembling the
// title/body/link, they just pass the source data here.

export async function notifyOrderCreated(args: {
  userId: mongoose.Types.ObjectId | string;
  storeId: mongoose.Types.ObjectId | string;
  orderId: string;
  orderNumber: string;
  total: number;
  currency: string;
  customerName?: string;
}) {
  const who = args.customerName?.trim() || 'Nouveau client';
  const link = `/dashboard/orders?storeId=${args.storeId}`;
  const notif = await createNotification({
    userId: args.userId,
    storeId: args.storeId,
    type: 'order.created',
    title: `Commande ${args.orderNumber}`,
    body: `${who} · ${args.total} ${args.currency}`,
    link,
    meta: {
      orderId: args.orderId,
      orderNumber: args.orderNumber,
      total: args.total,
      currency: args.currency,
    },
  });
  // Push mobile (Expo) — best-effort, jamais bloquant. Utilise le son choisi
  // par le vendeur. Import différé pour éviter tout cycle de dépendances.
  try {
    const { sendToUser } = await import('./push.service');
    await sendToUser(args.userId, {
      title: `Nouvelle commande ${args.orderNumber}`,
      body: `${who} · ${args.total} ${args.currency}`,
      link,
      data: { type: 'order.created', orderId: args.orderId, orderNumber: args.orderNumber },
    });
  } catch {
    /* non-fatal */
  }
  return notif;
}

export async function notifyOrderStatusChanged(args: {
  userId: mongoose.Types.ObjectId | string;
  storeId: mongoose.Types.ObjectId | string;
  orderId: string;
  orderNumber: string;
  status: string;
}) {
  const STATUS_LABELS: Record<string, string> = {
    pending:    'en attente',
    assigned:   'assignée au coursier',
    picked_up:  'récupérée',
    in_transit: 'en transit',
    delivered:  'livrée',
    returned:   'retournée',
    cancelled:  'annulée',
    failed:     'échec de livraison',
  };
  const label = STATUS_LABELS[args.status] || args.status;
  return createNotification({
    userId: args.userId,
    storeId: args.storeId,
    type: 'order.status_changed',
    title: `Commande ${args.orderNumber} : ${label}`,
    body: `Mise à jour MogaDelivery — statut « ${args.status} »`,
    link: `/dashboard/orders?storeId=${args.storeId}`,
    meta: {
      orderId: args.orderId,
      orderNumber: args.orderNumber,
      status: args.status,
    },
  });
}

export async function notifyTeamMemberAdded(args: {
  userId: mongoose.Types.ObjectId | string;
  memberEmail: string;
  memberRole: string;
}) {
  return createNotification({
    userId: args.userId,
    type: 'team.member_added',
    title: 'Nouveau membre dans ton équipe',
    body: `${args.memberEmail} a rejoint ton équipe en tant que ${args.memberRole}.`,
    link: '/dashboard/team',
    meta: { memberEmail: args.memberEmail, memberRole: args.memberRole },
  });
}

export async function notifyTeamMemberRemoved(args: {
  userId: mongoose.Types.ObjectId | string;
  memberEmail: string;
}) {
  return createNotification({
    userId: args.userId,
    type: 'team.member_removed',
    title: 'Un membre a quitté ton équipe',
    body: `${args.memberEmail} n'a plus accès à ta boutique.`,
    link: '/dashboard/team',
    meta: { memberEmail: args.memberEmail },
  });
}

/** Le bot a atteint sa limite de messages incluse → on passe en mode facturé
 *  (prélèvement du solde IA par message). Notif une fois par période. */
export async function notifyBotLimitReached(args: {
  userId: mongoose.Types.ObjectId | string;
  storeId: mongoose.Types.ObjectId | string;
  channel: string;
  limit: number;
}) {
  const canal = args.channel === 'whatsapp' ? 'WhatsApp' : 'Messenger';
  return createNotification({
    userId: args.userId,
    storeId: args.storeId,
    type: 'bot.limit_reached',
    title: `Limite du chatbot ${canal} atteinte`,
    body: `Tu as atteint ta limite de ${args.limit} messages inclus ce mois-ci. Les messages suivants sont désormais décomptés de ton solde IA.`,
    link: '/dashboard/apps/whatsapp-bot',
    meta: { channel: args.channel, limit: args.limit },
  });
}

/** Le solde IA est épuisé → le bot ne peut plus répondre aux messages en
 *  dépassement. Notif une fois par période. */
export async function notifyBotBalanceEmpty(args: {
  userId: mongoose.Types.ObjectId | string;
  storeId: mongoose.Types.ObjectId | string;
  channel: string;
}) {
  const canal = args.channel === 'whatsapp' ? 'WhatsApp' : 'Messenger';
  return createNotification({
    userId: args.userId,
    storeId: args.storeId,
    type: 'bot.balance_empty',
    title: `Chatbot ${canal} en pause — solde IA épuisé`,
    body: `Ton solde IA est épuisé, le chatbot ${canal} ne peut plus répondre aux messages au-delà de ta limite. Recharge ton solde IA pour le réactiver.`,
    link: '/dashboard/wallet',
    meta: { channel: args.channel },
  });
}

/**
 * Alerte "pluie d'échecs dispatch" — déclenchée quand > seuil orders ont
 * fait échouer leur dispatch vers le coursier en moins d'une heure.
 * Souvent signe d'un secret HMAC désynchronisé ou d'un catalogue mal
 * référencé côté transporteur. Le vendeur doit agir vite avant qu'une
 * grosse journée de pub ne parte en fumée.
 *
 * Anti-spam : on ne notifie qu'une fois par heure et par store (dédup côté
 * caller via un simple in-memory throttle, pas de state DB).
 */
export async function notifyDispatchStorm(args: {
  userId: mongoose.Types.ObjectId | string;
  storeId: mongoose.Types.ObjectId | string;
  count: number;
  topErrors: Array<{ error: string; count: number }>;
  provider?: string;
}) {
  const topText = args.topErrors
    .slice(0, 3)
    .map((e) => `• ${e.count}× ${e.error.slice(0, 100)}`)
    .join('\n');
  return createNotification({
    userId: args.userId,
    storeId: args.storeId,
    type: 'delivery.dispatch_storm',
    title: `⚠ ${args.count} dispatchs échoués en 1h`,
    body: `Beaucoup de commandes n'ont pas pu être envoyées${args.provider ? ' à ' + args.provider : ''} sur la dernière heure. Top erreurs :\n${topText}`,
    link: '/dashboard/orders?status=pending',
    meta: { count: args.count, topErrors: args.topErrors.slice(0, 3), provider: args.provider },
  });
}
