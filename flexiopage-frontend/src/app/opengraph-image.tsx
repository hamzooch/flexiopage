import { ImageResponse } from 'next/og';

/**
 * Dynamic 1200×630 social-share card for /, /login, /register and every
 * route that doesn't override metadata.openGraph.images. Rendered on the
 * edge at request time, cached by Next, so we never ship a static PNG
 * (faster iteration when the wording or palette changes).
 *
 * If you swap the marketing message, update the headline text below and
 * Google/Facebook will pick up the new card within a few hours.
 */

export const runtime = 'edge';
export const alt = 'FlexioPage — Crée ta boutique en un clic';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background:
            'linear-gradient(135deg, #fbbf24 0%, #f97316 50%, #c2410c 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          position: 'relative',
        }}
      >
        {/* Decorative light blob — soft glow top-left */}
        <div
          style={{
            position: 'absolute',
            top: '-200px',
            left: '-150px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.18)',
            filter: 'blur(80px)',
          }}
        />
        {/* Decorative blob — bottom-right */}
        <div
          style={{
            position: 'absolute',
            bottom: '-200px',
            right: '-100px',
            width: '480px',
            height: '480px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)',
            filter: 'blur(90px)',
          }}
        />

        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '24px',
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '60px',
              fontWeight: 900,
              letterSpacing: '-2px',
            }}
          >
            F.
          </div>
          <div style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-1px' }}>
            FlexioPage
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            maxWidth: '900px',
          }}
        >
          <div
            style={{
              fontSize: '78px',
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: '-2px',
            }}
          >
            Crée ta boutique en un clic.
          </div>
          <div style={{ fontSize: '32px', fontWeight: 500, opacity: 0.92, lineHeight: 1.3 }}>
            Landing pages IA · Paiement à la livraison · MogaDelivery inclus
          </div>
        </div>

        {/* Footer row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '24px',
            fontWeight: 600,
            opacity: 0.85,
          }}
        >
          <div>flexiopage.com</div>
          <div>Tu paies seulement quand tu vends.</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
