/**
 * Test live de l'appel OpenAI pour marketplace-ai.service.
 * Nécessite OPENAI_API_KEY dans .env.
 *
 * Run : cd flexiopage-backend && npx tsx scripts/test-marketplace-ai.ts
 */
import 'dotenv/config';
import { generateMarketplaceProduct } from '../src/services/marketplace-ai.service';

async function main() {
  console.log('\n🧪 Test génération IA marketplace\n');
  console.log('OPENAI_API_KEY configuré:', !!process.env.OPENAI_API_KEY);
  console.log('');

  const cases = [
    { title: 'Ebook Dropshipping Débutants', digitalKind: 'download' as const, wholesalePrice: 5000, currency: 'XOF' },
    { title: 'Formation TikTok Ads Complète', digitalKind: 'course' as const, wholesalePrice: 15000, currency: 'XOF', hint: 'cible débutants marketing' },
    { title: 'Template Landing Page Cosmétique', digitalKind: 'download' as const, wholesalePrice: 2000, currency: 'XOF' },
  ];

  for (const c of cases) {
    console.log(`── ${c.title} (${c.wholesalePrice} ${c.currency})`);
    const t0 = Date.now();
    const result = await generateMarketplaceProduct(c);
    const dt = Date.now() - t0;
    console.log(`   IA utilisée: ${result.aiGenerated ? '✅' : '❌ fallback'} (${dt}ms)`);
    console.log(`   Description: ${result.description}`);
    console.log(`   Catégorie:   ${result.category}`);
    console.log(`   Tags:        ${result.tags.join(', ')}`);
    console.log(`   Prix retail: ${result.suggestedRetailPrice} ${c.currency} (${(result.suggestedRetailPrice / c.wholesalePrice).toFixed(1)}x le wholesale)`);
    console.log('');
  }
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
