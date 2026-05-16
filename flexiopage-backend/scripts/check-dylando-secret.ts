import 'dotenv/config';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { Store } from '../src/models/Store.model';

const STORE_ID = '6a05f36317450c7ec240c30f';

function mask(s: string | undefined): string {
  if (!s) return '(empty)';
  return `${s.slice(0, 6)}…${s.slice(-6)} (len=${s.length})`;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const store: any = await Store.findById(STORE_ID).lean();
  if (!store) {
    console.log(`Store ${STORE_ID} NOT FOUND`);
    process.exit(1);
  }
  const cfg = store.integrations?.delivery || {};
  const log = store.integrations?.logistics || {};
  console.log('--- store.integrations.delivery ---');
  console.log('enabled        :', cfg.enabled);
  console.log('provider       :', cfg.provider);
  console.log('baseUrl        :', cfg.baseUrl || '(default)');
  console.log('webhookSecret  :', mask(cfg.webhookSecret));
  console.log();
  console.log('--- store.integrations.logistics ---');
  console.log('enabled        :', log.enabled);
  console.log('provider       :', log.provider);
  console.log('autoForward    :', log.autoForward);
  console.log('baseUrl        :', log.baseUrl || '(default)');
  console.log('webhookSecret  :', mask(log.webhookSecret));
  console.log();
  console.log('--- env fallbacks ---');
  console.log('FLEXIOPAGE_WEBHOOK_SECRET :', mask(process.env.FLEXIOPAGE_WEBHOOK_SECRET));
  console.log('BOUTSHOP_WEBHOOK_SECRET   :', mask(process.env.BOUTSHOP_WEBHOOK_SECRET));
  console.log();

  // Real dispatch path: if logistics is the trigger, it synthesises delivery
  // config from logistics. So the *signing* secret resolution becomes:
  //   logistics.webhookSecret → env (FLEXIOPAGE) → env (BOUTSHOP)
  const synthesisedDeliverySecret = log.webhookSecret || cfg.webhookSecret;
  const effective =
    synthesisedDeliverySecret ||
    process.env.FLEXIOPAGE_WEBHOOK_SECRET ||
    process.env.BOUTSHOP_WEBHOOK_SECRET ||
    '';
  console.log('--- effective secret used to sign for THIS store ---');
  console.log(mask(effective));
  console.log('first4 :', effective.slice(0, 4), '   last4 :', effective.slice(-4));

  const sample = '{"test":"payload"}';
  const sig = crypto.createHmac('sha256', effective).update(sample).digest('hex');
  console.log('sample HMAC over `{"test":"payload"}`:', sig);

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
