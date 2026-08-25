/**
 * Raw upload Cloudinary — bypass la SDK, tape direct l'API via https natif.
 * Objectif : voir les headers + le body brut de la réponse Cloudinary quand
 * on POST un upload multipart. Si un WAF (CloudFront/Cloudflare) devant
 * l'API bloque notre IP, on verra un HTML au lieu d'un JSON.
 *
 *   npx tsx scripts/raw-cloudinary-upload.ts
 *
 * Aucune écriture Cloudinary si ça marche — l'upload est réel mais le test
 * envoie un PNG 1×1 pixel (77 octets) et le fichier finit dans le folder
 * `test/` du compte.
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import * as https from 'https';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('❌ Missing CLOUDINARY_* env vars.');
  process.exit(1);
}

// Signature = SHA1( sorted_params_as_query + api_secret )
// Pour un upload simple : uniquement `timestamp` comme param à signer.
const timestamp = Math.floor(Date.now() / 1000);
const signature = createHash('sha1')
  .update(`timestamp=${timestamp}${apiSecret}`)
  .digest('hex');

// PNG 1×1 transparent (77 octets) — le plus petit fichier possible pour
// vérifier que Cloudinary accepte l'upload.
const png1x1 = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6300010000000500010D0A2DB40000000049454E44AE426082',
  'hex',
);

const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

function part(name: string, value: string): string {
  return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
}

const body = Buffer.concat([
  Buffer.from(
    part('api_key', apiKey) +
      part('timestamp', String(timestamp)) +
      part('signature', signature) +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pixel.png"\r\nContent-Type: image/png\r\n\r\n`,
  ),
  png1x1,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);

console.log('Cloud name :', cloudName);
console.log('API key    :', apiKey);
console.log('Timestamp  :', timestamp);
console.log('Signature  :', signature.slice(0, 8) + '…' + signature.slice(-4));
console.log('Body size  :', body.length, 'bytes');
console.log('\nPOST https://api.cloudinary.com/v1_1/' + cloudName + '/image/upload\n');

const req = https.request(
  {
    hostname: 'api.cloudinary.com',
    port: 443,
    path: `/v1_1/${cloudName}/image/upload`,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
      'User-Agent': 'flexiopage-diagnostic/1.0',
    },
  },
  (res) => {
    console.log('── Response ────────────────────────────');
    console.log('HTTP', res.statusCode, res.statusMessage);
    console.log('\nHeaders :');
    for (const [k, v] of Object.entries(res.headers)) {
      console.log(`  ${k}: ${v}`);
    }
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => (raw += chunk));
    res.on('end', () => {
      console.log('\nBody (first 2000 chars) :');
      // Scrub par sécurité — jamais logger un long token alphanum en clair.
      const scrubbed = raw.slice(0, 2000).replace(/[A-Za-z0-9_-]{25,}/g, '***REDACTED***');
      console.log(scrubbed);
      console.log('\n── Diagnostic ────────────────────────');
      const server = String(res.headers.server || '').toLowerCase();
      const isCloudFront = server.includes('cloudfront') || 'x-amz-cf-id' in res.headers;
      const isCloudflare = server.includes('cloudflare') || 'cf-ray' in res.headers;
      const isHtml = raw.trim().startsWith('<');
      if (res.statusCode === 200) {
        console.log('✅ Upload OK — pas de problème réseau.');
      } else if (isHtml && (isCloudFront || isCloudflare)) {
        console.log(`❌ ${isCloudFront ? 'CloudFront' : 'Cloudflare'} bloque en amont (WAF).`);
        console.log('   → ton IP VPS est probablement filtrée. Options :');
        console.log('   1. Contacter le support Cloudinary avec ton cloud_name + IP VPS');
        console.log('   2. Sortie via proxy (Cloudflare Warp, Fixie, QuotaGuard)');
        console.log('   3. Changer d\'IP VPS (dernier recours)');
      } else if (res.statusCode === 401) {
        console.log('❌ 401 — credentials refusées (signature ou API key).');
      } else if (res.statusCode === 403 && !isHtml) {
        console.log('❌ 403 API Cloudinary — regarde le body pour la vraie raison.');
      } else {
        console.log(`⚠️  HTTP ${res.statusCode} — inspecte les headers + body ci-dessus.`);
      }
    });
  },
);

req.on('error', (e) => {
  console.error('❌ Request error :', e.message);
  process.exit(1);
});

req.write(body);
req.end();
