/**
 * Enriched storefront footer — brand, contact details, social links, and
 * seller-defined extra links. Adopts the active theme tokens.
 */
import Link from 'next/link';
import {
  Instagram,
  Facebook,
  Youtube,
  Mail,
  Phone,
  MapPin,
  Twitter,
  MessageCircle,
} from 'lucide-react';
import type { ThemeTokens } from '@/data/store-themes';
import { mediaUrl } from '@/lib/utils';

export interface FooterColumn {
  title: string;
  links: Array<{ label: string; url: string }>;
}

export type FooterBrandDisplay = 'logo+name' | 'logo' | 'name';
export type FooterLogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface FooterConfig {
  social?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    youtube?: string;
    x?: string;
    whatsapp?: string;
  };
  contact?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  links?: Array<{ label: string; url: string }>;
  /** Grouped link columns — when present, replaces the flat `links` list. */
  columns?: FooterColumn[];
  /** Marque dans le bloc "À propos" : nom (par défaut), logo seul, ou logo+nom. */
  brandDisplay?: FooterBrandDisplay;
  /** Hauteur du logo quand affiché. */
  logoSize?: FooterLogoSize;
}

const FOOTER_LOGO_PX: Record<FooterLogoSize, number> = {
  sm: 28,
  md: 40,
  lg: 56,
  xl: 80,
};

interface Props {
  storeName: string;
  storeSlug: string;
  storeLogo?: string;
  footerNote?: string;
  config?: FooterConfig;
  theme: ThemeTokens;
}

// Inline TikTok logo (lucide doesn't ship one).
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.5 3a5.5 5.5 0 0 0 5 5v3a8.5 8.5 0 0 1-5-1.6V15a6 6 0 1 1-6-6c.3 0 .7 0 1 .1v3.1a3 3 0 1 0 2 2.8V3h3z" />
    </svg>
  );
}

const SOCIAL_DEFS = [
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'facebook',  label: 'Facebook',  Icon: Facebook },
  { key: 'tiktok',    label: 'TikTok',    Icon: TikTokIcon },
  { key: 'youtube',   label: 'YouTube',   Icon: Youtube },
  { key: 'x',         label: 'X',         Icon: Twitter },
  { key: 'whatsapp',  label: 'WhatsApp',  Icon: MessageCircle },
] as const;

