/**
 * Application Workflow.
 *
 * Premier scénario : une commande digitale reste impayée → email pour
 * revenir payer, puis un rappel. Le passage en « abandoned » est déjà fait
 * par abandon-orders.service (15 min). Ici on attend encore le délai choisi
 * par le vendeur avant le premier email.
 */
import mongoose from 'mongoose';
import { logger } from '../lib/logger';
import { leaderElection } from '../lib/leader-election';
import { ABANDON_GRACE_MS } from './abandon-orders.service';
import { sendEmail } from './email.service';
import { initOrderPayment } from './mobile-money.service';
import { Order } from '../models/Order.model';
import { Product } from '../models/Product.model';
import { Store, type IStore } from '../models/Store.model';
import { WorkflowRun } from '../models/WorkflowRun.model';
import {
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  clampDelayHours,
  clampDelayMinutes,
  escapeHtml,
  firstNameOf,
  isDeliverableEmail,
  renderTemplate,
} from './workflow-template';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SCENARIO = 'abandoned_checkout' as const;

export interface AbandonedCheckoutInput {
  enabled: boolean;
  firstDelayMinutes?: number;
  secondEnabled?: boolean;
  secondDelayHours?: number;
  subject?: string;
  body?: string;
}

export interface WorkflowView {
  storeType: 'physical' | 'digital';
  enabled: boolean;
  enabledAt: string | null;
  abandonedCheckout: {
    firstDelayMinutes: number;
    secondEnabled: boolean;
    secondDelayHours: number;
    subject: string;
    body: string;
  };
}

function apiBase(): string {
  return (process.env.API_PUBLIC_URL || 'http://localhost:5051').replace(/\/$/, '');
}

function frontBase(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:3002').split(',')[0].trim().replace(/\/$/, '');
}

function viewOf(store: IStore): WorkflowView {
  const cfg = store.settings?.workflow?.abandonedCheckout;
  return {
    storeType: store.storeType,
    enabled: !!store.settings?.workflow?.enabled,
    enabledAt: store.settings?.workflow?.enabledAt
      ? new Date(store.settings.workflow.enabledAt).toISOString()
      : null,
    abandonedCheckout: {
      firstDelayMinutes: clampDelayMinutes(cfg?.firstDelayMinutes),
      secondEnabled: cfg?.secondEnabled !== false,
      secondDelayHours: clampDelayHours(cfg?.secondDelayHours),
      subject: (cfg?.subject || '').trim() || DEFAULT_SUBJECT,
      body: (cfg?.body || '').trim() || DEFAULT_BODY,
    },
  };
}

export async function getWorkflow(storeId: string): Promise<WorkflowView | null> {
  const store = await Store.findById(storeId);
  if (!store) return null;
  return viewOf(store);
}

export async function saveWorkflow(
  storeId: string,
  input: AbandonedCheckoutInput,
): Promise<WorkflowView | { error: string }> {
  const store = await Store.findById(storeId);
  if (!store) return { error: 'Boutique introuvable.' };
  if (input.enabled && store.storeType !== 'digital') {
    return { error: 'Ce scénario concerne les boutiques digitales.' };
  }

  const prev = store.settings?.workflow;
  const enabling = input.enabled && !prev?.enabled;
  const subject = (input.subject || '').trim().slice(0, 140) || DEFAULT_SUBJECT;
  const body = (input.body || '').trim().slice(0, 2000) || DEFAULT_BODY;

  store.set('settings.workflow', {
    enabled: !!input.enabled,
    enabledAt: enabling ? new Date() : prev?.enabledAt,
    abandonedCheckout: {
      firstDelayMinutes: clampDelayMinutes(input.firstDelayMinutes),
      secondEnabled: input.secondEnabled !== false,
      secondDelayHours: clampDelayHours(input.secondDelayHours),
      subject,
      body,
    },
  });
  await store.save();
  return viewOf(store);
}

export async function listWorkflowRuns(storeId: string) {
  const runs = await WorkflowRun.find({ storeId, scenario: SCENARIO })
    .sort({ sentAt: -1 })
    .limit(50)
    .lean();
  if (runs.length === 0) return [];

  const orders = await Order.find({ _id: { $in: runs.map((r) => r.orderId) } })
    .select('orderNumber paymentStatus')
    .lean();
  const byId = new Map(orders.map((o) => [String(o._id), o]));

  return runs.map((run) => {
    const order = byId.get(String(run.orderId));
    return {
      id: String(run._id),
      orderId: String(run.orderId),
      orderNumber: order?.orderNumber || '—',
      step: run.step,
      status: run.status,
      recovered: order?.paymentStatus === 'paid',
      to: run.to,
      subject: run.subject,
      error: run.error || null,
      sentAt: run.sentAt,
    };
  });
}

