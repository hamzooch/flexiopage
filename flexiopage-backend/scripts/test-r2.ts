/**
 * Smoke-test R2 storage: upload a tiny buffer as a "deliverable", sign a
 * download URL, fetch it, and verify the response is served with
 * `Content-Disposition: attachment` + the correct body.
 *
 * Usage: npm run test:r2
 */
import 'dotenv/config';
import {
  isR2Configured,
  uploadFile,
  signR2DownloadUrl,
  isR2Url,
} from '../src/services/storage.service';

async function main() {
  console.log('[test-r2] checking R2 config…');
  if (!isR2Configured()) {
    console.error('❌ R2 not configured. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
    process.exit(1);
  }
  console.log('✅ R2 credentials detected');
  console.log(`   Account: ${process.env.R2_ACCOUNT_ID}`);
  console.log(`   Bucket:  ${process.env.R2_BUCKET}`);

  // 1) Upload
  const testContent = Buffer.from('This is a FlexioPage R2 smoke test.\nIf you can read this, R2 works.\n');
  const filename = `smoke-test-${Date.now()}.txt`;
  console.log(`\n[test-r2] uploading ${filename} (${testContent.length} bytes)…`);
  const uploaded = await uploadFile(
    testContent,
    filename,
    'smoke-tests',
    'text/plain',
    'deliverable',
  );
  console.log('✅ upload OK');
  console.log(`   key: ${uploaded.key}`);
  console.log(`   url: ${uploaded.url}`);
  console.log(`   size: ${uploaded.size}`);

  if (!isR2Url(uploaded.url)) {
    console.error('❌ Uploaded URL is not detected as R2 — routing bug.');
    console.error(`   URL: ${uploaded.url}`);
    process.exit(1);
  }
  console.log('✅ URL identified as R2');

  // 2) Sign
  console.log('\n[test-r2] signing 5-min download URL…');
  const signed = await signR2DownloadUrl(uploaded.url, 'downloaded-name.txt');
  console.log('✅ signed OK');
  console.log(`   URL: ${signed.slice(0, 120)}…`);

  // 3) Fetch the signed URL
  console.log('\n[test-r2] fetching signed URL to verify delivery…');
  const res = await fetch(signed);
  console.log(`   status: ${res.status}`);
  console.log(`   content-type: ${res.headers.get('content-type')}`);
  console.log(`   content-disposition: ${res.headers.get('content-disposition')}`);
  console.log(`   content-length: ${res.headers.get('content-length')}`);
  if (res.status !== 200) {
    const body = await res.text();
    console.error(`❌ Expected 200, got ${res.status}`);
    console.error(body.slice(0, 500));
    process.exit(1);
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.equals(testContent)) {
    console.error('❌ Downloaded body does not match uploaded content.');
    process.exit(1);
  }
  console.log('✅ downloaded body matches uploaded content');

  const disposition = res.headers.get('content-disposition') || '';
  if (!disposition.toLowerCase().includes('attachment')) {
    console.error('⚠️  Content-Disposition does not contain "attachment" — browser may render inline.');
    console.error(`   Got: ${disposition}`);
    process.exit(1);
  }
  console.log('✅ Content-Disposition forces attachment');

  console.log('\n🎉 R2 round-trip works. Digital deliverables will be uploaded to R2 and served via signed URLs.');
}

main().catch((err) => {
  console.error('❌ smoke-test failed');
  console.error(err);
  process.exit(1);
});
