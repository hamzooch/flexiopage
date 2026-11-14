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
/** Trafic froid : promesse, bénéfices, offre, photos, commande. */
const LANDING_ORDER = ['hero', 'features', 'product', 'gallery', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer'];
/** Trafic déjà sur le produit : prix et photos avant le récit. */
const PRODUCT_ORDER = ['hero', 'product', 'gallery', 'features', 'steps', 'testimonials', 'cod-form', 'faq', 'cta', 'footer'];
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
  featuresTitle: string;
  featuresSubtitle: string;
  ctaTitle: string;
  galleryTitle: string;
  reassurance: (eta?: string) => string;
}

const SALES_COPY: Record<'fr' | 'en' | 'ar' | 'tn' | 'dz' | 'ma', SalesCopy> = {
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
    featuresTitle: 'Ce que tu obtiens',
    featuresSubtitle: 'Les faits du produit, et comment tu paies.',
    ctaTitle: 'Commande maintenant, paie à la livraison',
    galleryTitle: 'Le produit en photo',
    reassurance: (eta) => eta ? `Paiement à la livraison · Livraison ${eta} · Aucune avance` : 'Paiement à la livraison · Aucune avance',
  },
  tn: {
    formTitle: 'الكوموند · تخلّص كي توصلك',
    formSubtitle: 'الإسم، التيليفون والمدينة. نعيّطوا لك باش نأكّدوا. تخلّص للكولي كاش، حتى شيء قبل.',
    submit: 'أكّد الكوموند',
    heroCta: 'كوموندي · تخلّص عند الإستلام',
    ctaButton: 'كوموندي توّا',
    urgency: 'تخلّص كان كي الكولي يعطيك الكولية في يدك.',
    trust: 'الخلاص عند الإستلام',
    noAdvance: 'حتى تسبيق',
    stepsTitle: 'الكوموند كيفاش تتمّ',
    stepsSubtitle: 'ما تخلّص حتى شيء توّا.',
    steps: [
      { title: 'تبعث الكوموند', description: 'الإسم، التيليفون والمدينة. دقيقة برك.', icon: 'check' },
      { title: 'نعيّطوا لك', description: 'نتثبّتوا من العنوان. تنجم تلغي.', icon: 'clock' },
      { title: 'تخلّص للكولي', description: 'تحلّ الكولية. تخلّص كاش كان عجبتك.', icon: 'truck' },
    ],
    faqTitle: 'قبل ما تكموندي',
    faq: [
      { question: 'كيفاش نخلّص؟', answer: 'حتى شيء توّا. الكولي ياخو الكاش كي يسلّملك الكولية.' },
      { question: 'كان ما نكونش في الدار؟', answer: 'نعيّطوا لك قبل ما يجي الكولي باش نتفاهموا على الوقت.' },
      { question: 'كان المنتج ما يعجبنيش؟', answer: 'تشوف الكولية قبل ما تخلّص. كان ما عجبتكش، ما تاخذهاش.' },
      { question: 'وين توصّلوا؟', answer: 'في المدن اللي يغطّيها الناقل متاع البوتيك. المكالمة توضّحلك.' },
    ],
    featuresTitle: 'شنوّة تاخو',
    featuresSubtitle: 'المنتج، وكيفاش تخلّص.',
    ctaTitle: 'كوموندي توّا، وخلّص كي توصلك',
    galleryTitle: 'المنتج في التصاور',
    reassurance: (eta) => eta ? `الخلاص عند الإستلام · التوصيل ${eta} · حتى تسبيق` : 'الخلاص عند الإستلام · حتى تسبيق',
  },
  dz: {
    formTitle: 'الكوموند · تخلّص كي يوصلك',
    formSubtitle: 'السمية، التيليفون والمدينة. نعيّطوا لك باش نأكّدوا. تخلّص للكولي كاش، والو قبل.',
    submit: 'أكّد الكوموند',
    heroCta: 'كوموندي · الخلاص عند الإستلام',
    ctaButton: 'كوموندي دروك',
    urgency: 'تخلّص غير كي الكولي يمدّلك الكولي في يدك.',
    trust: 'الخلاص عند الإستلام',
    noAdvance: 'بلا تسبيق',
    stepsTitle: 'الكوموند كيفاش تديرها',
    stepsSubtitle: 'ما تخلّص والو دروك.',
    steps: [
      { title: 'دير الكوموند', description: 'السمية، التيليفون والمدينة. دقيقة.', icon: 'check' },
      { title: 'نعيّطوا لك', description: 'نأكّدوا العنوان. تقدر تلغي.', icon: 'clock' },
      { title: 'تخلّص للكولي', description: 'تحل الكولي. تخلّص كاش غير إلا عجبك.', icon: 'truck' },
    ],
    faqTitle: 'قبل ما تكموندي',
    faq: [
      { question: 'كيفاش نخلّص؟', answer: 'والو دروك. الكولي ياخد الكاش كي يسلّملك الكولي.' },
      { question: 'إلا ما كنتش في الدار؟', answer: 'نعيّطوا لك قبل ما يجي الكولي باش نتفاهموا على الوقت.' },
      { question: 'إلا المنتج ما عجبنيش؟', answer: 'تشوف الكولي قبل ما تخلّص. إلا ما عجبكش، ما تاخذوش.' },
      { question: 'وين توصّلوا؟', answer: 'في المدن اللي يغطّيها ناقل البوتيك. المكالمة تقولك.' },
    ],
    featuresTitle: 'واش تاخو',
    featuresSubtitle: 'المنتج، وكيفاش تخلّص.',
    ctaTitle: 'كوموندي دروك، وخلّص كي يوصلك',
    galleryTitle: 'المنتج في التصاور',
    reassurance: (eta) => eta ? `الخلاص عند الإستلام · التوصيل ${eta} · بلا تسبيق` : 'الخلاص عند الإستلام · بلا تسبيق',
  },
  ma: {
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
    featuresTitle: 'شنو غادي تاخد',
    featuresSubtitle: 'المنتج، وكيفاش كتخلص.',
    ctaTitle: 'اطلب دابا، تخلص عند الاستلام',
    galleryTitle: 'المنتج فالتصاور',
    reassurance: (eta) => eta ? `الدفع عند الاستلام · التوصيل ${eta} · بلا تسبيق` : 'الدفع عند الاستلام · بلا تسبيق',
  },
  ar: {
    formTitle: 'اطلب · الدفع عند الاستلام',
    formSubtitle: 'الاسم، الهاتف والمدينة. نتصل بك للتأكيد. تدفع للمندوب كاش، ولا شيء قبل.',
    submit: 'تأكيد الطلب',
    heroCta: 'اطلب · الدفع عند الاستلام',
    ctaButton: 'اطلب الآن',
    urgency: 'تدفع كاش للمندوب لما تستلم، ولا شيء قبل.',
    trust: 'الدفع عند الاستلام',
    noAdvance: 'بدون مقدم',
    stepsTitle: 'كيف يتم الطلب',
    stepsSubtitle: 'ما تدفع شيء الآن.',
    steps: [
      { title: 'تبعت الطلب', description: 'الاسم، الهاتف والمدينة. دقيقة.', icon: 'check' },
      { title: 'نتصل فيك', description: 'نتأكد من العنوان. تقدر تلغي.', icon: 'clock' },
      { title: 'تدفع للمندوب', description: 'تفتح الطرد. تدفع كاش بس إذا ناسبك.', icon: 'truck' },
    ],
    faqTitle: 'قبل ما تطلب',
    faq: [
      { question: 'كيف أدفع؟', answer: 'ولا شيء الآن. المندوب ياخذ الكاش لما يسلّمك الطرد.' },
      { question: 'إذا ما كنت بالبيت؟', answer: 'نتصل فيك قبل ما يجي المندوب حتى نتفق على الوقت.' },
      { question: 'إذا المنتج ما ناسبني؟', answer: 'تشوف الطرد قبل ما تدفع. إذا ما ناسبك، ما تاخذه.' },
      { question: 'وين توصّلون؟', answer: 'بالمدن اللي يغطيها مندوب المتجر. المكالمة توضّح لك.' },
    ],
    featuresTitle: 'شو تاخذ',
    featuresSubtitle: 'المنتج، وكيف تدفع.',
    ctaTitle: 'اطلب الآن، وادفع عند الاستلام',
    galleryTitle: 'المنتج بالصور',
    reassurance: (eta) => eta ? `الدفع عند الاستلام · التوصيل ${eta} · بدون مقدم` : 'الدفع عند الاستلام · بدون مقدم',
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
    featuresTitle: 'What you get',
    featuresSubtitle: 'The product, and how you pay.',
    ctaTitle: 'Order now, pay on delivery',
    galleryTitle: 'The product, up close',
    reassurance: (eta) => eta ? `Cash on delivery · Delivery ${eta} · No prepayment` : 'Cash on delivery · No prepayment',
  },
};

