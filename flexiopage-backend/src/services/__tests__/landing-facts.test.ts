import { describe, expect, it } from 'vitest';
import { classifyCategory, resolveLandingCategory } from '../image-generation.service';
import { buildConversionHooks, hookImagePrompt, lockLandingSections, lockSeo, shapeCodSalesPage } from '../landing-facts';

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

describe('page de vente cash à la livraison', () => {
  it('place le formulaire après la preuve et retire le délai inventé', () => {
    const sections = shapeCodSalesPage(
      [
        { type: 'hero', props: { title: 'Le caftan', ctaText: 'Acheter' } },
        { type: 'faq', props: { items: [{ question: 'La taille ?', answer: 'Du S au XL.' }] } },
        {
          type: 'cod-form',
          props: {
            title: 'Je le veux — commander',
            reassurance: 'Livraison en 48h · Retour 14j',
            productSlug: 'autre-produit',
          },
        },
        { type: 'footer', props: { brandName: 'Boutique Test' } },
      ],
      { productName: 'Caftan Brodé Marrakech', productSlug: 'caftan-brode', productPrice: 45000, currency: 'XOF', country: 'SN', language: 'fr', eta: 'en 48h' },
    );
    expect(sections.map((s) => s.type)).toEqual([
      'hero', 'product', 'steps', 'cod-form', 'faq', 'footer',
    ]);
    const form = sections.find((s) => s.type === 'cod-form')!;
    expect(form.props.title).toBe('Commande · paiement à la livraison');
    expect(form.props.productSlug).toBe('caftan-brode');
    expect(form.props.reassurance).toBe('Paiement à la livraison · Livraison en 48h · Aucune avance');
    expect(form.props.reassurance).not.toMatch(/14/);
    expect(sections[0].props.ctaText).toBe('Commander · paiement à la livraison');
    expect(sections[0].props.ctaHref).toBe('#cod-order-form-section');
    const product = sections.find((s) => s.type === 'product')!;
    expect(product.props.priceAfter).toBe(45000);
  });

  it('garde un formulaire déjà sérieux et écrit en arabe si la page est en arabe', () => {
    const sections = shapeCodSalesPage(
      [{ type: 'hero', props: { title: 'قفطان', ctaText: 'اطلب الآن' } }],
      { language: 'ar', country: 'MA' },
    );
    const form = sections.find((s) => s.type === 'cod-form')!;
    expect(form.props.title).toBe('الطلب · الدفع عند الاستلام');
    expect(form.props.showPostalCode).toBe(true);
    expect(String(form.props.reassurance)).not.toMatch(/48h|14/);
    expect(sections[0].props.ctaText).toBe('اطلب الآن');
  });
});

describe('accroches image', () => {
  it('peint la remise réelle et le paiement à la livraison, sans délai inventé', () => {
    const hooks = buildConversionHooks({ priceBefore: 60000, priceAfter: 45000, currency: 'XOF' });
    const texts = [hooks.hero.text, ...hooks.frames.map((f) => f.text)];
    expect(hooks.hero.text).toBe('-25%');
    expect(texts).toContain('PAYE A LA LIVRAISON');
    expect(texts.some((t) => t.includes('45'))).toBe(true);
    expect(texts.join(' ')).not.toMatch(/72|48h|14 jours|gratuit/i);
    const prompt = hookImagePrompt(hooks.hero, 'a Dakar home');
    expect(prompt).toContain('-25%');
    expect(prompt).toContain('reference image');
    expect(prompt).not.toMatch(/no text/i);
  });

  it('sans prix barré, l\'accroche est le paiement à la livraison', () => {
    const hooks = buildConversionHooks({ priceAfter: 12000, currency: 'XOF' });
    expect(hooks.hero.text).toBe('PAYE A LA LIVRAISON');
    expect([hooks.hero.text, ...hooks.frames.map((f) => f.text)].join(' ')).not.toMatch(/%/);
  });
});
