/**
 * Demo products par thème — utilisés pour les pages `theme-preview/[theme]`
 * afin que chaque preview de thème montre des produits cohérents avec la
 * niche du thème (électronique pour Volt, mode pour Atelier, etc.), et
 * plus des paysages/images génériques Unsplash sans rapport.
 *
 * Choix des images :
 *   - Toutes hébergées sur `images.unsplash.com` — libres de droits, pas
 *     dans notre stockage (donc pas migrées vers Cloudinary, pas de coût).
 *   - Photo IDs choisis pour matcher visuellement la niche (packshots
 *     produit, cadrages orientés e-commerce).
 *   - Si une image devient périmée (Unsplash a supprimé la photo → 404),
 *     remplacer l'URL par un autre ID de la même niche.
 *
 * Le thème `forge` a son propre fichier historique (`forge-demo-products.ts`)
 * qu'on ne touche PAS pour éviter de casser sa page preview existante.
 * Ce fichier-ci couvre les 7 autres thèmes (Volt, Atelier, Bloom pour
 * physical ; Pulse, Sage, Studio, Lumen pour digital).
 */

export interface DemoProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  currency: string;
  image: string;
  images?: string[];
  category: string;
  inStock: boolean;
  rating: number;
  reviews: number;
  badge?: 'NEW' | 'BESTSELLER' | 'SALE' | 'LIMITED';
}

export type DemoThemeId = 'volt' | 'atelier' | 'bloom' | 'pulse' | 'sage' | 'studio' | 'lumen';

// Petit helper pour uniformiser les URLs Unsplash : même dimension + qualité,
// centré sur le sujet. `w=800` couvre les grilles storefront 3-4 cols en
// retina sans surdimension excessive.
const u = (id: string): string =>
  `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`;

// ═════════════════════════════════════════════════════════════════════
// VOLT — Electronics (physical)
// smartphones, écouteurs, montres connectées, casques
// ═════════════════════════════════════════════════════════════════════
const voltProducts: DemoProduct[] = [
  {
    id: 'volt-001',
    name: 'Nova Wireless Earbuds Pro',
    description: 'Écouteurs true wireless avec réduction de bruit active, 30h d\'autonomie, charge sans fil.',
    price: 149, originalPrice: 199, currency: 'USD',
    image: u('1590658268037-6bf12165a8df'),
    category: 'Audio', inStock: true, rating: 4.7, reviews: 1248, badge: 'BESTSELLER',
  },
  {
    id: 'volt-002',
    name: 'Pulse Smart Watch Series X',
    description: 'Montre connectée avec écran AMOLED, GPS, ECG, résistance à l\'eau 50m. Compatible iOS/Android.',
    price: 249, currency: 'USD',
    image: u('1523275335684-37898b6baf30'),
    category: 'Wearables', inStock: true, rating: 4.8, reviews: 892, badge: 'NEW',
  },
  {
    id: 'volt-003',
    name: 'Studio Over-Ear Headphones',
    description: 'Casque premium avec drivers 40mm, réduction de bruit hybride, 40h de lecture continue.',
    price: 279, originalPrice: 329, currency: 'USD',
    image: u('1505740420928-5e560c06d30e'),
    category: 'Audio', inStock: true, rating: 4.9, reviews: 2103, badge: 'BESTSELLER',
  },
  {
    id: 'volt-004',
    name: 'Powerbank 20 000 mAh USB-C',
    description: 'Batterie externe compacte, charge rapide 65W, 3 ports, écran LED d\'état.',
    price: 59, currency: 'USD',
    image: u('1609592806996-4e5e5b5f0c9c'),
    category: 'Accessoires', inStock: true, rating: 4.5, reviews: 587,
  },
  {
    id: 'volt-005',
    name: 'Enceinte Bluetooth Portable',
    description: 'Son 360°, waterproof IP67, 24h d\'autonomie, appairage stéréo.',
    price: 89, currency: 'USD',
    image: u('1608043152269-423dbba4e7e1'),
    category: 'Audio', inStock: true, rating: 4.6, reviews: 743,
  },
  {
    id: 'volt-006',
    name: 'Clavier Mécanique RGB Compact',
    description: 'Clavier 65% low-profile, switches optiques, hot-swap, USB-C.',
    price: 129, currency: 'USD',
    image: u('1587829741301-dc798b83add3'),
    category: 'Périphériques', inStock: true, rating: 4.7, reviews: 421, badge: 'NEW',
  },
  {
    id: 'volt-007',
    name: 'Souris Gamer Sans Fil',
    description: 'Capteur 26 000 DPI, 8 boutons programmables, 80h d\'autonomie, latence 1 ms.',
    price: 79, originalPrice: 99, currency: 'USD',
    image: u('1527864550417-7fd91fc51a46'),
    category: 'Périphériques', inStock: true, rating: 4.6, reviews: 356,
  },
  {
    id: 'volt-008',
    name: 'Webcam 4K Streaming',
    description: 'Autofocus, HDR, cadrage automatique par IA, micro double.',
    price: 149, currency: 'USD',
    image: u('1587826080692-f439cd0b70da'),
    category: 'Vidéo', inStock: true, rating: 4.5, reviews: 218,
  },
];

