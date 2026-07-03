/**
 * Diagnostic : historique complet des webhooks MogaDelivery d'une commande.
 *
 * Affiche, pour un numéro de commande (ou un externalId MD) :
 *   - l'état de livraison actuel de la commande côté FlexioPage ;
 *   - TOUS les WebhookLog liés (sortants = dispatch, entrants = statuts MD),
 *     en ordre chronologique, avec code HTTP / signature / erreur ;
 *   - un résumé : statuts MD reçus (succès) vs rejetés (error).
 *
 * Sert à trancher « pourquoi seul Livré s'affiche » : on voit exactement ce
 * que MogaDelivery a réellement envoyé et ce qui a été rejeté (signature…).
 *
 * Usage :
 *   npm run webhooks:inspect -- ORD-1024
 *   npm run webhooks:inspect -- MD-abc123        (externalId MD)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Order } from '../src/models/Order.model';
import { WebhookLog } from '../src/models/WebhookLog.model';

function fmt(d?: Date): string {
  if (!d) return '—';
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19);
}

async function main(): Promise<void> {
  const arg = process.argv[2]?.trim();
  if (!arg) {
    console.error('Usage : npm run webhooks:inspect -- <ORD-xxxx | MD-externalId>');
    process.exit(1);
  }
  await connectDB();

  // Retrouve la commande par numéro OU par externalId de livraison.
  const order: any = await Order.findOne({
    $or: [{ orderNumber: arg }, { 'delivery.externalId': arg }],
  }).lean();

  console.log('\n════════════════════════════════════════════════════════════');
  if (!order) {
    console.log(`Aucune commande trouvée pour « ${arg} ».`);
    console.log('On cherche quand même des WebhookLog par orderNumber…\n');
  } else {
    console.log(`Commande      : ${order.orderNumber}`);
    console.log(`Client        : ${order.customerName || '—'} · ${order.customerPhone || '—'}`);
    console.log(`Paiement      : ${order.paymentStatus} (${order.paymentMethod})`);
    console.log(`Fulfillment   : ${order.fulfillmentStatus}`);
    console.log(`Transporteur  : ${order.delivery?.provider || '—'}`);
    console.log(`externalId    : ${order.delivery?.externalId || '— (jamais dispatchée)'}`);
    console.log(`Statut MD     : ${order.delivery?.externalStatus || '—'}  (dernière synchro: ${fmt(order.delivery?.lastSyncedAt)})`);
    if (order.delivery?.error) console.log(`Erreur dispatch: ${order.delivery.error}`);
  }
  console.log('════════════════════════════════════════════════════════════\n');

  const q: Record<string, unknown> = order
    ? { $or: [{ orderId: order._id }, { orderNumber: order.orderNumber }] }
    : { orderNumber: arg };
  const logs: any[] = await WebhookLog.find(q).sort({ createdAt: 1 }).lean();

  if (!logs.length) {
    console.log('Aucun WebhookLog pour cette commande.');
    console.log('→ Si MD prétend avoir envoyé des statuts, ils ne sont jamais arrivés');
    console.log('  (mauvais externalId, mauvaise URL, ou pas envoyés du tout).\n');
    await mongoose.disconnect();
    return;
  }

  console.log(`${logs.length} webhook(s) :\n`);
  for (const l of logs) {
    const arrow = l.direction === 'outbound' ? '→ MD ' : '← MD ';
    const ok = l.status === 'success' ? '✓' : '✗';
    const bits = [
      fmt(l.createdAt),
      arrow,
      `${ok} ${l.direction}`,
      l.event ? `[${l.event}]` : '',
      l.httpStatus != null ? `http=${l.httpStatus}` : '',
      l.signatureValid === false ? 'SIGNATURE INVALIDE' : l.signatureValid === true ? 'sig=ok' : '',
      l.secretSource ? `secret=${l.secretSource}` : '',
      l.error ? `— ${l.error}` : '',
    ].filter(Boolean);
    console.log('  ' + bits.join('  '));
  }

  // Résumé inbound (ce que MD nous a réellement envoyé).
  const inbound = logs.filter((l) => l.direction === 'inbound');
  const received = inbound.filter((l) => l.status === 'success').map((l) => l.event);
  const rejected = inbound.filter((l) => l.status === 'error');
  console.log('\n────────────────────────────────────────────────────────────');
  console.log(`Statuts MD reçus (OK)     : ${received.length ? received.join(' → ') : '(aucun)'}`);
  console.log(`Webhooks MD rejetés (KO)  : ${rejected.length}`);
  for (const r of rejected) {
    console.log(`   ✗ ${fmt(r.createdAt)} [${r.event || '?'}] — ${r.error}${r.signatureValid === false ? ' (signature)' : ''}`);
  }
  console.log('────────────────────────────────────────────────────────────');
  if (!inbound.length) {
    console.log('⚠ Aucun webhook ENTRANT : MD ne nous a envoyé aucun statut pour cette commande.');
  } else if (received.length === 1 && received[0] === 'delivered') {
    console.log('⚠ Seul « delivered » reçu → MD n\'envoie pas les statuts intermédiaires.');
  }
  console.log('');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('inspect-order-webhooks failed:', (err as Error).message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
