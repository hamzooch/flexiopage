import { Store, IStore, StoreType } from '../models/Store.model';
import { LandingPage } from '../models/LandingPage.model';
import { Product } from '../models/Product.model';
import mongoose from 'mongoose';
import { slugify } from '../lib/slugify';

/**
 * Standard info pages seeded into every new store. Each becomes a
 * LandingPage(kind='info') the seller can edit freely; their slugs are
 * referenced by the default footer columns below so the footer is
 * functional out of the box.
 *
 * Body is plain markdown — kept intentionally short so the seller is
 * nudged to customize it rather than ship boilerplate.
 */
const STANDARD_INFO_PAGES: Array<{
  name: string;
  slug: string;
  body: string;
}> = [
  {
    name: "Conditions d'utilisation",
    slug: 'conditions-utilisation',
    body: "# Conditions d'utilisation\n\nMerci de visiter notre boutique. En passant commande, tu acceptes les conditions suivantes.\n\n## 1. Commandes\nLes commandes sont confirmées par téléphone avant expédition.\n\n## 2. Paiement\nNous acceptons le paiement à la livraison (cash on delivery).\n\n## 3. Litiges\nTout litige est traité directement avec notre service client.\n\n*— À personnaliser dans ton tableau de bord.*",
  },
  {
    name: "Politique d'échange et de retour",
    slug: 'politique-retour',
    body: "# Politique d'échange et de retour\n\nNous voulons que tu sois satisfait·e de ton achat.\n\n## Retours\nTu disposes de **7 jours** après livraison pour nous retourner ton produit s'il ne te convient pas, à condition qu'il soit en parfait état et dans son emballage d'origine.\n\n## Échanges\nLes échanges (taille, couleur) sont gratuits sous 14 jours.\n\n## Remboursements\nLes remboursements sont effectués sous 5 jours ouvrés après réception du retour.\n\n*— À personnaliser dans ton tableau de bord.*",
  },
  {
    name: 'Politique de confidentialité',
    slug: 'politique-confidentialite',
    body: "# Politique de confidentialité\n\nNous respectons ta vie privée.\n\n## Données collectées\nNom, téléphone, adresse de livraison, email — uniquement pour traiter ta commande.\n\n## Utilisation\nTes données ne sont jamais revendues ni partagées avec des tiers, sauf le transporteur pour la livraison.\n\n## Cookies\nNous utilisons des cookies pour mesurer le trafic et améliorer l'expérience.\n\n*— À personnaliser dans ton tableau de bord.*",
  },
  {
    name: 'Contactez-nous',
    slug: 'contact',
    body: "# Contactez-nous\n\nUne question, une commande à modifier ?\n\n- **Téléphone** : +216 55 oooooo\n- **Email** : exemple@gmail.com\n- **WhatsApp** : +216 55 oooooo\n\nNous répondons sous 24 h en semaine.\n\n*— Mets ici tes vraies coordonnées.*",
  },
  {
    name: 'Questions fréquemment posées',
    slug: 'faq',
    body: "# FAQ\n\n## Comment passer commande ?\nClique sur « Commander » sur la page produit, remplis le formulaire et nous t'appelons pour confirmer.\n\n## Combien de temps pour être livré ?\nEntre 2 et 5 jours selon ta ville.\n\n## Puis-je payer à la livraison ?\nOui, c'est notre mode de paiement par défaut.\n\n## Comment retourner un produit ?\nContacte-nous sous 7 jours, voir la [politique de retour](/politique-retour).\n\n*— Ajoute tes propres questions.*",
  },
  {
    name: 'À propos de nous',
    slug: 'a-propos',
    body: [
      "# À propos de nous",
      "",
      "## Notre histoire",
      "",
      "Tout a commencé en **2024** avec une idée simple : rendre accessible ce qui se faisait de mieux, sans intermédiaires inutiles. Aujourd'hui, on continue avec la même obsession — chaque produit qu'on vend, on l'a d'abord testé nous-mêmes.",
      "",
      "## Notre mission",
      "",
      "Te livrer **rapidement**, à un prix **juste**, et derrière chaque colis garder un **humain** qui répond. Pas de support automatisé, pas de tickets sans fin — quand tu nous écris, c'est quelqu'un de l'équipe qui te lit.",
      "",
      "## Nos valeurs",
      "",
      "- **Qualité d'abord.** Si on ne l'achèterait pas pour notre famille, on ne le vend pas.",
      "- **Service local.** On livre dans toute la région et on parle ta langue.",
      "- **Transparence.** Pas de frais cachés, pas de promesses qu'on ne peut pas tenir.",
      "- **Soutien après-vente.** Une question, un défaut, un échange ? On gère.",
      "",
      "## En chiffres",
      "",
      "- **+1 000 clients** déjà servis",
      "- **+5 villes** livrées chaque semaine",
      "- **4,8 / 5** de note moyenne sur nos commandes",
      "- **24 h** pour répondre à un message",
      "",
      "## L'équipe",
      "",
      "On est une petite équipe basée localement. On choisit nos fournisseurs en personne, on prépare nos colis à la main, et on répond à chaque commande avec attention.",
      "",
      "## Notre engagement",
      "",
      "Si tu n'es pas satisfait de ton achat, on s'arrange — un échange, un remboursement, ou un avoir. Tu peux nous joindre via la page [Contact](/p/contact) ou directement sur WhatsApp.",
      "",
      "Merci de faire confiance à une boutique locale. Ton soutien fait toute la différence.",
      "",
      "*— Personnalise chaque section avec ton vrai chiffre et ton vrai ton. Ce template est juste un point de départ.*",
    ].join('\n'),
  },
  {
    name: 'Méthodes de paiement',
    slug: 'paiement',
    body: "# Méthodes de paiement\n\n## Paiement à la livraison (COD)\nMode de paiement par défaut. Tu payes en espèces au livreur lorsqu'il dépose ton colis.\n\n## Paiement en ligne\nNous travaillons à proposer d'autres options bientôt.\n\n*— À personnaliser.*",
  },
  {
    name: 'Livraison',
    slug: 'livraison',
    body: "# Livraison\n\n## Délais\nLivraison sous **2 à 5 jours** ouvrés selon ta ville.\n\n## Frais\nLes frais sont calculés au moment du checkout selon ta zone.\n\n## Suivi\nDès que ton colis est expédié, tu reçois un SMS avec le numéro de suivi.\n\n*— À personnaliser selon ton transporteur.*",
  },
];

