/**
 * Shared blur placeholder for next/image on the storefront. Shown
 * immediately while the real image streams in, then smoothly cross-faded
 * to the actual image (next/image handles the transition).
 *
 * Implementation: a 10×10 SVG with a soft diagonal gradient that reads
 * like a skeleton on every background. base64-encoded inline so the
 * browser never makes an extra request — total payload ≈ 220 bytes.
 *
 * Use as:
 *   <Image ... placeholder="blur" blurDataURL={IMAGE_BLUR_DATA_URL} />
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#eef0f3"/><stop offset="50%" stop-color="#f7f8fa"/><stop offset="100%" stop-color="#e6e9ee"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>`;

export const IMAGE_BLUR_DATA_URL = `data:image/svg+xml;base64,${
  typeof window === 'undefined'
    ? Buffer.from(SVG).toString('base64')
    : btoa(SVG)
}`;
