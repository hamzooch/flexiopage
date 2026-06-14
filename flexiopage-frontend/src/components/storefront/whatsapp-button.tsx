'use client';

import { useEffect, useState } from 'react';

/**
 * Floating WhatsApp button — rendered on every storefront page when the
 * seller turns it on in /dashboard/stores/[id]/sections. Replaces the
 * previous in-store chatbot with a one-tap deep link to wa.me.
 *
 * Config (all from `store.settings.whatsapp`):
 *   - phoneNumber  E.164 (required)
 *   - message      pre-filled text in the wa.me URL
 *   - position     bottom-right | bottom-left | top-right | top-left
 *   - accentColor  hex (defaults to WhatsApp brand green #25D366)
 *   - pulse        when true, a subtle ring pulses around the FAB
 *
 * Self-contained (zero JS deps): all animations are inline keyframes.
 */

export interface WhatsappConfig {
  enabled?: boolean;
  phoneNumber?: string;
  message?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  accentColor?: string;
  pulse?: boolean;
}

// Bottom positions get a bigger mobile offset (80px) so the button clears
// the mobile sticky CTA bar on product pages AND the iOS safe-area inset on
// iPhones with a home-indicator. Desktop stays modest.
const POSITION_CLASSES: Record<NonNullable<WhatsappConfig['position']>, string> = {
  'bottom-right': 'bottom-20 right-4 sm:bottom-8 sm:right-6',
  'bottom-left':  'bottom-20 left-4 sm:bottom-8 sm:left-6',
  'top-right':    'top-20 right-4 sm:top-8 sm:right-6',
  'top-left':     'top-20 left-4 sm:top-8 sm:left-6',
};

/** Strip everything that's not a digit — wa.me expects no '+' / spaces / dashes. */
function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

export function WhatsappButton({ config }: { config?: WhatsappConfig }) {
  // Aperçu vendeur (`?preview=1`) → on masque le bouton pour ne pas couvrir
  // le rendu du storefront dans l'iframe du dashboard. On lit la query via
  // window.location plutôt que useSearchParams() pour ne pas forcer un
  // CSR-bailout sur les pages prerenderées qui embarquent ce composant.
  const [isPreviewIframe, setIsPreviewIframe] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsPreviewIframe(new URLSearchParams(window.location.search).get('preview') === '1');
    }
  }, []);
  if (isPreviewIframe) return null;

  if (!config?.enabled || !config.phoneNumber?.trim()) return null;

  const phone = normalizePhone(config.phoneNumber);
  if (!phone) return null;

  const accent = config.accentColor || '#25D366';
  const pulse = config.pulse !== false; // default ON
  const position = config.position || 'bottom-right';
  const positionClass = POSITION_CLASSES[position];

  const href = `https://wa.me/${phone}${
    config.message?.trim()
      ? `?text=${encodeURIComponent(config.message.trim())}`
      : ''
  }`;

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Discuter sur WhatsApp"
        className={`flexio-wa fixed z-50 grid h-14 w-14 place-items-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95 ${positionClass}`}
        style={{ backgroundColor: accent, color: '#ffffff' }}
      >
        {/* WhatsApp logo — inline SVG, no extra dep */}
        <svg
          viewBox="0 0 32 32"
          aria-hidden
          className="h-7 w-7"
          fill="currentColor"
        >
          <path d="M16.001 3C9.373 3 4 8.373 4 15c0 2.317.673 4.476 1.832 6.297L4 28l6.928-1.798A11.96 11.96 0 0 0 16 27c6.627 0 12-5.373 12-12s-5.373-12-12-12zm0 21.6a9.5 9.5 0 0 1-4.83-1.32l-.347-.205-4.114 1.069 1.098-4.013-.226-.36A9.55 9.55 0 0 1 6.4 15c0-5.302 4.298-9.6 9.6-9.6 5.302 0 9.6 4.298 9.6 9.6s-4.298 9.6-9.6 9.6zm5.452-7.135c-.299-.149-1.767-.872-2.04-.971-.273-.099-.472-.149-.671.149-.198.299-.769.971-.943 1.17-.174.198-.347.224-.646.075-.299-.149-1.262-.465-2.404-1.483-.888-.793-1.487-1.772-1.661-2.071-.174-.299-.018-.46.131-.609.134-.134.299-.347.448-.521.149-.174.198-.299.298-.498.099-.198.05-.373-.025-.521-.075-.149-.671-1.616-.918-2.214-.242-.581-.488-.502-.671-.512l-.572-.01c-.198 0-.521.075-.794.373-.273.299-1.041 1.018-1.041 2.484s1.066 2.882 1.215 3.082c.149.198 2.099 3.205 5.082 4.493.71.307 1.264.49 1.696.628.713.227 1.361.195 1.874.118.572-.085 1.767-.722 2.016-1.42.249-.697.249-1.295.174-1.42-.075-.124-.273-.198-.572-.347z" />
        </svg>
        {pulse && (
          <>
            <span
              aria-hidden
              className="flexio-wa-ring pointer-events-none absolute inset-0 rounded-full"
              style={{ border: `2px solid ${accent}` }}
            />
            <span
              aria-hidden
              className="flexio-wa-ring-2 pointer-events-none absolute inset-0 rounded-full"
              style={{ border: `2px solid ${accent}` }}
            />
          </>
        )}
      </a>
      <style>{`
        @keyframes flexioWaPulse {
          0%   { transform: scale(1);    opacity: 0.55; }
          70%  { transform: scale(1.85); opacity: 0;    }
          100% { transform: scale(1.85); opacity: 0;    }
        }
        .flexio-wa-ring,
        .flexio-wa-ring-2 {
          animation: flexioWaPulse 2.2s ease-out infinite;
        }
        .flexio-wa-ring-2 { animation-delay: 1.1s; }
        @media (prefers-reduced-motion: reduce) {
          .flexio-wa-ring, .flexio-wa-ring-2 { animation: none; opacity: 0; }
          .flexio-wa { transition: none !important; }
        }
      `}</style>
    </>
  );
}
