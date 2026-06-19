/**
 * Storefront footer — 4 variantes selon `theme.layout.footer` :
 *   - full     (défaut) — brand + contact + colonnes de liens, 3 colonnes
 *   - minimal  — une ligne plate : marque, liens inline, social à droite
 *   - split    — brand+contact à gauche, gros bloc « rester en contact » à droite
 *   - bold     — énorme nom de marque + tagline, contact compact en bas
 *
 * Chaque thème fixe sa variante dans store-themes.ts. Toutes lisent la
 * MÊME config FooterConfig — pas de breaking change pour le vendeur.
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
  columns?: FooterColumn[];
  brandDisplay?: FooterBrandDisplay;
  logoSize?: FooterLogoSize;
}

const FOOTER_LOGO_PX: Record<FooterLogoSize, number> = {
  sm: 28, md: 40, lg: 56, xl: 80,
};

interface Props {
  storeName: string;
  storeSlug: string;
  storeLogo?: string;
  footerNote?: string;
  config?: FooterConfig;
  theme: ThemeTokens;
}

// ───────────────────────────────── utilitaires ─────────────────────────

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

function storeLink(storeSlug: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const trimmed = url.trim();
  if (!trimmed) return `/${storeSlug}`;
  return `/${storeSlug}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

function hexA(hex: string | undefined | null, a: number): string {
  if (!hex || typeof hex !== 'string') return 'transparent';
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ───────────────────────────────── atoms ─────────────────────────

function SocialRow({ social, theme, size = 'md' }: { social: NonNullable<FooterConfig['social']>; theme: ThemeTokens; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-10 w-10' : size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const icon = size === 'lg' ? 'h-4 w-4' : size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
            className={`grid ${box} place-items-center rounded-full border transition-colors hover:opacity-80`}
            style={{ borderColor: theme.border, backgroundColor: theme.surface, color: theme.foreground }}
          >
            <Icon className={icon} />
          </a>
        );
      })}
    </div>
  );
}

function ContactList({ contact, theme, compact }: { contact: NonNullable<FooterConfig['contact']>; theme: ThemeTokens; compact?: boolean }) {
  const sz = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <ul className={`space-y-1.5 ${compact ? 'text-[12px]' : 'text-sm'}`}>
      {contact.email && (
        <li>
          <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 break-all hover:underline" style={{ color: theme.muted }}>
            <Mail className={`${sz} shrink-0`} />
            {contact.email}
          </a>
        </li>
      )}
      {contact.phone && (
        <li>
          <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-2 hover:underline" style={{ color: theme.muted }}>
            <Phone className={`${sz} shrink-0`} />
            {contact.phone}
          </a>
        </li>
      )}
      {contact.address && (
        <li className="inline-flex items-start gap-2" style={{ color: theme.muted }}>
          <MapPin className={`${sz} mt-0.5 shrink-0`} />
          <span>{contact.address}</span>
        </li>
      )}
    </ul>
  );
}

function BrandLine({
  storeName, storeSlug, storeLogo, brandDisplay, logoPx, theme,
  size = 'md',
}: {
  storeName: string; storeSlug: string; storeLogo?: string;
  brandDisplay: FooterBrandDisplay; logoPx: number; theme: ThemeTokens;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const wantLogo = brandDisplay !== 'name' && !!storeLogo;
  const wantName = brandDisplay === 'name' || brandDisplay === 'logo+name' || !storeLogo;
  const textSize =
    size === 'xl' ? 'text-4xl sm:text-6xl' :
    size === 'lg' ? 'text-2xl sm:text-3xl' :
    size === 'sm' ? 'text-sm' :
    'text-base sm:text-lg';
  const logoSize = size === 'xl' ? Math.max(logoPx, 64) : size === 'lg' ? Math.max(logoPx, 48) : Math.min(logoPx, 40);
  return (
    <Link
      href={`/${storeSlug}`}
      className={`inline-flex items-center gap-2 font-bold tracking-tight sm:gap-3 ${textSize}`}
      style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
      aria-label={storeName}
    >
      {wantLogo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={mediaUrl(storeLogo!)}
          alt={storeName}
          className="shrink-0 rounded-md object-contain"
          style={{ width: logoSize, height: logoSize }}
        />
      )}
      {wantName && <span>{storeName}</span>}
    </Link>
  );
}

function BottomRow({
  storeName, theme,
  trailingNote,
}: {
  storeName: string; theme: ThemeTokens;
  trailingNote?: string;
}) {
  return (
    <div
      className="mt-4 flex flex-col items-center justify-between gap-1.5 pb-[68px] text-[11px] sm:mt-6 sm:flex-row sm:gap-3 sm:pb-0 sm:text-xs"
    >
      <p className="text-center sm:text-left" style={{ color: theme.muted }}>
        © {new Date().getFullYear()} {storeName}. Tous droits réservés.
        {trailingNote ? ` · ${trailingNote}` : ''}
      </p>
      <p style={{ color: theme.muted }}>
        Créé par{' '}
        <a
          href="https://flexiopage.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold hover:underline"
          style={{ color: theme.foreground }}
        >
          FlexioPage
        </a>
      </p>
    </div>
  );
}

// ───────────────────────────────── main dispatch ─────────────────────────

export function StoreFooter({ storeName, storeSlug, storeLogo, footerNote, config, theme }: Props) {
  const variant = theme.layout?.footer || 'full';

  return (
    <footer
      id="store-footer"
      className="border-t"
      style={{
        borderColor: theme.border,
        backgroundColor: theme.surfaceMuted,
        color: theme.muted,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10">
        {variant === 'minimal' && <MinimalVariant {...{ storeName, storeSlug, storeLogo, footerNote, config, theme }} />}
        {variant === 'split'   && <SplitVariant   {...{ storeName, storeSlug, storeLogo, footerNote, config, theme }} />}
        {variant === 'bold'    && <BoldVariant    {...{ storeName, storeSlug, storeLogo, footerNote, config, theme }} />}
        {(!variant || variant === 'full') && <FullVariant {...{ storeName, storeSlug, storeLogo, footerNote, config, theme }} />}
      </div>
    </footer>
  );
}

// ───────────────────────────────── 1. FULL (défaut) ─────────────────────────

function FullVariant({ storeName, storeSlug, storeLogo, footerNote, config, theme }: Props) {
  const social = config?.social || {};
  const contact = config?.contact || {};
  const columns = (config?.columns || [])
    .map((c) => ({ ...c, links: (c.links || []).filter((l) => l.label?.trim() && l.url?.trim()) }))
    .filter((c) => c.title?.trim() && c.links.length > 0);
  const legacyLinks = (config?.links || []).filter((l) => l.label?.trim() && l.url?.trim());
  const hasContact = !!(contact.email || contact.phone || contact.address);
  const hasSocial = SOCIAL_DEFS.some((s) => social[s.key as keyof typeof social]);
  const hasExtras = columns.length > 0 || legacyLinks.length > 0 || hasContact || hasSocial;
  const brandDisplay: FooterBrandDisplay = config?.brandDisplay || 'name';
  const logoPx = FOOTER_LOGO_PX[config?.logoSize || 'md'];

  return (
    <>
      {hasExtras && (
        <div
          className="grid grid-cols-2 gap-x-4 gap-y-5 border-b pb-5 sm:gap-x-8 sm:gap-y-8 sm:pb-8"
          style={{ borderColor: theme.border }}
        >
          <div className="col-span-2">
            <BrandLine storeName={storeName} storeSlug={storeSlug} storeLogo={storeLogo} brandDisplay={brandDisplay} logoPx={logoPx} theme={theme} />
            {footerNote && (
              <p className="mt-2 line-clamp-2 max-w-md text-[12px] leading-snug sm:mt-3 sm:line-clamp-none sm:text-sm sm:leading-relaxed" style={{ color: theme.muted }}>
                {footerNote}
              </p>
            )}
            {hasSocial && <div className="mt-3 sm:mt-4"><SocialRow social={social} theme={theme} /></div>}
          </div>

          {hasContact && (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider sm:mb-3 sm:text-sm" style={{ color: theme.foreground, fontFamily: theme.fontHeading }}>
                Contact
              </h4>
              <ContactList contact={contact} theme={theme} compact />
            </div>
          )}

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider sm:mb-3 sm:text-sm" style={{ color: theme.foreground, fontFamily: theme.fontHeading }}>
                {col.title}
              </h4>
              <ul className="space-y-1.5 text-[12px] sm:space-y-2 sm:text-sm">
                {col.links.map((l, i) => (
                  <li key={i}>
                    <Link href={storeLink(storeSlug, l.url)} className="line-clamp-1 hover:underline" style={{ color: theme.muted }}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {columns.length === 0 && legacyLinks.length > 0 && (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider sm:mb-3 sm:text-sm" style={{ color: theme.foreground, fontFamily: theme.fontHeading }}>
                Liens
              </h4>
              <ul className="space-y-1.5 text-[12px] sm:space-y-2 sm:text-sm">
                {legacyLinks.map((l, i) => (
                  <li key={i}>
                    <Link href={storeLink(storeSlug, l.url)} className="line-clamp-1 hover:underline" style={{ color: theme.muted }}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <BottomRow storeName={storeName} theme={theme} trailingNote={!hasExtras ? footerNote : undefined} />
    </>
  );
}

// ───────────────────────────────── 2. MINIMAL ─────────────────────────
// Une seule rangée : marque à gauche, liens inline au centre, social à droite.

function MinimalVariant({ storeName, storeSlug, storeLogo, config, theme, footerNote }: Props) {
  const social = config?.social || {};
  const columns = config?.columns || [];
  // Aplatit toutes les colonnes en une seule liste (le footer minimal n'a
  // pas de structure en groupes — juste des liens inline).
  const flatLinks = columns.flatMap((c) => c.links || []).filter((l) => l.label?.trim() && l.url?.trim()).slice(0, 8);
  const hasSocial = SOCIAL_DEFS.some((s) => social[s.key as keyof typeof social]);
  const brandDisplay: FooterBrandDisplay = config?.brandDisplay || 'name';
  const logoPx = FOOTER_LOGO_PX[config?.logoSize || 'md'];

  return (
    <>
      <div className="flex flex-col items-center gap-5 border-b pb-6 text-center sm:flex-row sm:justify-between sm:text-left" style={{ borderColor: theme.border }}>
        <BrandLine storeName={storeName} storeSlug={storeSlug} storeLogo={storeLogo} brandDisplay={brandDisplay} logoPx={logoPx} theme={theme} />
        {flatLinks.length > 0 && (
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs sm:text-sm" aria-label="Liens du footer">
            {flatLinks.map((l, i) => (
              <Link
                key={i}
                href={storeLink(storeSlug, l.url)}
                className="hover:underline"
                style={{ color: theme.muted, fontFamily: theme.fontBody }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
        {hasSocial && <SocialRow social={social} theme={theme} size="sm" />}
      </div>
      <BottomRow storeName={storeName} theme={theme} trailingNote={footerNote} />
    </>
  );
}

// ───────────────────────────────── 3. SPLIT ─────────────────────────
// 2 colonnes : brand + contact à gauche, gros bloc « rester en contact »
// avec social en grand et lien de contact mis en avant à droite.

function SplitVariant({ storeName, storeSlug, storeLogo, footerNote, config, theme }: Props) {
  const social = config?.social || {};
  const contact = config?.contact || {};
  const columns = (config?.columns || [])
    .map((c) => ({ ...c, links: (c.links || []).filter((l) => l.label?.trim() && l.url?.trim()) }))
    .filter((c) => c.title?.trim() && c.links.length > 0);
  const hasContact = !!(contact.email || contact.phone || contact.address);
  const hasSocial = SOCIAL_DEFS.some((s) => social[s.key as keyof typeof social]);
  const brandDisplay: FooterBrandDisplay = config?.brandDisplay || 'name';
  const logoPx = FOOTER_LOGO_PX[config?.logoSize || 'md'];

  return (
    <>
      <div className="grid gap-8 border-b pb-8 sm:grid-cols-[1.2fr_1fr] sm:gap-12 lg:gap-20" style={{ borderColor: theme.border }}>
        {/* Colonne gauche : brand + colonnes de liens */}
        <div>
          <BrandLine storeName={storeName} storeSlug={storeSlug} storeLogo={storeLogo} brandDisplay={brandDisplay} logoPx={logoPx} theme={theme} size="lg" />
          {footerNote && (
            <p className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: theme.muted, fontFamily: theme.fontBody }}>
              {footerNote}
            </p>
          )}
          {columns.length > 0 && (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {columns.map((col) => (
                <div key={col.title}>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.foreground, fontFamily: theme.fontHeading }}>
                    {col.title}
                  </h4>
                  <ul className="space-y-1.5 text-sm">
                    {col.links.map((l, i) => (
                      <li key={i}>
                        <Link href={storeLink(storeSlug, l.url)} className="hover:underline" style={{ color: theme.muted }}>
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Colonne droite : grand bloc contact avec accent */}
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: `linear-gradient(135deg, ${hexA(theme.primary, 0.08)}, ${hexA(theme.accent, 0.05)})`,
            border: `1px solid ${theme.border}`,
          }}
        >
          <h3 className="text-lg font-bold tracking-tight sm:text-xl" style={{ color: theme.foreground, fontFamily: theme.fontHeading }}>
            Restons en contact
          </h3>
          <p className="mt-1 text-sm" style={{ color: theme.muted, fontFamily: theme.fontBody }}>
            Une question ? Une commande ? On répond vite.
          </p>
          {hasContact && (
            <div className="mt-5 space-y-2">
              <ContactList contact={contact} theme={theme} />
            </div>
          )}
          {hasSocial && (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.muted }}>
                Réseaux
              </div>
              <SocialRow social={social} theme={theme} size="lg" />
            </div>
          )}
        </div>
      </div>
      <BottomRow storeName={storeName} theme={theme} />
    </>
  );
}

