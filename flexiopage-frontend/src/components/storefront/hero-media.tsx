/**
 * Renders the hero background media — picks between an HTML5 <video>
 * (mp4/webm/mov), a YouTube/Vimeo iframe, or a plain background image
 * based on the URL shape. Designed to sit behind the hero text overlay.
 *
 * The wrapper is positioned absolutely (`inset-0`) so the parent just
 * needs to be relatively positioned to host it.
 */
import { mediaUrl } from '@/lib/utils';

interface Props {
  /** Direct file URL OR YouTube/Vimeo watch URL. */
  videoUrl?: string;
  /** Fallback poster image — also used when no video is configured. */
  imageUrl?: string;
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

export function HeroMedia({ videoUrl, imageUrl, overlay = 'dark', alt = '' }: Props) {
  const overlayLayer =
    overlay === 'dark'  ? 'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.55))'
    : overlay === 'light' ? 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.45))'
    : 'transparent';

  // ── 1. No video → image fallback (or nothing) ───────────────────
  if (!videoUrl?.trim()) {
    if (!imageUrl?.trim()) return null;
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(imageUrl) || imageUrl}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: overlayLayer }} aria-hidden />
      </>
    );
  }

  // ── 2. Direct file (mp4/webm/etc.) ──────────────────────────────
  const resolvedVideo = mediaUrl(videoUrl) || videoUrl;
  if (isDirectVideo(resolvedVideo)) {
    return (
      <>
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          // Poster speeds up the perceived load + provides graceful
          // fallback on browsers that block autoplay.
          poster={imageUrl ? (mediaUrl(imageUrl) || imageUrl) : undefined}
        >
          <source src={resolvedVideo} />
        </video>
        <div className="absolute inset-0" style={{ background: overlayLayer }} aria-hidden />
      </>
    );
  }

  // ── 3. YouTube ──────────────────────────────────────────────────
  const yt = extractYouTubeId(videoUrl);
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
  const vimeoId = extractVimeoId(videoUrl);
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(imageUrl) || imageUrl} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: overlayLayer }} aria-hidden />
      </>
    );
  }
  return null;
}
