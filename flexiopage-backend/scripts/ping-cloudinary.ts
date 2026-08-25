/**
 * Ping Cloudinary — teste juste l'authentification (pas d'upload).
 *   npx tsx scripts/ping-cloudinary.ts
 *
 * Résultats :
 *   ✅ OK  → credentials valides, tu peux uploader.
 *   ❌ 401 → API key ou secret incorrects.
 *   ❌ 403 → credentials valides mais permission refusée (compte restreint).
 *   ❌ ENOTFOUND / timeout → problème réseau depuis le container.
 */
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('cloud_name :', process.env.CLOUDINARY_CLOUD_NAME || '(unset)');
console.log('api_key    :', process.env.CLOUDINARY_API_KEY || '(unset)');
console.log('api_secret :', process.env.CLOUDINARY_API_SECRET ? `set (len=${process.env.CLOUDINARY_API_SECRET.length})` : '(unset)');
console.log('\nPinging Cloudinary API…\n');

cloudinary.api
  .ping()
  .then((r) => {
    console.log('✅ AUTH OK');
    console.log('   Response :', r);
    process.exit(0);
  })
  .catch((e: { message?: string; http_code?: number }) => {
    console.error('❌ AUTH FAILED');
    console.error('   HTTP code :', e.http_code ?? '?');
    console.error('   Message   :', e.message || e);
    process.exit(1);
  });