/**
 * Footer columns linked to the seeded info pages. Edited by the seller in
 * /dashboard/stores/[id]/sections (Footer editor). Each link's URL is a
 * relative path that the storefront prepends with the store slug.
 */
function defaultFooterColumns() {
  return [
    {
      title: 'Termes et politiques',
      links: [
        { label: "Conditions d'utilisation", url: '/p/conditions-utilisation' },
        { label: "Politique d'échange et de retour", url: '/p/politique-retour' },
        { label: 'Politique de confidentialité', url: '/p/politique-confidentialite' },
      ],
    },
    {
      title: 'Contact',
      links: [
        { label: 'Contactez-nous', url: '/p/contact' },
        { label: 'Questions fréquemment posées', url: '/p/faq' },
      ],
    },
    {
      title: 'Information',
      links: [
        { label: 'À propos de nous', url: '/p/a-propos' },
        { label: 'Méthodes de paiement', url: '/p/paiement' },
        { label: 'Livraison', url: '/p/livraison' },
      ],
    },
  ];
}

/** Create the 8 standard info pages for a freshly-created store. */
async function seedInfoPages(storeId: mongoose.Types.ObjectId, language?: string, direction?: 'ltr' | 'rtl') {
  const docs = STANDARD_INFO_PAGES.map((p) => ({
    storeId,
    name: p.name,
    slug: p.slug,
    kind: 'info' as const,
    body: p.body,
    sections: [],
    isPublished: true,
    publishedAt: new Date(),
    language,
    direction,
  }));
  // insertMany continues on dup-key (very unlikely but safe), and is one
  // round-trip instead of 8 sequential creates.
  try {
    await LandingPage.insertMany(docs, { ordered: false });
  } catch (err) {
    // Non-fatal — a failed seed shouldn't block store creation.
    console.error('[store.seedInfoPages] failed:', (err as Error).message);
  }
}

/**
 * Produits de démonstration créés dans chaque nouvelle boutique pour qu'elle
 * ait l'air d'une vraie boutique dès l'ouverture (storefront non vide, aperçu
 * de thème réaliste). Ce sont de VRAIS produits : le vendeur les modifie (nom,
 * prix, images, description) ou les supprime depuis la page Produits.
 * Nommés « Produit 1 … N » pour être clairement identifiables comme du test.
 */
const DEMO_PRODUCT_COUNT = 6;
const DEMO_PRICES = [25, 35, 45, 30, 60, 40];
const DEMO_COMPARE_AT = [0, 49, 0, 0, 79, 0];

async function seedDemoProducts(
  storeId: mongoose.Types.ObjectId,
  storeType: StoreType,
  currency?: string,
) {
  const type: StoreType = storeType === 'digital' ? 'digital' : 'physical';
  const docs = Array.from({ length: DEMO_PRODUCT_COUNT }, (_, idx) => {
    const i = idx + 1;
    const compareAt = DEMO_COMPARE_AT[idx];
    return {
      storeId,
      name: `Produit ${i}`,
      slug: `produit-${i}`,
      description:
        'Produit de démonstration. Modifie son nom, sa description, son prix et ses images — ou supprime-le quand tu ajoutes tes vrais produits.',
      type,
      price: DEMO_PRICES[idx] ?? 30,
      compareAtPrice: compareAt && compareAt > 0 ? compareAt : undefined,
      currency: currency?.trim().toUpperCase() || undefined,
      sku: `DEMO-${i}`,
      stock: 50,
      trackInventory: true,
      allowBackorder: false,
      images: [`https://picsum.photos/seed/flexio-demo-${i}/900/900`],
      isPublished: true,
    };
  });
  // insertMany non bloquant — un seed produit raté ne doit pas faire échouer
  // la création de la boutique.
  try {
    await Product.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error('[store.seedDemoProducts] failed:', (err as Error).message);
  }
}

