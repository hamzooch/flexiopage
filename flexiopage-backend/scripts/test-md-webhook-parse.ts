/**
 * Test local (sans DB, sans MogaDelivery réel) du parsing des webhooks MD.
 *
 * Vérifie le fix des deux symptômes :
 *   A. les statuts de livraison intermédiaires remontent (plus « seul Livré »)
 *      quel que soit le nom de champ (status / order_status / shipping_status /
 *      statut_livraison) et la langue (EN/FR) ;
 *   B. le statut de confirmation (centre d'appel) est extrait du payload.
 *
 * Run : npm run test:md-webhook
 */
import { getDeliveryProvider } from '../src/services/delivery.service';

const provider = getDeliveryProvider('mogadelivery');
if (!provider) {
  console.error('MogaDelivery provider introuvable');
  process.exit(1);
}

interface Case {
  name: string;
  payload: Record<string, unknown>;
  expect: { status: string; confirmation?: string };
}

const cases: Case[] = [
  // ── A : statuts de livraison, champ & langue variés ──────────────────
  { name: 'status=in_transit', payload: { delivery_id: 'MD1', order_id: 'FX-1', status: 'in_transit' }, expect: { status: 'in_transit' } },
  { name: 'status=out_for_delivery', payload: { status: 'out_for_delivery' }, expect: { status: 'in_transit' } },
  { name: 'shipping_status=picked_up', payload: { shipping_status: 'picked_up' }, expect: { status: 'picked_up' } },
  { name: 'statut_livraison=en_cours (FR)', payload: { statut_livraison: 'en_cours' }, expect: { status: 'in_transit' } },
  { name: 'status=Livré (FR + accent + casse)', payload: { status: 'Livré' }, expect: { status: 'delivered' } },
  { name: 'status=Retourné (FR)', payload: { status: 'Retourné' }, expect: { status: 'returned' } },
  { name: 'status=annulée (FR)', payload: { status: 'annulée' }, expect: { status: 'cancelled' } },
  { name: 'status=assigned', payload: { status: 'assigned' }, expect: { status: 'assigned' } },
  { name: 'valeur inconnue → pending', payload: { status: 'zzz' }, expect: { status: 'pending' } },

  // ── B : statut de confirmation (centre d'appel) ──────────────────────
  { name: 'order_status=confirmed → assigned + confirmed', payload: { order_status: 'confirmed' }, expect: { status: 'assigned', confirmation: 'confirmed' } },
  { name: 'order_status=no_answer', payload: { order_status: 'no_answer' }, expect: { status: 'pending', confirmation: 'no_answer' } },
  { name: 'notreachable (champ unique) → no_answer', payload: { status: 'notreachable' }, expect: { status: 'pending', confirmation: 'no_answer' } },
  { name: 'order_status=callback', payload: { order_status: 'callback' }, expect: { status: 'pending', confirmation: 'callback' } },
  { name: 'order_status=refusé (FR) → declined', payload: { order_status: 'refusé' }, expect: { status: 'pending', confirmation: 'declined' } },
  { name: 'deux enums : confirmed + in_transit', payload: { order_status: 'confirmed', shipping_status: 'in_transit' }, expect: { status: 'in_transit', confirmation: 'confirmed' } },

  // ── Garde-fous : un événement purement logistique ne touche PAS la confirmation ──
  { name: 'shipping cancelled → PAS de confirmation', payload: { shipping_status: 'cancelled' }, expect: { status: 'cancelled' } },
  { name: 'delivered → PAS de confirmation', payload: { status: 'delivered' }, expect: { status: 'delivered' } },
];

async function main(): Promise<void> {
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const r = await provider!.parseWebhook(c.payload, {});
    const okStatus = r.status === c.expect.status;
    const okConf = (c.expect.confirmation ?? undefined) === (r.confirmation ?? undefined);
    const ok = okStatus && okConf;
    ok ? pass++ : fail++;
    const got = `status=${r.status} confirmation=${r.confirmation ?? '—'}`;
    const exp = `status=${c.expect.status} confirmation=${c.expect.confirmation ?? '—'}`;
    console.log(`${ok ? '✅' : '❌'} ${c.name.padEnd(48)} → ${got}${ok ? '' : `   (attendu ${exp})`}`);
  }
  console.log(`\n${pass}/${pass + fail} cas OK`);
  process.exit(fail ? 1 : 0);
}

void main();
