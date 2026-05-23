/**
 * Client-side dominant-color extraction for store logos.
 *
 * Loads the logo into an offscreen canvas, samples its pixels, drops the
 * background (transparent + near-white/near-black), quantizes the rest into
 * coarse buckets and returns the most representative brand colors — sorted
 * so vivid, frequent colors come first. Used by the appearance editor to
 * suggest a theme palette derived from the seller's own logo.
 *
 * Requires the image host to allow cross-origin reads (our /uploads route
 * sends `Access-Control-Allow-Origin: *`), otherwise the canvas is tainted
 * and `getImageData` throws — we surface that as a friendly error.
 */

export interface ExtractedColor {
  hex: string;
  /** 0..1 — share of sampled pixels falling in this color's bucket. */
  weight: number;
  /** 0..1 HSL saturation. */
  saturation: number;
  /** 0..1 HSL lightness. */
  lightness: number;
}

const MAX_DIM = 96; // downscale longest edge to this before sampling

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')
  );
}

/** RGB (0..255) → HSL (h in degrees, s/l in 0..1). */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

/** Smallest angular distance between two hues, in degrees (0..180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image du logo."));
    img.src = src;
  });
}

/**
 * Extract up to `max` dominant brand colors from a logo URL.
 *
 * @throws Error with a French, user-facing message on load/CORS failure.
 */
export async function extractLogoColors(
  src: string,
  max = 6
): Promise<ExtractedColor[]> {
  const img = await loadImage(src);

  const ratio = Math.min(1, MAX_DIM / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round((img.width || MAX_DIM) * ratio));
  const h = Math.max(1, Math.round((img.height || MAX_DIM) * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Le navigateur ne permet pas de lire les couleurs du logo.");
  ctx.drawImage(img, 0, 0, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // Tainted canvas — the host didn't allow cross-origin pixel reads.
    throw new Error("Les couleurs de ce logo n'ont pas pu être lues (image protégée).");
  }

  // Quantize into 16 levels/channel and accumulate per-bucket sums so the
  // representative hex is the bucket's average rather than its corner.
  interface Bucket {
    count: number;
    r: number;
    g: number;
    b: number;
  }
  const buckets = new Map<number, Bucket>();
  let sampled = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 130) continue; // transparent → background
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Drop near-white (paper/background) and near-black (outlines) so the
    // suggestion favors actual brand colors. Pure-grey pixels are skipped too.
    if (r > 244 && g > 244 && b > 244) continue;
    if (r < 14 && g < 14 && b < 14) continue;

    sampled++;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  if (sampled === 0) {
    throw new Error("Ce logo semble n'avoir que du blanc ou du noir — aucune couleur à extraire.");
  }

  // Average each bucket, compute HSL, then rank: frequency boosted by
  // saturation so a small vivid mark outweighs a large flat grey.
  const colors: ExtractedColor[] = Array.from(buckets.values())
    .map((bucket) => {
      const r = bucket.r / bucket.count;
      const g = bucket.g / bucket.count;
      const b = bucket.b / bucket.count;
      const [, s, l] = rgbToHsl(r, g, b);
      return {
        hex: toHex(r, g, b).toLowerCase(),
        weight: bucket.count / sampled,
        saturation: s,
        lightness: l,
      };
    })
    .sort(
      (x, y) =>
        y.weight * (0.35 + y.saturation) - x.weight * (0.35 + x.saturation)
    );

  // Merge perceptually-close colors so the palette isn't six near-identical
  // shades of the same brand color.
  const merged: ExtractedColor[] = [];
  for (const c of colors) {
    const [hc] = rgbToHsl(...hexToRgb(c.hex));
    const dup = merged.some((m) => {
      const [hm] = rgbToHsl(...hexToRgb(m.hex));
      const closeHue = hueDistance(hc, hm) < 18;
      const closeLight = Math.abs(c.lightness - m.lightness) < 0.12;
      return closeHue && closeLight;
    });
    if (!dup) merged.push(c);
    if (merged.length >= max) break;
  }

  return merged;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const n = parseInt(m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Pick a sensible (primary, accent) pair from an extracted palette.
 *
 * Primary = the most prominent reasonably-saturated color; accent = the next
 * color whose hue is clearly distinct, falling back to the second-most
 * prominent. Returns `null` when the palette is empty.
 */
export function suggestPrimaryAccent(
  colors: ExtractedColor[]
): { primary: string; accent: string } | null {
  if (colors.length === 0) return null;

  const primary =
    colors.find((c) => c.saturation > 0.18 && c.lightness > 0.12 && c.lightness < 0.92) ||
    colors[0];

  const [hp] = rgbToHsl(...hexToRgb(primary.hex));
  const accent =
    colors.find(
      (c) => c.hex !== primary.hex && hueDistance(hp, rgbToHsl(...hexToRgb(c.hex))[0]) > 24
    ) ||
    colors.find((c) => c.hex !== primary.hex) ||
    primary;

  return { primary: primary.hex, accent: accent.hex };
}
