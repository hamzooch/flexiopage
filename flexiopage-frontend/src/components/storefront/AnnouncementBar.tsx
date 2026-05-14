/**
 * Storefront announcement bar — a thin strip above the navbar for short
 * promo lines ("Livraison gratuite", "Promo −40%", …).
 *
 * Two modes:
 *   fixed    — messages shown statically, centered, separated by a glyph
 *   animated — continuous scrolling ticker (CSS marquee, see globals.css)
 *
 * Colors come from the active theme (primary background / primary-fg text)
 * so it adopts each theme's identity automatically.
 */
import type { ThemeTokens } from '@/data/store-themes';

export interface AnnouncementBarConfig {
  enabled?: boolean;
  messages?: string[];
  mode?: 'fixed' | 'animated';
}

const SEPARATOR = '✦';

export function AnnouncementBar({
  config,
  theme,
}: {
  config?: AnnouncementBarConfig;
  theme: ThemeTokens;
}) {
  const messages = (config?.messages || []).map((m) => m.trim()).filter(Boolean);
  if (!config?.enabled || messages.length === 0) return null;

  const mode = config.mode || 'fixed';
  const style = { backgroundColor: theme.primary, color: theme.primaryFg };

  if (mode === 'animated') {
    // Duplicate the sequence so translateX(-50%) loops seamlessly. Duration
    // scales with content length to keep a steady, readable speed.
    const totalChars = messages.join('').length;
    const durationS = Math.max(15, Math.round(totalChars * 0.4));
    const sequence = [...messages, ...messages];
    return (
      <div className="overflow-hidden" style={style} role="status" aria-label="Annonces de la boutique">
        <div
          className="flexio-marquee-track py-2 text-xs font-semibold tracking-wide sm:text-sm"
          style={{ animationDuration: `${durationS}s` }}
        >
          {sequence.map((m, i) => (
            <span key={i} className="inline-flex items-center" aria-hidden={i >= messages.length}>
              <span className="px-6">{m}</span>
              <span aria-hidden className="opacity-50">{SEPARATOR}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // fixed — static, centered, messages separated by the glyph
  return (
    <div
      className="py-2 text-center text-xs font-semibold tracking-wide sm:text-sm"
      style={style}
      role="status"
      aria-label="Annonces de la boutique"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4">
        {messages.map((m, i) => (
          <span key={i} className="inline-flex items-center gap-3">
            {i > 0 && <span aria-hidden className="opacity-50">{SEPARATOR}</span>}
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
