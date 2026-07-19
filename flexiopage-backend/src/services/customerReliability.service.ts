import mongoose from 'mongoose';
import { Order } from '../models/Order.model';
import { phoneKey } from '../utils/phone';

/**
 * Fiabilité client (COD) — aide à la décision pour l'agent de confirmation.
 *
 * On agrège l'historique d'un numéro pour détecter les clients « à risque »
 * (colis retournés à répétition, refus à la confirmation). Modèle HYBRIDE :
 *   - `store`    : détail complet des commandes DE CETTE boutique (visible).
 *   - `platform` : compteurs agrégés sur TOUTE la plateforme (nombres seuls,
 *                  sans exposer les commandes des autres vendeurs).
 * Le badge/score se calcule prioritairement sur le signal plateforme, plus
 * puissant contre le serial-refuser qui change de vendeur.
 *
 * Système « conseil seulement » : rien n'est bloqué, l'agent garde la main.
 */

export type ReliabilityBadge = 'reliable' | 'watch' | 'risky';

/** Un colis est « retourné » quand le transporteur le renvoie (refus livraison). */
function isReturned(o: { delivery?: { externalStatus?: string } }): boolean {
  return o.delivery?.externalStatus === 'returned';
}
/** Livraison réussie (signal positif). */
function isDelivered(o: {
  fulfillmentStatus?: string;
  delivery?: { externalStatus?: string };
}): boolean {
  return o.fulfillmentStatus === 'fulfilled' || o.delivery?.externalStatus === 'delivered';
}

interface Counts {
  total: number;
  delivered: number;
  returned: number;
  declined: number; // refus à l'appel de confirmation
  noAnswer: number; // injoignable à l'appel
  /** Commandes ayant atteint une issue de livraison (livrée ou retournée). */
  decisive: number;
  /** returned / decisive, arrondi 0-1 (0 si aucune issue). */
  returnRate: number;
}

interface CountableOrder {
  fulfillmentStatus?: string;
  confirmationStatus?: string;
  delivery?: { externalStatus?: string };
}

function countOrders(orders: CountableOrder[]): Counts {
  const c: Counts = {
    total: orders.length,
    delivered: 0,
    returned: 0,
    declined: 0,
    noAnswer: 0,
    decisive: 0,
    returnRate: 0,
  };
  for (const o of orders) {
    const ret = isReturned(o);
    const del = isDelivered(o);
    if (ret) c.returned += 1;
    if (del) c.delivered += 1;
    if (ret || del) c.decisive += 1;
    if (o.confirmationStatus === 'declined') c.declined += 1;
    if (o.confirmationStatus === 'no_answer') c.noAnswer += 1;
  }
  c.returnRate = c.decisive > 0 ? Math.round((c.returned / c.decisive) * 100) / 100 : 0;
  return c;
}

/**
 * Score 0-100 (100 = parfaitement fiable) — sert au tri / affichage.
 * Chaque retour pèse lourd, un refus à l'appel un peu moins, une livraison
 * réussie rachète partiellement.
 */
function computeScore(p: Counts): number {
  let s = 100;
  s -= p.returned * 35;
  s -= p.declined * 12;
  s -= p.noAnswer * 4;
  s += Math.min(p.delivered, 5) * 4;
  return Math.max(0, Math.min(100, s));
}

/** Règles de badge, basées sur le signal plateforme (fallback boutique). */
function computeBadge(p: Counts): { badge: ReliabilityBadge; reasons: string[] } {
  const reasons: string[] = [];

  if (p.total === 0) {
    return { badge: 'reliable', reasons: ['Nouveau client, aucun historique'] };
  }

  // 🔴 Risque élevé
  if (p.returned >= 2) {
    reasons.push(`${p.returned} colis retournés au total`);
    return { badge: 'risky', reasons };
  }
  if (p.decisive >= 2 && p.returnRate >= 0.5) {
    reasons.push(`Taux de retour ${Math.round(p.returnRate * 100)}% (${p.returned}/${p.decisive})`);
    return { badge: 'risky', reasons };
  }

  // 🟡 À surveiller
  if (p.returned === 1) reasons.push('1 colis déjà retourné');
  if (p.declined >= 2) reasons.push(`${p.declined} refus à la confirmation`);
  if (reasons.length > 0) {
    return { badge: 'watch', reasons };
  }

  // 🟢 Fiable
  if (p.delivered >= 1) reasons.push(`${p.delivered} livraison(s) réussie(s)`);
  return { badge: 'reliable', reasons: reasons.length ? reasons : ['Aucun incident'] };
}

