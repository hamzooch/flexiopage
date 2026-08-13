/**
 * One-off migration : remplace les images `picsum.photos` (aléatoires,
 * souvent des paysages nature / fleurs / arbres) sur les produits de démo
 * seedés à la création de boutique, par de vraies photos produit e-commerce.
 *
 * Contexte : jusqu'ici, seedDemoProducts() écrivait
 *   `https://picsum.photos/seed/flexio-demo-N/900/900`
 * ce qui donnait un rendu peu sérieux (nature/paysages) dans la vitrine du
 * vendeur dès l'ouverture. Le fix côté service utilise maintenant 6 URLs
 * Unsplash produit stables — ce script applique la même logique aux
 * produits déjà en base.
 *
 * Idempotent : un produit dont AUCUNE image ne contient `picsum.photos`
 * est ignoré.
 *
 * Run :
 *   npm run migrate:demo-product-images
 *   npm run migrate:demo-product-images -- --dry-run
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Product } from '../src/models/Product.model';

const DRY_RUN = process.argv.includes('--dry-run');

// Doit rester synchronisé avec DEMO_PRODUCT_IMAGES dans store.service.ts.
const DEMO_PRODUCT_IMAGES = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900&q=80', // t-shirt blanc
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80',   // sneakers modernes
  'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=900&q=80',   // montre connectée
  'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=900&q=80', // écouteurs sans-fil
  'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=80',   // sac à dos
  'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=900&q=80', // flacon cosmétique
];

function pickImageFor(slug: string | undefined, fallbackIdx: number): string {
  // Si le slug ressemble à "produit-3", on garde le même index de mapping
  // que le seed original — sinon on retombe sur un modulo cyclique stable.
  const m = slug?.match(/produit[-_]?(\d+)/i);
  const idx = m ? Math.max(0, parseInt(m[1], 10) - 1) : fallbackIdx;
  return DEMO_PRODUCT_IMAGES[idx % DEMO_PRODUCT_IMAGES.length];
}

async function main(): Promise<void> {
  await connectDB();

  const products = await Product.find({ images: { $regex: 'picsum\\.photos' } });

  if (products.length === 0) {
    console.log('✓ Rien à migrer — aucun produit n\'utilise picsum.photos.');
    await mongoose.disconnect();
    return;
  }

  console.log(
    `Trouvé ${products.length} produit(s) avec au moins une image picsum.photos.${DRY_RUN ? ' [DRY-RUN]' : ''}\n`,
  );

  let updated = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const before = p.images || [];
    const after = before.map((url) =>
      url && url.includes('picsum.photos') ? pickImageFor(p.slug, i) : url,
    );
    // Si le remplacement ne change rien (regex faux positif), skip.
    if (JSON.stringify(before) === JSON.stringify(after)) continue;

    console.log(`  · ${p.slug || p._id} (store=${p.storeId})`);
    console.log(`    − ${before.join(', ')}`);
    console.log(`    + ${after.join(', ')}`);

    if (!DRY_RUN) {
      p.images = after;
      await p.save();
    }
    updated++;
  }

  console.log(
    `\n${DRY_RUN ? '[DRY-RUN] ' : ''}${updated}/${products.length} produit(s) mis à jour.`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
