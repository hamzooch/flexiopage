import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import {
  detectSource,
  extractFromJsonLd,
  extractFromOpenGraph,
} from '../product-import.service';

describe('detectSource', () => {
  it('reconnaît les marketplaces supportées', () => {
    expect(detectSource('https://www.aliexpress.com/item/123.html')).toBe('aliexpress');
    expect(detectSource('https://fr.aliexpress.com/item/123.html')).toBe('aliexpress');
    expect(detectSource('https://www.alibaba.com/product-detail/x_123.html')).toBe('alibaba');
    expect(detectSource('https://www.amazon.fr/dp/B0XXXX')).toBe('amazon');
    expect(detectSource('https://amzn.to/abc')).toBe('amazon');
  });

  it('refuse les autres domaines et les URLs invalides', () => {
    expect(detectSource('https://example.com/p/1')).toBeNull();
    expect(detectSource('pas une url')).toBeNull();
  });
});

describe('extractFromJsonLd', () => {
  it('extrait nom, description, images et prix depuis @type Product', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Montre connectée X',
      description: 'Une super montre',
      image: ['https://img.test/1.jpg', 'https://img.test/2.jpg'],
      offers: { '@type': 'Offer', price: '29.99', priceCurrency: 'USD' },
    })}</script></head><body></body></html>`;
    const data = extractFromJsonLd(cheerio.load(html));
    expect(data.title).toBe('Montre connectée X');
    expect(data.description).toBe('Une super montre');
    expect(data.images).toEqual(['https://img.test/1.jpg', 'https://img.test/2.jpg']);
    expect(data.price).toBeCloseTo(29.99);
    expect(data.currency).toBe('USD');
  });

  it('gère @graph et une image objet', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'WebPage' },
        { '@type': 'Product', name: 'P', image: { url: 'https://img.test/a.jpg' } },
      ],
    })}</script>`;
    const data = extractFromJsonLd(cheerio.load(html));
    expect(data.title).toBe('P');
    expect(data.images).toEqual(['https://img.test/a.jpg']);
  });

  it('ignore un JSON-LD invalide sans planter', () => {
    const data = extractFromJsonLd(cheerio.load('<script type="application/ld+json">{bad json</script>'));
    expect(data.title).toBeUndefined();
  });
});

describe('extractFromOpenGraph', () => {
  it('extrait titre, description, prix et images depuis les balises og', () => {
    const html = `<head>
      <meta property="og:title" content="Casque Audio" />
      <meta property="og:description" content="Son immersif" />
      <meta property="og:image" content="https://img.test/og1.jpg" />
      <meta property="og:image" content="https://img.test/og2.jpg" />
      <meta property="product:price:amount" content="49,90" />
      <meta property="product:price:currency" content="EUR" />
    </head>`;
    const data = extractFromOpenGraph(cheerio.load(html));
    expect(data.title).toBe('Casque Audio');
    expect(data.description).toBe('Son immersif');
    expect(data.images).toEqual(['https://img.test/og1.jpg', 'https://img.test/og2.jpg']);
    expect(data.price).toBeCloseTo(49.9);
    expect(data.currency).toBe('EUR');
  });
});
