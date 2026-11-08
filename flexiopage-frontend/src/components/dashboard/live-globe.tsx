'use client';

/**
 * Live globe widget — Shopify-style. Rotating 3D sphere rendered via `cobe`
 * (canvas WebGL). Les continents (Afrique, Europe, …) sont tracés en sombre
 * sur un océan clair en thème clair, et l'inverse en thème sombre. Le globe
 * s'ouvre face à l'Afrique et l'Europe.
 * Deux séries de marqueurs :
 *
 *   - points oranges : visiteurs actifs sur la boutique (5 dernières min)
 *   - points verts   : commandes fraîches (30 dernières min). Une
 *     commande qui arrive déclenche un pulse de célébration pour que
 *     le vendeur voie l'event sans le rater.
 *
 * Le globe est un détail d'ambiance — les chiffres (visiteurs live,
 * commandes récentes) restent l'info principale. On respecte
 * `prefers-reduced-motion` : plus de rotation, plus de pulse, juste des
 * points statiques.
 *
 * cobe 2 dessine une seule fois à la création, avant que la texture de la
 * carte soit prête, et n'appelle pas `onRender`. Sans boucle `update()`,
 * la sphère reste un disque noir. On pilote donc le rendu nous-mêmes.
 *
 * Side-effects :
 *   - un seul canvas WebGL par montage (cleanup au démontage)
 *   - poll de l'endpoint live-globe toutes les 15 s quand l'onglet est visible
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import createGlobe, { type COBEOptions } from 'cobe';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Globe2, ShoppingBag, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface GlobePoint {
  id: string;
  lat: number;
  lng: number;
  country?: string;
  ts: string;
}

type Marker = GlobePoint & { kind: 'visitor' | 'order' };

interface LiveGlobeProps {
  storeId: string | null;
  /** Fallback pays pour centrer le globe quand il n'y a encore aucun point. */
  fallbackCountry?: string;
  className?: string;
}

/** Centroïdes grossiers pour pointer le globe quand on n'a aucun visiteur. */
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  FR: [46.6, 2.5],
  SN: [14.5, -14.5],
  CI: [7.5, -5.5],
  TN: [34.0, 9.5],
  DZ: [28.0, 2.5],
  MA: [31.8, -7.1],
  ML: [17.6, -4.0],
  BJ: [9.3, 2.3],
  TG: [8.6, 0.8],
  CM: [7.4, 12.5],
  BF: [12.2, -1.6],
  US: [39.0, -98.0],
  GB: [54.0, -2.0],
};

/**
 * Inclinaison qui laisse l'Afrique au centre et l'Europe dans la moitié
 * haute — la bande que les boutiques voient le plus souvent.
 */
const GLOBE_THETA = 0.22;
/** Longitude « maison » : méridien ~8°E, Afrique + Europe face caméra. */
const HOME_LNG = 8;
/** Rayon du globe dans l'espace clip de cobe (avant `scale`). */
const GLOBE_RADIUS = 0.8;
const GLOBE_SCALE = 1.08;

/**
 * Phi cobe qui place `lng` au centre de la face visible.
 * (270° − longitude) : la formule (lng+180) regardait le Pacifique,
 * donc l'Afrique et l'Europe restaient dans le dos du cercle.
 */
function phiFacingLng(lng: number): number {
  return ((270 - lng) * Math.PI) / 180;
}

/** Projette un point (lat, lng) sur le canvas, même rotation que cobe. */
function projectOnGlobe(
  lat: number,
  lng: number,
  phi: number,
  scale: number,
): { x: number; y: number; front: boolean } {
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const cosLat = Math.cos(latR);
  const x = cosLat * Math.cos(lngR);
  const y = Math.sin(latR);
  const z = -cosLat * Math.sin(lngR);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const ct = Math.cos(GLOBE_THETA);
  const st = Math.sin(GLOBE_THETA);
  const lx = c * x + s * z;
  const ly = s * st * x + ct * y - c * st * z;
  const lz = -s * ct * x + st * y + c * ct * z;
  const r = GLOBE_RADIUS * scale;
  return {
    x: ((lx * r + 1) / 2) * 100,
    y: ((1 - (ly * r + 1) / 2)) * 100,
    front: lz > 0.12,
  };
}

const regionNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' });
  } catch {
    return null;
  }
})();