// ═════════════════════════════════════════════════════════════════════
// ATELIER — Fashion (physical)
// vêtements, accessoires mode, sacs, chaussures
// ═════════════════════════════════════════════════════════════════════
const atelierProducts: DemoProduct[] = [
  {
    id: 'atelier-001',
    name: 'Manteau en Laine Camel',
    description: 'Manteau long coupe droite, 90% laine vierge, doublure satinée. Coupe unisexe intemporelle.',
    price: 389, originalPrice: 450, currency: 'USD',
    image: u('1591047139829-d91aecb6caea'),
    category: 'Manteaux', inStock: true, rating: 4.9, reviews: 187, badge: 'BESTSELLER',
  },
  {
    id: 'atelier-002',
    name: 'Robe Midi en Soie',
    description: 'Robe fluide 100% soie, col V, ceinture à nouer. Coloris ivoire.',
    price: 249, currency: 'USD',
    image: u('1595777457583-95e059d581b8'),
    category: 'Robes', inStock: true, rating: 4.7, reviews: 234, badge: 'NEW',
  },
  {
    id: 'atelier-003',
    name: 'Sac Cabas en Cuir Grainé',
    description: 'Sac structuré, cuir pleine fleur, doublure toile. Grand format 40×32 cm.',
    price: 329, currency: 'USD',
    image: u('1584917865442-de89df76afd3'),
    category: 'Sacs', inStock: true, rating: 4.8, reviews: 412, badge: 'BESTSELLER',
  },
  {
    id: 'atelier-004',
    name: 'Boots en Cuir Noir',
    description: 'Bottines montantes, semelle crantée, cuir souple italien. Fabrication artisanale.',
    price: 289, originalPrice: 349, currency: 'USD',
    image: u('1543163521-1bf539c55dd2'),
    category: 'Chaussures', inStock: true, rating: 4.6, reviews: 298,
  },
  {
    id: 'atelier-005',
    name: 'Blazer Oversized Beige',
    description: 'Veste blazer coupe ample, laine mélangée, épaules structurées.',
    price: 219, currency: 'USD',
    image: u('1594633312681-425c7b97ccd1'),
    category: 'Vestes', inStock: true, rating: 4.5, reviews: 156,
  },
  {
    id: 'atelier-006',
    name: 'Écharpe Cachemire',
    description: 'Écharpe 100% cachemire, tissage main, 200×70 cm. Boîte cadeau incluse.',
    price: 129, currency: 'USD',
    image: u('1520903920243-00d872a2d1c9'),
    category: 'Accessoires', inStock: true, rating: 4.8, reviews: 89, badge: 'LIMITED',
  },
  {
    id: 'atelier-007',
    name: 'Jean Wide-Leg Denim Brut',
    description: 'Jean taille haute, coupe large, denim japonais 14 oz.',
    price: 159, currency: 'USD',
    image: u('1541099649105-f69ad21f3246'),
    category: 'Pantalons', inStock: true, rating: 4.4, reviews: 267,
  },
  {
    id: 'atelier-008',
    name: 'Chemise Popeline Blanche',
    description: 'Chemise unisexe, popeline 100% coton, coupe droite, col italien.',
    price: 99, currency: 'USD',
    image: u('1489987707025-afc232f7ea0f'),
    category: 'Chemises', inStock: true, rating: 4.6, reviews: 341,
  },
];