function resolveSocialUrl(key: typeof SOCIAL_DEFS[number]['key'], value: string): string {
  // Accept full URL, @handle, or bare username — normalize to a clickable link.
  if (/^https?:\/\//i.test(value)) return value;
  const clean = value.replace(/^@/, '').trim();
  switch (key) {
    case 'instagram': return `https://instagram.com/${clean}`;
    case 'facebook':  return `https://facebook.com/${clean}`;
    case 'tiktok':    return `https://tiktok.com/@${clean}`;
    case 'youtube':   return clean.startsWith('UC') || clean.startsWith('channel/') ? `https://youtube.com/${clean}` : `https://youtube.com/@${clean}`;
    case 'x':         return `https://x.com/${clean}`;
    case 'whatsapp':  return `https://wa.me/${clean.replace(/[^\d+]/g, '')}`;
  }
}

/** Make an absolute path relative to the store root (so seller-typed
 *  `/p/contact` becomes `/<slug>/p/contact`). External URLs pass through. */
function storeLink(storeSlug: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const trimmed = url.trim();
  if (!trimmed) return `/${storeSlug}`;
  return `/${storeSlug}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export function StoreFooter({ storeName, storeSlug, storeLogo, footerNote, config, theme }: Props) {
  const social = config?.social || {};
  const contact = config?.contact || {};
  // Grouped columns take precedence over the flat `links` array — they
  // are what we seed on store creation and what the seller edits in the
  // dashboard.
  const columns = (config?.columns || [])
    .map((c) => ({ ...c, links: (c.links || []).filter((l) => l.label?.trim() && l.url?.trim()) }))
    .filter((c) => c.title?.trim() && c.links.length > 0);
  const legacyLinks = (config?.links || []).filter((l) => l.label?.trim() && l.url?.trim());
  const hasContact = !!(contact.email || contact.phone || contact.address);
  const hasSocial = SOCIAL_DEFS.some((s) => social[s.key as keyof typeof social]);
  const hasExtras = columns.length > 0 || legacyLinks.length > 0 || hasContact || hasSocial;

  // Brand display in the footer about-block. Defaults to 'name' so existing
  // stores keep their current footer (no visual change without opt-in).
  const brandDisplay: FooterBrandDisplay = config?.brandDisplay || 'name';
  const hasLogo = !!storeLogo;
  const wantLogo = brandDisplay !== 'name' && hasLogo;
  const wantName = brandDisplay === 'name' || brandDisplay === 'logo+name' || !hasLogo;
  const logoPx = FOOTER_LOGO_PX[config?.logoSize || 'md'];

  return (
    <footer
      id="store-footer"
      className="border-t"
      style={{
        borderColor: theme.border,
        backgroundColor: theme.surfaceMuted,
        color: theme.muted,
        // Push the bottom row above the mobile sticky CTA bar (h≈64px + safe area)
        // so the © row never gets hidden under it on phones.
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Compact paddings — generous breathing room on desktop, tight on mobile */}
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10">
        {hasExtras && (
          <div
            className="grid grid-cols-2 gap-x-4 gap-y-5 border-b pb-5 sm:gap-x-8 sm:gap-y-8 sm:pb-8"
            style={{
              borderColor: theme.border,
              // On sm+, switch to auto-fit grid for natural column widths.
              // The inline override applies above the sm breakpoint via @media.
              // Mobile stays at 2 cols for compact 4-tile layouts.
            }}
          >
            {/* Brand block — spans both mobile columns; sits naturally first on desktop */}
            <div className="col-span-2 sm:col-span-2">
              <Link
                href={`/${storeSlug}`}
                className="inline-flex items-center gap-2 text-base font-bold tracking-tight sm:gap-3 sm:text-lg"
                style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
                aria-label={storeName}
              >
                {wantLogo && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={mediaUrl(storeLogo!)}
                    alt={storeName}
                    className="shrink-0 rounded-md object-contain"
                    style={{ width: Math.min(logoPx, 40), height: Math.min(logoPx, 40) }}
                  />
                )}
                {wantName && <span>{storeName}</span>}
              </Link>
              {footerNote && (
                <p
                  className="mt-2 line-clamp-2 max-w-md text-[12px] leading-snug sm:mt-3 sm:line-clamp-none sm:text-sm sm:leading-relaxed"
                  style={{ color: theme.muted }}
                >
                  {footerNote}
                </p>
              )}
              {hasSocial && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">
                  {SOCIAL_DEFS.map(({ key, label, Icon }) => {
                    const val = social[key as keyof typeof social];
                    if (!val) return null;
                    return (
                      <a
                        key={key}
                        href={resolveSocialUrl(key, val)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        className="grid h-8 w-8 place-items-center rounded-full border transition-colors hover:opacity-80 sm:h-9 sm:w-9"
                        style={{
                          borderColor: theme.border,
                          backgroundColor: theme.surface,
                          color: theme.foreground,
                        }}
                      >
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Contact block */}
            {hasContact && (
              <div>
                <h4
                  className="mb-2 text-[11px] font-semibold uppercase tracking-wider sm:mb-3 sm:text-sm"
                  style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
                >
                  Contact
                </h4>
                <ul className="space-y-1.5 text-[12px] sm:space-y-2 sm:text-sm">
                  {contact.email && (
                    <li>
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-1.5 break-all hover:underline sm:gap-2"
                        style={{ color: theme.muted }}
                      >
                        <Mail className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                        {contact.email}
                      </a>
                    </li>
                  )}
                  {contact.phone && (
                    <li>
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-1.5 hover:underline sm:gap-2"
                        style={{ color: theme.muted }}
                      >
                        <Phone className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                        {contact.phone}
                      </a>
                    </li>
                  )}
                  {contact.address && (
                    <li className="inline-flex items-start gap-1.5 sm:gap-2" style={{ color: theme.muted }}>
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                      <span>{contact.address}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Grouped columns (Termes et politiques, Contact, Information…) */}
            {columns.map((col) => (
              <div key={col.title}>
                <h4
                  className="mb-2 text-[11px] font-semibold uppercase tracking-wider sm:mb-3 sm:text-sm"
                  style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
                >
                  {col.title}
                </h4>
                <ul className="space-y-1.5 text-[12px] sm:space-y-2 sm:text-sm">
                  {col.links.map((l, i) => (
                    <li key={i}>
                      <Link
                        href={storeLink(storeSlug, l.url)}
                        className="line-clamp-1 hover:underline"
                        style={{ color: theme.muted }}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Legacy flat links — only shown when no grouped columns are set */}
            {columns.length === 0 && legacyLinks.length > 0 && (
              <div>
                <h4
                  className="mb-2 text-[11px] font-semibold uppercase tracking-wider sm:mb-3 sm:text-sm"
                  style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
                >
                  Liens
                </h4>
                <ul className="space-y-1.5 text-[12px] sm:space-y-2 sm:text-sm">
                  {legacyLinks.map((l, i) => (
                    <li key={i}>
                      <a
                        href={l.url.startsWith('http') || l.url.startsWith('/') ? l.url : `/${storeSlug}/${l.url.replace(/^\/+/, '')}`}
                        className="line-clamp-1 hover:underline"
                        style={{ color: theme.muted }}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Bottom row — single line on mobile, copyright + brand inline.
            Reserve extra bottom space when the mobile sticky CTA might overlap. */}
        <div className="mt-4 flex flex-col items-center justify-between gap-1.5 pb-[68px] text-[11px] sm:mt-6 sm:flex-row sm:gap-3 sm:pb-0 sm:text-xs">
          <span
            className="inline-flex items-center gap-1.5 font-bold tracking-tight sm:gap-2"
            style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
          >
            {wantLogo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mediaUrl(storeLogo!)}
                alt=""
                className="rounded object-contain"
                style={{ height: Math.min(22, Math.round(logoPx / 2)), width: 'auto' }}
              />
            )}
            {wantName && <span>{storeName}</span>}
          </span>
          <p className="text-center sm:text-right" style={{ color: theme.muted }}>
            © {new Date().getFullYear()} {storeName}. Tous droits réservés.
            {!hasExtras && footerNote ? ` · ${footerNote}` : ''}
          </p>
        </div>
      </div>
    </footer>
  );
}