function countryLabel(code?: string): string {
  if (!code) return 'Pays inconnu';
  const iso = code.toUpperCase();
  try {
    return regionNames?.of(iso) || iso;
  } catch {
    return iso;
  }
}

function flagEmoji(code?: string): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '🌍';
  return code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

interface CountryPin {
  code: string;
  label: string;
  lat: number;
  lng: number;
  visitors: number;
  orders: number;
}

export function LiveGlobe({ storeId, fallbackCountry, className }: LiveGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const [visitors, setVisitors] = useState<GlobePoint[]>([]);
  const [orders, setOrders] = useState<GlobePoint[]>([]);
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  const [celebration, setCelebration] = useState<{ id: string } | null>(null);
  const [dark, setDark] = useState(false);

  // Dark/light theme — on lit la classe `.dark` sur <html> et on écoute les
  // changements via MutationObserver pour recréer le globe au bon theme.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const read = () => setDark(html.classList.contains('dark'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // Fetch — poll every 15s while the tab is visible. Cheap endpoint, indexed
  // slice on last 30 min, safe to hit often.
  useEffect(() => {
    if (!storeId) {
      setVisitors([]);
      setOrders([]);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      storesApi
        .getLiveGlobe(storeId)
        .then((res) => {
          if (cancelled) return;
          const nextOrders = res.data.orders ?? [];
          const prev = prevOrderIdsRef.current;
          // Détecte la 1re commande nouvelle depuis le dernier fetch pour la
          // célébration. On ne traite qu'un seul pulse à la fois (ordres
          // triés par date desc par le backend).
          const freshest = nextOrders.find((o) => !prev.has(o.id));
          if (freshest && prev.size > 0) setCelebration({ id: freshest.id });
          prevOrderIdsRef.current = new Set(nextOrders.map((o) => o.id));
          setVisitors(res.data.visitors ?? []);
          setOrders(nextOrders);
        })
        .catch(() => { /* silent — le globe n'est jamais critique */ });
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [storeId]);

  // Clear celebration marker after the animation runs.
  useEffect(() => {
    if (!celebration) return;
    const id = window.setTimeout(() => setCelebration(null), 2400);
    return () => window.clearTimeout(id);
  }, [celebration]);

  const markers: Marker[] = useMemo(() => {
    const vis: Marker[] = visitors.map((v) => ({ ...v, kind: 'visitor' as const }));
    const ord: Marker[] = orders.map((o) => ({ ...o, kind: 'order' as const }));
    // Orders last so they render above visitors when stacked.
    return [...vis, ...ord];
  }, [visitors, orders]);

  // Cible de phi (longitude) : par défaut, la commande/visiteur le plus
  // récent ou le centroïde pays du vendeur. Le globe tourne doucement vers
  // cette cible sans à-coup, pour donner l'impression qu'il "suit" l'activité.
  const targetPhi = useMemo(() => {
    const recent = orders[0] ?? visitors[0];
    if (recent) return phiFacingLng(recent.lng);
    const fb = fallbackCountry && COUNTRY_CENTROIDS[fallbackCountry.toUpperCase()];
    if (fb) return phiFacingLng(fb[1]);
    return phiFacingLng(HOME_LNG);
  }, [orders, visitors, fallbackCountry]);

  const pins: CountryPin[] = useMemo(() => {
    const byCountry = new Map<string, CountryPin>();
    const touch = (m: Marker) => {
      const code = (m.country || '').toUpperCase();
      const key = /^[A-Z]{2}$/.test(code) ? code : `~${m.lat.toFixed(1)},${m.lng.toFixed(1)}`;
      const cur = byCountry.get(key) ?? {
        code: key,
        label: countryLabel(/^[A-Z]{2}$/.test(code) ? code : undefined),
        lat: 0,
        lng: 0,
        visitors: 0,
        orders: 0,
      };
      const n = cur.visitors + cur.orders;
      cur.lat = (cur.lat * n + m.lat) / (n + 1);
      cur.lng = (cur.lng * n + m.lng) / (n + 1);
      if (m.kind === 'order') cur.orders += 1;
      else cur.visitors += 1;
      byCountry.set(key, cur);
    };
    markers.forEach(touch);
    return [...byCountry.values()]
      .sort((a, b) => b.orders + b.visitors - (a.orders + a.visitors))
      .slice(0, 8);
  }, [markers]);

  // Globe lifecycle — un seul renderer par montage. On lit `markers` et
  // `targetPhi` via refs pour éviter de détruire/recréer le canvas à chaque
  // tick (coûteux : WebGL context init).
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const targetPhiRef = useRef(targetPhi);
  targetPhiRef.current = targetPhi;
  const reducedRef = useRef(!!prefersReducedMotion);
  reducedRef.current = !!prefersReducedMotion;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const phiRef = useRef(targetPhi);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let phi = targetPhiRef.current;
    let width = 0;
    let globe: ReturnType<typeof createGlobe> | null = null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cancelled = false;

    const buildCobeMarkers = () =>
      markersRef.current.map((m) => ({
        location: [m.lat, m.lng] as [number, number],
        size: m.kind === 'order' ? 0.07 : 0.05,
        color: (m.kind === 'order' ? [0.08, 0.78, 0.48] : [1, 0.48, 0.08]) as [number, number, number],
      }));

    const placeLabels = () => {
      const layer = labelsRef.current;
      if (!layer) return;
      layer.querySelectorAll<HTMLElement>('[data-pin]').forEach((node) => {
        const lat = Number(node.dataset.lat);
        const lng = Number(node.dataset.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const p = projectOnGlobe(lat, lng, phi, GLOBE_SCALE);
        node.style.left = `${p.x}%`;
        node.style.top = `${p.y}%`;
        node.style.opacity = p.front ? '1' : '0';
      });
    };

    let raf = 0;
    let sentWidth = 0;

    const palette = (): Pick<
      COBEOptions,
      'dark' | 'diffuse' | 'mapSamples' | 'mapBrightness' | 'mapBaseBrightness' | 'baseColor' | 'glowColor' | 'opacity'
    > => {
      if (darkRef.current) {
        return {
          // Terres claires sur un océan bleu nuit — pas un disque noir plein.
          dark: 1,
          diffuse: 1.2,
          mapSamples: 28000,
          mapBrightness: 5.5,
          mapBaseBrightness: 0.18,
          baseColor: [0.62, 0.74, 0.98],
          glowColor: [0.18, 0.3, 0.58],
          opacity: 0.96,
        };
      }
      return {
        // Thème clair : océan gris-bleu, continents sombres. Un baseColor
        // blanc faisait disparaître la sphère dans la carte.
        dark: 0,
        diffuse: 1.25,
        mapSamples: 28000,
        mapBrightness: 7,
        mapBaseBrightness: 0,
        baseColor: [0.7, 0.77, 0.9],
        glowColor: [0.78, 0.86, 1],
        opacity: 1,
      };
    };

    const tick = () => {
      if (cancelled || !globe) return;
      if (!reducedRef.current) {
        // Tour lent. phi part déjà face à l'Afrique et l'Europe
        // (ou au dernier visiteur), donc ces régions sont les premières visibles.
        phi += 0.0014;
      }
      phiRef.current = phi;
      const buf = Math.round(width * dpr);
      const patch: Partial<COBEOptions> = {
        phi,
        theta: GLOBE_THETA,
        markers: buildCobeMarkers(),
      };
      if (buf !== sentWidth && buf > 0) {
        patch.width = buf;
        patch.height = buf;
        sentWidth = buf;
      }
      globe.update(patch);
      placeLabels();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      width = canvas.offsetWidth;
      if (width < 8 || globe || cancelled) return;
      const buf = Math.round(width * dpr);
      sentWidth = buf;
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: buf,
        height: buf,
        phi,
        theta: GLOBE_THETA,
        markerColor: [1, 0.48, 0.08],
        scale: GLOBE_SCALE,
        markers: buildCobeMarkers(),
        ...palette(),
      });
      canvas.style.opacity = '0';
      requestAnimationFrame(() => {
        canvas.style.transition = 'opacity 700ms ease-out';
        canvas.style.opacity = '1';
      });
      raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(() => {
      width = canvas.offsetWidth;
      start();
    });
    ro.observe(canvas);
    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      globe?.destroy();
      const wrapper = canvas.parentElement;
      const host = wrapper?.parentElement;
      if (
        wrapper &&
        host &&
        wrapper.tagName === 'DIV' &&
        wrapper !== host &&
        wrapper.childNodes.length <= 2
      ) {
        host.insertBefore(canvas, wrapper);
        wrapper.remove();
      }
    };
    // On recrée le globe uniquement quand le thème change — le reste passe
    // par les refs pour rester fluide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  const visitorCount = visitors.length;
  const orderCount = orders.length;
  const empty = visitorCount === 0 && orderCount === 0;

  const celebrationMarker = useMemo(() => {
    if (!celebration) return null;
    return orders.find((o) => o.id === celebration.id) ?? null;
  }, [celebration, orders]);

  const celebrationPos = useMemo(() => {
    if (!celebrationMarker) return null;
    const p = projectOnGlobe(celebrationMarker.lat, celebrationMarker.lng, targetPhi, GLOBE_SCALE);
    if (!p.front) return null;
    return { left: `${p.x}%`, top: `${p.y}%` };
  }, [celebrationMarker, targetPhi]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-r from-background to-muted/30 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white">
              <Globe2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Activité live</div>
              <div className="text-[11px] text-muted-foreground truncate">
                Visiteurs et commandes en temps réel
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <LiveBadge
              icon={<Users className="h-3 w-3" />}
              count={visitorCount}
              color="orange"
              label={`${visitorCount} visiteur${visitorCount > 1 ? 's' : ''}`}
            />
            <LiveBadge
              icon={<ShoppingBag className="h-3 w-3" />}
              count={orderCount}
              color="emerald"
              label={`${orderCount} commande${orderCount > 1 ? 's' : ''}`}
            />
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[240px] sm:max-w-[300px] lg:max-w-[360px]">
          <canvas
            ref={canvasRef}
            className="block h-full w-full"
            aria-hidden
          />

          <div ref={labelsRef} className="pointer-events-none absolute inset-0">
            {pins.map((pin) => (
              <div
                key={pin.code}
                data-pin=""
                data-lat={pin.lat}
                data-lng={pin.lng}
                className="absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-sm ring-1 ring-black/10"
                style={{ opacity: 0 }}
              >
                <span className="mr-1" aria-hidden>
                  {flagEmoji(pin.code.startsWith('~') ? undefined : pin.code)}
                </span>
                {pin.label}
              </div>
            ))}
          </div>

          {/* Overlay de célébration pour la nouvelle commande — onde expansive +
              burst scale. On respecte reduced-motion : simple fade-in alors. */}
          <AnimatePresence>
            {celebrationPos && (
              <motion.div
                key={celebration?.id}
                className="pointer-events-none absolute"
                style={celebrationPos}
                initial={{ opacity: 0, scale: 0.4, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.8, x: '-50%', y: '-50%' }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              >
                {!prefersReducedMotion && (
                  <motion.span
                    className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400"
                    initial={{ opacity: 0.7, scale: 1 }}
                    animate={{ opacity: 0, scale: 6 }}
                    transition={{ duration: 1.4, ease: 'easeOut' }}
                  />
                )}
                <span className="relative block h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.9)] ring-2 ring-emerald-200 dark:ring-emerald-900" />
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {empty && (
          <p className="border-t px-4 py-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            L&apos;Afrique et l&apos;Europe sont face à toi. Dès qu&apos;un acheteur ouvre ta boutique, son pays s&apos;allume en orange.
          </p>
        )}

        {pins.length > 0 && (
          <ul className="space-y-1 border-t px-4 py-2">
            {pins.map((pin) => (
              <li key={pin.code} className="flex items-center gap-2 text-[12px]">
                <span aria-hidden>{flagEmoji(pin.code.startsWith('~') ? undefined : pin.code)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{pin.label}</span>
                {pin.visitors > 0 && (
                  <span className="shrink-0 tabular-nums text-orange-600 dark:text-orange-400">
                    {pin.visitors} visiteur{pin.visitors > 1 ? 's' : ''}
                  </span>
                )}
                {pin.orders > 0 && (
                  <span className="shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400">
                    {pin.orders} commande{pin.orders > 1 ? 's' : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <Legend />
      </CardContent>
    </Card>
  );
}

function LiveBadge({
  icon,
  count,
  color,
  label,
}: {
  icon: React.ReactNode;
  count: number;
  color: 'orange' | 'emerald';
  label: string;
}) {
  const palette =
    color === 'orange'
      ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  const dot =
    color === 'orange' ? 'bg-orange-500' : 'bg-emerald-500';
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        palette,
      )}
    >
      {count > 0 && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', dot)} />
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dot)} />
        </span>
      )}
      {icon}
      <span>{count}</span>
    </span>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
        Visiteur actif
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        Commande &lt; 30 min
      </span>
    </div>
  );
}