export interface OrderSummary {
  _id: string;
  orderNumber: string;
  createdAt: Date;
  total: number;
  currency: string;
  confirmationStatus?: string;
  fulfillmentStatus?: string;
  deliveryStatus?: string;
  isReturn: boolean;
}

export interface ReliabilityResult {
  phoneKey: string | null;
  badge: ReliabilityBadge;
  score: number;
  reasons: string[];
  /** Détail des commandes de la boutique courante. */
  store: Counts & { orders: OrderSummary[] };
  /** Compteurs agrégés plateforme (sans détail cross-vendeur). */
  platform: Counts;
}

/** Résultat neutre quand on n'a pas de numéro exploitable. */
function emptyResult(): ReliabilityResult {
  const zero: Counts = { total: 0, delivered: 0, returned: 0, declined: 0, noAnswer: 0, decisive: 0, returnRate: 0 };
  return {
    phoneKey: null,
    badge: 'reliable',
    score: 100,
    reasons: ['Numéro absent ou invalide'],
    store: { ...zero, orders: [] },
    platform: { ...zero },
  };
}

/** Agrégat de comptage via un unique pipeline (retours / livraisons / refus). */
async function aggregateCounts(match: Record<string, unknown>): Promise<Counts> {
  const [row] = await Order.aggregate<{
    total: number;
    delivered: number;
    returned: number;
    declined: number;
    noAnswer: number;
    decisive: number;
  }>([
    { $match: match },
    {
      $project: {
        isReturned: { $eq: ['$delivery.externalStatus', 'returned'] },
        isDelivered: {
          $or: [
            { $eq: ['$fulfillmentStatus', 'fulfilled'] },
            { $eq: ['$delivery.externalStatus', 'delivered'] },
          ],
        },
        declined: { $eq: ['$confirmationStatus', 'declined'] },
        noAnswer: { $eq: ['$confirmationStatus', 'no_answer'] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        returned: { $sum: { $cond: ['$isReturned', 1, 0] } },
        delivered: { $sum: { $cond: ['$isDelivered', 1, 0] } },
        declined: { $sum: { $cond: ['$declined', 1, 0] } },
        noAnswer: { $sum: { $cond: ['$noAnswer', 1, 0] } },
        decisive: { $sum: { $cond: [{ $or: ['$isReturned', '$isDelivered'] }, 1, 0] } },
      },
    },
  ]);

  const total = row?.total ?? 0;
  const returned = row?.returned ?? 0;
  const decisive = row?.decisive ?? 0;
  return {
    total,
    delivered: row?.delivered ?? 0,
    returned,
    declined: row?.declined ?? 0,
    noAnswer: row?.noAnswer ?? 0,
    decisive,
    returnRate: decisive > 0 ? Math.round((returned / decisive) * 100) / 100 : 0,
  };
}

/**
 * Calcule la fiabilité d'un client à partir de son numéro.
 * @param storeId  boutique courante (pour le détail visible)
 * @param phone    numéro brut saisi sur la commande
 * @param excludeOrderId  commande en cours de confirmation (exclue des compteurs)
 */
export async function getCustomerReliability(
  storeId: string | mongoose.Types.ObjectId,
  phone?: string | null,
  excludeOrderId?: string,
): Promise<ReliabilityResult> {
  const key = phoneKey(phone);
  if (!key) return emptyResult();

  const excl = excludeOrderId && mongoose.isValidObjectId(excludeOrderId)
    ? new mongoose.Types.ObjectId(excludeOrderId)
    : undefined;

  const storeMatch: Record<string, unknown> = {
    storeId: new mongoose.Types.ObjectId(String(storeId)),
    customerPhoneKey: key,
  };
  const platformMatch: Record<string, unknown> = { customerPhoneKey: key };
  if (excl) {
    storeMatch._id = { $ne: excl };
    platformMatch._id = { $ne: excl };
  }

  const [storeOrdersRaw, platform] = await Promise.all([
    Order.find(storeMatch)
      .sort({ createdAt: -1 })
      .limit(50)
      .select('orderNumber createdAt total currency confirmationStatus fulfillmentStatus delivery.externalStatus')
      .lean(),
    aggregateCounts(platformMatch),
  ]);

  const storeCounts = countOrders(storeOrdersRaw as CountableOrder[]);
  const orders: OrderSummary[] = (storeOrdersRaw as Array<Record<string, unknown>>).map((o) => ({
    _id: String(o._id),
    orderNumber: String(o.orderNumber),
    createdAt: o.createdAt as Date,
    total: Number(o.total ?? 0),
    currency: String(o.currency ?? 'USD'),
    confirmationStatus: o.confirmationStatus as string | undefined,
    fulfillmentStatus: o.fulfillmentStatus as string | undefined,
    deliveryStatus: (o.delivery as { externalStatus?: string } | undefined)?.externalStatus,
    isReturn: isReturned(o as CountableOrder),
  }));

  // Le badge/score s'appuie sur le signal plateforme (plus complet).
  const { badge, reasons } = computeBadge(platform);
  const score = computeScore(platform);

  return {
    phoneKey: key,
    badge,
    score,
    reasons,
    store: { ...storeCounts, orders },
    platform,
  };
}

/**
 * Version batch pour la liste orders — évite le N+1 (20 rows visibles = 20
 * appels sinon). Prend un tableau de phones (ou phoneKeys), renvoie un
 * Record `{ [phoneKey]: { badge, score, total, refusalRate } }`. Le badge
 * est basé sur les compteurs plateforme (agrégé en UN pipeline).
 */
export async function getCustomerReliabilityBatch(
  phones: string[],
): Promise<Record<string, { badge: ReliabilityBadge; score: number; total: number; refusalRate: number }>> {
  // Table de correspondance phoneRaw → phoneKey normalisé. On garde ce mapping
  // pour renvoyer un dict keyé par le phone brut (le client n'a pas le key
  // normalisé, ça évite de dupliquer la logique phoneKey côté frontend).
  const phoneToKey: Record<string, string> = {};
  for (const p of phones) {
    const k = phoneKey(p);
    if (k) phoneToKey[p] = k;
  }
  const keys = Array.from(new Set(Object.values(phoneToKey)));
  if (keys.length === 0) return {};

  // Un seul pipeline qui matche tous les phoneKeys, groupe par key, et
  // agrège les 4 métriques nécessaires au badge. Pas de projection des
  // commandes individuelles — on ne renvoie que les compteurs.
  const rows = await Order.aggregate([
    { $match: { customerPhoneKey: { $in: keys } } },
    {
      $group: {
        _id: '$customerPhoneKey',
        total: { $sum: 1 },
        delivered: {
          $sum: {
            $cond: [
              { $or: [
                { $eq: ['$fulfillmentStatus', 'fulfilled'] },
                { $eq: ['$delivery.externalStatus', 'delivered'] },
              ]},
              1, 0,
            ],
          },
        },
        returned: { $sum: { $cond: [{ $eq: ['$delivery.externalStatus', 'returned'] }, 1, 0] } },
        declined: { $sum: { $cond: [{ $eq: ['$confirmationStatus', 'declined'] }, 1, 0] } },
        noAnswer: { $sum: { $cond: [{ $eq: ['$confirmationStatus', 'no_answer'] }, 1, 0] } },
      },
    },
  ]);

  // On construit d'abord le résultat keyé par phoneKey, puis on le "réémet"
  // pour chaque phone brut qui pointe vers ce key. Ça permet de renvoyer
  // le même badge pour deux formats du même numéro (+221701234, 0221701234).
  const byKey: Record<string, { badge: ReliabilityBadge; score: number; total: number; refusalRate: number }> = {};
  for (const row of rows) {
    const counts: Counts = {
      total: row.total,
      delivered: row.delivered || 0,
      returned: row.returned || 0,
      declined: row.declined || 0,
      noAnswer: row.noAnswer || 0,
      decisive: (row.delivered || 0) + (row.returned || 0),
      returnRate: 0,
    };
    counts.returnRate = counts.decisive > 0 ? Math.round((counts.returned / counts.decisive) * 100) / 100 : 0;
    const { badge } = computeBadge(counts);
    const score = computeScore(counts);
    const refusalRate = counts.total > 0
      ? Math.round(((counts.declined + counts.returned) / counts.total) * 100) / 100
      : 0;
    byKey[row._id] = { badge, score, total: counts.total, refusalRate };
  }

  const out: Record<string, { badge: ReliabilityBadge; score: number; total: number; refusalRate: number }> = {};
  for (const [rawPhone, key] of Object.entries(phoneToKey)) {
    if (byKey[key]) out[rawPhone] = byKey[key];
  }
  return out;
}
