'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useMotionValue,
  useTransform,
  type Variants,
} from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useCountUp } from '@/lib/use-count-up';
import { BrandLogo } from '@/components/brand-logo';
import { StructuredData } from '@/components/seo/StructuredData';
import { useAuthStore } from '@/stores/auth-store';
import { isStaff } from '@/lib/is-staff';

// Mirrors the FAQ rendered inside <Faq /> so Google can index the
// questions as rich results without scraping the React tree.
// Reste en FR volontairement : la landing est sur une URL unique (/) partagée
// par toutes les langues et le marché principal est francophone — Google
// indexe la version FR canonique. La version AR/EN visible à l'écran est
// rendue via useT() dans <Faq />.
const FAQ_ITEMS = [
  {
    q: 'Comment fonctionne le solde ?',
    a: "Tes 30 premières commandes livrées sont 100% gratuites — aucun frais ne sort de ton solde. À partir de la 31e commande, une petite commission s'applique sur chaque livraison confirmée par le transporteur. Tu recharges ton solde via Wave, Orange Money, MTN MoMo ou virement quand tu veux.",
  },
  {
    q: "Que se passe-t-il si une commande n'est pas livrée ?",
    a: "Aucun frais. La commission ne s'applique qu'aux commandes livrées ET payées (transporteur confirme la collecte). Annulation, retour, refus → 0 frais. Les 30 premières livraisons restent gratuites de toute façon.",
  },
  {
    q: 'Dans quels pays opérez-vous ?',
    a: "16 pays : Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Bénin, Togo, Guinée, Niger, Gambie, Ghana, Nigeria, Cameroun, Maroc, Tunisie, Algérie, Libye.",
  },
  {
    q: 'Puis-je vendre des produits digitaux ?',
    a: 'Oui. Pour les produits digitaux le client paie en ligne (Wave, Orange Money, carte) et reçoit son fichier instantanément. Les 30 premières ventes sont gratuites comme pour les produits physiques.',
  },
];
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Wallet,
  Truck,
  ShieldCheck,
  Zap,
  LayoutTemplate,
  Smartphone,
  CheckCircle2,
  Globe,
  Mail,
  CreditCard,
  Lock,
  Menu,
  X,
} from 'lucide-react';
import { useLangStore, LANGUAGES, useT, isRtl } from '@/lib/i18n';

/**
 * `ArrowRight` de lucide pointe vers la droite → en RTL (arabe) l'utilisateur
 * attend une flèche qui pointe vers l'avant, soit vers la gauche. On swap
 * l'icône côté rendu. Toutes les flèches "action suivante / CTA" de la
 * landing passent par ce composant.
 */
function DirArrow({ className }: { className?: string }) {
  const { lang } = useT();
  const Icon = isRtl(lang) ? ArrowLeft : ArrowRight;
  return <Icon className={className} />;
}

/**
 * FlexioPage — public landing page.
 * Pricing: zero subscription. Sellers pay a small commission per sale, debited
 * from a prepaid balance (solde). Marketing messaging revolves around that.
 *
 * Animations: framer-motion for scroll-triggered fades + hero staggered
 * entrance + floating phone mockup. `useReducedMotion` is respected so users
 * with the OS-level "reduce motion" preference get a static page.
 */
export default function HomePage() {
  const router = useRouter();
  const lang = useLangStore((s) => s.lang);

  // Un vendeur déjà connecté qui tape "back" depuis le dashboard atterrit ici
  // (le login utilise `router.replace`, donc `/login` n'est plus dans
  // l'historique — l'étape précédente est `/`). On le renvoie vers son écran
  // d'entrée pour qu'il ne sorte pas de l'app par accident.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const apply = () => {
      const { token, user } = useAuthStore.getState();
      if (token) router.replace(isStaff(user) ? '/select-space' : '/select-store');
    };
    if (useAuthStore.persist?.hasHydrated?.()) {
      apply();
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration?.(apply);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [router]);

  // Synchronise <html lang="…" dir="…"> avec le choix live du visiteur.
  // Le script pré-hydration du root layout fixe déjà dir/lang au 1er paint
  // depuis localStorage (évite le flash LTR→RTL) — cet effet gère le swap
  // en direct quand l'utilisateur clique dans le LangSwitcher, sans reload.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Soft mesh background — subtle drift for life */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <motion.div
          className="absolute -left-32 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/25 blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-24 top-32 h-[420px] w-[420px] rounded-full bg-orange-500/25 blur-3xl"
          animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute left-1/3 top-[680px] h-[360px] w-[360px] rounded-full bg-amber-300/10 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
      </div>

      <ScrollProgress />
      <Header />

      <main>
        <Hero />
        <SocialProofBar />
        <Features />
        <HowItWorks />
        <FlexioPay />
        <CommissionPanel />
        <Faq />
        <FinalCta />
      </main>

      <Footer />

      <StructuredData faq={FAQ_ITEMS} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared variants
// ─────────────────────────────────────────────────────────────────────
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.21, 0.61, 0.35, 1] } },
};

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

