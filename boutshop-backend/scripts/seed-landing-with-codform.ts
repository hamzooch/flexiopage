/**
 * Quick seed: a landing page on the test store that includes a cod-form
 * section. Used to validate the new section type end-to-end:
 *   GET /store/boutique-test/p/caftan-landing → renders hero + features +
 *   cod-form (live order form for Caftan Brodé Marrakech) + cta.
 *
 * Run: cd boutshop-backend && npx tsx scripts/seed-landing-with-codform.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Store } from '../src/models/Store.model';
import { LandingPage } from '../src/models/LandingPage.model';

async function main(): Promise<void> {
  await connectDB();

  const store = await Store.findOne({ slug: 'boutique-test' });
  if (!store) {
    throw new Error('Run seed:test-store first.');
  }

  const slug = 'caftan-landing';
  await LandingPage.deleteOne({ storeId: store._id, slug });

  const page = await LandingPage.create({
    storeId: store._id,
    name: 'Caftan Marrakech — Landing',
    slug,
    sections: [
      {
        id: 'sec-h',
        type: 'hero',
        order: 0,
        props: {
          title: 'Caftan Brodé Marrakech',
          subtitle: 'Soie pure · brodé main · livraison express en Afrique de l’Ouest et au Maghreb',
          ctaText: 'Commander maintenant',
          layout: 'split',
        },
      },
      {
        id: 'sec-f',
        type: 'features',
        order: 1,
        props: {
          title: 'Pourquoi nos clientes adorent',
          items: [
            { title: 'Soie pure', description: 'Tissu premium · 100% naturel', icon: 'leaf' },
            { title: 'Brodé main', description: 'Artisanat marocain authentique', icon: 'crown' },
            { title: 'Livraison 48h', description: 'Casablanca · Dakar · Tunis', icon: 'truck' },
            { title: 'Paiement à réception', description: 'Tu vérifies, tu paies', icon: 'shield' },
          ],
        },
      },
      {
        id: 'sec-t',
        type: 'testimonials',
        order: 2,
        props: {
          title: 'Elles ont commandé',
          items: [
            { quote: 'La qualité est incroyable, exactement comme sur la photo.', author: 'Khadija', role: 'Casablanca', rating: 5 },
            { quote: 'Livraison rapide et le caftan est sublime !', author: 'Aïssatou', role: 'Dakar', rating: 5 },
            { quote: 'Paiement à la livraison, super pratique.', author: 'Lamia', role: 'Tunis', rating: 5 },
          ],
        },
      },
      {
        id: 'sec-c',
        type: 'cod-form',
        order: 3,
        props: {
          title: 'Commande ton caftan',
          subtitle: 'Remplis tes coordonnées — paiement en espèces à la livraison',
          submitLabel: 'Réserver mon caftan',
          reassurance: 'Aucun prépaiement · vérifie le colis avant de payer.',
          productSlug: 'caftan-brode-marrakech',
          showPostalCode: true,
          showState: false,
          showQuantity: true,
          showNotes: true,
          showEmail: true,
          requireEmail: false,
        },
      },
      {
        id: 'sec-cta',
        type: 'cta',
        order: 4,
        props: {
          title: 'Stock limité',
          subtitle: 'Plus que quelques pièces disponibles ce mois-ci.',
          buttonText: 'Commander',
        },
      },
    ],
    seoTitle: 'Caftan Brodé Marrakech | Boutique Test',
    seoDescription: 'Caftan en soie brodé main. Paiement à la livraison. Livraison 48h en Afrique de l’Ouest et Maghreb.',
    language: store.settings?.language || 'fr',
    direction: store.settings?.direction || 'ltr',
    currency: store.settings?.currency || 'XOF',
    isPublished: true,
    publishedAt: new Date(),
  });

  console.log(`✓ Landing page créée : /store/${store.slug}/p/${page.slug}`);
  console.log(`  http://localhost:3000/store/${store.slug}/p/${page.slug}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
