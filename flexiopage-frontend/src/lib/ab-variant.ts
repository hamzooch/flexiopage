/**
 * Sélection d'un variant A/B pour la page produit, côté server component.
 *
 * Le split est déterministe : la graine (`splitSeed`) vient du cookie
 * `flexio_split` posé par le middleware à la 1ʳᵉ visite storefront, donc le
 * même visiteur voit toujours le même variant (et peut toujours forcer un
 * variant particulier via `?v=<id>` pour les tests ciblés / campagnes FB).
 *
 * Le "contrôle" (= produit tel que renseigné dans le dashboard) partage le
 * tirage pondéré avec chaque pageVariant `enabled` ayant `weight > 0`. Si
 * aucun variant n'est servable, le contrôle est renvoyé tel quel.
 */

export interface PageVariantOverrides {
  name?: string;
  price?: number;
  compareAtPrice?: number;
  description?: string;
  images?: string[];
  pageSettings?: Record<string, unknown>;
}

export interface PageVariantInput {
  _id?: string;
  name: string;
  enabled?: boolean;
  weight?: number;
  overrides?: PageVariantOverrides;
}

export interface PickedVariant {
  variantId: string;
  name: string;
  overrides: PageVariantOverrides;
  isControl: boolean;
}

export const CONTROL_VARIANT_ID = 'control';

/**
 * Normalise la valeur du cookie `flexio_split` en entier 0..999999. Tolérant
 * aux casses où le cookie est absent/pollué : on retombe sur un tirage pseudo-
 * aléatoire pour ne jamais bloquer le rendu.
 */
function parseSplitSeed(raw: string | undefined | null): number {
  if (!raw) return Math.floor(Math.random() * 1_000_000);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return Math.floor(Math.random() * 1_000_000);
  return Math.floor(n) % 1_000_000;
}

/**
 * Choisit un variant parmi `pageVariants` + le contrôle implicite.
 *
 *  - `urlVariantId` : valeur du query param `?v=<id>`. Gagne toujours si elle
 *    résout sur un variant existant OU sur `CONTROL_VARIANT_ID`.
 *  - `splitCookie` : valeur du cookie `flexio_split` posé par le middleware.
 *    Utilisé pour un tirage pondéré stable.
 *
 * Le contrôle a un poids de 1 par défaut, mais quand des variants existent
 * avec des poids explicites, le contrôle est pondéré `1` dans le tirage
 * (équivalent à "une branche parmi les autres"). Les vendeurs peuvent donc
 * monter un variant à `weight=3` pour servir 3× plus de trafic dessus.
 */
export function pickPageVariant(
  pageVariants: PageVariantInput[] | undefined | null,
  input: { urlVariantId?: string | null; splitCookie?: string | null } = {},
): PickedVariant {
  const variants = Array.isArray(pageVariants) ? pageVariants : [];
  const servable = variants.filter(
    (v) => !!v && !!v._id && v.enabled !== false && (typeof v.weight !== 'number' || v.weight > 0),
  );

  // 1. URL param explicite → gagne toujours (campagne FB vers ?v=xxx)
  if (input.urlVariantId) {
    if (input.urlVariantId === CONTROL_VARIANT_ID) {
      return { variantId: CONTROL_VARIANT_ID, name: 'Contrôle', overrides: {}, isControl: true };
    }
    const hit = variants.find((v) => v._id === input.urlVariantId);
    if (hit) {
      return {
        variantId: hit._id!,
        name: hit.name,
        overrides: hit.overrides || {},
        isControl: false,
      };
    }
  }

  // 2. Aucun variant actif → contrôle
  if (servable.length === 0) {
    return { variantId: CONTROL_VARIANT_ID, name: 'Contrôle', overrides: {}, isControl: true };
  }

  // 3. Tirage pondéré déterministe avec la graine du cookie
  const controlWeight = 1;
  const weights = [controlWeight, ...servable.map((v) => (typeof v.weight === 'number' ? v.weight : 1))];
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) {
    return { variantId: CONTROL_VARIANT_ID, name: 'Contrôle', overrides: {}, isControl: true };
  }
  const seed = parseSplitSeed(input.splitCookie);
  // Mod total donne un entier dans [0, total). On parcourt les poids
  // jusqu'à ce que le cumul dépasse le tirage.
  const pick = seed % total;
  let cum = 0;
  if (pick < (cum += controlWeight)) {
    return { variantId: CONTROL_VARIANT_ID, name: 'Contrôle', overrides: {}, isControl: true };
  }
  for (const v of servable) {
    const w = typeof v.weight === 'number' ? v.weight : 1;
    cum += w;
    if (pick < cum) {
      return {
        variantId: v._id!,
        name: v.name,
        overrides: v.overrides || {},
        isControl: false,
      };
    }
  }
  // Fallback défensif — ne devrait pas arriver vu la boucle ci-dessus.
  return { variantId: CONTROL_VARIANT_ID, name: 'Contrôle', overrides: {}, isControl: true };
}

/**
 * Applique des overrides sur un produit. Chaque champ d'override, s'il est
 * défini, écrase le champ correspondant du produit. `pageSettings` est mergé
 * champ à champ (merge superficiel — suffisant pour les sous-blocs edited ici).
 */
export function applyVariantOverrides<P extends object>(
  product: P,
  overrides: PageVariantOverrides | undefined | null,
): P {
  if (!overrides) return product;
  const next = { ...product } as Record<string, unknown>;
  if (typeof overrides.name === 'string' && overrides.name.trim()) next.name = overrides.name;
  if (typeof overrides.description === 'string') next.description = overrides.description;
  if (typeof overrides.price === 'number' && overrides.price >= 0) next.price = overrides.price;
  if (typeof overrides.compareAtPrice === 'number' && overrides.compareAtPrice >= 0) {
    next.compareAtPrice = overrides.compareAtPrice;
  }
  if (Array.isArray(overrides.images) && overrides.images.length > 0) next.images = overrides.images;
  if (overrides.pageSettings && typeof overrides.pageSettings === 'object') {
    const baseSettings = (product as { pageSettings?: Record<string, unknown> }).pageSettings;
    next.pageSettings = { ...(baseSettings || {}), ...overrides.pageSettings };
  }
  return next as P;
}
