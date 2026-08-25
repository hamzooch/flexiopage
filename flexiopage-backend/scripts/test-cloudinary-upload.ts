/**
 * One-shot : teste le pipeline d'upload complet (sharp resize + driver
 * actif = Cloudinary attendu). Génère un PNG 3000×2000 en RAM, l'envoie
 * dans `uploadFile`, affiche l'URL retournée + le poids avant/après.
 *
 * Utilisation :  npx tsx scripts/test-cloudinary-upload.ts
 */
import 'dotenv/config';
import sharp from 'sharp';
import { uploadFile } from '../src/services/storage.service';

async function main() {
  console.log('\n── Test upload storage.service ──────────────────────────\n');
  console.log('Driver env :', process.env.STORAGE_DRIVER || '(unset → local)');
  console.log('Cloudinary  :', process.env.CLOUDINARY_CLOUD_NAME ? 'configuré' : 'NON CONFIGURÉ');

  // Génère un PNG factice 3000×2000 rempli d'un dégradé — simule une
  // photo iPhone haute-résolution (~4-6 MB en PNG non compressé).
  const rawBuffer = await sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .png()
    .toBuffer();

  console.log(`\nImage source : 3000×2000 PNG = ${(rawBuffer.byteLength / 1024).toFixed(0)} KB`);

  const before = Date.now();
  const result = await uploadFile(
    rawBuffer,
    'test-cloudinary.png',
    'test',
    'image/png',
    'media',
  );
  const durationMs = Date.now() - before;

  console.log('\n── Résultat ─────────────────────────────────────────────');
  console.log('URL     :', result.url);
  console.log('Key     :', result.key);
  console.log('Size    :', `${(result.size / 1024).toFixed(0)} KB (dans le storage — après sharp resize)`);
  console.log('Durée   :', `${durationMs}ms`);

  const isCloudinary = /res\.cloudinary\.com/.test(result.url);
  const isLocal = result.url.startsWith('/uploads/') || result.url.includes('localhost');

  console.log('\n── Diagnostic ───────────────────────────────────────────');
  if (isCloudinary) {
    console.log('✅ Cloudinary ACTIF — URL sert bien depuis le CDN Cloudinary.');
  } else if (isLocal) {
    console.log('❌ Cloudinary INACTIF — URL locale renvoyée. Le driver est resté sur "local".');
    console.log('   Vérifie que le process backend a bien été redémarré APRÈS la modif .env');
    console.log('   (tsx watch ne relit pas .env automatiquement).');
  } else {
    console.log('⚠️  URL inattendue — regarde ci-dessus.');
  }

  // Vérifie que sharp a bien resize (source 3000px → attendu ≤1600px)
  const meta = await sharp(rawBuffer).metadata();
  console.log(`\nsharp check : source ${meta.width}×${meta.height} → attendu résized ≤1600px de large`);
  console.log('(fetch l\'URL ci-dessus et regarde ses dimensions pour confirmer)');

  process.exit(0);
}

main().catch((err) => {
  // La SDK Cloudinary renvoie parfois l'erreur détaillée dans `err.error`
  // ou `err.http_code`, et le message générique « Server returned unexpected
  // status code - 403 » masque la vraie raison. On extrait tout ce qu'on peut.
  console.error('\n❌ ERREUR');
  console.error('   Message : ', err.message);
  if (err.http_code) console.error('   HTTP code : ', err.http_code);
  if (err.error) {
    const e = err.error;
    console.error('   error.message : ', e.message);
    console.error('   error.http_code : ', e.http_code);
  }
  if (err.name) console.error('   name : ', err.name);
  // Dump complet avec scrubbing anti-fuite credentials (>15 char alphanum).
  try {
    const dump = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    const scrubbed = dump.replace(/[A-Za-z0-9_-]{20,}/g, '***REDACTED***');
    console.error('\n── Raw error (scrubbed) ────────────');
    console.error(scrubbed);
  } catch { /* ignore */ }
  process.exit(1);
});
