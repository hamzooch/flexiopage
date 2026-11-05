/**
 * Produits d'exemple affichés quand une boutique vient d'être créée
 * (et quand la vitrine est encore vide). Chaque thème a ses propres
 * exemples, du même type que la boutique : un thème digital ne montre
 * jamais un t-shirt, une montre ou un flacon.
 *
 * Les photos vivent dans `public/demo-products/` et sont servies par le
 * frontend (`/demo-products/…`).
 */
export type ExampleDigitalKind = 'download' | 'course' | 'license' | 'membership' | 'service';

export interface ThemeExample {
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  category: string;
  image: string;
  badge?: 'NEW' | 'BESTSELLER' | 'SALE' | 'LIMITED';
  digitalKind?: ExampleDigitalKind;
}

const img = (file: string) => `/demo-products/${file}.jpg`;

const PHYSICAL: Record<string, ThemeExample[]> = {
  volt: [
    { name: 'Écouteurs sans fil Nova', description: 'Exemple — écouteurs true wireless, réduction de bruit, boîtier de charge. Remplace-le par ton produit.', price: 149, compareAtPrice: 199, category: 'Audio', image: img('volt-1'), badge: 'BESTSELLER' },
    { name: 'Montre connectée Pulse', description: 'Exemple — montre avec écran sombre, suivi d’activité. Remplace-la par ton produit.', price: 249, category: 'Wearables', image: img('volt-2'), badge: 'NEW' },
    { name: 'Casque studio', description: 'Exemple — casque circum-aural pour l’écoute longue durée. Remplace-le par ton produit.', price: 279, category: 'Audio', image: img('volt-3') },
    { name: 'Clavier mécanique compact', description: 'Exemple — clavier bas profil pour un setup gaming. Remplace-le par ton produit.', price: 129, category: 'Périphériques', image: img('volt-4') },
  ],
  atelier: [
    { name: 'Manteau en laine camel', description: 'Exemple — manteau long, coupe droite. Remplace-le par ton produit.', price: 389, compareAtPrice: 450, category: 'Manteaux', image: img('atelier-1'), badge: 'BESTSELLER' },
    { name: 'Robe midi en soie', description: 'Exemple — robe fluide ivoire. Remplace-la par ton produit.', price: 249, category: 'Robes', image: img('atelier-2'), badge: 'NEW' },
    { name: 'Sac cabas en cuir', description: 'Exemple — sac structuré, cuir cognac. Remplace-le par ton produit.', price: 329, category: 'Sacs', image: img('atelier-3') },
    { name: 'Boots en cuir noir', description: 'Exemple — bottines en cuir. Remplace-les par ton produit.', price: 289, category: 'Chaussures', image: img('atelier-4') },
  ],
  bloom: [
    { name: 'Sérum éclat', description: 'Exemple — flacon compte-gouttes pour le visage. Remplace-le par ton produit.', price: 68, compareAtPrice: 82, category: 'Soins visage', image: img('bloom-1'), badge: 'BESTSELLER' },
    { name: 'Crème hydratante nuit', description: 'Exemple — pot de crème de nuit. Remplace-le par ton produit.', price: 54, category: 'Soins visage', image: img('bloom-2') },
    { name: 'Parfum signature', description: 'Exemple — flacon de parfum. Remplace-le par ton produit.', price: 129, category: 'Parfums', image: img('bloom-3'), badge: 'NEW' },
    { name: 'Palette fards nude', description: 'Exemple — palette de fards. Remplace-la par ton produit.', price: 48, category: 'Maquillage', image: img('bloom-4') },
  ],
  nova: [
    { name: 'Flacon céramique', description: 'Exemple — flacon de soin au design épuré. Remplace-le par ton produit.', price: 42, category: 'Maison', image: img('nova-1') },
    { name: 'Plaid en lin', description: 'Exemple — plaid plié, ton naturel. Remplace-le par ton produit.', price: 89, category: 'Textile', image: img('nova-2'), badge: 'BESTSELLER' },
    { name: 'Bougie en verre fumé', description: 'Exemple — bougie parfumée. Remplace-la par ton produit.', price: 36, category: 'Maison', image: img('nova-3') },
    { name: 'Savons artisanaux', description: 'Exemple — trio de savons. Remplace-les par ton produit.', price: 28, category: 'Soin', image: img('nova-4') },
  ],
  carthago: [
    { name: 'Caftan brodé', description: 'Exemple — caftan ivoire. Remplace-le par ton produit.', price: 220, category: 'Mode', image: img('carthago-1'), badge: 'BESTSELLER' },
    { name: 'Huile d’olive', description: 'Exemple — bouteille d’huile. Remplace-la par ton produit.', price: 18, category: 'Épicerie', image: img('carthago-2') },
    { name: 'Bol en céramique', description: 'Exemple — bol artisanal. Remplace-le par ton produit.', price: 34, category: 'Maison', image: img('carthago-3') },
    { name: 'Sandales en cuir', description: 'Exemple — sandales plates. Remplace-les par ton produit.', price: 75, category: 'Chaussures', image: img('carthago-4') },
  ],
  maison: [
    { name: 'Manteau noir', description: 'Exemple — manteau de laine, coupe nette. Remplace-le par ton produit.', price: 320, category: 'Manteaux', image: img('maison-1'), badge: 'BESTSELLER' },
    { name: 'Chemise blanche', description: 'Exemple — chemise en coton. Remplace-la par ton produit.', price: 95, category: 'Chemises', image: img('maison-2') },
    { name: 'Sac beige', description: 'Exemple — petit sac en cuir. Remplace-le par ton produit.', price: 180, category: 'Sacs', image: img('maison-3') },
    { name: 'Écharpe cachemire', description: 'Exemple — écharpe pliée. Remplace-la par ton produit.', price: 120, category: 'Accessoires', image: img('maison-4') },
  ],
  forge: [
    { name: 'Legging performance', description: 'Exemple — legging taille haute. Remplace-le par ton produit.', price: 129, compareAtPrice: 149, category: 'Bas', image: img('forge-1'), badge: 'BESTSELLER' },
    { name: 'Short d’entraînement', description: 'Exemple — short léger. Remplace-le par ton produit.', price: 69, category: 'Bas', image: img('forge-2') },
    { name: 'Brassière athlete', description: 'Exemple — brassière de sport. Remplace-la par ton produit.', price: 79, category: 'Hauts', image: img('forge-3'), badge: 'NEW' },
    { name: 'Hoodie training', description: 'Exemple — sweat à capuche. Remplace-le par ton produit.', price: 99, category: 'Hauts', image: img('forge-4') },
  ],
  prima: [
    { name: 'Vase imprimé 3D', description: 'Exemple — vase en filament terracotta, couches visibles. Remplace-le par ta pièce.', price: 45, category: 'Impression 3D', image: img('prima-1'), badge: 'BESTSELLER' },
    { name: 'Lampe géométrique', description: 'Exemple — lampe imprimée. Remplace-la par ta pièce.', price: 78, category: 'Impression 3D', image: img('prima-2') },
    { name: 'Pot à plante', description: 'Exemple — jardinière imprimée. Remplace-le par ta pièce.', price: 32, category: 'Impression 3D', image: img('prima-3') },
    { name: 'Sculpture abstraite', description: 'Exemple — petite sculpture imprimée. Remplace-la par ta pièce.', price: 55, category: 'Impression 3D', image: img('prima-4'), badge: 'NEW' },
  ],
  aurum: [
    { name: 'Bague fine', description: 'Exemple — bague or avec une pierre. Remplace-la par ta pièce.', price: 240, category: 'Bagues', image: img('aurum-1'), badge: 'BESTSELLER' },
    { name: 'Collier délicat', description: 'Exemple — collier avec pendentif. Remplace-le par ta pièce.', price: 180, category: 'Colliers', image: img('aurum-2') },
    { name: 'Montre or', description: 'Exemple — montre bracelet fin. Remplace-la par ta pièce.', price: 420, category: 'Horlogerie', image: img('aurum-3') },
    { name: 'Créoles', description: 'Exemple — paire de créoles. Remplace-les par ta pièce.', price: 90, category: 'Boucles', image: img('aurum-4'), badge: 'NEW' },
  ],
  vinum: [
    { name: 'Rouge de garde', description: 'Exemple — bouteille de vin rouge. Remplace-la par ton produit.', price: 28, category: 'Vins', image: img('vinum-1'), badge: 'BESTSELLER' },
    { name: 'Blanc sec', description: 'Exemple — bouteille de vin blanc. Remplace-la par ton produit.', price: 24, category: 'Vins', image: img('vinum-2') },
    { name: 'Cognac', description: 'Exemple — flacon d’eau-de-vie. Remplace-le par ton produit.', price: 46, category: 'Spiritueux', image: img('vinum-3') },
    { name: 'Champagne', description: 'Exemple — bouteille effervescente. Remplace-la par ton produit.', price: 39, category: 'Effervescents', image: img('vinum-4'), badge: 'NEW' },
  ],
  comptoir: [
    { name: 'T-shirt blanc', description: 'Exemple — t-shirt coton. Remplace-le par ton produit.', price: 25, category: 'Mode', image: img('comptoir-1') },
    { name: 'Baskets blanches', description: 'Exemple — paire de baskets. Remplace-les par ton produit.', price: 60, compareAtPrice: 79, category: 'Chaussures', image: img('comptoir-2'), badge: 'BESTSELLER' },
    { name: 'Sac à dos', description: 'Exemple — sac en toile. Remplace-le par ton produit.', price: 45, category: 'Sacs', image: img('comptoir-3') },
    { name: 'Gourde', description: 'Exemple — bouteille isotherme. Remplace-la par ton produit.', price: 22, category: 'Accessoires', image: img('comptoir-4') },
  ],
  halle: [
    { name: 'Friteuse à air', description: 'Exemple — friteuse compacte. Remplace-la par ton offre.', price: 89, compareAtPrice: 119, category: 'Cuisine', image: img('halle-1'), badge: 'BESTSELLER' },
    { name: 'Blender', description: 'Exemple — blender de comptoir. Remplace-le par ton offre.', price: 65, category: 'Cuisine', image: img('halle-2') },
    { name: 'Bouilloire électrique', description: 'Exemple — bouilloire. Remplace-la par ton offre.', price: 40, category: 'Cuisine', image: img('halle-3') },
    { name: 'Balance de cuisine', description: 'Exemple — balance digitale. Remplace-la par ton offre.', price: 25, category: 'Cuisine', image: img('halle-4') },
  ],
  prism: [
    { name: 'Hoodie oversized', description: 'Exemple — sweat streetwear. Remplace-le par ton produit.', price: 95, category: 'Streetwear', image: img('prism-1'), badge: 'BESTSELLER' },
    { name: 'Sneakers chunky', description: 'Exemple — baskets épaisses. Remplace-les par ton produit.', price: 110, category: 'Chaussures', image: img('prism-2') },
    { name: 'Casquette', description: 'Exemple — casquette noire. Remplace-la par ton produit.', price: 30, category: 'Accessoires', image: img('prism-3'), badge: 'NEW' },
    { name: 'Tote bag', description: 'Exemple — sac en toile. Remplace-le par ton produit.', price: 35, category: 'Sacs', image: img('prism-4') },
  ],
  afro3dprod: [
    { name: 'Buste néon', description: 'Exemple — sculpture imprimée, finition violet. Remplace-la par ta pièce.', price: 120, category: '3D', image: img('afro3d-1'), badge: 'BESTSELLER' },
    { name: 'Vase cyan', description: 'Exemple — vase imprimé. Remplace-le par ta pièce.', price: 80, category: '3D', image: img('afro3d-2') },
    { name: 'Casque futuriste', description: 'Exemple — casque imprimé. Remplace-le par ta pièce.', price: 150, category: '3D', image: img('afro3d-3') },
    { name: 'Figurine low-poly', description: 'Exemple — figurine imprimée. Remplace-la par ta pièce.', price: 60, category: '3D', image: img('afro3d-4'), badge: 'NEW' },
  ],
};

