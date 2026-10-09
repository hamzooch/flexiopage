/**
 * Verrouille la landing sur les faits du catalogue.
 * Le modèle a tendance à renommer le produit et à inventer des avis,
 * un stock et une presse. On retire ces blocs après le JSON, quoi qu'il écrive.
 */

export interface LandingSection {
  type: string;
  props: Record<string, unknown>;
}

const FAKE_PROOF = /\d[\d\s.,]*\+?[\s\S]{0,24}(clients?|clientes?|avis|pi[eè]ces|commandes|recommand)/i;

export function lockLandingSections<T extends LandingSection>(
  sections: T[],
  opts: { productName?: string; allowDiscount: boolean },
): T[] {
  const kept = sections.filter((s) => s.type !== 'stats' && s.type !== 'brands');
  for (const sec of kept) {
    const p = sec.props;
    if (!p) continue;
    if (sec.type === 'product') {
      if (opts.productName) p.name = opts.productName;
      delete p.rating;
      delete p.reviewCount;
      if (!opts.allowDiscount) {
        delete p.priceBefore;
        delete p.discountPct;
      }
    }
    if (!opts.allowDiscount) {
      delete p.bannerPrompt;
      if (sec.type === 'hero' || sec.type === 'cta' || sec.type === 'product') {
        delete p.discountBadge;
        delete p.ctaBadge;
        if (typeof p.badge === 'string' && /%|solde|promo|−|remise/i.test(p.badge)) delete p.badge;
      }
    }
  }
  return kept;
}

export function lockSeo(
  seoTitle: string | undefined,
  seoDescription: string | undefined,
  productName?: string,
): { seoTitle?: string; seoDescription?: string } {
  let title = seoTitle?.trim();
  const name = productName?.trim();
  if (name && (!title || !title.toLowerCase().includes(name.toLowerCase()))) {
    title = title ? `${name} · ${title}`.slice(0, 70) : name;
  }
  const description = seoDescription
    ?.split(/(?<=[.!?])\s+/)
    .filter((sentence) => !FAKE_PROOF.test(sentence))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    seoTitle: title || undefined,
    seoDescription: description || undefined,
  };
}