// ═════════════════════════════════════════════════════════════════════
// BLOOM — Beauty (physical)
// cosmétiques, parfums, soins visage/corps
// ═════════════════════════════════════════════════════════════════════
const bloomProducts: DemoProduct[] = [
  {
    id: 'bloom-001',
    name: 'Sérum Éclat Vitamine C',
    description: 'Sérum concentré 15% vitamine C stabilisée, acide hyaluronique. Anti-taches, illuminateur.',
    price: 68, originalPrice: 82, currency: 'USD',
    image: u('1620916566398-39f1143ab7be'),
    category: 'Soins visage', inStock: true, rating: 4.8, reviews: 1823, badge: 'BESTSELLER',
  },
  {
    id: 'bloom-002',
    name: 'Crème Hydratante Nuit',
    description: 'Crème riche à la centella asiatica et céramides. Régénère la peau pendant la nuit.',
    price: 54, currency: 'USD',
    image: u('1596462502278-27bfdc403348'),
    category: 'Soins visage', inStock: true, rating: 4.7, reviews: 967, badge: 'NEW',
  },
  {
    id: 'bloom-003',
    name: 'Parfum Signature Oud & Rose',
    description: 'Eau de parfum 50 ml, notes de fond boisées. Longue tenue 8 h.',
    price: 129, currency: 'USD',
    image: u('1541643600914-78b084683601'),
    category: 'Parfums', inStock: true, rating: 4.9, reviews: 542, badge: 'BESTSELLER',
  },
  {
    id: 'bloom-004',
    name: 'Palette Fards Nude',
    description: '12 teintes mates et satinées, formule vegan, pigmentation intense.',
    price: 48, originalPrice: 65, currency: 'USD',
    image: u('1512496015851-a90fb38ba796'),
    category: 'Maquillage', inStock: true, rating: 4.6, reviews: 728,
  },
  {
    id: 'bloom-005',
    name: 'Rouge à Lèvres Mat Longue Tenue',
    description: 'Formule crémeuse, 14 teintes disponibles, tenue 12 h sans dessèchement.',
    price: 32, currency: 'USD',
    image: u('1586495777744-4413f21062fa'),
    category: 'Maquillage', inStock: true, rating: 4.5, reviews: 1289,
  },
  {
    id: 'bloom-006',
    name: 'Huile Sèche Corps & Cheveux',
    description: 'Huile multi-usage, 5 huiles précieuses, non grasse. Vaporisateur 100 ml.',
    price: 42, currency: 'USD',
    image: u('1571781926291-c477ebfd024b'),
    category: 'Soins corps', inStock: true, rating: 4.7, reviews: 356,
  },
  {
    id: 'bloom-007',
    name: 'Masque Argile Purifiant',
    description: 'Masque à l\'argile verte + charbon actif. Désincruste les pores, matifie.',
    price: 28, currency: 'USD',
    image: u('1608248543803-ba4f8c70ae0b'),
    category: 'Soins visage', inStock: true, rating: 4.4, reviews: 512,
  },
  {
    id: 'bloom-008',
    name: 'Baume à Lèvres Repulpant',
    description: 'Formule à l\'acide hyaluronique, teintes translucides, gloss finish.',
    price: 24, currency: 'USD',
    image: u('1522337360788-8b13dee7a37e'),
    category: 'Maquillage', inStock: true, rating: 4.6, reviews: 423, badge: 'NEW',
  },
];

