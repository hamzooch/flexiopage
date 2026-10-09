import { describe, expect, it } from 'vitest';
import { classifyCategory, resolveLandingCategory } from '../image-generation.service';
import { lockLandingSections, lockSeo } from '../landing-facts';

describe('catégorie landing', () => {
  it('reconnaît un caftan comme de la mode', () => {
    expect(classifyCategory('Caftan Brodé Marrakech')).toBe('fashion');
  });

  it('ignore le libellé générique envoyé par l’écran', () => {
    expect(resolveLandingCategory('physical products', 'Caftan Brodé Marrakech')).toBe(
      'Caftan Brodé Marrakech',
    );
    expect(classifyCategory(resolveLandingCategory('physical products', 'Caftan Brodé Marrakech'))).toBe(
      'fashion',
    );
  });

  it('garde une niche saisie par le vendeur', () => {
    expect(resolveLandingCategory('parfum', 'Caftan Brodé Marrakech')).toBe('parfum');
  });
});

describe('faits de la landing', () => {
  it('retire les preuves inventées et le prix barré', () => {
    const sections = lockLandingSections(
      [
        { type: 'stats', props: { items: [{ value: '2 800+', label: 'clientes' }] } },
        { type: 'brands', props: { items: [{ name: 'Dakar Matin' }] } },
        {
          type: 'product',
          props: { name: 'Tenue 3 pièces', priceBefore: 65000, rating: 4.8, reviewCount: 2847 },
        },
        { type: 'hero', props: { title: 'Brille', badge: '−30%' } },
      ],
      { productName: 'Caftan Brodé Marrakech', allowDiscount: false },
    );
    expect(sections.map((s) => s.type)).toEqual(['product', 'hero']);
    expect(sections[0].props.name).toBe('Caftan Brodé Marrakech');
    expect(sections[0].props.priceBefore).toBeUndefined();
    expect(sections[0].props.rating).toBeUndefined();
    expect(sections[1].props.badge).toBeUndefined();
  });

  it('garde le nom du produit dans le titre SEO et retire le faux volume', () => {
    const seo = lockSeo(
      'Tenue Brodée 3 Pièces Dakar',
      'Broderie main. 2 800+ clientes satisfaites. Paiement à la livraison.',
      'Caftan Brodé Marrakech',
    );
    expect(seo.seoTitle).toContain('Caftan Brodé Marrakech');
    expect(seo.seoDescription).not.toMatch(/clientes/);
    expect(seo.seoDescription).toMatch(/Paiement à la livraison/);
  });
});
