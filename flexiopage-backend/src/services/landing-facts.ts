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

export type HookScene = 'room' | 'cod' | 'offer' | 'hands' | 'detail';

export interface ConversionHook {
  text: string;
  scene: HookScene;
}

/**
 * Accroches courtes peintes SUR la photo produit.
 * Seulement le prix réel, la remise réelle, et le paiement à la livraison.
 * Pas de délai, pas de retour, pas de « livraison gratuite ».
 */
export function buildConversionHooks(opts: {
  priceBefore?: number;
  priceAfter?: number;
  currency?: string;
}): { hero: ConversionHook; frames: ConversionHook[] } {
  const { priceBefore, priceAfter, currency } = opts;
  const discount =
    typeof priceBefore === 'number' &&
    typeof priceAfter === 'number' &&
    priceBefore > priceAfter
      ? Math.round(((priceBefore - priceAfter) / priceBefore) * 100)
      : 0;
  const priceText = typeof priceAfter === 'number' ? hookPrice(priceAfter, currency) : '';
  const pool = [
    discount >= 5 ? `-${discount}%` : '',
    'PAYE A LA LIVRAISON',
    priceText,
    'EN MAIN PROPRE',
    'SANS AVANCE',
    'COMMANDE MAINTENANT',
  ].filter((t) => t.length > 0);
  const unique = [...new Set(pool)];
  const scenes: HookScene[] = ['cod', 'offer', 'hands', 'detail'];
  const frames = scenes.map((scene, i) => ({
    text: unique[i + 1] || unique[unique.length - 1] || 'COMMANDE MAINTENANT',
    scene,
  }));
  return {
    hero: { text: unique[0] || 'PAYE A LA LIVRAISON', scene: 'room' },
    frames,
  };
}

export function hookImagePrompt(hook: ConversionHook, culture: string): string {
  const scene =
    hook.scene === 'room'
      ? `the product worn or held in a real ${culture} interior, large in the frame, a dark gradient on one side so the type stays readable`
      : hook.scene === 'cod'
        ? 'the product centered on a deep warm background like a paid social ad, with empty space for one line of type'
        : hook.scene === 'offer'
          ? 'a tight premium crop of the product, with a solid color block on the bottom third reserved for type'
          : hook.scene === 'hands'
            ? 'the product worn normally, face fully visible, hands relaxed, type in the top corner. Do not hide or crop the head'
            : 'a macro of the product material filling the frame, one short line of type over a dark scrim';
  return [
    'Vertical 4:5 conversion ad, made from the reference image.',
    'Keep that exact product recognizable: same color, same shape, same material, same pieces.',
    'Do not replace it with a different product.',
    `Scene: ${scene}.`,
    `The only words on the image are "${hook.text}", in bold condensed sans-serif, high contrast, spelled exactly.`,
    'No other words, no watermark, no logo.',
  ].join(' ');
}

function hookPrice(amount: number, currency?: string): string {
  const n = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount);
  const c = (currency || '').toUpperCase();
  if (c === 'XOF' || c === 'XAF') return `${n} F CFA`;
  if (c === 'EUR') return `${n} EUR`;
  if (c === 'USD') return `${n} USD`;
  return c ? `${n} ${c}` : n;
}
