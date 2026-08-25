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
  .catch((e: unknown) => {
    // La SDK Cloudinary inclut les credentials complets (`auth: "key:secret"`)
    // dans certaines erreurs — jamais les logger tel quel. On extrait uniquement
    // le http_code et le message texte, en filtrant tout ce qui ressemble à un
    // secret par mesure de sécurité.
    const err = e as { message?: string; http_code?: number; error?: { message?: string; http_code?: number } };
    const httpCode = err.http_code ?? err.error?.http_code ?? '?';
    const rawMsg = err.error?.message ?? err.message ?? '(no message)';
    const cleanMsg = String(rawMsg).replace(/[A-Za-z0-9_-]{15,}/g, '***REDACTED***');
    console.error('❌ AUTH FAILED');
    console.error('   HTTP code :', httpCode);
    console.error('   Message   :', cleanMsg);
    process.exit(1);
  });