export interface CreateStoreInput {
  name: string;
  slug?: string;
  description?: string;
  ownerId: mongoose.Types.ObjectId;
  storeType: StoreType;
  theme?: Record<string, unknown>;
  /** Optional locale defaults — used to pre-fill landing page generation. */
  currency?: string;
  language?: string;
  country?: string;
}

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
function directionFor(lang?: string): 'ltr' | 'rtl' {
  if (!lang) return 'ltr';
  return RTL_LANGS.has(lang.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';
}

export async function createStore(input: CreateStoreInput): Promise<IStore> {
  // Stores are unlimited under the commission-per-sale model. Sellers pay only
  // when an order is delivered (debited from the wallet), so capping store
  // creation no longer fits the business model.
  const baseSlug = input.slug?.trim() || slugify(input.name, 'store', { ascii: true });
  let slug = baseSlug;
  let subdomain = baseSlug;
  let n = 0;
  while (await Store.findOne({ $or: [{ slug }, { subdomain }] })) {
    n++;
    slug = `${baseSlug}-${n}`;
    subdomain = slug;
  }
  const lang = input.language?.trim().toLowerCase() || undefined;
  const dir = directionFor(lang);
  const store = await Store.create({
    ownerId: input.ownerId,
    name: input.name.trim(),
    slug,
    subdomain,
    storeType: input.storeType,
    description: input.description?.trim(),
    theme: input.theme || undefined,
    settings: {
      currency: input.currency?.trim().toUpperCase() || 'USD',
      timezone: 'UTC',
      maintenanceMode: false,
      language: lang,
      country: input.country?.trim().toUpperCase() || undefined,
      direction: dir,
      storefront: {
        showFooter: true,
        footer: { columns: defaultFooterColumns() },
      },
    },
  });
  // Best-effort seeding — failure here doesn't roll back the store creation.
  await seedInfoPages(store._id, lang, dir);
  // Produits de démo « Produit 1..N » → boutique non vide dès l'ouverture.
  await seedDemoProducts(store._id, input.storeType, store.settings?.currency);
  return store;
}

export async function updateStore(
  storeId: string,
  updates: Partial<Pick<IStore,
    | 'name' | 'description' | 'logo' | 'favicon'
    | 'customDomain' | 'customDomainVerified' | 'customDomainVerifiedAt' | 'customDomainTarget'
    | 'theme' | 'settings' | 'integrations' | 'isPublished'
  >>
): Promise<IStore | null> {
  // Split into $set / $unset so we can clear customDomain (null) properly —
  // `$set: { customDomain: null }` would store a literal null and break the
  // sparse unique-style index; $unset removes the field outright.
  const set: Record<string, unknown> = {};
  const unset: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v === null) unset[k] = '';
    else set[k] = v;
  }
  const op: Record<string, unknown> = {};
  if (Object.keys(set).length) op.$set = set;
  if (Object.keys(unset).length) op.$unset = unset;
  return Store.findByIdAndUpdate(storeId, op, { new: true });
}

export async function getStoresByOwner(ownerId: string): Promise<IStore[]> {
  return Store.find({ ownerId }).sort({ updatedAt: -1 }).lean<IStore[]>();
}

export async function getStoreById(storeId: string): Promise<IStore | null> {
  return Store.findById(storeId).lean<IStore | null>();
}

export async function getStoreBySlug(slug: string): Promise<IStore | null> {
  return Store.findOne({ slug, isPublished: true }).lean<IStore | null>();
}

/**
 * Variante qui ignore `isPublished` — utilisée par les routes publiques pour
 * différencier "boutique inexistante" (404 réel) de "boutique en brouillon"
 * (on peut afficher au visiteur un message d'attente, et au propriétaire un
 * CTA "Activer ma boutique"). Ne JAMAIS exposer le payload complet d'un draft
 * via une route publique — n'utiliser que les champs sûrs (name, logo, slug).
 */
export async function getStoreBySlugIncludingDraft(slug: string): Promise<IStore | null> {
  return Store.findOne({ slug }).lean<IStore | null>();
}

export async function getStoreBySubdomain(subdomain: string): Promise<IStore | null> {
  return Store.findOne({ subdomain, isPublished: true }).lean<IStore | null>();
}

/** Pareil que getStoreBySubdomain mais sans le filtre `isPublished`. */
export async function getStoreBySubdomainIncludingDraft(subdomain: string): Promise<IStore | null> {
  return Store.findOne({ subdomain }).lean<IStore | null>();
}

export async function getStoreByCustomDomain(domain: string): Promise<IStore | null> {
  // Only serve a custom-domain request once DNS has been verified — otherwise
  // a seller could squat on a domain they don't actually control.
  return Store.findOne({
    customDomain: domain,
    customDomainVerified: true,
    isPublished: true,
  }).lean<IStore | null>();
}