// ═════════════════════════════════════════════════════════════════════
// PULSE — SaaS / software / outils (digital)
// ═════════════════════════════════════════════════════════════════════
const pulseProducts: DemoProduct[] = [
  {
    id: 'pulse-001',
    name: 'Analytics Dashboard Pro',
    description: 'Template SaaS analytics prêt à l\'emploi. Next.js 15 + Tailwind + Recharts. Licence commerciale.',
    price: 149, currency: 'USD',
    image: u('1551288049-bebda4e38f71'),
    category: 'Templates', inStock: true, rating: 4.9, reviews: 342, badge: 'BESTSELLER',
  },
  {
    id: 'pulse-002',
    name: 'CRM Starter Kit',
    description: 'Boilerplate CRM avec auth, billing Stripe, notifications, tableaux de bord.',
    price: 199, originalPrice: 249, currency: 'USD',
    image: u('1460925895917-afdab827c52f'),
    category: 'Boilerplates', inStock: true, rating: 4.8, reviews: 178,
  },
  {
    id: 'pulse-003',
    name: 'AI Chat Widget Component',
    description: 'Composant React de chat IA plug-and-play. Support OpenAI, Anthropic, Ollama.',
    price: 79, currency: 'USD',
    image: u('1526379095098-d400fd0bf935'),
    category: 'Composants', inStock: true, rating: 4.7, reviews: 234, badge: 'NEW',
  },
  {
    id: 'pulse-004',
    name: 'Auth System Complet',
    description: 'Module authentification NextAuth + rôles + SSO Google/GitHub. Documentation vidéo.',
    price: 129, currency: 'USD',
    image: u('1555949963-aa79dcee981c'),
    category: 'Modules', inStock: true, rating: 4.6, reviews: 156,
  },
  {
    id: 'pulse-005',
    name: 'Landing Page Generator',
    description: 'Générateur de landing pages via IA. 20 templates. Export HTML/Next/Astro.',
    price: 99, currency: 'USD',
    image: u('1517180102446-f3ece451e9d8'),
    category: 'Outils', inStock: true, rating: 4.5, reviews: 267,
  },
  {
    id: 'pulse-006',
    name: 'Payment Gateway SDK',
    description: 'SDK unifié Stripe + PayPal + CinetPay. TypeScript, tests inclus.',
    price: 89, currency: 'USD',
    image: u('1556742049-0cfed4f6a45d'),
    category: 'SDK', inStock: true, rating: 4.7, reviews: 189, badge: 'BESTSELLER',
  },
];

// ═════════════════════════════════════════════════════════════════════
// SAGE — Coaching / cours / memberships (digital)
// ═════════════════════════════════════════════════════════════════════
const sageProducts: DemoProduct[] = [
  {
    id: 'sage-001',
    name: 'Formation Marketing Digital 2026',
    description: '12 modules · 40h de vidéos · templates + certificat. Accès à vie.',
    price: 299, originalPrice: 399, currency: 'USD',
    image: u('1522202176988-66273c2fd55f'),
    category: 'Formations', inStock: true, rating: 4.9, reviews: 1247, badge: 'BESTSELLER',
  },
  {
    id: 'sage-002',
    name: 'Coaching Business 1-to-1',
    description: '6 sessions Zoom de 1h + suivi Slack. Plan d\'action personnalisé.',
    price: 899, currency: 'USD',
    image: u('1552664730-d307ca884978'),
    category: 'Coaching', inStock: true, rating: 5.0, reviews: 89, badge: 'LIMITED',
  },
  {
    id: 'sage-003',
    name: 'Programme Fitness 12 Semaines',
    description: 'Plan complet nutrition + sport. 3 séances/semaine, meal plans, groupe privé.',
    price: 149, currency: 'USD',
    image: u('1518611012118-696072aa579a'),
    category: 'Programmes', inStock: true, rating: 4.8, reviews: 523, badge: 'BESTSELLER',
  },
  {
    id: 'sage-004',
    name: 'Membership Mindset Coach',
    description: 'Accès mensuel · masterclass live 2× / mois · communauté privée · workbooks.',
    price: 49, currency: 'USD',
    image: u('1506126613408-eca07ce68773'),
    category: 'Membership', inStock: true, rating: 4.7, reviews: 342,
  },
  {
    id: 'sage-005',
    name: 'Bootcamp Copywriting Intensif',
    description: '4 jours en live · exercices pratiques · frameworks éprouvés · replays inclus.',
    price: 449, currency: 'USD',
    image: u('1434030216411-0b793f4b4173'),
    category: 'Bootcamps', inStock: true, rating: 4.9, reviews: 178, badge: 'NEW',
  },
  {
    id: 'sage-006',
    name: 'Méditation Guidée — 30 Jours',
    description: '30 séances audio · workbook PDF · accompagnement WhatsApp. Idéal débutants.',
    price: 39, currency: 'USD',
    image: u('1506126613408-eca07ce68773'),
    category: 'Bien-être', inStock: true, rating: 4.6, reviews: 692,
  },
];

