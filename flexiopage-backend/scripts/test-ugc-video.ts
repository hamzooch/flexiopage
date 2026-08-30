/**
 * Test e2e local du service UGC vidéo — pas d'auth, pas de HTTP, pas de
 * job. On appelle `generateUgcVideo()` en direct avec un produit factice
 * + un avatar de la bibliothèque publique, et on vérifie qu'on reçoit
 * bien un MP4 exploitable.
 *
 * But : détecter tôt les erreurs fal (clé manquante, modèle Hedra/Kling
 * indisponible sur le compte, format inattendu) sans dépenser des tokens
 * ni polluer la DB avec un vrai job. La facturation wallet est bypassée
 * (le service pur ne touche pas au wallet — c'est le controller qui charge).
 *
 * Run : `npm run test:ugc-video -- <mode>`  (mode = talking-head | lifestyle)
 */
import 'dotenv/config';
import { generateUgcVideo } from '../src/services/ugc-video.service';

async function main() {
  if (!process.env.FAL_KEY) {
    console.error('❌ FAL_KEY manquante dans .env — impossible d\'appeler fal.');
    process.exit(1);
  }

  const mode = (process.argv[2] as 'talking-head' | 'lifestyle') || 'lifestyle';
  if (mode !== 'talking-head' && mode !== 'lifestyle') {
    console.error(`❌ Mode inconnu "${mode}" — attendu talking-head | lifestyle.`);
    process.exit(1);
  }

  // Avatar de test — 1er de la bibliothèque publique (Aya). pravatar.cc
  // en 512×512 pour satisfaire le minimum 300×300 exigé par Kling/Hedra.
  const avatarUrl = 'https://i.pravatar.cc/512?img=44';

  const input = {
    storeName: 'Boutique test',
    product: {
      name: 'Caftan Marrakech',
      category: 'mode',
      description: 'Caftan en soie brodée main, coupe ample, livré sous 48h. Idéal pour cérémonies.',
      images: ['https://picsum.photos/seed/caftan/720/1280'],
      price: 45000,
    },
    language: 'fr',
    avatarUrl,
    mode,
    // Talking-head : script court ; lifestyle : description de scène.
    ...(mode === 'talking-head'
      ? { script: 'Découvre le nouveau caftan Marrakech, tissu de soie brodée main. Livraison à domicile en 48 heures !' }
      : { scenePrompt: 'She wears the caftan in front of a mirror, gently turns to show the back, smiles at the camera. Soft morning light.' }),
  };

  console.log(`\n🎬 Test UGC vidéo — mode = ${mode}`);
  console.log(`   avatar : ${avatarUrl}`);
  console.log(`   produit: ${input.product.name}`);
  if (mode === 'talking-head') console.log(`   script : "${(input as any).script}"`);
  else console.log(`   scène  : "${(input as any).scenePrompt}"`);
  console.log('\n⏳ Appel fal (attendu 60-180s selon mode)…\n');

  const t0 = Date.now();
  try {
    const result = await generateUgcVideo(input, async (u) => {
      console.log(`   • [${((Date.now() - t0) / 1000).toFixed(1)}s] step=${u.step} status=${u.status}${u.progress ? ` progress=${u.progress}%` : ''}`);
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ Vidéo générée en ${elapsed}s`);
    console.log(`   URL      : ${result.videoUrl}`);
    console.log(`   Taille   : ${result.width}×${result.height}`);
    console.log(`   Durée    : ${result.durationSeconds}s`);
    console.log(`   Modèle   : ${result.modelId}`);
    console.log(`\n👉 Ouvre l'URL dans le navigateur pour vérifier le rendu.\n`);
    process.exit(0);
  } catch (err) {
    const e = err as Error & { publicMessage?: string };
    console.error(`\n❌ Échec (${((Date.now() - t0) / 1000).toFixed(1)}s) :`);
    console.error(`   ${e.publicMessage || e.message}`);
    console.error(`\n   Stack:`, e.stack);
    process.exit(1);
  }
}

main();
