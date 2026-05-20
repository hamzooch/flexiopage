/**
 * Catalogue produits exposé au bot. Selon `catalog_source` de la config :
 *   - 'auto'   : produits publiés de la boutique (modèle Product existant)
 *   - 'manual' : uniquement les custom_products de la config
 *   - 'hybrid' : les deux
 *
 * Le résultat alimente le system prompt (UNIQUE source de vérité pour le bot).
 */
import { Product } from '../../../models/Product.model';
import type { IBotConfig } from '../models/BotConfig.model';
import type { CatalogProduct } from '../prompts/promptBuilders';

export class CatalogService {
  async getCatalog(config: IBotConfig): Promise<CatalogProduct[]> {
    const source = config.catalog_source || 'auto';
    const out: CatalogProduct[] = [];

    if (source === 'auto' || source === 'hybrid') {
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
          landing_url: p.slug ? `/${p.slug}` : undefined,
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

  /** Recherche tolérante d'un produit par id puis par nom (contains, insensible à la casse). */
  findProduct(catalog: CatalogProduct[], opts: { id?: string; name?: string }): CatalogProduct | null {
    if (opts.id) {
      const byId = catalog.find((p) => p.id && p.id === opts.id);
      if (byId) return byId;
    }
    if (opts.name) {
      const q = opts.name.trim().toLowerCase();
      return (
        catalog.find((p) => p.name.toLowerCase() === q) ||
        catalog.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())) ||
        null
      );
    }
    return null;
  }
}

export const catalogService = new CatalogService();
