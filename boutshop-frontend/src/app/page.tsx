import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';

/**
 * Boutshop — public landing page.
 * Pricing: zero subscription. Sellers pay a small commission per sale, debited
 * from a prepaid balance (solde). Marketing messaging revolves around that.
 */
export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Soft mesh background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 -top-40 h-[480px] w-[480px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute -right-24 top-32 h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute left-1/3 top-[680px] h-[360px] w-[360px] rounded-full bg-amber-300/10 blur-3xl" />
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-600 via-indigo-600 to-amber-500 text-sm font-black text-white">
            B
          </span>
          <span className="bg-gradient-to-r from-fuchsia-600 via-indigo-600 to-amber-600 bg-clip-text text-transparent">
            BoutShop
          </span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Fonctionnalités</a>
          <a href="#how" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Comment ça marche</a>
          <a href="#commission" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Tarification</a>
          <a href="#faq" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:inline-flex">
            <Button variant="ghost" size="sm">Se connecter</Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="gap-1.5 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-700 hover:to-indigo-700">
              Créer ma boutique
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24 md:pt-32">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5 text-xs font-semibold backdrop-blur">
          <span className="grid h-1.5 w-1.5 place-items-center">
            <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Sans abonnement · Tu paies seulement quand tu vends
        </div>

        <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Crée ta boutique en ligne.{' '}
          <span className="bg-gradient-to-r from-fuchsia-600 via-indigo-600 to-amber-500 bg-clip-text text-transparent">
            Vends dès aujourd&apos;hui.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
          Boutique, landing pages, paiement à la livraison, livraison auto via MogaDelivery.
          Pour les vendeurs en Afrique de l&apos;Ouest et au Maghreb.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register">
            <Button size="lg" className="h-12 gap-2 bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-7 text-base font-semibold shadow-xl shadow-indigo-500/30 transition-all hover:scale-[1.02] hover:from-fuchsia-700 hover:to-indigo-700">
              Démarrer gratuitement
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#how">
            <Button size="lg" variant="outline" className="h-12 px-7 text-base">
              Voir comment ça marche
            </Button>
          </a>
        </div>

        <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Aucune carte bancaire pour commencer · Aucun engagement
        </p>
      </div>

      {/* Hero "screen" mock */}
      <HeroScreenMock />
    </section>
  );
}

