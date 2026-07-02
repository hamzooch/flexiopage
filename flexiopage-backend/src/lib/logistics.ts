import type { IStore } from '../models/Store.model';

/**
 * Providers de livraison qui matchent leurs produits par SKU côté partenaire
 * (MogaDelivery, BestDelivery). Pour ces intégrations, un produit dispatché
 * SANS SKU est invisible dans leur catalogue → jamais préparé ni livré
 * (panne « catalogue vendeur vide »). `manual`/`other` ne matchent rien.
 */
const SKU_MATCHING_PROVIDERS = new Set(['mogadelivery', 'bestdelivery']);

/**
 * Le store est-il relié à une société de logistique qui exige un SKU ?
 *
 * Vrai si :
 *   - un `market` porte un provider SKU-matché activé, OU
 *   - l'intégration `integrations.delivery` est activée sur un tel provider.
 *
 * Quand c'est le cas, tout produit physique publié DOIT avoir un SKU
 * (cf. `productNeedsSku`), sinon le dispatch part avec `sku: ''`.
 */
export function storeUsesLogistics(store: Pick<IStore, 'markets' | 'integrations'>): boolean {
  const marketReady = (store.markets || []).some(
    (m) =>
      m.delivery?.enabled !== false &&
      !!m.delivery?.provider &&
      SKU_MATCHING_PROVIDERS.has(m.delivery.provider),
  );
  if (marketReady) return true;

  const integ = store.integrations?.delivery;
  return !!(integ?.enabled && integ.provider && SKU_MATCHING_PROVIDERS.has(integ.provider));
}

/**
 * Le produit résout-il un SKU pour CHAQUE ligne qu'il peut générer au dispatch ?
 * Le payload MD utilise `variant.sku || product.sku` — donc :
 *   - sans variante : le SKU produit doit être non-vide ;
 *   - avec variantes : chacune doit résoudre un SKU (le sien, sinon celui du
 *     produit). Si le SKU produit est posé, toutes les variantes sont couvertes.
 */
export function productHasDispatchableSku(p: {
  sku?: string;
  variants?: Array<{ sku?: string }>;
}): boolean {
  const base = (p.sku || '').trim();
  const variants = p.variants || [];
  if (variants.length > 0) {
    return variants.every((v) => (((v.sku || '').trim() || base)).length > 0);
  }
  return base.length > 0;
}

/** Message seller-facing quand un SKU manque alors que la logistique l'exige. */
export const SKU_REQUIRED_MESSAGE =
  'Un SKU est obligatoire : votre boutique est reliée à une société de livraison qui identifie ' +
  'chaque article par son SKU. Sans SKU, la commande ne pourra pas être préparée ni livrée. ' +
  'Ajoutez une référence SKU au produit (et à chaque variante si vous en avez) avant de le publier.';

/**
 * Valide qu'un produit physique publié porte un SKU dispatchable dès lors que
 * le store est relié à une logistique SKU-matchée. Renvoie un message d'erreur
 * si la règle est violée, sinon `null`. Les brouillons (non publiés) et les
 * produits digitaux ne sont jamais bloqués.
 */
export function validateLogisticsSku(
  store: Pick<IStore, 'markets' | 'integrations'>,
  product: { type?: 'physical' | 'digital'; isPublished?: boolean; sku?: string; variants?: Array<{ sku?: string }> },
): string | null {
  if (product.type === 'digital') return null;
  if (!product.isPublished) return null;
  if (!storeUsesLogistics(store)) return null;
  if (productHasDispatchableSku(product)) return null;
  return SKU_REQUIRED_MESSAGE;
}
