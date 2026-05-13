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
}

interface Props {
  storeName: string;
  storeSlug: string;
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

export function StoreFooter({ storeName, storeSlug, footerNote, config, theme }: Props) {
  const social = config?.social || {};
  const contact = config?.contact || {};
  const links = (config?.links || []).filter((l) => l.label?.trim() && l.url?.trim());
  const hasContact = !!(contact.email || contact.phone || contact.address);
  const hasSocial = SOCIAL_DEFS.some((s) => social[s.key as keyof typeof social]);
  const hasExtras = links.length > 0 || hasContact || hasSocial;

  return (
    <footer
      className="border-t"
      style={{
        borderColor: theme.border,
        backgroundColor: theme.surfaceMuted,
        color: theme.muted,
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {hasExtras && (
          <div className="grid gap-6 border-b pb-8 sm:grid-cols-2 sm:gap-10 sm:pb-10 lg:grid-cols-4" style={{ borderColor: theme.border }}>
            {/* Brand block */}
            <div className="lg:col-span-2">
              <Link
                href={`/store/${storeSlug}`}
                className="text-lg font-bold tracking-tight"
                style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
              >
                {storeName}
              </Link>
              {footerNote && (
                <p className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: theme.muted }}>
                  {footerNote}
                </p>
              )}
              {hasSocial && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
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
                        className="grid h-9 w-9 place-items-center rounded-full border transition-colors hover:opacity-80"
                        style={{
                          borderColor: theme.border,
                          backgroundColor: theme.surface,
                          color: theme.foreground,
                        }}
                      >
                        <Icon className="h-4 w-4" />
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
                  className="mb-3 text-sm font-semibold uppercase tracking-wider"
                  style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
                >
                  Contact
                </h4>
                <ul className="space-y-2 text-sm">
                  {contact.email && (
                    <li>
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-2 hover:underline"
                        style={{ color: theme.muted }}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {contact.email}
                      </a>
                    </li>
                  )}
                  {contact.phone && (
                    <li>
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-2 hover:underline"
                        style={{ color: theme.muted }}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {contact.phone}
                      </a>
                    </li>
                  )}
                  {contact.address && (
                    <li className="inline-flex items-start gap-2" style={{ color: theme.muted }}>
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{contact.address}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Extra links */}
            {links.length > 0 && (
              <div>
                <h4
                  className="mb-3 text-sm font-semibold uppercase tracking-wider"
                  style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
                >
                  Liens
                </h4>
                <ul className="space-y-2 text-sm">
                  {links.map((l, i) => (
                    <li key={i}>
                      <a
                        href={l.url.startsWith('http') || l.url.startsWith('/') ? l.url : `/store/${storeSlug}/${l.url.replace(/^\/+/, '')}`}
                        className="hover:underline"
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

        <div className="mt-8 flex flex-col items-center justify-between gap-3 text-xs sm:flex-row">
          <span
            className="font-bold tracking-tight"
            style={{ color: theme.foreground, fontFamily: theme.fontHeading }}
          >
            {storeName}
          </span>
          <p style={{ color: theme.muted }}>
            © {new Date().getFullYear()} {storeName}. Tous droits réservés.
            {!hasExtras && footerNote ? ` · ${footerNote}` : ''}
          </p>
        </div>
      </div>
    </footer>
  );
}
