/**
 * Smoke test the enhanced image generation pipeline (category routing,
 * quality gate + retry, post-processing upscale).
 *
 * Génère 3 images :
 *   1. Hero, catégorie 'fashion'   → doit router sur FLUX pro
 *   2. Avatar (personne testimonial) → doit router sur FLUX Realism + face restore
 *   3. Product, catégorie 'electronics' → doit router sur défaut (nano-banana)
 *
 * Observe les logs pour vérifier :
 *   - `quality gate: X/30` apparaît → le gate a couru
 *   - Aucun `attendait une reference` warn si non-attendu
 *   - Les URLs finales sont différentes des URLs initiales quand upscale fire
 *
 * Usage : npx tsx scripts/smoke-image-pipeline.ts
 */
import 'dotenv/config';
import {
  generateImage,
  resolveModelForCategory,
  classifyCategory,
} from '../src/services/image-generation.service';

async function main() {
  console.log('[smoke] ANTHROPIC_API_KEY set?', !!process.env.ANTHROPIC_API_KEY);
  console.log('[smoke] FAL_KEY set?', !!process.env.FAL_KEY);

  // ── Sanity : classification catégorie ──
  console.log('\n[smoke] classifyCategory("robe soirée fashion"):', classifyCategory('robe soirée fashion'));
  console.log('[smoke] classifyCategory("montre luxury"):', classifyCategory('montre luxury'));
  console.log('[smoke] classifyCategory("crème visage"):', classifyCategory('crème visage'));
  console.log('[smoke] classifyCategory("smartphone chargeur"):', classifyCategory('smartphone chargeur'));
  console.log('[smoke] classifyCategory("truc random"):', classifyCategory('truc random'));

  // ── Sanity : model routing ──
  console.log('\n[smoke] resolveModelForCategory(hero, fashion):', resolveModelForCategory('hero', 'fashion'));
  console.log('[smoke] resolveModelForCategory(gallery, luxury):', resolveModelForCategory('gallery', 'luxury'));
  console.log('[smoke] resolveModelForCategory(hero, electronics):', resolveModelForCategory('hero', 'electronics'));
  console.log('[smoke] resolveModelForCategory(product, beauty):', resolveModelForCategory('product', 'beauty'));
  console.log('[smoke] resolveModelForCategory(avatar, anything):', resolveModelForCategory('avatar', 'anything'));

  if (process.argv.includes('--images')) {
    console.log('\n[smoke] Generating 3 images (10-30s each with upscale + gate)…');

    // 1. Hero fashion
    console.log('\n[smoke] #1 HERO fashion — expect FLUX pro + upscale');
    const hero = await generateImage({
      prompt: 'A stylish young woman wearing a black leather jacket in a Parisian street at golden hour',
      slot: 'hero',
      aspect: 'wide',
      productCategory: 'fashion',
      negativePrompt: 'text, watermark, logo, blurry, extra fingers',
    });
    console.log(`[smoke] hero result: ${hero.url}`);

    // 2. Avatar (skip category, avatar routing is fixed)
    console.log('\n[smoke] #2 AVATAR — expect FLUX Realism + face restore');
    const avatar = await generateImage({
      prompt: 'A warm, friendly 34 year old woman with Moroccan heritage, relaxed at home, natural window light',
      slot: 'avatar',
      aspect: 'portrait',
      negativePrompt: 'text, watermark, deformed, extra fingers',
    });
    console.log(`[smoke] avatar result: ${avatar.url}`);

    // 3. Product electronics (no upscale on gallery by default, but should route to nano-banana)
    console.log('\n[smoke] #3 PRODUCT electronics — expect default model, no upscale on gallery');
    const product = await generateImage({
      prompt: 'A sleek wireless charger on a marble surface, clean product shot',
      slot: 'gallery',
      aspect: 'square',
      productCategory: 'electronics',
      negativePrompt: 'text, watermark, blurry',
    });
    console.log(`[smoke] gallery result: ${product.url}`);
  } else {
    console.log('\n[smoke] Sanity checks OK. Add --images to actually generate 3 test images (~$0.10 total).');
  }
}

main().catch((err) => { console.error('[smoke] FAILED:', err); process.exit(1); });
