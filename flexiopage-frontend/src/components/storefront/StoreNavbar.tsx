'use client';

/**
 * Enriched storefront navbar — logo + menu links + mobile hamburger.
 * Uses the active theme tokens so it adopts each theme's colors/fonts,
 * and the theme's `layout.nav` token so the bar's *shape* changes too:
 *
 *   standard — logo left, links right (calm, default)
 *   centered — logo centered on top, links centered below (editorial)
 *   bold     — tall bar, thick divider, chunky uppercase links
 */
import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { ThemeTokens, NavStyle } from '@/data/store-themes';
import { mediaUrl } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/storefront/language-switcher';
import { MarketSwitcher, type PublicMarket } from '@/components/storefront/market-switcher';
import { CartIcon } from '@/components/storefront/cart-icon';

export interface NavMenuLink {
  label: string;
  url: string;
}

/** How the brand is shown in the navbar. */
export type BrandDisplay = 'logo+name' | 'logo' | 'name';
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface NavbarConfig {
  showSearch?: boolean;
  menuLinks?: NavMenuLink[];
  /** logo+name (default) · logo only · name only. */
  brandDisplay?: BrandDisplay;
  /** Hauteur du logo. Par défaut: 'md'. */
  logoSize?: LogoSize;
  /** Opt-in language switcher in the navbar. Default: false (hidden). */
  showLanguageSwitcher?: boolean;
}

/** Tailles utilisées par la navbar : valeurs PX gardées explicites pour rester
 *  cohérentes avec la palette du picker côté dashboard. La hauteur de la barre
 *  s'ajuste sous l'effet du logo via padding (cf. <header>). */
const LOGO_SIZE_PX: Record<LogoSize, { mobile: number; desktop: number }> = {
  sm: { mobile: 22, desktop: 24 },
  md: { mobile: 28, desktop: 32 },
  lg: { mobile: 36, desktop: 44 },
  xl: { mobile: 48, desktop: 56 },
};

interface Props {
  storeName: string;
  storeSlug: string;
  storeLogo?: string;
  theme: ThemeTokens;
  config?: NavbarConfig;
  /** Storefront default locale (used to seed the language switcher). */
  defaultLocale?: string;
  /** Optional rendered to the right of the menu (e.g. cart button later). */
  trailing?: React.ReactNode;
  /** Per-page background override (e.g. product page palette wants its own
   *  navbar color). Wins over the theme background when set. */
  bgOverride?: string;
  /** Paired text/icon color when bgOverride is used — keeps contrast right. */
  fgOverride?: string;
  /** Marchés publiquement activés — déclenche le sélecteur pays quand ≥ 2. */
  markets?: PublicMarket[];
  /** Pays actuellement résolu côté backend (pré-coche le switcher). */
  currentMarketCountry?: string;
}

/**
 * Default menu shown on every theme when the seller hasn't configured any
 * links. `storeSlug` is woven in so "Accueil" points at the store home.
 */
function defaultNavLinks(storeSlug: string): NavMenuLink[] {
  return [
    { label: 'Accueil', url: `/${storeSlug}` },
    { label: 'Catalogue', url: '#products' },
    { label: 'Contact', url: '#store-footer' },
  ];
}