function salesVoice(language?: string, country?: string): 'fr' | 'en' | 'ar' | 'tn' | 'dz' | 'ma' {
  const lang = (language || '').toLowerCase();
  const code = (country || '').toUpperCase();
  if (lang.startsWith('en')) return 'en';
  if (lang === 'ar-tn' || (lang.startsWith('ar') && code === 'TN')) return 'tn';
  if (lang === 'ar-dz' || (lang.startsWith('ar') && code === 'DZ')) return 'dz';
  if (lang === 'ar-ma' || (lang.startsWith('ar') && code === 'MA')) return 'ma';
  if (lang.startsWith('ar')) return 'ar';
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
export function shapeCodSalesPage(
  sections: LandingSection[],
  opts: {
    productName?: string;
    productSlug?: string;
    productPrice?: number;
    productDescription?: string;
    productImages?: string[];
    storeName?: string;
    currency?: string;
    country?: string;
    language?: string;
    eta?: string;
    /** `product` met le prix et les photos avant les bénéfices. */
    pageKind?: 'landing' | 'product';
  },
): LandingSection[] {
  const copy = SALES_COPY[salesVoice(opts.language, opts.country)];
  const country = (opts.country || '').toUpperCase();
  const list: LandingSection[] = sections.map((s) => ({ ...s, props: { ...(s.props || {}) } }));

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
    if (sec.type === 'gallery') {
      const existing = imageList(p.images);
      const fallback = imageList(opts.productImages);
      if (existing.length === 0 && fallback.length > 0) p.images = fallback;
      if (typeof p.title !== 'string' || !p.title.trim()) p.title = copy.galleryTitle;
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

  const has = (type: string) => list.some((s) => s.type === type && sectionUsable(type, s));

  if (!has('hero') && opts.productName) {
    list.push({
      type: 'hero',
      props: {
        title: opts.productName,
        subtitle: copy.urgency,
        ctaText: copy.heroCta,
        ctaHref: FORM_ANCHOR,
        trustLine: copy.trust,
        layout: 'split',
      },
    });
  }
  if (!has('features')) {
    list.push({
      type: 'features',
      props: {
        title: copy.featuresTitle,
        subtitle: copy.featuresSubtitle,
        items: benefitItems(opts.productDescription, copy),
      },
    });
  }
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
        highlights: benefitItems(opts.productDescription, copy).slice(0, 4).map((item) => item.title),
      },
    });
  }
  const photos = imageList(opts.productImages);
  if (!has('gallery') && photos.length > 0) {
    list.push({ type: 'gallery', props: { title: copy.galleryTitle, images: photos } });
  }
  if (!has('steps')) {
    list.push({ type: 'steps', props: { title: copy.stepsTitle, subtitle: copy.stepsSubtitle, items: copy.steps } });
  }
  if (!has('faq')) {
    list.push({ type: 'faq', props: { title: copy.faqTitle, items: copy.faq } });
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
    });
  }
  if (!has('cta')) {
    list.push({
      type: 'cta',
      props: {
        title: copy.ctaTitle,
        subtitle: copy.formSubtitle,
        buttonText: copy.ctaButton,
        buttonHref: FORM_ANCHOR,
        urgency: copy.urgency,
      },
    });
  }
  if (!list.some((s) => s.type === 'footer')) {
    list.push({
      type: 'footer',
      props: {
        brandName: opts.storeName || opts.productName || '',
        tagline: copy.reassurance(opts.eta),
        paymentMethods: ['cod'],
        links: [],
      },
    });
  }

  const order = opts.pageKind === 'product' ? PRODUCT_ORDER : LANDING_ORDER;
  const best = new Map<string, LandingSection>();
  const extras: LandingSection[] = [];
  for (const s of list) {
    if (!order.includes(s.type)) {
      if (s.type !== 'stats' && s.type !== 'brands') extras.push(s);
      continue;
    }
    const prev = best.get(s.type);
    if (!prev || richness(s) > richness(prev)) best.set(s.type, s);
  }
  const core = order
    .map((type) => best.get(type))
    .filter((s): s is LandingSection => !!s && sectionUsable(s.type, s));
  const faqAt = core.findIndex((s) => s.type === 'faq');
  if (extras.length > 0 && faqAt >= 0) core.splice(faqAt, 0, ...extras);
  else core.push(...extras);
  return core;
}

