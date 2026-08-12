'use client';

/**
 * Afro3DProd — landing storefront (thème VIP fondateur).
 *
 * Rendu uniquement quand `store.theme.templateId === 'afro3dprod'`.
 * Le parent (/store/[storeSlug]/page.tsx) fait l'aiguillage.
 *
 * Structure : Hero massif → Shop (produits) → Features → Testimonials → CTA.
 * Le navbar et footer restent ceux du storefront standard (partagés avec
 * cart/wishlist/product) — ils héritent des tokens néon via CSS vars.
 *
 * Design : fond ultra-sombre, accents violet/cyan néon, glow partout,
 * grosses typos. framer-motion pour les animations d'entrée + parallax
 * discret. Respecte `prefers-reduced-motion`.
 */

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  ShieldCheck,
  Truck,
  Sparkles,
  Star,
  Quote,
  ShoppingBag,
} from 'lucide-react';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';

interface StoreShape {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
}

interface ProductShape {
  _id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  images?: string[];
  stock?: number;
  type?: 'physical' | 'digital';
}

interface Props {
  store: StoreShape;
  products: ProductShape[];
  currency: string;
}

export function Afro3dprodLanding({ store, products, currency }: Props) {
  return (
    <>
      <Hero storeName={store.name} storeSlug={store.slug} description={store.description} />
      <Shop products={products} storeSlug={store.slug} currency={currency} />
      <Features />
      <Testimonials />
      <FinalCta storeSlug={store.slug} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO — massif dark + blobs néon animés + parallax
// ─────────────────────────────────────────────────────────────────────
function Hero({
  storeName,
  storeSlug,
  description,
}: {
  storeName: string;
  storeSlug: string;
  description?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.2]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#050510] py-24 sm:py-32 lg:py-40"
    >
      {/* Grille tech en fond */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(#a855f7 1px, transparent 1px), linear-gradient(90deg, #a855f7 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden
      />

      {/* Blobs néon animés */}
      <motion.div
        style={reduce ? undefined : { y, opacity }}
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden
      >
        <motion.div
          className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#a855f7]/25 blur-[120px]"
          animate={reduce ? undefined : { x: ['-50%', '-42%', '-50%'], y: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-0 top-10 h-[380px] w-[380px] rounded-full bg-[#22d3ee]/20 blur-[110px]"
          animate={reduce ? undefined : { x: [0, -30, 0], y: [0, 30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
        <motion.div
          className="absolute -left-20 bottom-0 h-[340px] w-[340px] rounded-full bg-[#7c3aed]/15 blur-[110px]"
          animate={reduce ? undefined : { x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </motion.div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.21, 0.61, 0.35, 1] }}
          className="mx-auto max-w-4xl text-center"
        >
          {/* Eyebrow badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#a855f7]/40 bg-[#a855f7]/10 px-3.5 py-1.5 text-xs font-semibold text-[#e9d5ff] backdrop-blur">
            <span className="relative grid h-1.5 w-1.5 place-items-center">
              <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-[#22d3ee] opacity-70" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee]" />
            </span>
            Nouvelle collection · disponible
          </div>

          {/* Brand name — massif */}
          <h1 className="text-balance text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl md:text-8xl lg:text-[9rem]">
            <span
              className="bg-gradient-to-br from-white via-[#f5f5fa] to-[#c4b5fd] bg-clip-text text-transparent"
              style={{ backgroundSize: '200% 200%' }}
            >
              {storeName}
            </span>
          </h1>

          {description ? (
            <p className="mx-auto mt-8 max-w-2xl text-balance text-base leading-relaxed text-[#c4c4d4] sm:text-lg md:text-xl">
              {description}
            </p>
          ) : (
            <p className="mx-auto mt-8 max-w-2xl text-balance text-base leading-relaxed text-[#c4c4d4] sm:text-lg md:text-xl">
              Une sélection exclusive de créations premium. Livrées avec le soin
              qu&apos;elles méritent.
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <a href="#shop">
              <button
                className="group relative inline-flex h-13 items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[#a855f7] to-[#22d3ee] px-8 py-3.5 text-sm font-bold text-white shadow-[0_0_40px_-5px_rgba(168,85,247,0.55)] transition-all hover:scale-[1.03] hover:shadow-[0_0_50px_-5px_rgba(34,211,238,0.6)] sm:text-base"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative">Voir la boutique</span>
                <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </a>
            <Link
              href={`/${storeSlug}/wishlist`}
              className="inline-flex h-13 items-center gap-2 rounded-full border border-white/20 bg-white/[0.03] px-7 py-3.5 text-sm font-semibold text-white/85 backdrop-blur transition-all hover:border-white/40 hover:bg-white/[0.06] sm:text-base"
            >
              Ma wishlist
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a855f7]/70 sm:bottom-10"
        aria-hidden
      >
        Défile pour explorer ↓
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SHOP — grille de produits overlay, thème dark néon
// ─────────────────────────────────────────────────────────────────────
function Shop({
  products,
  storeSlug,
  currency,
}: {
  products: ProductShape[];
  storeSlug: string;
  currency: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      ref={ref}
      id="shop"
      className="relative overflow-hidden bg-[#0a0a15] py-20 sm:py-28 lg:py-36"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.21, 0.61, 0.35, 1] }}
          className="mb-12 flex flex-wrap items-end justify-between gap-6 sm:mb-16"
        >
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#22d3ee]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#22d3ee]">
              <ShoppingBag className="h-3 w-3" /> Boutique
            </div>
            <h2 className="text-balance text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
              Nos créations
            </h2>
            <p className="mt-3 max-w-xl text-sm text-[#a4a4b8] sm:text-base">
              Chaque pièce est fabriquée à la commande. Édition limitée, finition
              premium.
            </p>
          </div>
          {products.length > 0 && (
            <div className="text-xs font-medium text-[#8b8ba7]">
              {products.length} produit{products.length > 1 ? 's' : ''}
            </div>
          )}
        </motion.div>

        {products.length === 0 ? (
          <div className="grid place-items-center rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#a855f7] to-[#22d3ee] text-white shadow-lg shadow-[#a855f7]/40">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="mt-4 text-lg font-bold text-white">La collection arrive bientôt</div>
            <p className="mt-2 max-w-sm text-sm text-[#a4a4b8]">
              De nouvelles pièces sont en préparation. Reviens vite.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {products.map((p, i) => (
              <ProductCard
                key={p._id}
                product={p}
                storeSlug={storeSlug}
                currency={currency}
                index={i}
                inView={inView}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  storeSlug,
  currency,
  index,
  inView,
}: {
  product: ProductShape;
  storeSlug: string;
  currency: string;
  index: number;
  inView: boolean;
}) {
  const cover = product.images?.[0];
  const coverUrl = cover ? mediaUrl(cover) : undefined;
  const hasDiscount = !!(product.compareAtPrice && product.compareAtPrice > product.price);
  const outOfStock = product.type !== 'digital' && typeof product.stock === 'number' && product.stock <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.06, ease: [0.21, 0.61, 0.35, 1] }}
    >
      <Link
        href={`/${storeSlug}/product/${product.slug}`}
        className="group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#0f0f1c] transition-all hover:border-[#a855f7]/50 hover:shadow-[0_0_35px_-10px_rgba(168,85,247,0.55)]"
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#0f0f1c] to-[#050510]">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              placeholder="blur"
              blurDataURL={IMAGE_BLUR_DATA_URL}
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-white/20">
              <ShoppingBag className="h-10 w-10" />
            </div>
          )}

          {/* Overlay gradient bottom → text becomes readable */}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" aria-hidden />

          {/* Badges */}
          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            {hasDiscount && (
              <span className="inline-flex items-center rounded-full bg-[#22d3ee] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#050510]">
                −{Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)}%
              </span>
            )}
            {outOfStock && (
              <span className="inline-flex items-center rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Épuisé
              </span>
            )}
          </div>

          {/* Text overlay bottom */}
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
            <div className="line-clamp-2 text-base font-bold text-white sm:text-lg">
              {product.name}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black text-white sm:text-xl">
                {formatCurrency(product.price, currency)}
              </span>
              {hasDiscount && (
                <span className="text-xs text-white/50 line-through sm:text-sm">
                  {formatCurrency(product.compareAtPrice!, currency)}
                </span>
              )}
            </div>
          </div>

          {/* Corner glow accent — révélé au hover */}
          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" aria-hidden>
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#a855f7] blur-2xl" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FEATURES — 3 promesses de la marque, cartes néon
// ─────────────────────────────────────────────────────────────────────
function Features() {
  const items = [
    {
      icon: Truck,
      title: 'Livraison rapide',
      desc: 'Expédition sous 48h en Afrique de l\'Ouest et au Maghreb, avec suivi en temps réel.',
    },
    {
      icon: ShieldCheck,
      title: 'Qualité garantie',
      desc: 'Chaque pièce est contrôlée à la main. Satisfait ou remboursé sous 14 jours.',
    },
    {
      icon: Sparkles,
      title: 'Édition limitée',
      desc: 'Séries numérotées, jamais rééditées. Une pièce unique dans ta collection.',
    },
  ];

  return (
    <section className="relative overflow-hidden bg-[#050510] py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.12 } },
          }}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6"
        >
          {items.map((it) => (
            <motion.div
              key={it.title}
              variants={{
                hidden: { opacity: 0, y: 24 },
                show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.21, 0.61, 0.35, 1] } },
              }}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d1a] p-6 transition-all hover:border-[#a855f7]/40 hover:shadow-[0_0_30px_-10px_rgba(168,85,247,0.5)] sm:p-8"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-gradient-to-br from-[#a855f7]/25 to-[#22d3ee]/25 opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70" aria-hidden />
              <div className="relative mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#a855f7] to-[#22d3ee] text-white shadow-lg shadow-[#a855f7]/30">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="relative text-lg font-bold text-white sm:text-xl">{it.title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-[#a4a4b8]">{it.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TESTIMONIALS — carousel style card unique + avatars discrets
// ─────────────────────────────────────────────────────────────────────
function Testimonials() {
  const items = [
    {
      quote:
        "Livré en 2 jours, l'emballage à lui seul valait le prix. La qualité de la pièce est irréprochable — je commanderai encore.",
      author: 'Aïcha D.',
      role: 'Dakar',
      rating: 5,
    },
    {
      quote:
        "J'ai rarement vu un tel niveau de finition. On sent que chaque détail est pensé. Bravo à l'équipe.",
      author: 'Youssef B.',
      role: 'Casablanca',
      rating: 5,
    },
    {
      quote:
        "Service client au top. Ils ont répondu à mes questions en moins d'une heure sur WhatsApp. Rare.",
      author: 'Marie K.',
      role: 'Abidjan',
      rating: 5,
    },
  ];

  return (
    <section className="relative overflow-hidden bg-[#0a0a15] py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center sm:mb-14"
        >
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#a855f7]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#c4b5fd]">
            Ils en parlent
          </div>
          <h2 className="text-balance text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
            La communauté nous fait confiance.
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.15 } } }}
          className="grid gap-5 md:grid-cols-3"
        >
          {items.map((it) => (
            <motion.figure
              key={it.author}
              variants={{
                hidden: { opacity: 0, y: 24 },
                show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.21, 0.61, 0.35, 1] } },
              }}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f0f1c] to-[#0a0a15] p-6 sm:p-7"
            >
              <Quote className="absolute right-5 top-5 h-8 w-8 text-[#a855f7]/25" aria-hidden />
              <div className="mb-3 flex items-center gap-0.5">
                {Array.from({ length: it.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-[#22d3ee] text-[#22d3ee]" />
                ))}
              </div>
              <blockquote className="text-sm leading-relaxed text-[#e0e0ea] sm:text-base">
                &laquo; {it.quote} &raquo;
              </blockquote>
              <figcaption className="mt-5 border-t border-white/10 pt-4">
                <div className="text-sm font-bold text-white">{it.author}</div>
                <div className="text-xs text-[#8b8ba7]">{it.role}</div>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FINAL CTA — gradient violet → cyan pleine largeur
// ─────────────────────────────────────────────────────────────────────
function FinalCta({ storeSlug }: { storeSlug: string }) {
  return (
    <section className="relative overflow-hidden bg-[#050510] py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.21, 0.61, 0.35, 1] }}
          className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#a855f7] via-[#7c3aed] to-[#22d3ee] p-8 text-center sm:p-14 lg:p-20"
        >
          {/* Décor : dots pattern */}
          <div
            className="absolute inset-0 opacity-20"
            aria-hidden
            style={{
              backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-balance text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
              Prêt à commander ?
            </h2>
            <p className="mt-4 text-sm text-white/90 sm:text-base lg:text-lg">
              Livraison sous 48h. Paiement à la livraison ou en ligne. Zéro souci.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="#shop">
                <button className="group inline-flex h-13 items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-[#050510] shadow-xl transition-all hover:scale-[1.03] hover:bg-[#f5f5fa] sm:text-base">
                  Voir la boutique
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </a>
              <Link
                href={`/${storeSlug}/cart`}
                className="inline-flex h-13 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/20 sm:text-base"
              >
                Mon panier
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