// ─────────────────────────────────────────────────────────────────────
// SCROLL PROGRESS — thin gradient bar bound to page scroll
// ─────────────────────────────────────────────────────────────────────
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.2 });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-gradient-to-r from-amber-400 via-orange-500 to-orange-700"
      aria-hidden
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// MAGNETIC — CTA pulls slightly toward the cursor for a premium feel
// Respects reduced-motion (renders children with no interaction).
// ─────────────────────────────────────────────────────────────────────
function Magnetic({ children, strength = 0.25 }: { children: ReactNode; strength?: number }) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 15, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 200, damping: 15, mass: 0.4 });

  if (reduceMotion) return <>{children}</>;

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
        y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className="inline-block will-change-transform"
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TILT CARD — subtle 3D tilt on hover using motion values
// ─────────────────────────────────────────────────────────────────────
function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useTransform(my, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(mx, [-0.5, 0.5], [-6, 6]);
  const sRotateX = useSpring(rotateX, { stiffness: 150, damping: 15 });
  const sRotateY = useSpring(rotateY, { stiffness: 150, damping: 15 });

  return (
    <motion.div
      ref={ref}
      style={reduceMotion ? undefined : { rotateX: sRotateX, rotateY: sRotateY, transformStyle: 'preserve-3d' }}
      onPointerMove={(e) => {
        if (reduceMotion) return;
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        mx.set((e.clientX - rect.left) / rect.width - 0.5);
        my.set((e.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// REVEAL WORDS — splits a string and reveals each word with a spring
// ─────────────────────────────────────────────────────────────────────
function RevealWords({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  // Fix critique : la version précédente utilisait `inline-flex flex-wrap
  // justify-center`, ce qui transformait chaque mot en flex item indépendant
  // et cassait le titre en lignes de un-mot sur mobile (« Crée / ta / boutique
  // / en / ligne »). On revient à un flow inline natif : chaque mot est un
  // inline-block (pour permettre l'animation Y + clip vertical), les espaces
  // texte entre les <span> assurent le wrap normal — le titre coule comme du
  // texte HTML classique tout en gardant l'entrée mot-à-mot.
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`}>
          <span className="relative inline-block overflow-hidden pb-[0.12em] align-baseline leading-[inherit]">
            <motion.span
              initial={{ y: '110%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              transition={{
                duration: 0.75,
                delay: delay + i * 0.06,
                ease: [0.21, 0.61, 0.35, 1],
              }}
              className="inline-block"
            >
              {w}
            </motion.span>
          </span>
          {/* Espace texte réel — garantit que la ligne wrap normalement au
              rendu, contrairement à un gap flex qui empêchait tout mot d'être
              collé à ses voisins. */}
          {i < words.length - 1 && ' '}
        </span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// NAVBAR — minimaliste style Stripe/Linear :
//   • 3 liens au centre (Fonctionnalités / Tarifs / FAQ) + underline animé
//   • 2 CTAs à droite : Se connecter (ghost) + Créer ma boutique (gradient)
//   • Sélecteur FR/AR/EN (dropdown compact avec drapeau)
//   • Burger + drawer plein écran sur mobile
//   • Reste sticky avec compression/shadow au scroll (identique à avant)
// ─────────────────────────────────────────────────────────────────────
// Les libellés viennent du dico i18n — on garde ici seulement les hrefs +
// la clé i18n associée. Le rendu résout la clé via `useT()` à chaque frame.
const NAV_LINKS = [
  { href: '#features', key: 'landing.nav.features' },
  { href: '#commission', key: 'landing.nav.pricing' },
  { href: '#faq', key: 'landing.nav.faq' },
] as const;

function Header() {
  const { t } = useT();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // Ferme le drawer si on redimensionne au-dessus de md (évite un état bloqué
  // quand l'utilisateur pivote sa tablette en mode paysage).
  useEffect(() => {
    if (!mobileOpen) return;
    const onResize = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mobileOpen]);
  // Bloque le scroll body quand le drawer plein écran est ouvert.
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  return (
    <>
      <motion.header
        initial={false}
        animate={{
          boxShadow: scrolled ? '0 8px 24px -12px rgb(0 0 0 / 0.10)' : '0 0 0 rgb(0 0 0 / 0)',
        }}
        transition={{ duration: 0.35, ease: [0.21, 0.61, 0.35, 1] }}
        className={`sticky top-0 z-30 border-b transition-colors duration-300 ${
          scrolled
            ? 'border-border/70 bg-background/85 backdrop-blur-2xl'
            : 'border-border/40 bg-background/60 backdrop-blur-xl'
        }`}
      >
        <motion.div
          initial={false}
          animate={{ height: scrolled ? 56 : 68 }}
          transition={{ duration: 0.35, ease: [0.21, 0.61, 0.35, 1] }}
          className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
        >
          {/* Logo — gauche */}
          <Link href="/" className="flex items-center" aria-label={t('landing.nav.logoAria')}>
            <BrandLogo variant="color" width={scrolled ? 130 : 150} priority />
          </Link>

          {/* Liens desktop — centre */}
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="group relative text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t(link.key)}
                {/* Underline animé au hover — signal pro subtil. */}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          {/* Actions droite — desktop */}
          <div className="hidden items-center gap-1.5 md:flex">
            <LangSwitcher />
            <Link href="/login">
              <Button
                size="sm"
                variant="ghost"
                className="text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t('landing.nav.login')}
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="sm"
                className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 shadow-md shadow-orange-500/20 transition-all hover:from-amber-600 hover:to-orange-700 hover:shadow-orange-500/40"
              >
                {t('landing.nav.createStore')}
                <DirArrow className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {/* Burger mobile — droite */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t('landing.nav.openMenu')}
            className="grid h-10 w-10 place-items-center rounded-lg text-foreground/80 transition-colors hover:bg-muted md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </motion.div>
      </motion.header>

      {/* Drawer plein écran mobile */}
      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}

/**
 * Sélecteur langue compact — dropdown natif <details>/<summary> pour éviter
 * une dépendance popover. Suffisant pour un toggle rare, et 100% keyboard-a11y.
 * `useLangStore` persiste le choix (Zustand persist) + le layout root pose
 * déjà `dir="rtl"` sur <html> quand la langue passe à `ar`.
 */
function LangSwitcher() {
  const { t } = useT();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
  return (
    <details className="group relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`${t('landing.nav.currentLang')} : ${current.label}`}
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="uppercase">{current.code}</span>
      </summary>
      <div className="absolute right-0 top-full z-40 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-border/70 bg-popover p-1 shadow-lg shadow-black/10">
        {LANGUAGES.map((l) => {
          const active = l.code === lang;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l.code);
                // Ferme le <details> après clic (behavior par défaut ne le fait pas).
                (document.activeElement as HTMLElement | null)?.blur();
                const parent = document.querySelectorAll('details[open]');
                parent.forEach((d) => d.removeAttribute('open'));
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                active
                  ? 'bg-muted font-semibold text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span className="text-sm">{l.flag}</span>
              <span className="flex-1">{l.nativeName}</span>
              {active && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            </button>
          );
        })}
      </div>
    </details>
  );
}

/** Drawer plein écran mobile — animé avec framer-motion. */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  return (
    <motion.div
      initial={false}
      animate={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 md:hidden"
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Contenu */}
      <motion.div
        initial={false}
        animate={{ y: open ? 0 : -20, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.21, 0.61, 0.35, 1] }}
        className="relative flex h-full flex-col px-6 pb-8 pt-6"
      >
        {/* Header du drawer */}
        <div className="flex items-center justify-between">
          <BrandLogo variant="color" width={140} />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('landing.nav.closeMenu')}
            className="grid h-10 w-10 place-items-center rounded-lg text-foreground/80 transition-colors hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Liens grande police */}
        <nav className="mt-10 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="border-b border-border/40 py-4 text-2xl font-semibold text-foreground transition-colors hover:text-orange-600"
            >
              {t(link.key)}
            </a>
          ))}
        </nav>

        {/* Sélecteur langue horizontal */}
        <div className="mt-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('landing.nav.langLabel')}</div>
          <div className="mt-2 flex gap-2">
            {LANGUAGES.map((l) => {
              return (
                <MobileLangButton key={l.code} lang={l} onSelect={onClose} />
              );
            })}
          </div>
        </div>

        {/* CTAs bas */}
        <div className="mt-auto flex flex-col gap-2 pt-8">
          <Link href="/login" onClick={onClose}>
            <Button size="lg" variant="outline" className="w-full">
              {t('landing.nav.login')}
            </Button>
          </Link>
          <Link href="/register" onClick={onClose}>
            <Button
              size="lg"
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700"
            >
              {t('landing.nav.createStore')}
              <DirArrow className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MobileLangButton({ lang, onSelect }: { lang: typeof LANGUAGES[number]; onSelect: () => void }) {
  const current = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const active = current === lang.code;
  return (
    <button
      type="button"
      onClick={() => { setLang(lang.code); onSelect(); }}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300'
          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <span>{lang.flag}</span>
      <span>{lang.nativeName}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO — staggered entrance + floating phone mockup
// ─────────────────────────────────────────────────────────────────────

/**
 * Stats affichées juste sous les CTAs du hero. Placeholders early-stage,
 * ajustables librement. Idéalement à brancher plus tard à un endpoint public
 * type `GET /api/public/metrics` qui renvoie { activeStores, countries,
 * satisfaction } pour que ces chiffres bougent en temps réel avec la
 * croissance et prouvent la traction sans risque de rester obsolètes.
 * `labelKey` est résolu au rendu via `useT()` pour supporter FR / EN / AR.
 */
const HERO_STATS: { value: string; labelKey: 'landing.hero.stat1Label' | 'landing.hero.stat2Label' | 'landing.hero.stat3Label' }[] = [
  { value: '500+', labelKey: 'landing.hero.stat1Label' },
  { value: '12',   labelKey: 'landing.hero.stat2Label' },
  { value: '4.8★', labelKey: 'landing.hero.stat3Label' },
];

function Hero() {
  const { t } = useT();
  const reduceMotion = useReducedMotion();
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16 md:pt-32">
      <motion.div
        initial="hidden"
        animate="show"
        variants={staggerContainer}
        className="mx-auto max-w-3xl text-center"
      >
        <motion.div
          variants={fadeUp}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5 text-xs font-semibold backdrop-blur"
        >
          <span className="relative grid h-1.5 w-1.5 place-items-center">
            <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {t('landing.hero.badge')}
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="text-balance text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          <RevealWords text={t('landing.hero.title1')} delay={0.15} />{' '}
          <span
            className="bg-gradient-to-r from-amber-400 via-orange-500 to-orange-700 bg-clip-text text-transparent animate-gradient-shift"
            style={{ backgroundSize: '200% 200%' }}
          >
            <RevealWords text={t('landing.hero.title2')} delay={0.45} />
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-5 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg md:text-xl"
        >
          {t('landing.hero.subtitle')}
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10"
        >
          {/* CTA primaire — pointe vers /register : le prospect n'a pas de
              compte, il vient pour créer. Se connecter reste dans la navbar. */}
          <Magnetic strength={0.3}>
            <Link href="/register">
              <Button
                size="lg"
                className="group relative h-12 gap-2 overflow-hidden bg-gradient-to-r from-amber-500 to-orange-600 px-7 text-base font-semibold shadow-xl shadow-orange-500/30 transition-all hover:scale-[1.03] hover:from-amber-600 hover:to-orange-700"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative">{t('landing.hero.ctaPrimary')}</span>
                <span className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5">
                  <DirArrow className="h-4 w-4" />
                </span>
              </Button>
            </Link>
          </Magnetic>
          <a href="#how">
            <Button size="lg" variant="outline" className="h-12 px-7 text-base transition-all hover:border-orange-500/50 hover:bg-orange-50/50">
              {t('landing.hero.ctaSecondary')}
            </Button>
          </a>
        </motion.div>

        {/* Barre stats mini — chiffres placeholder à brancher aux vraies
            métriques (`GET /api/public/metrics` ou similaire) quand tu auras
            un endpoint. Pour l'instant : chiffres crédibles early-stage,
            ajustables ligne par ligne dans `HERO_STATS`. */}
        <motion.div
          variants={fadeUp}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:mt-10 sm:gap-x-10"
        >
          {HERO_STATS.map((stat) => (
            <div key={stat.labelKey} className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground tabular-nums sm:text-2xl">
                {stat.value}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground sm:text-xs">
                {t(stat.labelKey)}
              </span>
            </div>
          ))}
        </motion.div>

        <motion.p
          variants={fadeUp}
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {t('landing.hero.reassure')}
        </motion.p>
      </motion.div>

      {/* Hero "screen" mock — slides up + floats subtly */}
      <motion.div
        initial={{ opacity: 0, y: 80, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.35, ease: [0.21, 0.61, 0.35, 1] }}
        className="relative mx-auto mt-12 max-w-5xl sm:mt-20"
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <HeroScreenMock />
        </motion.div>
      </motion.div>
    </section>
  );
}

function HeroScreenMock() {
  const { t } = useT();
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-amber-400/30 via-orange-500/25 to-orange-700/20 blur-3xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-black/5">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2 sm:px-4 sm:py-2.5">
          <span className="h-2 w-2 rounded-full bg-rose-400 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-amber-400 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-emerald-400 sm:h-2.5 sm:w-2.5" />
          <span className="ml-2 truncate rounded-md bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground sm:ml-3 sm:px-2.5 sm:text-[11px]">
            boutique-test.flexiopage.com/p/caftan-marrakech
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[1.05fr_1fr] sm:gap-8 sm:p-10">
          {/* Mock product image */}
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-gradient-to-br from-amber-50 via-orange-100 to-orange-200">
            <motion.div
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.2, type: 'spring', stiffness: 200 }}
              className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white sm:left-4 sm:top-4 sm:px-2.5 sm:py-1 sm:text-[10px]"
            >
              −25%
            </motion.div>
            <motion.div
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.4, type: 'spring', stiffness: 200 }}
              className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-[9px] font-semibold backdrop-blur sm:right-4 sm:top-4 sm:px-2.5 sm:py-1 sm:text-[10px]"
            >
              <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> {t('landing.heroMock.cash')}
            </motion.div>
            <div className="absolute inset-x-4 bottom-4 grid grid-cols-4 gap-1 sm:inset-x-6 sm:bottom-6 sm:gap-1.5">
              {[0,1,2,3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, delay: 1.6 + i * 0.08 }}
                  className="aspect-square rounded-md bg-card/70 backdrop-blur"
                />
              ))}
            </div>
          </div>

          {/* Mock product details + tiny form */}
          <div className="space-y-3 sm:space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('landing.heroMock.category')}</div>
              <div className="mt-1.5 text-xl font-bold tracking-tight sm:mt-2 sm:text-3xl">{t('landing.heroMock.name')}</div>
              <div className="mt-1.5 text-[11px] text-muted-foreground sm:mt-2 sm:text-xs">{t('landing.heroMock.desc')}</div>
            </div>
            <div className="flex items-baseline gap-2">
              {/* Pulsing price — draws the eye */}
              <motion.span
                animate={reduceMotion ? undefined : { scale: [1, 1.04, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                className="text-2xl font-extrabold text-orange-600 sm:text-3xl"
              >
                45 000 F CFA
              </motion.span>
              <span className="text-xs text-muted-foreground line-through sm:text-sm">60 000</span>
            </div>
            <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
              <div className="font-semibold">{t('landing.heroMock.formTitle')}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-7 rounded-md border border-border/60 bg-card sm:h-8" />
                <div className="h-7 rounded-md border border-border/60 bg-card sm:h-8" />
              </div>
              <div className="h-7 rounded-md border border-border/60 bg-card sm:h-8" />
              <motion.div
                animate={reduceMotion ? undefined : { boxShadow: [
                  '0 0 0 0 rgba(217, 70, 239, 0.4)',
                  '0 0 0 8px rgba(217, 70, 239, 0)',
                  '0 0 0 0 rgba(217, 70, 239, 0)',
                ] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 2.5 }}
                className="grid h-9 place-items-center rounded-md bg-gradient-to-r from-amber-500 to-orange-600 text-xs font-bold text-white"
              >
                {t('landing.heroMock.cta')}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SOCIAL PROOF — animated count-up stats
// ─────────────────────────────────────────────────────────────────────
function SocialProofBar() {
  const { t } = useT();
  const stats = [
    { value: 0, suffix: '€', label: t('landing.stats.subscription'), customFormat: () => '0 €' },
    { value: 5, suffix: 'min', label: t('landing.stats.openShop'), customFormat: (n: number) => `< ${n} min` },
    { value: 16, suffix: 'pays', label: t('landing.stats.countries'), customFormat: (n: number) => `${n} ${t('landing.stats.countriesUnit')}` },
    { value: 24, suffix: '/7', label: t('landing.stats.support'), customFormat: (n: number) => `${n}/7` },
  ];
  return (
    <section className="border-y border-border/40 bg-card/30 backdrop-blur">
      <CountryMarquee />
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 sm:grid-cols-4 sm:gap-6 sm:px-6 sm:py-10">
        {stats.map((s, i) => (
          <StatBlock key={s.label} {...s} delay={i * 0.08} />
        ))}
      </div>
    </section>
  );
}

// Liste des pays affichés dans le marquee. On garde uniquement le drapeau + la
// clé i18n ici ; le nom localisé est résolu au rendu via `useT()` — permet à
// la bannière de bascule instantanément entre FR / EN / AR.
const MARQUEE_COUNTRIES = [
  { flag: '🇸🇳', key: 'landing.countries.SN' },
  { flag: '🇨🇮', key: 'landing.countries.CI' },
  { flag: '🇲🇱', key: 'landing.countries.ML' },
  { flag: '🇧🇫', key: 'landing.countries.BF' },
  { flag: '🇧🇯', key: 'landing.countries.BJ' },
  { flag: '🇹🇬', key: 'landing.countries.TG' },
  { flag: '🇬🇳', key: 'landing.countries.GN' },
  { flag: '🇳🇪', key: 'landing.countries.NE' },
  { flag: '🇬🇲', key: 'landing.countries.GM' },
  { flag: '🇬🇭', key: 'landing.countries.GH' },
  { flag: '🇳🇬', key: 'landing.countries.NG' },
  { flag: '🇨🇲', key: 'landing.countries.CM' },
  { flag: '🇲🇦', key: 'landing.countries.MA' },
  { flag: '🇹🇳', key: 'landing.countries.TN' },
  { flag: '🇩🇿', key: 'landing.countries.DZ' },
  { flag: '🇱🇾', key: 'landing.countries.LY' },
] as const;

function CountryMarquee() {
  const { t } = useT();
  const reduceMotion = useReducedMotion();
  // Duplicate the list so the -50% translate loop is seamless.
  const track = [...MARQUEE_COUNTRIES, ...MARQUEE_COUNTRIES];
  return (
    <div
      className="relative overflow-hidden border-b border-border/40 py-3 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
      aria-label={t('landing.stats.marqueeAria')}
    >
      <div className={reduceMotion ? 'flex justify-center gap-8' : 'flex w-max gap-8 animate-marquee will-change-transform'}>
        {(reduceMotion ? MARQUEE_COUNTRIES : track).map((c, i) => (
          <div
            key={`${c.key}-${i}`}
            className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground/80 sm:text-sm"
          >
            <span className="text-base sm:text-lg" aria-hidden>{c.flag}</span>
            <span>{t(c.key)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBlock({
  value, label, delay = 0, customFormat,
}: {
  value: number;
  suffix: string;
  label: string;
  delay?: number;
  customFormat: (n: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const n = useCountUp(value, inView);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      className="text-center"
    >
      <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-4xl">
        {customFormat(n)}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[11px]">{label}</div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FEATURES — fade-up + stagger on scroll
// ─────────────────────────────────────────────────────────────────────
function Features() {
  const { t } = useT();
  const items = [
    {
      icon: LayoutTemplate,
      title: t('landing.features.item1Title'),
      desc: t('landing.features.item1Desc'),
      gradient: 'from-fuchsia-500 to-pink-600',
    },
    {
      icon: Wallet,
      title: t('landing.features.item2Title'),
      desc: t('landing.features.item2Desc'),
      gradient: 'from-emerald-500 to-teal-600',
    },
    {
      icon: Truck,
      title: t('landing.features.item3Title'),
      desc: t('landing.features.item3Desc'),
      gradient: 'from-indigo-500 to-violet-600',
    },
    {
      icon: Smartphone,
      title: t('landing.features.item4Title'),
      desc: t('landing.features.item4Desc'),
      gradient: 'from-amber-500 to-orange-600',
    },
    {
      icon: Globe,
      title: t('landing.features.item5Title'),
      desc: t('landing.features.item5Desc'),
      gradient: 'from-rose-500 to-fuchsia-600',
    },
    {
      icon: ShieldCheck,
      title: t('landing.features.item6Title'),
      desc: t('landing.features.item6Desc'),
      gradient: 'from-cyan-500 to-blue-600',
    },
  ];

  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        variants={staggerContainer}
        className="mb-10 max-w-2xl sm:mb-14"
      >
        <motion.div
          variants={fadeUp}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-700"
        >
          <Sparkles className="h-3 w-3" /> {t('landing.features.badge')}
        </motion.div>
        <motion.h2
          variants={fadeUp}
          className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl"
        >
          {t('landing.features.titleA')} <span className="text-muted-foreground">{t('landing.features.titleB')}</span>
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base lg:text-lg"
        >
          {t('landing.features.subtitle')}
        </motion.p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-50px' }}
        variants={staggerContainer}
        className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3"
      >
        {items.map((item) => (
          <motion.div
            key={item.title}
            variants={fadeUp}
            style={{ perspective: 1000 }}
          >
            <TiltCard className="group relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-shadow duration-300 hover:shadow-2xl hover:shadow-orange-500/10 sm:p-6">
              <div className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${item.gradient} opacity-10 blur-3xl transition-opacity duration-500 group-hover:opacity-25`} aria-hidden />
              <div className="pointer-events-none absolute inset-0 -z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" aria-hidden>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/40 to-transparent" />
              </div>
              <motion.div
                whileHover={{ rotate: 6, scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className={`relative mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${item.gradient} text-white shadow-lg sm:mb-5 sm:h-12 sm:w-12`}
                style={{ transform: 'translateZ(30px)' }}
              >
                <item.icon className="h-5 w-5" />
              </motion.div>
              <h3 className="relative text-base font-bold tracking-tight sm:text-lg" style={{ transform: 'translateZ(20px)' }}>{item.title}</h3>
              <p className="relative mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm" style={{ transform: 'translateZ(10px)' }}>{item.desc}</p>
            </TiltCard>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FLEXIO PAY — passerelle de paiement intégrée (mobile money + carte)
// ─────────────────────────────────────────────────────────────────────
// Noms des marques (Wave, OM, MTN, Moov) = universels — pas traduits.
// Seul « Carte bancaire » a une clé i18n dans la liste (dernier item), résolu
// au rendu quand on itère `PAY_METHODS`.
const PAY_METHODS = [
  { name: 'Wave',           short: 'wave',  chip: 'bg-sky-500',    text: 'text-white', i18nKey: null as null | 'landing.pay.methodCard' },
  { name: 'Orange Money',   short: 'OM',    chip: 'bg-orange-500', text: 'text-white', i18nKey: null },
  { name: 'MTN MoMo',       short: 'MTN',   chip: 'bg-yellow-400', text: 'text-black', i18nKey: null },
  { name: 'Moov Money',     short: 'moov',  chip: 'bg-blue-600',   text: 'text-white', i18nKey: null },
  { name: 'Carte bancaire', short: '💳',    chip: 'bg-slate-800',  text: 'text-white', i18nKey: 'landing.pay.methodCard' as const },
];

function FlexioPay() {
  const { t } = useT();
  const bullets = [
    { icon: Zap, text: t('landing.pay.bullet1') },
    { icon: Globe, text: t('landing.pay.bullet2') },
    { icon: Wallet, text: t('landing.pay.bullet3') },
    { icon: ShieldCheck, text: t('landing.pay.bullet4') },
  ];

  return (
    <section id="payments" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Texte + points forts */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
        >
          <motion.div
            variants={fadeUp}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700"
          >
            <CreditCard className="h-3 w-3" /> {t('landing.pay.badge')}
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl"
          >
            {t('landing.pay.titleA')} <span className="text-muted-foreground">{t('landing.pay.titleB')}</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base lg:text-lg"
          >
            {t('landing.pay.paragraph')}
          </motion.p>

          {/* Moyens de paiement */}
          <motion.div variants={fadeUp} className="mt-6 flex flex-wrap items-center gap-2">
            {PAY_METHODS.map((m) => (
              <span
                key={m.name}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card py-1.5 pl-1.5 pr-3 text-xs font-semibold shadow-sm"
              >
                <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[9px] font-extrabold ${m.chip} ${m.text}`}>
                  {m.short}
                </span>
                {m.i18nKey ? t(m.i18nKey) : m.name}
              </span>
            ))}
          </motion.div>

          <motion.ul variants={fadeUp} className="mt-6 space-y-3">
            {bullets.map((b) => (
              <li key={b.text} className="flex items-start gap-2.5 text-sm text-foreground/85 sm:text-[15px]">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-emerald-500/10 text-emerald-600">
                  <b.icon className="h-3 w-3" />
                </span>
                {b.text}
              </li>
            ))}
          </motion.ul>

          <motion.div variants={fadeUp} className="mt-8">
            <Link href="/register">
              <Button size="lg" className="h-12 gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700">
                {t('landing.pay.cta')}
                <DirArrow className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        {/* Mockup — feuille de paiement Flexio Pay */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mx-auto w-full max-w-sm"
          style={{ perspective: 1000 }}
        >
          <TiltCard className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl shadow-emerald-500/10">
            {/* En-tête de la feuille */}
            <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-emerald-500/10 to-teal-500/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold leading-none">Flexio Pay</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{t('landing.pay.mockSubtitle')}</div>
                </div>
              </div>
              <Lock className="h-4 w-4 text-emerald-600" />
            </div>
            {/* Montant */}
            <div className="border-b border-border/60 px-5 py-4 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('landing.pay.mockTotal')}</div>
              <div className="mt-1 text-3xl font-extrabold tracking-tight">15 000 <span className="text-base font-bold text-muted-foreground">FCFA</span></div>
            </div>
            {/* Choix du moyen */}
            <div className="space-y-2 px-5 py-4">
              {PAY_METHODS.slice(0, 4).map((m, i) => (
                <div
                  key={m.name}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                    i === 0 ? 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/30' : 'border-border/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5 text-sm font-semibold">
                    <span className={`grid h-7 min-w-7 place-items-center rounded-lg px-1 text-[9px] font-extrabold ${m.chip} ${m.text}`}>
                      {m.short}
                    </span>
                    {m.i18nKey ? t(m.i18nKey) : m.name}
                  </span>
                  <span className={`h-4 w-4 rounded-full border-2 ${i === 0 ? 'border-emerald-500 bg-emerald-500' : 'border-border'}`} />
                </div>
              ))}
              <div className="pt-1">
                <div className="grid h-11 place-items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-md">
                  <span className="inline-flex items-center gap-2">
                    {t('landing.pay.mockCta')}
                    <DirArrow className="h-4 w-4" />
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-1 pt-1 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                {t('landing.pay.mockFooter')}
              </div>
            </div>
          </TiltCard>
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HOW IT WORKS — fade-up steps
// ─────────────────────────────────────────────────────────────────────
function HowItWorks() {
  const { t } = useT();
  const steps = [
    {
      n: '01',
      title: t('landing.how.step1Title'),
      desc: t('landing.how.step1Desc'),
    },
    {
      n: '02',
      title: t('landing.how.step2Title'),
      desc: t('landing.how.step2Desc'),
    },
    {
      n: '03',
      title: t('landing.how.step3Title'),
      desc: t('landing.how.step3Desc'),
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        variants={staggerContainer}
        className="mb-10 max-w-2xl sm:mb-14"
      >
        <motion.div
          variants={fadeUp}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700"
        >
          <Zap className="h-3 w-3" /> {t('landing.how.badge')}
        </motion.div>
        <motion.h2
          variants={fadeUp}
          className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl"
        >
          {t('landing.how.title')}
        </motion.h2>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-50px' }}
        variants={staggerContainer}
        className="grid gap-4 sm:gap-6 lg:grid-cols-3"
      >
        {steps.map((step, i) => (
          <motion.div
            key={step.n}
            variants={fadeUp}
            className="relative rounded-2xl border border-border/60 bg-card p-5 sm:p-7"
          >
            <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700 bg-clip-text text-4xl font-black leading-none tracking-tighter text-transparent sm:text-5xl">
              {step.n}
            </div>
            <h3 className="mt-4 text-lg font-bold tracking-tight sm:mt-5 sm:text-xl">{step.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:mt-2.5 sm:text-sm">{step.desc}</p>
            {i < steps.length - 1 && (
              <span className="absolute right-5 top-5 text-muted-foreground/30 sm:right-7 sm:top-7 lg:right-auto lg:-translate-x-3 lg:translate-y-1/2">
                <DirArrow className="h-5 w-5" />
              </span>
            )}
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COMMISSION PANEL
// ─────────────────────────────────────────────────────────────────────
function CommissionPanel() {
  const { t } = useT();
  const perks = [
    t('landing.commission.perk1'),
    t('landing.commission.perk2'),
    t('landing.commission.perk3'),
    t('landing.commission.perk4'),
    t('landing.commission.perk5'),
    t('landing.commission.perk6'),
  ];
  return (
    <section id="commission" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-card/40 p-6 sm:p-10 lg:p-14"
      >
        <div className="pointer-events-none absolute -right-24 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-gradient-to-br from-amber-400/25 via-orange-500/20 to-orange-700/10 blur-3xl" aria-hidden />

        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Wallet className="h-3 w-3" /> {t('landing.commission.badge')}
            </div>
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
              {t('landing.commission.titleA')} <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">{t('landing.commission.titleHighlight')}</span> {t('landing.commission.titleB')}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base lg:text-lg">
              {t('landing.commission.paragraphStart')}
              {' '}<strong className="text-foreground">{t('landing.commission.paragraphStrong')}</strong>.
            </p>

            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mt-6 inline-flex items-baseline gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-3.5 backdrop-blur sm:mt-8 sm:px-6 sm:py-4"
            >
              <span className="text-4xl font-black tracking-tight text-emerald-700 sm:text-5xl">30</span>
              <div className="text-start">
                <div className="text-xs font-semibold sm:text-sm">{t('landing.commission.badge30Main')}</div>
                <div className="text-[11px] text-muted-foreground sm:text-xs">{t('landing.commission.badge30Sub')}</div>
              </div>
            </motion.div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register">
                <Button size="lg" className="h-12 gap-2 bg-gradient-to-r from-amber-500 to-orange-600 px-7 font-semibold">
                  {t('landing.commission.cta')}
                  <DirArrow className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-50px' }}
              variants={staggerContainer}
              className="rounded-2xl border border-border/60 bg-background/60 p-5 backdrop-blur sm:p-7"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('landing.commission.includedTitle')}</div>
              <ul className="mt-4 space-y-2.5 sm:space-y-3">
                {perks.map((p) => (
                  <motion.li
                    key={p}
                    variants={fadeUp}
                    className="flex items-center gap-2.5 text-xs sm:text-sm"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </span>
                    {p}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────────────────
function Faq() {
  const { t } = useT();
  const items = [
    { q: t('landing.faq.q1'), a: t('landing.faq.a1') },
    { q: t('landing.faq.q2'), a: t('landing.faq.a2') },
    { q: t('landing.faq.q3'), a: t('landing.faq.a3') },
    { q: t('landing.faq.q4'), a: t('landing.faq.a4') },
  ];
  return (
    <section id="faq" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        variants={staggerContainer}
        className="mb-10 text-center sm:mb-12"
      >
        <motion.div
          variants={fadeUp}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700"
        >
          FAQ
        </motion.div>
        <motion.h2
          variants={fadeUp}
          className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl"
        >
          {t('landing.faq.title')}
        </motion.h2>
      </motion.div>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-50px' }}
        variants={staggerContainer}
        className="space-y-2.5 sm:space-y-3"
      >
        {items.map((item) => (
          <motion.details
            key={item.q}
            variants={fadeUp}
            className="group rounded-xl border border-border/60 bg-card p-4 transition-colors open:bg-card/80 sm:p-5"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-left text-sm font-semibold sm:text-base lg:text-lg">
              <span className="min-w-0 pr-2 sm:pr-6">{item.q}</span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border/60 transition-transform group-open:rotate-45">
                <span className="text-lg leading-none">+</span>
              </span>
            </summary>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground sm:text-sm lg:text-base">{item.a}</p>
          </motion.details>
        ))}
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FINAL CTA
// ─────────────────────────────────────────────────────────────────────
function FinalCta() {
  const { t } = useT();
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 30 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.21, 0.61, 0.35, 1] }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700 p-6 text-center text-white sm:p-10 lg:p-16"
      >
        <div className="absolute inset-0 -z-0 opacity-30" aria-hidden style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
            {t('landing.finalCta.title')}
          </h2>
          <p className="mt-3 text-sm text-white/85 sm:mt-4 sm:text-base lg:text-lg">
            {t('landing.finalCta.subtitle')}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:mt-8">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="h-12 gap-2 bg-white px-6 text-base font-bold text-foreground hover:bg-white/90 sm:px-7">
                {t('landing.finalCta.ctaPrimary')}
                <DirArrow className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login" className="text-sm font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">
              {t('landing.finalCta.ctaSecondary')}
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────────────
function Footer() {
  const { t } = useT();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border/40 bg-card/30 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Bloc principal — brand + colonnes de liens */}
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="space-y-3">
            <BrandLogo variant="color" width={130} />
            <p className="text-xs text-muted-foreground">
              {t('landing.footer.tagline')}
            </p>
          </div>

          {/* Produit */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('landing.footer.product')}</div>
            <ul className="space-y-1.5 text-sm">
              <li><a href="#features" className="text-foreground/80 hover:text-foreground hover:underline">{t('landing.nav.features')}</a></li>
              <li><a href="#how" className="text-foreground/80 hover:text-foreground hover:underline">{t('landing.footer.howLink')}</a></li>
              <li><a href="#commission" className="text-foreground/80 hover:text-foreground hover:underline">{t('landing.footer.pricingLink')}</a></li>
              <li><a href="#faq" className="text-foreground/80 hover:text-foreground hover:underline">{t('landing.nav.faq')}</a></li>
            </ul>
          </div>

          {/* Support — email visible + lien vers /support */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('landing.footer.support')}</div>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link href="/support" className="text-foreground/80 hover:text-foreground hover:underline">
                  {t('landing.footer.contact')}
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@flexiopage.com"
                  className="inline-flex items-center gap-1.5 text-foreground/80 hover:text-foreground hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" />
                  support@flexiopage.com
                </a>
              </li>
            </ul>
          </div>

          {/* Légal */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('landing.footer.legal')}</div>
            <ul className="space-y-1.5 text-sm">
              <li><Link href="/terms-of-service" className="text-foreground/80 hover:text-foreground hover:underline">{t('landing.footer.terms')}</Link></li>
              <li><Link href="/privacy-policy" className="text-foreground/80 hover:text-foreground hover:underline">{t('landing.footer.privacy')}</Link></li>
              <li><Link href="/data-deletion" className="text-foreground/80 hover:text-foreground hover:underline">{t('landing.footer.dataDeletion')}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bas — copyright */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-5 text-[11px] text-muted-foreground sm:text-xs">
          <span>© {year} FlexioPage. {t('landing.footer.rights')}</span>
          <span>{t('landing.footer.slogan')}</span>
        </div>
      </div>
    </footer>
  );
}