// ═════════════════════════════════════════════════════════════════════
// STUDIO — Creators (templates Notion, Figma, presets photo)
// ═════════════════════════════════════════════════════════════════════
const studioProducts: DemoProduct[] = [
  {
    id: 'studio-001',
    name: 'Second Brain Notion Template',
    description: 'Système complet PARA + gestion projets + habits. 30+ pages liées.',
    price: 49, currency: 'USD',
    image: u('1611224923853-80b023f02d71'),
    category: 'Notion', inStock: true, rating: 4.9, reviews: 1892, badge: 'BESTSELLER',
  },
  {
    id: 'studio-002',
    name: 'UI Kit Figma Design System',
    description: '250+ composants, tokens, thème dark/light, auto-layout. Figma & Adobe XD.',
    price: 89, originalPrice: 129, currency: 'USD',
    image: u('1541462608143-67571c6738dd'),
    category: 'Figma', inStock: true, rating: 4.8, reviews: 456, badge: 'NEW',
  },
  {
    id: 'studio-003',
    name: 'Lightroom Preset Pack Mood',
    description: '30 presets cinematic Lightroom mobile + desktop. Style éditorial moody.',
    price: 39, currency: 'USD',
    image: u('1502920917128-1aa500764cbd'),
    category: 'Photo', inStock: true, rating: 4.7, reviews: 823,
  },
  {
    id: 'studio-004',
    name: 'Notion CRM pour Freelances',
    description: 'Suivi clients, factures, tâches, revenus. Dashboards automatiques.',
    price: 59, currency: 'USD',
    image: u('1499750310107-5fef28a66643'),
    category: 'Notion', inStock: true, rating: 4.6, reviews: 267,
  },
  {
    id: 'studio-005',
    name: 'Icon Pack Minimalist 500',
    description: '500 icônes SVG cohérentes, outline + solid, Figma + illustrator + PNG.',
    price: 29, currency: 'USD',
    image: u('1618788372246-79faff0c3742'),
    category: 'Icônes', inStock: true, rating: 4.5, reviews: 341,
  },
  {
    id: 'studio-006',
    name: 'Templates Instagram Carousel',
    description: '50 templates Canva éditables. 5 styles distincts. Format 1080×1080.',
    price: 34, currency: 'USD',
    image: u('1611262588024-d12430b98920'),
    category: 'Canva', inStock: true, rating: 4.6, reviews: 512, badge: 'BESTSELLER',
  },
];

