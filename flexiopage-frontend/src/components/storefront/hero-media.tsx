/**
 * Renders the hero background media — picks between an HTML5 <video>
 * (mp4/webm/mov), a YouTube/Vimeo iframe, or a plain background image
 * based on the URL shape. Designed to sit behind the hero text overlay.
 *
 * The wrapper is positioned absolutely (`inset-0`) so the parent just
 * needs to be relatively positioned to host it.
 */
import Image from 'next/image';
import { mediaUrl } from '@/lib/utils';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';

interface Props {
  /** Direct file URL OR YouTube/Vimeo watch URL (desktop). */
  videoUrl?: string;
  /** Fallback poster image — desktop (utilisée aussi quand pas de vidéo). */
  imageUrl?: string;
  /** Vidéo dédiée mobile (portrait/square). Vide → on utilise `videoUrl`. */
  videoUrlMobile?: string;
  /** Image dédiée mobile (portrait/square). Vide → on utilise `imageUrl`. */
  imageUrlMobile?: string;
  /** Tint overlay applied on top (matches the seller's hero look). */
  overlay?: 'none' | 'light' | 'dark';
  /** Alt text when an image fallback is used. */
  alt?: string;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function HeroMedia({
  videoUrl,
  imageUrl,
  videoUrlMobile,
  imageUrlMobile,
  overlay = 'dark',
  alt = '',
}: Props) {
  const overlayLayer =
    overlay === 'dark'  ? 'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.55))'
    : overlay === 'light' ? 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.45))'
    : 'transparent';

  // Si le vendeur a fourni un média mobile spécifique (image OU vidéo),
  // on rend deux blocs : desktop visible md+, mobile visible <md. Sinon
  // un seul bloc qui s'adapte (comportement historique).
  const hasMobileImage = !!imageUrlMobile?.trim();
  const hasMobileVideo = !!videoUrlMobile?.trim();
  const hasMobileVariant = hasMobileImage || hasMobileVideo;

  // ── 1. No video → image fallback (or nothing) ───────────────────
  if (!videoUrl?.trim() && !hasMobileVideo) {
    if (!imageUrl?.trim() && !hasMobileImage) return null;
    return (
      <>
        {/* Image desktop (avec fallback mobile auto si pas de version mobile) */}
        {imageUrl?.trim() && (
          <Image
            src={mediaUrl(imageUrl) || imageUrl}
            alt={alt}
            fill
            priority
            sizes="100vw"
            placeholder="blur"
            blurDataURL={IMAGE_BLUR_DATA_URL}
            className={
              hasMobileImage
                ? 'hidden md:block object-cover'
                : 'object-contain sm:object-cover'
            }
          />
        )}
        {/* Image mobile spécifique (portrait/carré) */}
        {hasMobileImage && (
          <Image
            src={mediaUrl(imageUrlMobile!) || imageUrlMobile!}
            alt={alt}
            fill
            priority
            sizes="100vw"
            placeholder="blur"
            blurDataURL={IMAGE_BLUR_DATA_URL}
            className="block md:hidden object-cover"
          />
        )}
        <div className="absolute inset-0" style={{ background: overlayLayer }} aria-hidden />
      </>
    );
  }
  // À ce stade : il y a au moins une vidéo (desktop ou mobile).
  // ── 2. Direct file (mp4/webm/etc.) ──────────────────────────────
  // Si seul un mobile a été fourni, on l'utilise aussi côté desktop par
  // sécurité (le vendeur peut avoir laissé le desktop vide volontairement).
  const desktopVideoRaw = videoUrl?.trim() ? videoUrl : videoUrlMobile;
  const mobileVideoRaw = videoUrlMobile?.trim() && hasMobileVariant ? videoUrlMobile : null;
  const resolvedVideo = mediaUrl(desktopVideoRaw || '') || desktopVideoRaw || '';
  if (isDirectVideo(resolvedVideo)) {
    const resolvedMobileVideo = mobileVideoRaw ? mediaUrl(mobileVideoRaw) || mobileVideoRaw : null;
    return (
      <>
        <video
          className={
            mobileVideoRaw
              ? 'hidden md:block absolute inset-0 h-full w-full object-cover'
              : 'absolute inset-0 h-full w-full object-contain sm:object-cover'
          }
          autoPlay muted loop playsInline
          poster={imageUrl ? (mediaUrl(imageUrl) || imageUrl) : undefined}
        >
          <source src={resolvedVideo} />
        </video>
        {resolvedMobileVideo && (
          <video
            className="block md:hidden absolute inset-0 h-full w-full object-cover"
            autoPlay muted loop playsInline
            poster={imageUrlMobile ? (mediaUrl(imageUrlMobile) || imageUrlMobile) : (imageUrl ? (mediaUrl(imageUrl) || imageUrl) : undefined)}
          >
            <source src={resolvedMobileVideo} />
          </video>
        )}
        <div className="absolute inset-0" style={{ background: overlayLayer }} aria-hidden />
      </>
    );
  }

  // ── 3. YouTube ──────────────────────────────────────────────────
  // Pour YT/Vimeo on garde la même vidéo sur tous les écrans (rare d'avoir
  // une version mobile dédiée sur ces plateformes).
  const videoUrlForEmbed = videoUrl || videoUrlMobile || '';
  const yt = videoUrlForEmbed ? extractYouTubeId(videoUrlForEmbed) : null;
  if (yt) {
    // YouTube needs `playlist=ID` to loop a single video. `mute=1` is
    // required for autoplay to work in Chrome/Safari.
    const src =
      `https://www.youtube.com/embed/${yt}` +
      `?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&modestbranding=1&playsinline=1&rel=0`;
    return (
      <>
        <iframe
          src={src}
          allow="autoplay; encrypted-media; picture-in-picture"
          title="Hero video"
          // Overscale the iframe so the YouTube chrome (top bar that
          // appears on hover) stays out of view.
          className="absolute left-1/2 top-1/2 h-[120%] w-[150%] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          frameBorder={0}
        />
        <div className="absolute inset-0" style={{ background: overlayLayer }} aria-hidden />
      </>
    );
  }

  // ── 4. Vimeo ────────────────────────────────────────────────────
  const vimeoId = videoUrlForEmbed ? extractVimeoId(videoUrlForEmbed) : null;
  if (vimeoId) {
    const src = `https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1&background=1`;
    return (
      <>
        <iframe
          src={src}
          allow="autoplay; fullscreen; picture-in-picture"
          title="Hero video"
          className="absolute left-1/2 top-1/2 h-[120%] w-[150%] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          frameBorder={0}
        />
        <div className="absolute inset-0" style={{ background: overlayLayer }} aria-hidden />
      </>
    );
  }

  // Unknown URL — fall back to image if available.
  if (imageUrl) {
    return (
      <>
        <Image
          src={mediaUrl(imageUrl) || imageUrl}
          alt={alt}
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          blurDataURL={IMAGE_BLUR_DATA_URL}
          // Mobile: contain → image entière visible. Desktop: cover → fond plein.
          className="object-contain sm:object-cover"
        />
        <div className="absolute inset-0" style={{ background: overlayLayer }} aria-hidden />
      </>
    );
  }
  return null;
}