function itemCount(props: Record<string, unknown>): number {
  return Array.isArray(props.items) ? props.items.length : 0;
}

function imageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((u): u is string => typeof u === 'string' && u.length > 0);
}

function sectionUsable(type: string, section: LandingSection): boolean {
  if (type === 'faq' || type === 'steps' || type === 'features' || type === 'testimonials') {
    return itemCount(section.props) > 0;
  }
  if (type === 'gallery') return imageList(section.props.images).length > 0;
  if (type === 'hero') return typeof section.props.title === 'string' && section.props.title.trim().length > 0;
  return true;
}

function richness(section: LandingSection): number {
  return itemCount(section.props) * 100 + imageList(section.props.images).length * 40 + Math.min(JSON.stringify(section.props).length, 800);
}

function benefitItems(description: string | undefined, copy: SalesCopy): Array<{ title: string; description: string; icon: string }> {
  const fromFacts = (description || '')
    .split(/[\n•]|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24 && s.length <= 180)
    .slice(0, 3)
    .map((sentence, i) => ({
      title: sentence.split(/\s+/).slice(0, 6).join(' '),
      description: sentence,
      icon: ['check', 'sparkles', 'heart'][i] || 'check',
    }));
  const trust = [
    { title: copy.trust, description: copy.formSubtitle, icon: 'truck' },
    { title: copy.noAdvance, description: copy.urgency, icon: 'shield' },
    { title: copy.steps[1]?.title || copy.stepsTitle, description: copy.steps[1]?.description || copy.stepsSubtitle, icon: 'clock' },
  ];
  return [...fromFacts, ...trust].slice(0, 5);
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