// ═════════════════════════════════════════════════════════════════════
// LUMEN — Ebooks / PDFs / guides digitaux
// ═════════════════════════════════════════════════════════════════════
const lumenProducts: DemoProduct[] = [
  {
    id: 'lumen-001',
    name: 'Le Guide Complet du Freelance',
    description: '280 pages · trouver ses premiers clients, fixer ses tarifs, gérer sa compta.',
    price: 29, originalPrice: 39, currency: 'USD',
    image: u('1544716278-ca5e3f4abd8c'),
    category: 'Business', inStock: true, rating: 4.8, reviews: 1234, badge: 'BESTSELLER',
  },
  {
    id: 'lumen-002',
    name: 'Recettes Batch Cooking',
    description: '80 recettes healthy · listes de courses · planning semaine · PDF imprimable.',
    price: 19, currency: 'USD',
    image: u('1490645935967-10de6ba17061'),
    category: 'Cuisine', inStock: true, rating: 4.7, reviews: 892,
  },
  {
    id: 'lumen-003',
    name: 'Investir en Bourse pour Débutants',
    description: 'Guide 150 pages · ETF, actions, dividendes. Cas pratiques + calculateurs Excel.',
    price: 39, currency: 'USD',
    image: u('1554224155-6726b3ff858f'),
    category: 'Finance', inStock: true, rating: 4.9, reviews: 456, badge: 'NEW',
  },
  {
    id: 'lumen-004',
    name: 'Voyage Solo — Le Manuel',
    description: 'Préparer, budgéter, sécuriser son premier voyage solo. 200 pages illustrées.',
    price: 24, currency: 'USD',
    image: u('1436491865332-7a61a109cc05'),
    category: 'Voyage', inStock: true, rating: 4.6, reviews: 267,
  },
  {
    id: 'lumen-005',
    name: 'Yoga à la Maison — Programme 8 sem.',
    description: 'Programme progressif PDF + planches postures. Débutant à intermédiaire.',
    price: 22, currency: 'USD',
    image: u('1545205597-3d9d02c29597'),
    category: 'Bien-être', inStock: true, rating: 4.7, reviews: 512,
  },
  {
    id: 'lumen-006',
    name: 'SEO Local pour Commerçants',
    description: '80 pages · Google Business Profile, avis clients, backlinks locaux. Check-lists.',
    price: 34, currency: 'USD',
    image: u('1432888622747-4eb9a8efeb07'),
    category: 'Marketing', inStock: true, rating: 4.5, reviews: 189, badge: 'NEW',
  },
];

// ═════════════════════════════════════════════════════════════════════
// Registry + helpers
// ═════════════════════════════════════════════════════════════════════

const REGISTRY: Record<DemoThemeId, DemoProduct[]> = {
  volt: voltProducts,
  atelier: atelierProducts,
  bloom: bloomProducts,
  pulse: pulseProducts,
  sage: sageProducts,
  studio: studioProducts,
  lumen: lumenProducts,
};

/** Retourne tous les produits demo pour un thème donné. */
export function getDemoProductsByTheme(themeId: DemoThemeId): DemoProduct[] {
  return REGISTRY[themeId] || [];
}

/** Best-sellers : top N par nombre d'avis, priorité aux badges BESTSELLER. */
export function getFeaturedByTheme(themeId: DemoThemeId, count = 4): DemoProduct[] {
  const products = REGISTRY[themeId] || [];
  return [...products]
    .sort((a, b) => {
      const aBest = a.badge === 'BESTSELLER' ? 1 : 0;
      const bBest = b.badge === 'BESTSELLER' ? 1 : 0;
      if (aBest !== bBest) return bBest - aBest;
      return b.reviews - a.reviews;
    })
    .slice(0, count);
}

/** Nouveautés : produits avec badge NEW en priorité. */
export function getNewArrivalsByTheme(themeId: DemoThemeId, count = 4): DemoProduct[] {
  const products = REGISTRY[themeId] || [];
  const news = products.filter((p) => p.badge === 'NEW');
  if (news.length >= count) return news.slice(0, count);
  // Fallback : complète avec les mieux notés si pas assez de "NEW".
  const rest = products.filter((p) => p.badge !== 'NEW').sort((a, b) => b.rating - a.rating);
  return [...news, ...rest].slice(0, count);
}

export default REGISTRY;