function hexA(hex: string | undefined | null, a: number): string {
  if (!hex || typeof hex !== 'string') return 'transparent';
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function resolveHref(url: string, storeSlug: string): string {
  // Same-store anchor or path → keep as is; external → keep absolute.
  if (url.startsWith('#')) return url;
  if (url.startsWith('/')) return url;
  if (/^https?:\/\//.test(url)) return url;
  // Bare slug — assume internal storefront page (`about`, `contact`).
  return `/${storeSlug}/${url.replace(/^\/+/, '')}`;
}

export function StoreNavbar({ storeName, storeSlug, storeLogo, theme, config, defaultLocale, trailing, bgOverride, fgOverride, markets, currentMarketCountry }: Props) {
  // Effective colors — per-page override (e.g. product page palette) wins
  // over the theme tokens. Header bg becomes opaque when overridden so the
  // chosen color stays true instead of being softened by the backdrop blur.
  const effectiveFg = fgOverride || theme.foreground;
  const effectiveBg = bgOverride || hexA(theme.background, 0.88);
  const configured = (config?.menuLinks || []).filter((l) => l.label?.trim() && l.url?.trim());
  // Every theme gets a default menu when the seller hasn't set one.
  const links = configured.length > 0 ? configured : defaultNavLinks(storeSlug);
  const [open, setOpen] = useState(false);
  const navStyle: NavStyle = theme.layout?.nav || 'standard';
  const isBold = navStyle === 'bold';
  const isCentered = navStyle === 'centered';
  const isGlass = navStyle === 'glass';
  const isEditorial = navStyle === 'editorial';

  // Brand display: logo+name (default), logo only, or name only. If "logo"
  // is chosen but no logo was uploaded, fall back to the name so the bar
  // is never empty.
  const hasLogo = !!storeLogo;
  const brandDisplay: BrandDisplay = config?.brandDisplay || 'logo+name';
  const wantLogo = brandDisplay !== 'name';
  const wantName = brandDisplay === 'name' || brandDisplay === 'logo+name' || !hasLogo;

  // Logo size: drives both the <img> dimensions AND the bar height so a big
  // logo doesn't get clipped by a small navbar.
  const logoSize: LogoSize = config?.logoSize || 'md';
  const { mobile: logoMobile, desktop: logoDesktop } = LOGO_SIZE_PX[logoSize];
  // Scale the brand text only when the logo grows past md — keeps small/medium
  // navbars from looking visually inconsistent.
  const isBigLogo = logoSize === 'lg' || logoSize === 'xl';

  const brand = (
    <Link
      href={`/${storeSlug}`}
      className={
        'inline-flex min-w-0 items-center gap-2 font-bold tracking-tight ' +
        (isBold
          ? 'text-lg uppercase sm:text-2xl'
          : isBigLogo
            ? 'text-lg sm:text-2xl'
            : 'text-base sm:text-xl')
      }
      style={{ fontFamily: theme.fontHeading, color: effectiveFg }}
    >
      {wantLogo && hasLogo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={mediaUrl(storeLogo)}
          alt={storeName}
          className="shrink-0 rounded-md object-contain"
          style={{
            // Inline width/height for the desktop size; the mobile breakpoint
            // is applied via the data attribute + CSS below so we don't pull in
            // an external lib for a one-shot media query.
            width: logoDesktop,
            height: logoDesktop,
          }}
          data-mobile-size={logoMobile}
        />
      )}
      {wantLogo && !hasLogo && brandDisplay === 'logo+name' && (
        <span
          aria-hidden
          className="grid shrink-0 place-items-center rounded-md font-bold"
          style={{
            background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
            color: theme.primaryFg,
            width: logoDesktop,
            height: logoDesktop,
            fontSize: Math.max(12, Math.round(logoDesktop * 0.45)),
          }}
        >
          {storeName.slice(0, 1).toUpperCase()}
        </span>
      )}
      {wantName && <span className="truncate">{storeName}</span>}
    </Link>
  );

  const linkClass =
    'rounded-md px-3 py-1.5 transition-colors hover:bg-black/5 ' +
    (isBold ? 'text-xs font-bold uppercase tracking-widest' : 'text-sm font-medium');

  const desktopLinks = links.length > 0 && (
    <nav className="hidden items-center gap-1 md:flex">
      {links.map((l, i) => (
        <a
          key={i}
          href={resolveHref(l.url, storeSlug)}
          className={linkClass}
          style={{ color: effectiveFg, fontFamily: theme.fontBody }}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );

  // Buyer-facing cart icon — replaces the old "Espace marchand" admin
  // link. Sellers still access the dashboard via /dashboard (header link
  // on the marketing site), so removing the public-facing entry here is
  // safe and gives the storefront the standard e-commerce affordance.
  const cartIcon = (
    <CartIcon
      storeSlug={storeSlug}
      color={effectiveFg}
      variant={isBold ? 'bold' : 'standard'}
    />
  );

  const mobileToggle = links.length > 0 && (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-label="Menu"
      className="grid h-9 w-9 place-items-center rounded-md md:hidden"
      style={{ color: effectiveFg, backgroundColor: hexA(theme.surface, 0.6) }}
    >
      {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );

  // ── GLASS ─────────────────────────────────────────────────────────
  // Frosted backdrop premium feel (Carthago, Bloom) — fond très transparent
  // qui laisse passer la couleur du hero, blur agressif, liens dans des
  // pilules avec halo, separator subtil. Idéal pour les boutiques branding.
  if (isGlass) {
    const glassBg = bgOverride || hexA(theme.background, 0.55);
    return (
      <header
        className="sticky top-0 z-40 backdrop-blur-2xl backdrop-saturate-150"
        style={{
          backgroundColor: glassBg,
          borderBottom: `1px solid ${hexA(theme.border, 0.6)}`,
          boxShadow: `0 1px 0 ${hexA(theme.foreground, 0.04)}, 0 8px 30px ${hexA(theme.foreground, 0.04)}`,
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          {brand}
          {links.length > 0 && (
            <nav className="hidden items-center gap-1 md:flex">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={resolveHref(l.url, storeSlug)}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all hover:scale-105"
                  style={{
                    color: effectiveFg,
                    fontFamily: theme.fontBody,
                    backgroundColor: hexA(theme.surface, 0.5),
                    border: `1px solid ${hexA(theme.border, 0.6)}`,
                  }}
                >
                  {l.label}
                </a>
              ))}
            </nav>
          )}
          <div className="flex items-center gap-2">
            {markets && markets.length > 1 && (
              <MarketSwitcher markets={markets} currentCountry={currentMarketCountry} />
            )}
            {config?.showLanguageSwitcher && (
              <LanguageSwitcher storeSlug={storeSlug} defaultLocale={defaultLocale} />
            )}
            {trailing}
            {cartIcon}
            {mobileToggle}
          </div>
        </div>
        {/* Mobile sheet */}
        {open && links.length > 0 && (
          <div
            className="border-t md:hidden"
            style={{ borderColor: theme.border, backgroundColor: bgOverride || theme.background }}
          >
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-3 sm:px-6">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={resolveHref(l.url, storeSlug)}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium"
                  style={{ color: effectiveFg, fontFamily: theme.fontBody }}
                >
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
        )}
      </header>
    );
  }

  // ── EDITORIAL ─────────────────────────────────────────────────────
  // Masthead magazine : nom de marque géant en serif, liens minimaux en
  // petits caps espacés en dessous, le tout centré et avec un filet
  // sous le bloc. Atelier, Nova — boutiques qui se vendent comme un brand.
  if (isEditorial) {
    return (
      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{
          backgroundColor: effectiveBg,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* Top mini-row — mobile toggle + actions seulement ; le brand
              vit dans son propre row au centre. */}
          <div className="flex h-10 items-center justify-between gap-2 text-[10px] uppercase tracking-[0.25em]" style={{ color: hexA(effectiveFg, 0.6) }}>
            <div className="flex items-center gap-2">{mobileToggle}</div>
            <div className="hidden md:block">— Maison —</div>
            <div className="flex items-center gap-2">
              {markets && markets.length > 1 && (
                <MarketSwitcher markets={markets} currentCountry={currentMarketCountry} />
              )}
              {config?.showLanguageSwitcher && (
                <LanguageSwitcher storeSlug={storeSlug} defaultLocale={defaultLocale} />
              )}
              {trailing}
              {cartIcon}
            </div>
          </div>
          {/* Centre row — nom de marque géant en serif */}
          <div className="flex justify-center pb-2 pt-1">
            <Link
              href={`/${storeSlug}`}
              className="inline-flex items-center gap-3"
              style={{ color: effectiveFg }}
              aria-label={storeName}
            >
              {wantLogo && hasLogo && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={mediaUrl(storeLogo)}
                  alt=""
                  className="shrink-0 rounded object-contain"
                  style={{ width: Math.max(40, logoDesktop), height: Math.max(40, logoDesktop) }}
                />
              )}
              {wantName && (
                <span
                  className="text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl"
                  style={{ fontFamily: theme.fontHeading, letterSpacing: '-0.02em' }}
                >
                  {storeName}
                </span>
              )}
            </Link>
          </div>
          {/* Liens centrés sous le brand */}
          {links.length > 0 && (
            <nav
              className="hidden items-center justify-center gap-6 border-t py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] md:flex"
              style={{ borderColor: hexA(theme.border, 0.6), color: hexA(effectiveFg, 0.85) }}
            >
              {links.map((l, i) => (
                <a
                  key={i}
                  href={resolveHref(l.url, storeSlug)}
                  className="transition-colors hover:opacity-60"
                  style={{ fontFamily: theme.fontBody }}
                >
                  {l.label}
                </a>
              ))}
            </nav>
          )}
        </div>
        {/* Mobile sheet */}
        {open && links.length > 0 && (
          <div
            className="border-t md:hidden"
            style={{ borderColor: theme.border, backgroundColor: bgOverride || theme.background }}
          >
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-3 sm:px-6">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={resolveHref(l.url, storeSlug)}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: effectiveFg, fontFamily: theme.fontBody }}
                >
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
        )}
      </header>
    );
  }

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{
        borderBottom: `${isBold ? 3 : 1}px solid ${theme.border}`,
        backgroundColor: effectiveBg,
      }}
    >
      {isCentered ? (
        // ── CENTERED — brand on top, links centered below ──
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-3 sm:h-16">
            <div className="flex w-24 items-center">{mobileToggle}</div>
            <div className="flex flex-1 justify-center">{brand}</div>
            <div className="flex w-24 items-center justify-end gap-2">
              {markets && markets.length > 1 && (
                <MarketSwitcher markets={markets} currentCountry={currentMarketCountry} />
              )}
              {trailing}
              {cartIcon}
            </div>
          </div>
          {links.length > 0 && (
            <nav
              className="hidden items-center justify-center gap-2 border-t py-2 md:flex"
              style={{ borderColor: theme.border }}
            >
              {links.map((l, i) => (
                <a
                  key={i}
                  href={resolveHref(l.url, storeSlug)}
                  className="rounded-md px-3 py-1 text-sm font-medium uppercase tracking-wide transition-colors hover:bg-black/5"
                  style={{ color: effectiveFg, fontFamily: theme.fontBody }}
                >
                  {l.label}
                </a>
              ))}
            </nav>
          )}
        </div>
      ) : (
        // ── STANDARD & BOLD — logo left, links right ──
        // Bar height scales with logo so a big logo never gets visually clipped.
        <div
          className={
            'mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 sm:px-6 ' +
            (logoSize === 'xl'
              ? 'min-h-20 sm:min-h-24'
              : logoSize === 'lg'
                ? 'min-h-16 sm:min-h-[72px]'
                : isBold
                  ? 'h-16 sm:h-20'
                  : 'h-14 sm:h-16')
          }
        >
          {brand}
          {desktopLinks}
          <div className="flex items-center gap-2">
            {markets && markets.length > 1 && (
              <MarketSwitcher markets={markets} currentCountry={currentMarketCountry} />
            )}
            {config?.showLanguageSwitcher && (
              <LanguageSwitcher storeSlug={storeSlug} defaultLocale={defaultLocale} />
            )}
            {trailing}
            {cartIcon}
            {mobileToggle}
          </div>
        </div>
      )}

      {/* Mobile sheet */}
      {open && links.length > 0 && (
        <div
          className="border-t md:hidden"
          style={{ borderColor: theme.border, backgroundColor: bgOverride || theme.background }}
        >
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-3 sm:px-6">
            {links.map((l, i) => (
              <a
                key={i}
                href={resolveHref(l.url, storeSlug)}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium"
                style={{ color: effectiveFg, fontFamily: theme.fontBody }}
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