// ───────────────────────────────── 4. BOLD ─────────────────────────
// Énorme nom de marque qui occupe la largeur, tagline, et compact contact
// + colonnes en bas — visuel impactant, premium.

function BoldVariant({ storeName, storeSlug, storeLogo, footerNote, config, theme }: Props) {
  const social = config?.social || {};
  const contact = config?.contact || {};
  const columns = (config?.columns || [])
    .map((c) => ({ ...c, links: (c.links || []).filter((l) => l.label?.trim() && l.url?.trim()) }))
    .filter((c) => c.title?.trim() && c.links.length > 0);
  const flatLinks = columns.flatMap((c) => c.links).slice(0, 8);
  const hasContact = !!(contact.email || contact.phone || contact.address);
  const hasSocial = SOCIAL_DEFS.some((s) => social[s.key as keyof typeof social]);
  const brandDisplay: FooterBrandDisplay = config?.brandDisplay || 'name';
  const logoPx = FOOTER_LOGO_PX[config?.logoSize || 'md'];

  return (
    <>
      {/* Énorme nom */}
      <div className="border-b pb-8 sm:pb-12" style={{ borderColor: theme.border }}>
        <BrandLine storeName={storeName} storeSlug={storeSlug} storeLogo={storeLogo} brandDisplay={brandDisplay} logoPx={logoPx} theme={theme} size="xl" />
        {footerNote && (
          <p className="mt-4 max-w-3xl text-base leading-relaxed sm:text-lg" style={{ color: theme.muted, fontFamily: theme.fontBody }}>
            {footerNote}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {hasSocial && <SocialRow social={social} theme={theme} size="md" />}
          {hasContact && contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold hover:opacity-80"
              style={{ color: theme.primary, fontFamily: theme.fontHeading }}
            >
              <Mail className="h-4 w-4" />
              {contact.email}
            </a>
          )}
          {hasContact && contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold hover:opacity-80"
              style={{ color: theme.primary, fontFamily: theme.fontHeading }}
            >
              <Phone className="h-4 w-4" />
              {contact.phone}
            </a>
          )}
        </div>
      </div>

      {/* Liens inline + adresse */}
      {(flatLinks.length > 0 || contact.address) && (
        <div className="mt-6 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: theme.border }}>
          {flatLinks.length > 0 && (
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs sm:text-sm" aria-label="Liens">
              {flatLinks.map((l, i) => (
                <Link
                  key={i}
                  href={storeLink(storeSlug, l.url)}
                  className="hover:underline"
                  style={{ color: theme.muted, fontFamily: theme.fontBody }}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          {contact.address && (
            <span className="inline-flex items-start gap-2 text-xs sm:text-sm" style={{ color: theme.muted }}>
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {contact.address}
            </span>
          )}
        </div>
      )}

      <BottomRow storeName={storeName} theme={theme} />
    </>
  );
}
