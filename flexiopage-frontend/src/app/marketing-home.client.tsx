'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, useReducedMotion, type Variants } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useCountUp } from '@/lib/use-count-up';
import { BrandLogo } from '@/components/brand-logo';
import { StructuredData } from '@/components/seo/StructuredData';

// Mirrors the FAQ rendered inside <Faq /> so Google can index the
// questions as rich results without scraping the React tree.
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
} from 'lucide-react';

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

      <Header />

      <main>
        <Hero />
        <SocialProofBar />
        <Features />
        <HowItWorks />
        <CommissionPanel />
        <Faq />
        <FinalCta />
      </main>

      <Footer />

      {/* ChatBot moved to root layout via PlatformChatBot — covers /, /login,
          /register, /dashboard, /admin with one shared conversation thread. */}

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
// HEADER
// ─────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-3 sm:h-16 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="FlexioPage — accueil">
          <BrandLogo variant="color" width={150} priority />
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Fonctionnalités</a>
          <a href="#how" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Comment ça marche</a>
          <a href="#commission" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Tarification</a>
          <a href="#faq" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button size="sm" className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700">
              Se connecter
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO — staggered entrance + floating phone mockup
// ─────────────────────────────────────────────────────────────────────
function Hero() {
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
          Sans abonnement · Tes 30 premières commandes sont gratuites
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="text-balance text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Crée ta boutique en ligne.{' '}
          <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-orange-700 bg-clip-text text-transparent">
            Vends dès aujourd&apos;hui.
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-5 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg md:text-xl"
        >
          Boutique, landing pages, paiement à la livraison, livraison auto via MogaDelivery.
          Pour les vendeurs en Afrique de l&apos;Ouest et au Maghreb.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10"
        >
          <Link href="/login">
            <Button size="lg" className="h-12 gap-2 bg-gradient-to-r from-amber-500 to-orange-600 px-7 text-base font-semibold shadow-xl shadow-orange-500/30 transition-all hover:scale-[1.02] hover:from-amber-600 hover:to-orange-700">
              Se connecter
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#how">
            <Button size="lg" variant="outline" className="h-12 px-7 text-base">
              Voir comment ça marche
            </Button>
          </a>
        </motion.div>

        <motion.p
          variants={fadeUp}
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Aucune carte bancaire pour commencer · Aucun engagement
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
              <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Cash
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
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Caftan Marrakech</div>
              <div className="mt-1.5 text-xl font-bold tracking-tight sm:mt-2 sm:text-3xl">Soie brodée main</div>
              <div className="mt-1.5 text-[11px] text-muted-foreground sm:mt-2 sm:text-xs">Coupe ample · livré sous 48h</div>
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
              <div className="font-semibold">Commande à la livraison</div>
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
                Commander
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
  const stats = [
    { value: 0, suffix: '€', label: "d'abonnement", customFormat: () => '0 €' },
    { value: 5, suffix: 'min', label: 'pour ouvrir une boutique', customFormat: (n: number) => `< ${n} min` },
    { value: 16, suffix: 'pays', label: 'Afrique de l’Ouest + Maghreb', customFormat: (n: number) => `${n} pays` },
    { value: 24, suffix: '/7', label: 'support FR / AR', customFormat: (n: number) => `${n}/7` },
  ];
  return (
    <section className="border-y border-border/40 bg-card/30 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 sm:grid-cols-4 sm:gap-6 sm:px-6 sm:py-10">
        {stats.map((s, i) => (
          <StatBlock key={s.label} {...s} delay={i * 0.08} />
        ))}
      </div>
    </section>
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
  const items = [
    {
      icon: LayoutTemplate,
      title: 'Landing pages générées par IA',
      desc: 'Décris ton produit, l’IA écrit le copy + génère les photos cinématiques. Édition libre ensuite.',
      gradient: 'from-fuchsia-500 to-pink-600',
    },
    {
      icon: Wallet,
      title: 'Paiement à la livraison',
      desc: 'Aucune carte bancaire requise. Le client paie en espèces au livreur, tu reçois ton argent net.',
      gradient: 'from-emerald-500 to-teal-600',
    },
    {
      icon: Truck,
      title: 'Intègre ta société de livraison facilement',
      desc: 'Connecte le coursier de ton choix : envoi des commandes, suivi des statuts et collecte du paiement gérés pour toi.',
      gradient: 'from-indigo-500 to-violet-600',
    },
    {
      icon: Smartphone,
      title: '100% mobile-first',
      desc: 'Tes clients commandent depuis WhatsApp, Instagram ou TikTok. Tout est optimisé mobile.',
      gradient: 'from-amber-500 to-orange-600',
    },
    {
      icon: Globe,
      title: 'Arabe, Français, Darija',
      desc: 'Interface bilingue, RTL natif, 16 pays préconfigurés (SN, MA, TN, DZ, CI, …).',
      gradient: 'from-rose-500 to-fuchsia-600',
    },
    {
      icon: ShieldCheck,
      title: 'Sécurité bancaire',
      desc: 'Webhook signés HMAC-SHA256, données chiffrées, conforme aux régulations locales.',
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
          <Sparkles className="h-3 w-3" /> Une stack complète
        </motion.div>
        <motion.h2
          variants={fadeUp}
          className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl"
        >
          Tout ce qu&apos;il faut pour vendre. <span className="text-muted-foreground">Rien de plus.</span>
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base lg:text-lg"
        >
          FlexioPage combine boutique, landing pages, formulaire COD et logistique en une seule app.
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
            whileHover={{ y: -6, transition: { duration: 0.2 } }}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-shadow duration-300 hover:shadow-2xl sm:p-6"
          >
            <div className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${item.gradient} opacity-10 blur-3xl transition-opacity duration-300 group-hover:opacity-20`} aria-hidden />
            <motion.div
              whileHover={{ rotate: 6, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className={`relative mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${item.gradient} text-white shadow-lg sm:mb-5 sm:h-12 sm:w-12`}
            >
              <item.icon className="h-5 w-5" />
            </motion.div>
            <h3 className="relative text-base font-bold tracking-tight sm:text-lg">{item.title}</h3>
            <p className="relative mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{item.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HOW IT WORKS — fade-up steps
// ─────────────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Crée ta boutique en 5 minutes',
      desc: 'Inscris-toi, choisis un thème, ajoute tes produits avec photos et SKU. Pas de configuration technique.',
    },
    {
      n: '02',
      title: 'Génère une landing page avec l’IA',
      desc: 'L’IA rédige le copywriting, génère les photos lifestyle et intègre le formulaire de commande.',
    },
    {
      n: '03',
      title: 'Le client commande, tu encaisses',
      desc: 'Commande à la livraison, MogaDelivery prend le relais, tu encaisses ton paiement. 30 premières livraisons gratuites, ensuite une petite commission seulement.',
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
          <Zap className="h-3 w-3" /> 3 étapes
        </motion.div>
        <motion.h2
          variants={fadeUp}
          className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl"
        >
          De la création à la première vente.
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
              <ArrowRight className="absolute right-5 top-5 h-5 w-5 text-muted-foreground/30 sm:right-7 sm:top-7 lg:right-auto lg:-translate-x-3 lg:translate-y-1/2" />
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
  const perks = [
    'Boutique illimitée',
    'Landing pages illimitées',
    'Génération IA des landings',
    'Commandes illimitées',
    'Dispatch MogaDelivery inclus',
    'Support FR / AR',
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
              <Wallet className="h-3 w-3" /> Tarification équitable
            </div>
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
              Tes <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">30 premières commandes</span> sont gratuites.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base lg:text-lg">
              Pas d&apos;abonnement, pas de carte bancaire à la création, pas de frais cachés.
              Tu lances ta boutique et tu vends sans payer un centime — une petite commission ne s&apos;applique qu&apos;à partir de la
              {' '}<strong className="text-foreground">31e commande livrée</strong>.
            </p>

            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mt-6 inline-flex items-baseline gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-3.5 backdrop-blur sm:mt-8 sm:px-6 sm:py-4"
            >
              <span className="text-4xl font-black tracking-tight text-emerald-700 sm:text-5xl">30</span>
              <div className="text-left">
                <div className="text-xs font-semibold sm:text-sm">premières commandes livrées</div>
                <div className="text-[11px] text-muted-foreground sm:text-xs">100% gratuites · sans frais cachés</div>
              </div>
            </motion.div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register">
                <Button size="lg" className="h-12 gap-2 bg-gradient-to-r from-amber-500 to-orange-600 px-7 font-semibold">
                  Créer ma boutique
                  <ArrowRight className="h-4 w-4" />
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
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inclus pour 0 €</div>
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
  const items = [
    {
      q: 'Comment fonctionne le solde ?',
      a: 'Tes 30 premières commandes livrées sont 100% gratuites — aucun frais ne sort de ton solde. À partir de la 31e commande, une petite commission s’applique sur chaque livraison confirmée par le transporteur. Tu recharges ton solde via Wave, Orange Money, MTN MoMo ou virement quand tu veux.',
    },
    {
      q: 'Que se passe-t-il si une commande n’est pas livrée ?',
      a: 'Aucun frais. La commission ne s’applique qu’aux commandes livrées ET payées (transporteur confirme la collecte). Annulation, retour, refus → 0 frais. Les 30 premières livraisons restent gratuites de toute façon.',
    },
    {
      q: 'Dans quels pays vous opérez ?',
      a: '16 pays : Sénégal, Côte d’Ivoire, Mali, Burkina Faso, Bénin, Togo, Guinée, Niger, Gambie, Ghana, Nigeria, Cameroun, Maroc, Tunisie, Algérie, Libye.',
    },
    {
      q: 'Puis-je vendre des produits digitaux ?',
      a: 'Oui. Pour les produits digitaux le client paie en ligne (Wave, Orange Money, carte) et reçoit son fichier instantanément. Les 30 premières ventes sont gratuites comme pour les produits physiques.',
    },
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
          Les questions qu&apos;on nous pose le plus.
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
            Prêt à vendre ?
          </h2>
          <p className="mt-3 text-sm text-white/85 sm:mt-4 sm:text-base lg:text-lg">
            Crée ta boutique en moins de 5 minutes. Aucune carte bancaire, aucun engagement.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:mt-8">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="h-12 gap-2 bg-white px-6 text-base font-bold text-foreground hover:bg-white/90 sm:px-7">
                Démarrer gratuitement
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login" className="text-sm font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">
              J&apos;ai déjà un compte
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
              La plateforme tout-en-un pour vendre, livrer et encaisser en Afrique.
            </p>
          </div>

          {/* Produit */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Produit</div>
            <ul className="space-y-1.5 text-sm">
              <li><a href="#features" className="text-foreground/80 hover:text-foreground hover:underline">Fonctionnalités</a></li>
              <li><a href="#how" className="text-foreground/80 hover:text-foreground hover:underline">Comment ça marche</a></li>
              <li><a href="#commission" className="text-foreground/80 hover:text-foreground hover:underline">Tarif</a></li>
              <li><a href="#faq" className="text-foreground/80 hover:text-foreground hover:underline">FAQ</a></li>
            </ul>
          </div>

          {/* Support — email visible + lien vers /support */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Support</div>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link href="/support" className="text-foreground/80 hover:text-foreground hover:underline">
                  Nous contacter
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
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Légal</div>
            <ul className="space-y-1.5 text-sm">
              <li><Link href="/terms-of-service" className="text-foreground/80 hover:text-foreground hover:underline">Conditions</Link></li>
              <li><Link href="/privacy-policy" className="text-foreground/80 hover:text-foreground hover:underline">Confidentialité</Link></li>
              <li><Link href="/data-deletion" className="text-foreground/80 hover:text-foreground hover:underline">Suppression données</Link></li>
            </ul>
          </div>
        </div>

        {/* Bas — copyright */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-5 text-[11px] text-muted-foreground sm:text-xs">
          <span>© {year} FlexioPage. Tous droits réservés.</span>
          <span>vendre · livrer · encaisser</span>
        </div>
      </div>
    </footer>
  );
}