function resumeUrl(orderId: string): string {
  return `${apiBase()}/api/public/checkout/resume/${orderId}`;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function emailHtml(paragraphs: string[], link: string, storeName: string): string {
  const blocks = paragraphs
    .map((p) => {
      if (p === link || p.includes(link)) {
        return `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#6D28D9;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px">Finaliser ma commande</a></p>`;
      }
      return `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(p)}</p>`;
    })
    .join('');
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;font-size:15px;max-width:520px">${blocks}<p style="margin:24px 0 0;color:#64748b;font-size:12px">${escapeHtml(storeName)}</p></div>`;
}

async function sendStep(args: {
  storeId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  step: 1 | 2;
  to: string;
  subject: string;
  body: string;
  link: string;
  storeName: string;
}): Promise<void> {
  const existing = await WorkflowRun.findOne({
    orderId: args.orderId,
    scenario: SCENARIO,
    step: args.step,
  }).select('_id');
  if (existing) return;

  let run;
  try {
    run = await WorkflowRun.create({
      storeId: args.storeId,
      orderId: args.orderId,
      scenario: SCENARIO,
      step: args.step,
      status: 'failed',
      to: args.to,
      subject: args.subject,
      error: 'Envoi interrompu',
      sentAt: new Date(),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return;
    throw err;
  }

  const text = args.body;
  const html = emailHtml(text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean), args.link, args.storeName);
  const result = await sendEmail({ to: args.to, subject: args.subject, html, text });
  run.status = result.ok ? 'sent' : 'failed';
  run.error = result.ok ? undefined : (result.error || 'Envoi impossible');
  await run.save();
}

/** Un passage. Les commandes créées avant l'activation sont ignorées. */
export async function sweepAbandonedCheckoutEmails(): Promise<{ sent: number }> {
  const stores = await Store.find({
    storeType: 'digital',
    'settings.workflow.enabled': true,
    'settings.workflow.enabledAt': { $exists: true },
  }).select('name slug settings.workflow');

  let sent = 0;
  for (const store of stores) {
    const view = viewOf(store);
    if (!view.enabled || !view.enabledAt) continue;
    const enabledAt = new Date(view.enabledAt);
    const firstWait = ABANDON_GRACE_MS + view.abandonedCheckout.firstDelayMinutes * 60 * 1000;
    const cutoff = new Date(Date.now() - firstWait);

    const orders = await Order.find({
      storeId: store._id,
      paymentStatus: 'abandoned',
      paymentMethod: { $ne: 'cod' },
      createdAt: { $gte: enabledAt, $lte: cutoff },
    })
      .sort({ createdAt: 1 })
      .limit(40);

    for (const order of orders) {
      if (!isDeliverableEmail(order.email)) continue;
      const runs = await WorkflowRun.find({ orderId: order._id, scenario: SCENARIO }).select('step sentAt status');
      const step1 = runs.find((r) => r.step === 1);
      const step2 = runs.find((r) => r.step === 2);
      const name = firstNameOf(order.customerName);
      const product = order.items[0]?.name || 'ta commande';
      const link = resumeUrl(String(order._id));
      const vars = {
        firstName: name ? ` ${name}` : '',
        product,
        amount: money(order.total, order.currency || 'XOF'),
        link,
        storeName: store.name,
      };
      const subject = renderTemplate(view.abandonedCheckout.subject, vars).replace(/\s+/g, ' ').trim().slice(0, 140);
      const body = renderTemplate(view.abandonedCheckout.body, vars);

      if (!step1) {
        await sendStep({
          storeId: store._id,
          orderId: order._id,
          step: 1,
          to: order.email,
          subject,
          body,
          link,
          storeName: store.name,
        });
        sent += 1;
        continue;
      }
      if (!view.abandonedCheckout.secondEnabled || step2 || step1.status !== 'sent') continue;
      const due = new Date(step1.sentAt).getTime() + view.abandonedCheckout.secondDelayHours * 60 * 60 * 1000;
      if (Date.now() < due) continue;
      await sendStep({
        storeId: store._id,
        orderId: order._id,
        step: 2,
        to: order.email,
        subject,
        body,
        link,
        storeName: store.name,
      });
      sent += 1;
    }
  }
  if (sent > 0) logger.info({ sent }, '[workflow] abandoned checkout emails');
  return { sent };
}

/**
 * Le lien de l'email. Rouvre le paiement de la même commande, ou ramène
 * vers le checkout du produit si le prestataire ne répond pas.
 */
export async function resumeCheckout(orderId: string): Promise<string> {
  const front = frontBase();
  if (!mongoose.isValidObjectId(orderId)) return front;
  const order = await Order.findById(orderId);
  if (!order) return front;

  const store = await Store.findById(order.storeId).select('slug');
  const product = order.items[0]?.productId
    ? await Product.findById(order.items[0].productId).select('slug')
    : null;
  const checkoutFallback = store?.slug && product?.slug
    ? `${front}/${store.slug}/checkout/${product.slug}`
    : store?.slug
      ? `${front}/${store.slug}`
      : front;

  if (order.paymentStatus === 'paid') {
    return order.downloadToken ? `${front}/d/${order.downloadToken}` : `${front}/thanks/${order._id}`;
  }
  if (order.paymentStatus !== 'abandoned' && order.paymentStatus !== 'pending' && order.paymentStatus !== 'failed') {
    return checkoutFallback;
  }

  const phone = order.paymentPhone || order.customerPhone || order.customerWhatsapp || '';
  try {
    if (order.paymentStatus === 'abandoned' || order.paymentStatus === 'failed') {
      order.paymentStatus = 'pending';
    }
    const init = await initOrderPayment(order, { phone });
    order.paymentReference = init.reference;
    order.paymentProvider = init.provider;
    await order.save();
    return init.checkoutUrl || checkoutFallback;
  } catch (err) {
    logger.warn({ err, orderId }, '[workflow] resume payment failed');
    return checkoutFallback;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startWorkflowJob(): void {
  if (timer) return;
  setTimeout(() => {
    if (!leaderElection.isLeader()) return;
    void sweepAbandonedCheckoutEmails().catch((err) =>
      logger.error({ err }, '[workflow] initial sweep failed'),
    );
  }, 45_000);
  timer = setInterval(() => {
    if (!leaderElection.isLeader()) return;
    void sweepAbandonedCheckoutEmails().catch((err) =>
      logger.error({ err }, '[workflow] sweep crashed'),
    );
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
  logger.info({ sweepIntervalMs: SWEEP_INTERVAL_MS }, '[workflow] abandoned-checkout job started');
}
