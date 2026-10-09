import { describe, expect, it } from 'vitest';
import type { IStore } from '../../models/Store.model';
import {
  matchCatalogProduct,
  productPath,
  resolveOrderLines,
  variantChoices,
  type CatalogLine,
} from '../botstore-order';

function line(partial: Partial<CatalogLine> & Pick<CatalogLine, 'id' | 'name'>): CatalogLine {
  return {
    slug: partial.name.toLowerCase(),
    type: 'physical',
    price: 100,
    stock: 5,
    trackInventory: true,
    allowBackorder: false,
    variants: [],
    ...partial,
  };
}

function store(type: 'physical' | 'digital' = 'physical'): IStore {
  return {
    _id: 'store1',
    slug: 'boutique-test',
    name: 'Boutique Test',
    storeType: type,
    settings: { currency: 'MAD', country: 'MA', codForm: { shippingFee: 25 } },
    markets: [{ country: 'MA', currency: 'MAD', enabled: true, isDefault: true, shippingFee: 30 }],
  } as unknown as IStore;
}

describe('botstore commande', () => {
  const products = [
    line({ id: '1', name: 'Caftan Rouge', slug: 'caftan-rouge', price: 450 }),
    line({ id: '2', name: 'Babouches', slug: 'babouches', price: 120, stock: 1 }),
    line({
      id: '3',
      name: 'Sac',
      slug: 'sac',
      variants: [
        { name: 'Noir', price: 80, stock: 2 },
        { name: 'Beige', price: 90, stock: 0 },
      ],
    }),
    line({ id: '4', name: 'Guide PDF', slug: 'guide', type: 'digital', price: 15, trackInventory: false }),
  ];

  it('retrouve un produit malgré les accents et la casse', () => {
    const found = matchCatalogProduct(products, 'caftan rouge');
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.match.product.id).toBe('1');
  });

  it('refuse un produit inconnu', () => {
    const found = matchCatalogProduct(products, 'iphone');
    expect(found.ok).toBe(false);
  });

  it('demande la variante et bloque le stock', () => {
    const missing = resolveOrderLines({
      store: store(),
      products,
      items: [{ product_name: 'Sac', quantity: 1 }],
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('Noir');

    const out = resolveOrderLines({
      store: store(),
      products,
      items: [{ product_name: 'Babouches', quantity: 3 }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('stock');
  });

  it('retrouve une variante citée dans la phrase, pas une lettre au milieu d’un mot', () => {
    const sizes = [
      line({
        id: '5',
        name: 'Caftan',
        slug: 'caftan',
        variants: [
          { name: 'S', price: 450, stock: 2 },
          { name: 'M', price: 450, stock: 2 },
          { name: 'L', price: 450, stock: 2 },
          { name: 'XL', price: 450, stock: 2 },
        ],
      }),
    ];
    const picked = resolveOrderLines({
      store: store(),
      products: sizes,
      items: [{ product_name: 'Caftan taille M', quantity: 1 }],
    });
    expect(picked.ok).toBe(true);
    if (picked.ok) expect(picked.lines[0].name).toBe('Caftan — M');

    const chips = variantChoices({
      products: sizes,
      userText: 'Je veux le caftan',
      reply: 'Le Caftan est disponible. Quelle taille ?',
    });
    expect(chips.map((choice) => choice.label)).toEqual(['S', 'M', 'L', 'XL']);
    expect(chips[1].message).toBe('Caftan — M');

    const chosen = variantChoices({
      products: sizes,
      userText: 'Caftan — M',
      reply: 'Taille M notée.',
    });
    expect(chosen).toEqual([]);
  });

  it('calcule le prix catalogue et les frais de la boutique', () => {
    const out = resolveOrderLines({
      store: store(),
      products,
      items: [{ product_name: 'Caftan Rouge', quantity: 2 }, { product_name: 'Sac', variant_name: 'Noir', quantity: 1 }],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.currency).toBe('MAD');
    expect(out.shippingFee).toBe(30);
    expect(out.lines.map((row) => row.price)).toEqual([450, 80]);
    expect(out.lines[1].name).toBe('Sac — Noir');
  });

  it('n’enregistre pas de livraison pour un produit digital', () => {
    const out = resolveOrderLines({
      store: store(),
      products,
      items: [{ product_name: 'Guide PDF', quantity: 1 }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain(productPath('boutique-test', 'guide'));
  });

  it('renvoie vers le paiement en ligne pour une boutique digitale', () => {
    const out = resolveOrderLines({
      store: store('digital'),
      products,
      items: [{ product_name: 'Guide PDF', quantity: 1 }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('en ligne');
  });
});
