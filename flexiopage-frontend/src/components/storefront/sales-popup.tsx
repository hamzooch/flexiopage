'use client';

/**
 * Social-proof "Sales Popup" — small toast that cycles through recent
 * purchase notifications on the storefront ("Ahmed from Casablanca just
 * bought Product X"). Config lives in `store.settings.salesPopup`;
 * events come from /api/public/stores/:slug/sales-popup-events (real
 * orders anonymized server-side + optional seller-authored fake list).
 *
 * Trigger logic:
 *   - Wait `initialDelaySeconds` after mount.
 *   - Show a popup for ~5s.
 *   - Wait `intervalSeconds` between two popups.
 *   - Cycle through the events; when we reach the end, we loop.
 *
 * The popup is dismissible per-visit (X button hides it until the next
 * cycle). We deliberately don't persist dismissal — this widget is
 * intentionally recurring social proof, not a one-shot lead capture.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingBag, X } from 'lucide-react';

export interface SalesPopupConfig {
  enabled?: boolean;
  mode?: 'real' | 'fake' | 'hybrid';
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  initialDelaySeconds?: number;
  intervalSeconds?: number;
  accentColor?: string;
}

interface SalesEvent {
  name: string;
  city?: string;
  product: string;
  minutesAgo?: number;
}

interface Props {
  storeSlug: string;
  config?: SalesPopupConfig;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const VISIBLE_MS = 5000;

function positionClasses(pos?: SalesPopupConfig['position']): string {
  switch (pos) {
    case 'bottom-right': return 'bottom-4 right-4';
    case 'top-left':     return 'top-4 left-4';
    case 'top-right':    return 'top-4 right-4';
    case 'bottom-left':
    default:             return 'bottom-4 left-4';
  }
}

function formatAgo(minutes: number | undefined): string {
  const m = Math.max(1, minutes ?? Math.floor(Math.random() * 55) + 3);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export function SalesPopup({ storeSlug, config }: Props) {
  // Never render inside the seller preview iframe — the dashboard uses
  // ?preview=1 to keep decorative widgets out of the WYSIWYG edit view.
  const [isPreview, setIsPreview] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsPreview(new URLSearchParams(window.location.search).get('preview') === '1');
    }
  }, []);

  const enabled = !!config?.enabled && !isPreview;
  const initialDelayMs = Math.max(0, (config?.initialDelaySeconds ?? 10) * 1000);
  const intervalMs = Math.max(5000, (config?.intervalSeconds ?? 25) * 1000);
  const accent = config?.accentColor || 'var(--primary, #6d28d9)';

  const [events, setEvents] = useState<SalesEvent[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const cancelledRef = useRef(false);

  // ── Fetch the events list once per mount ────────────────────────
  useEffect(() => {
    if (!enabled) return;
    cancelledRef.current = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/stores/${storeSlug}/sales-popup-events`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { events?: SalesEvent[] };
        if (cancelledRef.current) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
      } catch {
        // Silent — social proof isn't critical, don't spam the console.
      }
    })();
    return () => { cancelledRef.current = true; };
  }, [enabled, storeSlug]);

  // ── Cycle timer: show → hide → wait → next event ───────────────
  useEffect(() => {
    if (!enabled || dismissed || events.length === 0) return;

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let nextTimer: ReturnType<typeof setTimeout> | undefined;

    const showAt = index === 0 ? initialDelayMs : intervalMs;
    const showTimer = setTimeout(() => {
      setVisible(true);
      hideTimer = setTimeout(() => {
        setVisible(false);
        nextTimer = setTimeout(() => {
          setIndex((i) => (i + 1) % events.length);
        }, 400); // leave time for the exit animation
      }, VISIBLE_MS);
    }, showAt);

    return () => {
      clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
      if (nextTimer) clearTimeout(nextTimer);
    };
  }, [enabled, dismissed, events, index, initialDelayMs, intervalMs]);

  const current = useMemo(() => events[index], [events, index]);

  if (!enabled || dismissed || !current) return null;

  const posCls = positionClasses(config?.position);

  return (
    <div
      className={`sales-popup fixed z-[55] ${posCls} pointer-events-none`}
      aria-live="polite"
      aria-hidden={!visible}
    >
      <div
        className={`sales-popup-card ${visible ? 'sp-in' : 'sp-out'} pointer-events-auto flex max-w-[320px] items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-2xl`}
        role="status"
      >
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-md"
          style={{ background: accent }}
          aria-hidden
        >
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-foreground">
            <span className="font-semibold">{current.name}</span>
            {current.city ? <> de <span className="font-semibold">{current.city}</span></> : null}
            {' '}vient d&apos;acheter
          </p>
          <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground">
            {current.product}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {formatAgo(current.minutesAgo)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Fermer"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <style jsx>{`
        @keyframes spIn {
          from { transform: translateY(12px); opacity: 0 }
          to   { transform: translateY(0);    opacity: 1 }
        }
        @keyframes spOut {
          from { transform: translateY(0);    opacity: 1 }
          to   { transform: translateY(12px); opacity: 0 }
        }
        .sp-in  { animation: spIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .sp-out { animation: spOut 0.3s ease-in both; }
      `}</style>
    </div>
  );
}
