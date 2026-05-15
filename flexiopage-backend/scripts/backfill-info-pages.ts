/**
 * One-shot migration: seed the standard info pages + default footer columns
 * for stores that already existed before the seeding was added to createStore.
 *
 * Idempotent — a store that already has any info page is left alone (we
 * never overwrite seller-edited content). Footer columns are only set when
 * the store has none yet.
 *
 * Run with:
 *   tsx scripts/backfill-info-pages.ts
 */

import mongoose from 'mongoose';
import 'dotenv/config';
import { Store } from '../src/models/Store.model';
import { LandingPage } from '../src/models/LandingPage.model';

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/boutshop';

const STANDARD_INFO_PAGES = [
  { name: "Conditions d'utilisation",        slug: 'conditions-utilisation',  body: "# Conditions d'utilisation\n\nMerci de visiter notre boutique. En passant commande, tu acceptes les conditions suivantes.\n\n## 1. Commandes\nLes commandes sont confirmées par téléphone avant expédition.\n\n## 2. Paiement\nNous acceptons le paiement à la livraison (cash on delivery).\n\n## 3. Litiges\nTout litige est traité directement avec notre service client.\n\n*— À personnaliser dans ton tableau de bord.*" },
  { name: "Politique d'échange et de retour", slug: 'politique-retour',        body: "# Politique d'échange et de retour\n\nNous voulons que tu sois satisfait·e de ton achat.\n\n## Retours\nTu disposes de **7 jours** après livraison pour nous retourner ton produit s'il ne te convient pas, à condition qu'il soit en parfait état et dans son emballage d'origine.\n\n## Échanges\nLes échanges (taille, couleur) sont gratuits sous 14 jours.\n\n## Remboursements\nLes remboursements sont effectués sous 5 jours ouvrés après réception du retour.\n\n*— À personnaliser dans ton tableau de bord.*" },
  { name: 'Politique de confidentialité',     slug: 'politique-confidentialite', body: "# Politique de confidentialité\n\nNous respectons ta vie privée.\n\n## Données collectées\nNom, téléphone, adresse de livraison, email — uniquement pour traiter ta commande.\n\n## Utilisation\nTes données ne sont jamais revendues ni partagées avec des tiers, sauf le transporteur pour la livraison.\n\n## Cookies\nNous utilisons des cookies pour mesurer le trafic et améliorer l'expérience.\n\n*— À personnaliser dans ton tableau de bord.*" },
  { name: 'Contactez-nous',                   slug: 'contact',                 body: "# Contactez-nous\n\nUne question, une commande à modifier ?\n\n- **Téléphone** : +XXX XX XX XX XX\n- **Email** : contact@example.com\n- **WhatsApp** : +XXX XX XX XX XX\n\nNous répondons sous 24 h en semaine.\n\n*— Mets ici tes vraies coordonnées.*" },
  { name: 'Questions fréquemment posées',     slug: 'faq',                     body: "# FAQ\n\n## Comment passer commande ?\nClique sur « Commander » sur la page produit, remplis le formulaire et nous t'appelons pour confirmer.\n\n## Combien de temps pour être livré ?\nEntre 2 et 5 jours selon ta ville.\n\n## Puis-je payer à la livraison ?\nOui, c'est notre mode de paiement par défaut.\n\n## Comment retourner un produit ?\nContacte-nous sous 7 jours, voir la [politique de retour](/politique-retour).\n\n*— Ajoute tes propres questions.*" },
  { name: 'À propos de nous',                 slug: 'a-propos',                body: "# À propos\n\nNous sommes une boutique passionnée par les produits de qualité.\n\nNotre mission : t'offrir le meilleur rapport qualité-prix avec un service client humain.\n\n*— Raconte ton histoire ici.*" },
  { name: 'Méthodes de paiement',             slug: 'paiement',                body: "# Méthodes de paiement\n\n## Paiement à la livraison (COD)\nMode de paiement par défaut. Tu payes en espèces au livreur lorsqu'il dépose ton colis.\n\n## Paiement en ligne\nNous travaillons à proposer d'autres options bientôt.\n\n*— À personnaliser.*" },
  { name: 'Livraison',                        slug: 'livraison',               body: "# Livraison\n\n## Délais\nLivraison sous **2 à 5 jours** ouvrés selon ta ville.\n\n## Frais\nLes frais sont calculés au moment du checkout selon ta zone.\n\n## Suivi\nDès que ton colis est expédié, tu reçois un SMS avec le numéro de suivi.\n\n*— À personnaliser selon ton transporteur.*" },
];

const FOOTER_COLUMNS = [
  {
    title: 'Termes et politiques',
    links: [
      { label: "Conditions d'utilisation", url: '/p/conditions-utilisation' },
      { label: "Politique d'échange et de retour", url: '/p/politique-retour' },
      { label: 'Politique de confidentialité', url: '/p/politique-confidentialite' },
    ],
  },
  {
    title: 'Contact',
    links: [
      { label: 'Contactez-nous', url: '/p/contact' },
      { label: 'Questions fréquemment posées', url: '/p/faq' },
    ],
  },
  {
    title: 'Information',
    links: [
      { label: 'À propos de nous', url: '/p/a-propos' },
      { label: 'Méthodes de paiement', url: '/p/paiement' },
      { label: 'Livraison', url: '/p/livraison' },
    ],
  },
];

async function main() {
  await mongoose.connect(MONGO);
  console.log('Connected to', MONGO);

  const stores = await Store.find({}, { _id: 1, name: 1, slug: 1, settings: 1 }).lean();
  console.log(`Found ${stores.length} stores`);

  let pagesSeeded = 0;
  let footersSet = 0;

  for (const store of stores) {
    const existingInfoCount = await LandingPage.countDocuments({ storeId: store._id, kind: 'info' });
    if (existingInfoCount === 0) {
      const docs = STANDARD_INFO_PAGES.map((p) => ({
        storeId: store._id,
        name: p.name,
        slug: p.slug,
        kind: 'info' as const,
        body: p.body,
        sections: [],
        isPublished: true,
        publishedAt: new Date(),
      }));
      try {
        await LandingPage.insertMany(docs, { ordered: false });
        pagesSeeded += docs.length;
        console.log(`  ✓ Seeded ${docs.length} info pages for ${store.name} (${store.slug})`);
      } catch (err) {
        console.error(`  ✗ Failed to seed for ${store.name}:`, (err as Error).message);
      }
    }

    const currentCols = store.settings?.storefront?.footer?.columns;
    if (!currentCols || currentCols.length === 0) {
      await Store.updateOne(
        { _id: store._id },
        {
          $set: {
            'settings.storefront.showFooter': true,
            'settings.storefront.footer.columns': FOOTER_COLUMNS,
          },
        }
      );
      footersSet += 1;
      console.log(`  ✓ Set default footer columns for ${store.name}`);
    }
  }

  console.log(`\nDone: ${pagesSeeded} pages seeded, ${footersSet} footers initialized.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
