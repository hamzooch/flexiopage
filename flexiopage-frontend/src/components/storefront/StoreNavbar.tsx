'use client';

/**
 * Enriched storefront navbar — logo + menu links + mobile hamburger.
 * Uses the active theme tokens so it adopts each theme's colors/fonts.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { ThemeTokens } from '@/data/store-themes';

export interface NavMenuLink {
  label: string;
  url: string;
}

export interface NavbarConfig {
  showSearch?: boolean;
  menuLinks?: NavMenuLink[];
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
  return `/store/${storeSlug}/${url.replace(/^\/+/, '')}`;
}

export function StoreNavbar({ storeName, storeSlug, storeLogo, theme, config, trailing }: Props) {
  const links = (config?.menuLinks || []).filter((l) => l.label?.trim() && l.url?.trim());
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{
        borderColor: theme.border,
        backgroundColor: hexA(theme.background, 0.85),
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-3 sm:h-16 sm:gap-6 sm:px-6">
        {/* Brand */}
        <Link
          href={`/store/${storeSlug}`}
          className="inline-flex min-w-0 items-center gap-2 text-base font-bold tracking-tight sm:text-xl"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          {storeLogo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={storeLogo} alt={storeName} className="h-7 w-7 shrink-0 rounded-md object-cover sm:h-8 sm:w-8" />
          ) : (
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
          <span className="truncate">{storeName}</span>
        </Link>

        {/* Desktop menu */}
        {links.length > 0 && (
          <nav className="hidden md:flex items-center gap-1">
            {links.map((l, i) => (
              <a
                key={i}
                href={resolveHref(l.url, storeSlug)}
                className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5"
                style={{ color: theme.foreground, fontFamily: theme.fontBody }}
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}

        {/* Trailing slot + mobile toggle */}
        <div className="flex items-center gap-2">
          {trailing}
          <Link
            href="/login"
            className="hidden text-sm transition-colors md:inline-block"
            style={{ color: theme.muted }}
          >
            Espace marchand
          </Link>
          {links.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="Menu"
              className="md:hidden grid h-9 w-9 place-items-center rounded-md"
              style={{ color: theme.foreground, backgroundColor: hexA(theme.surface, 0.6) }}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile sheet */}
      {open && links.length > 0 && (
        <div
          className="md:hidden border-t"
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
            <Link
              href="/login"
              className="rounded-md px-3 py-2.5 text-sm"
              style={{ color: theme.muted }}
            >
              Espace marchand
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
