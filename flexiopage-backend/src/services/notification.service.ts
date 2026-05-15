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
  return Notification.create({
    userId: args.userId,
    storeId: args.storeId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
    meta: args.meta,
    read: false,
  });
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
  return createNotification({
    userId: args.userId,
    storeId: args.storeId,
    type: 'order.created',
    title: `Commande ${args.orderNumber}`,
    body: `${who} · ${args.total} ${args.currency}`,
    link: `/dashboard/orders?storeId=${args.storeId}`,
    meta: {
      orderId: args.orderId,
      orderNumber: args.orderNumber,
      total: args.total,
      currency: args.currency,
    },
  });
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
