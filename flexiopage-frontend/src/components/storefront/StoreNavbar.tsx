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

export interface NavMenuLink {
  label: string;
  url: string;
}

/** How the brand is shown in the navbar. */
export type BrandDisplay = 'logo+name' | 'logo' | 'name';

export interface NavbarConfig {
  showSearch?: boolean;
  menuLinks?: NavMenuLink[];
  /** logo+name (default) · logo only · name only. */
  brandDisplay?: BrandDisplay;
}

interface Props {
  storeName: string;
  storeSlug: string;
  storeLogo?: string;
  theme: ThemeTokens;
  config?: NavbarConfig;
  /** Optional rendered to the right of the menu (e.g. cart button later). */
  trailing?: React.ReactNode;
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

function hexA(hex: string, a: number): string {
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

export function StoreNavbar({ storeName, storeSlug, storeLogo, theme, config, trailing }: Props) {
  const configured = (config?.menuLinks || []).filter((l) => l.label?.trim() && l.url?.trim());
  // Every theme gets a default menu when the seller hasn't set one.
  const links = configured.length > 0 ? configured : defaultNavLinks(storeSlug);
  const [open, setOpen] = useState(false);
  const navStyle: NavStyle = theme.layout?.nav || 'standard';
  const isBold = navStyle === 'bold';
  const isCentered = navStyle === 'centered';

  // Brand display: logo+name (default), logo only, or name only. If "logo"
  // is chosen but no logo was uploaded, fall back to the name so the bar
  // is never empty.
  const hasLogo = !!storeLogo;
  const brandDisplay: BrandDisplay = config?.brandDisplay || 'logo+name';
  const wantLogo = brandDisplay !== 'name';
  const wantName = brandDisplay === 'name' || brandDisplay === 'logo+name' || !hasLogo;

  const brand = (
    <Link
      href={`/${storeSlug}`}
      className={
        'inline-flex min-w-0 items-center gap-2 font-bold tracking-tight ' +
        (isBold ? 'text-lg uppercase sm:text-2xl' : 'text-base sm:text-xl')
      }
      style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
    >
      {wantLogo && hasLogo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={mediaUrl(storeLogo)}
          alt={storeName}
          className="h-7 w-7 shrink-0 rounded-md object-cover sm:h-8 sm:w-8"
        />
      )}
      {wantLogo && !hasLogo && brandDisplay === 'logo+name' && (
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm font-bold sm:h-8 sm:w-8"
          style={{
            background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
            color: theme.primaryFg,
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
          style={{ color: theme.foreground, fontFamily: theme.fontBody }}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );

  const merchantLink = (
    <Link
      href="/login"
      className={'hidden transition-colors md:inline-block ' + (isBold ? 'text-xs font-semibold uppercase tracking-wider' : 'text-sm')}
      style={{ color: theme.muted }}
    >
      Espace marchand
    </Link>
  );

  const mobileToggle = links.length > 0 && (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-label="Menu"
      className="grid h-9 w-9 place-items-center rounded-md md:hidden"
      style={{ color: theme.foreground, backgroundColor: hexA(theme.surface, 0.6) }}
    >
      {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{
        borderBottom: `${isBold ? 3 : 1}px solid ${theme.border}`,
        backgroundColor: hexA(theme.background, 0.88),
      }}
    >
      {isCentered ? (
        // ── CENTERED — brand on top, links centered below ──
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-3 sm:h-16">
            <div className="flex w-24 items-center">{mobileToggle}</div>
            <div className="flex flex-1 justify-center">{brand}</div>
            <div className="flex w-24 items-center justify-end gap-2">{trailing}</div>
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
                  style={{ color: theme.foreground, fontFamily: theme.fontBody }}
                >
                  {l.label}
                </a>
              ))}
            </nav>
          )}
        </div>
      ) : (
        // ── STANDARD & BOLD — logo left, links right ──
        <div
          className={
            'mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 sm:px-6 ' +
            (isBold ? 'h-16 sm:h-20' : 'h-14 sm:h-16')
          }
        >
          {brand}
          {desktopLinks}
          <div className="flex items-center gap-2">
            {trailing}
            {merchantLink}
            {mobileToggle}
          </div>
        </div>
      )}

      {/* Mobile sheet */}
      {open && links.length > 0 && (
        <div
          className="border-t md:hidden"
          style={{ borderColor: theme.border, backgroundColor: theme.background }}
        >
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-3 sm:px-6">
            {links.map((l, i) => (
              <a
                key={i}
                href={resolveHref(l.url, storeSlug)}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium"
                style={{ color: theme.foreground, fontFamily: theme.fontBody }}
              >
                {l.label}
              </a>
            ))}
            <Link href="/login" className="rounded-md px-3 py-2.5 text-sm" style={{ color: theme.muted }}>
              Espace marchand
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
