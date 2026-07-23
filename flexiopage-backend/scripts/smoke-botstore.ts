/**
 * Smoke test the botstore end-to-end.
 *  1. Enables settings.botstore on the first published store found.
 *  2. Posts a real question to /api/public/botstore/:slug/chat.
 *  3. Prints the reply + fallback flag.
 *
 * Usage: npx tsx scripts/smoke-botstore.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Store } from '../src/models/Store.model';

const API = process.env.SMOKE_API || `http://localhost:${process.env.PORT || 5051}`;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const store = await Store.findOne({ isPublished: true }).sort({ updatedAt: -1 });
  if (!store) {
    console.error('No published store found. Publish one first.');
    process.exit(1);
  }

  const slug = store.slug;
  console.log(`[smoke] Using store: ${store.name} (/${slug})`);

  // Targeted $set — évite de re-valider les champs stales (menuLinks vides, etc.)
  // sur ce store de test précis. On enable + on pose une config light.
  await Store.updateOne(
    { _id: store._id },
    {
      $set: {
        'settings.botstore': {
          enabled: true,
          persona: 'Amical, tutoie le client, réponds en français simple.',
          instructions: 'Livraison en 24-48h. Paiement à la livraison uniquement.',
          position: 'bottom-right',
          accentColor: '#4f46e5',
          greeting: 'Salut 👋',
          launcherLabel: 'Discuter avec nous',
          whatsappFallback: { enabled: true, alwaysOffer: false, ctaLabel: 'Discuter sur WhatsApp' },
        },
      },
    },
  );
  console.log('[smoke] Botstore enabled on this store.');

  // Send a real chat message.
  const res = await fetch(`${API}/api/public/botstore/${slug}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Bonjour, que vendez-vous et à quel prix ?',
      history: [],
    }),
  });
  const body = await res.json().catch(() => null);
  console.log('[smoke] HTTP', res.status);
  console.log('[smoke] Body:', JSON.stringify(body, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
