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
    if (sec.type === 'hero' || sec.type === 'product' || sec.type === 'testimonials') {
      delete p.rating;
      delete p.reviewCount;
    }
    if (sec.type === 'product') {
      if (opts.productName) p.name = opts.productName;
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

const FORM_ANCHOR = '#cod-order-form-section';
const COD_ORDER = ['hero', 'product', 'features', 'gallery', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer'];
const WEAK_CTA = /^(acheter|achetez|buy now|shop now|add to cart|d[ée]couvrez|discover|je le veux|order now|get started)$/i;

interface SalesCopy {
  formTitle: string;
  formSubtitle: string;
  submit: string;
  heroCta: string;
  ctaButton: string;
  urgency: string;
  trust: string;
  noAdvance: string;
  stepsTitle: string;
  stepsSubtitle: string;
  steps: Array<{ title: string; description: string; icon: string }>;
  faqTitle: string;
  faq: Array<{ question: string; answer: string }>;
  reassurance: (eta?: string) => string;
}

const SALES_COPY: Record<'fr' | 'ar' | 'en', SalesCopy> = {
  fr: {
    formTitle: 'Commande · paiement à la livraison',
    formSubtitle: 'Nom, téléphone et ville. On te rappelle pour confirmer. Tu paies le livreur en cash, rien avant.',
    submit: 'Confirmer la commande',
    heroCta: 'Commander · paiement à la livraison',
    ctaButton: 'Commander maintenant',
    urgency: 'Tu paies seulement quand tu as le colis en main.',
    trust: 'Paiement à la livraison',
    noAdvance: 'Aucune avance',
    stepsTitle: 'Comment se passe la commande',
    stepsSubtitle: 'Tu ne paies rien en ligne.',
    steps: [
      { title: 'Tu commandes', description: 'Nom, téléphone, ville. Une minute.', icon: 'check' },
      { title: 'On confirme par téléphone', description: 'On vérifie l’adresse. Tu peux encore annuler.', icon: 'clock' },
      { title: 'Tu payes au livreur', description: 'Tu ouvres le colis. Tu paies en cash seulement si ça te convient.', icon: 'truck' },
    ],
    faqTitle: 'Avant de commander',
    faq: [
      { question: 'Comment je paie ?', answer: 'Rien maintenant. Le livreur encaisse en cash quand il te remet le colis.' },
      { question: 'Et si je ne suis pas là ?', answer: 'On t’appelle avant le passage pour confirmer l’heure.' },
      { question: 'Et si le produit ne me convient pas ?', answer: 'Tu regardes le colis avant de payer. S’il ne te convient pas, tu ne le prends pas.' },
      { question: 'Où livrez-vous ?', answer: 'Dans les villes couvertes par le transporteur de la boutique. L’appel de confirmation te le précise.' },
    ],
    reassurance: (eta) => eta ? `Paiement à la livraison · Livraison ${eta} · Aucune avance` : 'Paiement à la livraison · Aucune avance',
  },
  ar: {
    formTitle: 'الطلب · الدفع عند الاستلام',
    formSubtitle: 'الاسم، الهاتف والمدينة. نتصل بك للتأكيد. تخلص للكولي كاش، والو قبل.',
    submit: 'تأكيد الطلب',
    heroCta: 'اطلب · الدفع عند الاستلام',
    ctaButton: 'تأكيد الطلب',
    urgency: 'تخلص غير ملي يوصل الكولي والcolis في يدك.',
    trust: 'الدفع عند الاستلام',
    noAdvance: 'بلا تسبيق',
    stepsTitle: 'كيفاش كيتم الطلب',
    stepsSubtitle: 'ما تخلص والو دابا.',
    steps: [
      { title: 'كتسيب الطلب', description: 'الاسم، الهاتف والمدينة. دقيقة.', icon: 'check' },
      { title: 'كنأكدوا معاك بالهاتف', description: 'كنراجعوا العنوان. تقدر تلغي.', icon: 'clock' },
      { title: 'كتخلص للكولي', description: 'كتفتح الكوليس. كتخلص كاش غير إلا عجبك.', icon: 'truck' },
    ],
    faqTitle: 'قبل ما تطلب',
    faq: [
      { question: 'كيفاش نخلص؟', answer: 'والو دابا. الكولي كياخد الكاش ملي يسلمك الكوليس.' },
      { question: 'إلا ما كنتش فالدار؟', answer: 'كنعيطوا ليك قبل ما يجي الكولي باش نتافقوا على الوقت.' },
      { question: 'إلا ما عجبنيش المنتج؟', answer: 'كتشوف الكوليس قبل ما تخلص. إلا ما عجبكش، ما تاخدوش.' },
      { question: 'فين كتوصلوا؟', answer: 'فالمدن اللي كيغطّيها ناقل البوتيك. مكالمة التأكيد كتقول ليك.' },
    ],
    reassurance: (eta) => eta ? `الدفع عند الاستلام · التوصيل ${eta} · بلا تسبيق` : 'الدفع عند الاستلام · بلا تسبيق',
  },
  en: {
    formTitle: 'Order · cash on delivery',
    formSubtitle: 'Name, phone and city. We call to confirm. You pay the courier in cash, nothing before.',
    submit: 'Confirm the order',
    heroCta: 'Order · cash on delivery',
    ctaButton: 'Order now',
    urgency: 'You pay only when the parcel is in your hands.',
    trust: 'Cash on delivery',
    noAdvance: 'No prepayment',
    stepsTitle: 'How the order works',
    stepsSubtitle: 'You pay nothing online.',
    steps: [
      { title: 'You place the order', description: 'Name, phone, city. One minute.', icon: 'check' },
      { title: 'We confirm by phone', description: 'We check the address. You can still cancel.', icon: 'clock' },
      { title: 'You pay the courier', description: 'You open the parcel. You pay cash only if it suits you.', icon: 'truck' },
    ],
    faqTitle: 'Before you order',
    faq: [
      { question: 'How do I pay?', answer: 'Nothing now. The courier collects cash when they hand you the parcel.' },
      { question: 'What if I am not home?', answer: 'We call before the delivery to agree on a time.' },
      { question: 'What if the product does not suit me?', answer: 'You look at the parcel before paying. If it does not suit you, you do not take it.' },
      { question: 'Where do you deliver?', answer: 'In the cities covered by the store’s courier. The confirmation call tells you.' },
    ],
    reassurance: (eta) => eta ? `Cash on delivery · Delivery ${eta} · No prepayment` : 'Cash on delivery · No prepayment',
  },
};

function salesLang(language?: string): 'fr' | 'ar' | 'en' {
  const lang = (language || 'fr').toLowerCase();
  if (lang.startsWith('ar')) return 'ar';
  if (lang.startsWith('en')) return 'en';
  return 'fr';
}

function weakCta(value: unknown): boolean {
  return typeof value !== 'string' || !value.trim() || WEAK_CTA.test(value.trim());
}

function honestReassurance(current: unknown, fallback: string, eta?: string): string {
  if (typeof current !== 'string' || !current.trim()) return fallback;
  const text = current.trim();
  const inventedDelay = /\d+\s*(h|j|jours|hours|days)/i.test(text) && !(eta && text.includes(eta));
  const inventedPromise = /retour|rembours|gratuit|free shipping|14\s*j/i.test(text);
  if (inventedDelay || inventedPromise) return fallback;
  return text;
}

/**
 * Met la landing dans l'ordre d'une page de vente cash à la livraison :
 * offre, preuves, étapes de commande, formulaire, objections.
 * Le délai annoncé vient uniquement de l'ETA du pays, jamais d'un retour inventé.
 */
export function shapeCodSalesPage<T extends LandingSection>(
  sections: T[],
  opts: {
    productName?: string;
    productSlug?: string;
    productPrice?: number;
    currency?: string;
    country?: string;
    language?: string;
    eta?: string;
  },
): T[] {
  const copy = SALES_COPY[salesLang(opts.language)];
  const country = (opts.country || '').toUpperCase();
  const list = sections.map((s) => ({ ...s, props: { ...(s.props || {}) } }));

  for (const sec of list) {
    const p = sec.props;
    if (sec.type === 'hero') {
      p.ctaHref = FORM_ANCHOR;
      if (weakCta(p.ctaText)) p.ctaText = copy.heroCta;
      if (typeof p.trustLine !== 'string' || !p.trustLine.trim()) p.trustLine = copy.trust;
    }
    if (sec.type === 'cta') {
      p.buttonHref = FORM_ANCHOR;
      if (weakCta(p.buttonText)) p.buttonText = copy.ctaButton;
      if (typeof p.urgency === 'string' && /stock|pi[eè]ces|restant|limited stock/i.test(p.urgency)) p.urgency = copy.urgency;
      if (typeof p.urgency !== 'string' || !p.urgency.trim()) p.urgency = copy.urgency;
    }
    if (sec.type === 'product') {
      p.ctaHref = FORM_ANCHOR;
      if (weakCta(p.ctaText)) p.ctaText = copy.heroCta;
      if (!Array.isArray(p.trustBadges) || (p.trustBadges as unknown[]).length === 0) {
        p.trustBadges = [copy.trust, copy.noAdvance];
      }
    }
    if (sec.type === 'cod-form') {
      if (opts.productSlug) p.productSlug = opts.productSlug;
      if (weakCta(p.title) || /je le veux/i.test(String(p.title || ''))) p.title = copy.formTitle;
      if (typeof p.subtitle !== 'string' || !p.subtitle.trim()) p.subtitle = copy.formSubtitle;
      if (weakCta(p.submitLabel)) p.submitLabel = copy.submit;
      p.reassurance = honestReassurance(p.reassurance, copy.reassurance(opts.eta), opts.eta);
      p.showEmail = false;
      p.requireEmail = false;
      p.showNotes = false;
      p.showQuantity = true;
      if (country === 'MA' || country === 'TN') p.showPostalCode = true;
      if (country === 'DZ') p.showState = true;
    }
  }

  const has = (type: string) => list.some((s) => s.type === type && (
    type !== 'faq' && type !== 'steps' || itemCount(s.props) > 0
  ));

  if (opts.productName && !list.some((s) => s.type === 'product')) {
    const heroImage = list.find((s) => s.type === 'hero')?.props.imageUrl;
    list.push({
      type: 'product',
      props: {
        name: opts.productName,
        ...(typeof opts.productPrice === 'number' ? { priceAfter: opts.productPrice } : {}),
        ...(opts.currency ? { currency: opts.currency } : {}),
        ...(typeof heroImage === 'string' ? { imageUrl: heroImage } : {}),
        ctaText: copy.heroCta,
        ctaHref: FORM_ANCHOR,
        trustBadges: [copy.trust, copy.noAdvance],
      },
    } as T);
  }
  if (!has('steps')) {
    list.push({ type: 'steps', props: { title: copy.stepsTitle, subtitle: copy.stepsSubtitle, items: copy.steps } } as T);
  }
  if (!has('faq')) {
    list.push({ type: 'faq', props: { title: copy.faqTitle, items: copy.faq } } as T);
  }
  if (!has('cod-form')) {
    list.push({
      type: 'cod-form',
      props: {
        title: copy.formTitle,
        subtitle: copy.formSubtitle,
        submitLabel: copy.submit,
        reassurance: copy.reassurance(opts.eta),
        ...(opts.productSlug ? { productSlug: opts.productSlug } : {}),
        showEmail: false,
        requireEmail: false,
        showPostalCode: country === 'MA' || country === 'TN',
        showState: country === 'DZ',
        showNotes: false,
        showQuantity: true,
      },
    } as T);
  }

  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ra = COD_ORDER.indexOf(a.s.type);
      const rb = COD_ORDER.indexOf(b.s.type);
      return (ra === -1 ? 5.5 : ra) - (rb === -1 ? 5.5 : rb) || a.i - b.i;
    })
    .map((x) => x.s);
}

function itemCount(props: Record<string, unknown>): number {
  return Array.isArray(props.items) ? props.items.length : 0;
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