const DIGITAL: Record<string, ThemeExample[]> = {
  pulse: [
    { name: 'Dashboard analytics', description: 'Exemple digital — template de tableau de bord, livré en téléchargement. Remplace-le par ton produit.', price: 149, category: 'Templates', image: img('pulse-1'), badge: 'BESTSELLER', digitalKind: 'download' },
    { name: 'Kit CRM', description: 'Exemple digital — base de CRM à installer. Remplace-le par ton produit.', price: 199, compareAtPrice: 249, category: 'Boilerplates', image: img('pulse-2'), digitalKind: 'download' },
    { name: 'Widget de chat IA', description: 'Exemple digital — composant de chat à intégrer. Remplace-le par ton produit.', price: 79, category: 'Composants', image: img('pulse-3'), badge: 'NEW', digitalKind: 'download' },
    { name: 'Licence logicielle', description: 'Exemple digital — une clé de licence, pas un objet physique. Remplace-la par ton produit.', price: 129, category: 'Licences', image: img('pulse-4'), digitalKind: 'license' },
  ],
  sage: [
    { name: 'Formation en ligne', description: 'Exemple digital — cours en vidéos, accès en ligne. Remplace-la par ta formation.', price: 299, compareAtPrice: 399, category: 'Formations', image: img('sage-1'), badge: 'BESTSELLER', digitalKind: 'course' },
    { name: 'Coaching en visio', description: 'Exemple digital — sessions en ligne, pas un produit à livrer. Remplace-le par ton offre.', price: 899, category: 'Coaching', image: img('sage-2'), badge: 'LIMITED', digitalKind: 'service' },
    { name: 'Programme fitness 12 semaines', description: 'Exemple digital — plan d’entraînement à télécharger. Remplace-le par ton programme.', price: 149, category: 'Programmes', image: img('sage-3'), digitalKind: 'course' },
    { name: 'Méditations audio', description: 'Exemple digital — séances audio, accès membre. Remplace-les par ton contenu.', price: 49, category: 'Bien-être', image: img('sage-4'), digitalKind: 'membership' },
  ],
  studio: [
    { name: 'Template Notion', description: 'Exemple digital — tableau Notion à dupliquer. Remplace-le par ton template.', price: 49, category: 'Notion', image: img('studio-1'), badge: 'BESTSELLER', digitalKind: 'download' },
    { name: 'UI kit Figma', description: 'Exemple digital — fichier de composants. Remplace-le par ton kit.', price: 89, compareAtPrice: 129, category: 'Figma', image: img('studio-2'), badge: 'NEW', digitalKind: 'download' },
    { name: 'Pack de presets', description: 'Exemple digital — presets photo à télécharger, pas un appareil. Remplace-le par ton pack.', price: 39, category: 'Photo', image: img('studio-3'), digitalKind: 'download' },
    { name: 'Pack d’icônes', description: 'Exemple digital — fichiers d’icônes. Remplace-le par ton pack.', price: 29, category: 'Icônes', image: img('studio-4'), digitalKind: 'download' },
  ],
  lumen: [
    { name: 'Guide du freelance', description: 'Exemple digital — ebook PDF, pas un livre papier. Remplace-le par ton guide.', price: 29, compareAtPrice: 39, category: 'Business', image: img('lumen-1'), badge: 'BESTSELLER', digitalKind: 'download' },
    { name: 'Recettes batch cooking', description: 'Exemple digital — carnet de recettes en PDF. Remplace-le par ton ebook.', price: 19, category: 'Cuisine', image: img('lumen-2'), digitalKind: 'download' },
    { name: 'Investir pour débutants', description: 'Exemple digital — guide PDF. Remplace-le par ton ebook.', price: 39, category: 'Finance', image: img('lumen-3'), badge: 'NEW', digitalKind: 'download' },
    { name: 'Manuel du voyage solo', description: 'Exemple digital — guide PDF. Remplace-le par ton ebook.', price: 24, category: 'Voyage', image: img('lumen-4'), digitalKind: 'download' },
  ],
  prism: [
    { name: 'Template de landing', description: 'Exemple digital — page à télécharger. Remplace-la par ton fichier.', price: 59, category: 'Templates', image: img('pulse-1'), badge: 'BESTSELLER', digitalKind: 'download' },
    { name: 'Pack de presets', description: 'Exemple digital — presets à télécharger. Remplace-le par ton pack.', price: 29, category: 'Création', image: img('studio-3'), digitalKind: 'download' },
    { name: 'Mini-formation', description: 'Exemple digital — cours court en ligne. Remplace-la par ta formation.', price: 79, category: 'Formations', image: img('sage-1'), badge: 'NEW', digitalKind: 'course' },
    { name: 'Ebook', description: 'Exemple digital — guide PDF. Remplace-le par ton ebook.', price: 19, category: 'Ebooks', image: img('lumen-1'), digitalKind: 'download' },
  ],
  afro3dprod: [
    { name: 'Modèle 3D — Buste néon', description: 'Exemple digital — fichier 3D à télécharger, pas une pièce livrée. Remplace-le par ton modèle.', price: 35, category: 'Modèles 3D', image: img('afro3d-1'), badge: 'BESTSELLER', digitalKind: 'download' },
    { name: 'Modèle 3D — Vase', description: 'Exemple digital — fichier 3D à télécharger. Remplace-le par ton modèle.', price: 25, category: 'Modèles 3D', image: img('afro3d-2'), digitalKind: 'download' },
    { name: 'Modèle 3D — Casque', description: 'Exemple digital — fichier 3D à télécharger. Remplace-le par ton modèle.', price: 40, category: 'Modèles 3D', image: img('afro3d-3'), digitalKind: 'download' },
    { name: 'Modèle 3D — Figurine', description: 'Exemple digital — fichier 3D à télécharger. Remplace-le par ton modèle.', price: 20, category: 'Modèles 3D', image: img('afro3d-4'), badge: 'NEW', digitalKind: 'download' },
  ],
};

const DIGITAL_ONLY = new Set(['pulse', 'sage', 'studio', 'lumen']);

/**
 * Exemples cohérents avec le thème ET le type de boutique.
 * Un thème digital (ou une boutique digitale) ne reçoit jamais
 * les exemples physiques.
 */
export function examplesForTheme(
  themeId: string | undefined,
  storeType: 'physical' | 'digital',
): ThemeExample[] {
  const id = (themeId || '').trim();
  if (storeType === 'digital' || DIGITAL_ONLY.has(id)) {
    return DIGITAL[id] || DIGITAL.pulse;
  }
  return PHYSICAL[id] || PHYSICAL.comptoir;
}