function HeroScreenMock() {
  return (
    <div className="relative mx-auto mt-20 max-w-5xl">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-fuchsia-500/30 via-indigo-500/20 to-amber-300/20 blur-3xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-black/5">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate rounded-md bg-background/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
            boutique-test.boutshop.com/p/caftan-marrakech
          </span>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-[1.05fr_1fr] sm:gap-8 sm:p-10">
          {/* Mock product image */}
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-gradient-to-br from-amber-100 via-fuchsia-100 to-indigo-100">
            <div className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              −25%
            </div>
            <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold backdrop-blur">
              <Wallet className="h-3 w-3" /> Cash à la livraison
            </div>
            <div className="absolute inset-x-6 bottom-6 grid grid-cols-4 gap-1.5">
              {[0,1,2,3].map((i) => (
                <div key={i} className="aspect-square rounded-md bg-card/70 backdrop-blur" />
              ))}
            </div>
          </div>

          {/* Mock product details + tiny form */}
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Caftan Marrakech</div>
              <div className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Soie brodée main</div>
              <div className="mt-2 text-xs text-muted-foreground">Coupe ample · livré sous 48h</div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-fuchsia-600">45 000 F CFA</span>
              <span className="text-sm text-muted-foreground line-through">60 000</span>
            </div>
            <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-3.5 text-xs">
              <div className="font-semibold">Commande à la livraison</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-8 rounded-md border border-border/60 bg-card" />
                <div className="h-8 rounded-md border border-border/60 bg-card" />
              </div>
              <div className="h-8 rounded-md border border-border/60 bg-card" />
              <div className="grid h-9 place-items-center rounded-md bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-xs font-bold text-white">
                Commander
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SOCIAL PROOF
// ─────────────────────────────────────────────────────────────────────
function SocialProofBar() {
  const stats = [
    { value: '0 €', label: "d'abonnement" },
    { value: '< 5 min', label: 'pour ouvrir une boutique' },
    { value: '16 pays', label: 'Afrique de l’Ouest + Maghreb' },
    { value: '24/7', label: 'support FR / AR' },
  ];
  return (
    <section className="border-y border-border/40 bg-card/30 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-6 py-10 sm:grid-cols-4 sm:gap-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="bg-gradient-to-br from-fuchsia-600 via-indigo-600 to-amber-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
              {s.value}
            </div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FEATURES
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
      title: 'Livraison auto MogaDelivery',
      desc: 'Chaque commande est envoyée au coursier. Suivi, statuts, collecte de paiement gérés pour toi.',
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
    <section id="features" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mb-14 max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-700">
          <Sparkles className="h-3 w-3" /> Une stack complète
        </div>
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          Tout ce qu&apos;il faut pour vendre. <span className="text-muted-foreground">Rien de plus.</span>
        </h2>
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">
          BoutShop combine boutique, landing pages, formulaire COD et logistique en une seule app.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          >
            <div className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${item.gradient} opacity-10 blur-3xl transition-opacity duration-300 group-hover:opacity-20`} aria-hidden />
            <div className={`relative mb-5 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${item.gradient} text-white shadow-lg transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110`}>
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="relative text-lg font-bold tracking-tight">{item.title}</h3>
            <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HOW IT WORKS
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
      desc: 'Commande à la livraison, MogaDelivery prend le relais, tu reçois ton paiement net après commission.',
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mb-14 max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-700">
          <Zap className="h-3 w-3" /> 3 étapes
        </div>
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          De la création à la première vente.
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {steps.map((step, i) => (
          <div
            key={step.n}
            className="relative rounded-2xl border border-border/60 bg-card p-7"
          >
            <div className="bg-gradient-to-br from-fuchsia-600 via-indigo-600 to-amber-500 bg-clip-text text-5xl font-black leading-none tracking-tighter text-transparent">
              {step.n}
            </div>
            <h3 className="mt-5 text-xl font-bold tracking-tight">{step.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            {i < steps.length - 1 && (
              <ArrowRight className="absolute right-7 top-7 h-5 w-5 text-muted-foreground/30 lg:right-auto lg:-translate-x-3 lg:translate-y-1/2" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COMMISSION PANEL — replaces the old "View pricing" CTA
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
    <section id="commission" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-card/40 p-10 sm:p-14">
        <div className="pointer-events-none absolute -right-24 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-gradient-to-br from-fuchsia-500/20 via-indigo-500/15 to-amber-300/10 blur-3xl" aria-hidden />

        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Wallet className="h-3 w-3" /> Tarification équitable
            </div>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Tu paies <span className="bg-gradient-to-r from-fuchsia-600 to-indigo-600 bg-clip-text text-transparent">seulement quand tu vends</span>.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Pas d&apos;abonnement, pas de carte bancaire à la création, pas de frais cachés.
              Tu recharges ton solde quand tu veux, on prélève une petite commission sur chaque commande livrée.
              <strong className="text-foreground"> Si tu ne vends pas, tu ne paies pas.</strong>
            </p>

            <div className="mt-8 inline-flex items-baseline gap-3 rounded-2xl border border-border/60 bg-background/60 px-6 py-4 backdrop-blur">
              <span className="text-5xl font-black tracking-tight text-foreground">3%</span>
              <div className="text-left">
                <div className="text-sm font-semibold">par commande livrée</div>
                <div className="text-xs text-muted-foreground">débité de ton solde · plafonné à 1 500 F CFA</div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register">
                <Button size="lg" className="h-12 gap-2 bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-7 font-semibold">
                  Créer ma boutique
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-7 backdrop-blur">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inclus pour 0 €</div>
              <ul className="mt-4 space-y-3">
                {perks.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-sm">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
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
      a: 'Tu rechargeons ton solde via Wave, Orange Money, MTN MoMo ou virement. À chaque commande livrée, on prélève 3% (max 1 500 F CFA) directement du solde. Si le solde tombe à 0, tu ne peux plus dispatcher de nouvelles commandes jusqu’au prochain rechargement.',
    },
    {
      q: 'Que se passe-t-il si une commande n’est pas livrée ?',
      a: 'Aucun frais. La commission n’est prélevée que lorsque MogaDelivery confirme la livraison ET la collecte du paiement client. Annulation, retour, refus → 0 frais.',
    },
    {
      q: 'Dans quels pays vous opérez ?',
      a: '16 pays : Sénégal, Côte d’Ivoire, Mali, Burkina Faso, Bénin, Togo, Guinée, Niger, Gambie, Ghana, Nigeria, Cameroun, Maroc, Tunisie, Algérie, Libye.',
    },
    {
      q: 'Puis-je vendre des produits digitaux ?',
      a: 'Oui. Pour les produits digitaux le client paie en ligne (Wave, Orange Money, carte) et reçoit son fichier instantanément. Le système de commission par vente s’applique aussi.',
    },
  ];
  return (
    <section id="faq" className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
      <div className="mb-12 text-center">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">
          FAQ
        </div>
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          Les questions qu&apos;on nous pose le plus.
        </h2>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border border-border/60 bg-card p-5 open:bg-card/80 transition-colors"
          >
            <summary className="flex cursor-pointer items-center justify-between text-left text-base font-semibold sm:text-lg">
              <span className="pr-6">{item.q}</span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border/60 transition-transform group-open:rotate-45">
                <span className="text-lg leading-none">+</span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FINAL CTA
// ─────────────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-fuchsia-600 via-indigo-600 to-amber-500 p-10 text-center text-white sm:p-16">
        <div className="absolute inset-0 -z-0 opacity-30" aria-hidden style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Prêt à vendre ?
          </h2>
          <p className="mt-4 text-base text-white/85 sm:text-lg">
            Crée ta boutique en moins de 5 minutes. Aucune carte bancaire, aucun engagement.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="h-12 gap-2 bg-white px-7 text-base font-bold text-foreground hover:bg-white/90">
                Démarrer gratuitement
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login" className="text-sm font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">
              J&apos;ai déjà un compte
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-border/40 bg-card/30 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-fuchsia-600 via-indigo-600 to-amber-500 text-xs font-black text-white">
            B
          </span>
          <span className="font-semibold text-foreground">BoutShop</span>
          <span className="text-xs">— vendre, livrer, encaisser.</span>
        </div>
        <div className="text-xs">© {new Date().getFullYear()} BoutShop. Tous droits réservés.</div>
      </div>
    </footer>
  );
}
