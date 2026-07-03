/**
 * Catalogue produits exposé au bot. Selon `catalog_source` de la config :
 *   - 'auto'   : produits publiés de la boutique (modèle Product existant)
 *   - 'manual' : uniquement les custom_products de la config
 *   - 'hybrid' : les deux
 *
 * Le résultat alimente le system prompt (UNIQUE source de vérité pour le bot).
 */
import { Product } from '../../../models/Product.model';
import { Store } from '../../../models/Store.model';
import type { IBotConfig } from '../models/BotConfig.model';
import type { CatalogProduct } from '../prompts/promptBuilders';

/** URL absolue de la fiche produit sur le storefront — cliquable par le client
 *  dans le chat. Même route canonique que le dispatch (`/store/{slug}/product/{slug}`),
 *  valable pour toutes les boutiques (domaines custom inclus côté frontend). */
function productUrl(storeSlug: string | undefined, productSlug: string | undefined): string | undefined {
  if (!storeSlug || !productSlug) return undefined;
  const front = (process.env.FRONTEND_URL || 'https://flexiopage.com')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  return `${front}/store/${storeSlug}/product/${productSlug}`;
}

export class CatalogService {
  async getCatalog(config: IBotConfig): Promise<CatalogProduct[]> {
    const source = config.catalog_source || 'auto';
    const out: CatalogProduct[] = [];

    if (source === 'auto' || source === 'hybrid') {
      const store = await Store.findById(config.vendor_id).select('slug').lean();
      const products = await Product.find({ storeId: config.vendor_id, isPublished: true })
        .select('name price stock slug description')
        .limit(100)
        .lean();
      for (const p of products) {
        out.push({
          id: p._id.toString(),
          name: p.name,
          price: p.price,
          stock: typeof p.stock === 'number' ? p.stock : undefined,
          description: p.description,
          landing_url: productUrl(store?.slug, p.slug),
        });
      }
    }

    if (source === 'manual' || source === 'hybrid') {
      for (const c of config.custom_products || []) {
        out.push({
          name: c.name,
          price: c.price,
          stock: c.stock,
          description: c.description,
          landing_url: c.landing_url,
        });
      }
    }

    return out;
  }

  /**
   * Recherche d'un produit par id puis par nom. Volontairement STRICTE pour ne
   * jamais commander un produit à la place d'un autre :
   *   1. id exact ;
   *   2. nom exact (insensible casse) ;
   *   3. le nom du produit CONTIENT la requête (le client a tapé un fragment) ;
   *   4. la requête contient le nom du produit — mais UNIQUEMENT pour un nom
   *      significatif (>= 4 car.) ET une seule correspondance, sinon on renvoie
   *      `null`. Sans ce garde-fou, un code modèle court (« A9 ») présent dans
   *      la phrase captait la requête et faisait commander le mauvais produit
   *      (ex. un stabilisateur « A9 » sur une demande de caméra).
   * En cas d'ambiguïté → `null` : le bot redemande plutôt que de deviner faux.
   */
  findProduct(catalog: CatalogProduct[], opts: { id?: string; name?: string }): CatalogProduct | null {
    if (opts.id) {
      const byId = catalog.find((p) => p.id && p.id === opts.id);
      if (byId) return byId;
    }
    if (!opts.name) return null;
    const q = opts.name.trim().toLowerCase();
    if (!q) return null;

    // 2) Nom exact.
    const exact = catalog.find((p) => p.name.toLowerCase() === q);
    if (exact) return exact;

    // 3) Le nom du produit contient la requête. Si plusieurs, le nom le plus
    //    court est le plus proche du fragment tapé.
    const nameContainsQuery = catalog
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.length - b.name.length);
    if (nameContainsQuery.length) return nameContainsQuery[0];

    // 4) La requête contient le nom du produit — garde-fou anti-hijack.
    const queryContainsName = catalog.filter((p) => {
      const n = p.name.trim().toLowerCase();
      return n.length >= 4 && q.includes(n);
    });
    if (queryContainsName.length === 1) return queryContainsName[0];

    return null;
  }
}

export const catalogService = new CatalogService();
