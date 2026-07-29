'use client';

/**
 * Auto-play cinematic reel — meant to be viewed on a phone in portrait
 * and screen-recorded for Facebook / TikTok / Reels ads.
 *
 * Full-viewport, no chrome, no scrollbars. Timeline is scripted (12 s
 * total by default) with dashboard "shots" that transition smoothly.
 *
 * URL: /demo/reel   (optionally ?autoplay=1 — default on)
 *
 * How to use:
 *   1. Open on your phone in portrait
 *   2. Start the phone's screen recorder
 *   3. Tap "Rejouer" if needed to restart the timeline
 *   4. Import into CapCut to add voiceover / music / final text overlay
 */
import { useEffect, useState } from 'react';
import { Play, Pause, RotateCw } from 'lucide-react';

interface Shot {
  /** Ms from the start of the reel. */
  at: number;
  /** Ms — how long this shot lingers before the next one starts. */
  duration: number;
  render: (progress: number) => React.ReactNode;
}

const TOTAL_MS = 15_000; // 15-seconds reel

export default function ReelPage() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const start = Date.now() - t;
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= TOTAL_MS) {
        setT(TOTAL_MS);
        setPlaying(false);
        return;
      }
      setT(elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, t]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black overflow-hidden">
      {/* 9:16 canvas — locked ratio so it's identical on any device */}
      <div className="relative aspect-[9/16] h-full max-w-full overflow-hidden bg-gradient-to-br from-fuchsia-500 via-orange-500 to-rose-600">
        <Timeline t={t} />
        <ProgressBar t={t} />

        {/* Discreet playback controls at the very bottom — outside the safe area for recording */}
        <div className="absolute bottom-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-white backdrop-blur-md">
          <button
            type="button"
            onClick={() => { setT(0); setPlaying(true); }}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"
            aria-label="Rejouer"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="pl-1 text-[10px] font-semibold tabular-nums">
            {Math.floor(t / 1000)}s / {Math.floor(TOTAL_MS / 1000)}s
          </span>
        </div>
      </div>
    </div>
  );
}

/** The scripted animation timeline. Each shot has an entry animation + hold. */
function Timeline({ t }: { t: number }) {
  return (
    <div className="absolute inset-0">
      <Shot1_Intro visible={t >= 0 && t < 3000} progress={progressIn(t, 0, 3000)} />
      <Shot2_Notification visible={t >= 3000 && t < 6000} progress={progressIn(t, 3000, 6000)} />
      <Shot3_RevenueKpi visible={t >= 6000 && t < 9000} progress={progressIn(t, 6000, 9000)} />
      <Shot4_MethodBreakdown visible={t >= 9000 && t < 12000} progress={progressIn(t, 9000, 12000)} />
      <Shot5_CtaOutro visible={t >= 12000 && t <= 15000} progress={progressIn(t, 12000, 15000)} />
    </div>
  );
}

/** 0 → 1 over [start, end], easing baked in. */
function progressIn(t: number, start: number, end: number): number {
  if (t < start) return 0;
  if (t > end) return 1;
  const raw = (t - start) / (end - start);
  return 1 - Math.pow(1 - raw, 2);
}

function Shot1_Intro({ visible, progress }: { visible: boolean; progress: number }) {
  if (!visible) return null;
  const scale = 0.85 + progress * 0.15;
  const opacity = Math.min(1, progress * 3);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
      <div style={{ transform: `scale(${scale})`, opacity }} className="mb-6 grid h-24 w-24 place-items-center rounded-3xl bg-white/10 backdrop-blur-md shadow-2xl">
        <span className="text-5xl font-black tracking-tight">F</span>
      </div>
      <h1
        style={{ opacity, transform: `translateY(${(1 - progress) * 40}px)` }}
        className="text-4xl font-black leading-tight tracking-tight sm:text-5xl"
      >
        Ta boutique digitale
        <br />
        qui vend
        <br />
        <span className="italic text-yellow-200">pendant que tu dors</span>
      </h1>
      <p
        style={{ opacity, transform: `translateY(${(1 - progress) * 60}px)` }}
        className="mt-6 text-lg font-semibold text-white/90"
      >
        FlexioPage
      </p>
    </div>
  );
}

function Shot2_Notification({ visible, progress }: { visible: boolean; progress: number }) {
  if (!visible) return null;
  const notifSlide = -80 + progress * 80; // slide in from top
  const kachingScale = progress > 0.5 ? 1 + (progress - 0.5) * 0.4 : 1;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
      <div className="mb-6 text-xl font-bold uppercase tracking-widest text-yellow-200">
        Cha-ching 🔔
      </div>

      {/* Fake phone lock-screen notification */}
      <div
        style={{ transform: `translateY(${notifSlide}px)`, opacity: Math.min(1, progress * 2) }}
        className="w-full max-w-[320px] rounded-2xl bg-black/40 p-4 backdrop-blur-xl ring-1 ring-white/20 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-orange-500 text-lg font-black text-white">
            F
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-white">FlexioPage</span>
              <span className="shrink-0 text-[10px] text-white/60">à l&apos;instant</span>
            </div>
            <div className="mt-0.5 text-[13px] font-semibold text-white">Nouvelle commande ORD-1247</div>
            <div className="mt-0.5 text-[12px] text-white/80">Fatou Diallo · 14&nbsp;990 FCFA</div>
          </div>
        </div>
      </div>

      <div
        style={{ transform: `scale(${kachingScale})`, opacity: Math.min(1, (progress - 0.4) * 3) }}
        className="mt-8 text-3xl font-black text-yellow-200"
      >
        +14&nbsp;990 FCFA
      </div>
      <div className="mt-2 text-sm text-white/80">Une nouvelle vente. Automatique.</div>
    </div>
  );
}

function Shot3_RevenueKpi({ visible, progress }: { visible: boolean; progress: number }) {
  if (!visible) return null;
  const revenue = Math.round(progress * 4_800_000);
  const orders = Math.round(progress * 480);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-white">
      <div className="mb-4 text-xs font-bold uppercase tracking-widest text-white/70">
        Ta boutique en 30 jours
      </div>
      <div className="w-full max-w-[320px] rounded-3xl bg-white/10 p-6 backdrop-blur-xl ring-1 ring-white/20 shadow-2xl">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">Revenu total</div>
        <div className="mt-1 text-4xl font-black tabular-nums">
          {revenue.toLocaleString('fr-FR')}
        </div>
        <div className="text-lg font-bold text-yellow-200">FCFA</div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">Ventes</div>
            <div className="mt-0.5 text-2xl font-black tabular-nums">{orders}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">Taux succès</div>
            <div className="mt-0.5 text-2xl font-black tabular-nums text-emerald-300">
              {(progress * 96).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Growing bar chart illustration */}
        <div className="mt-4 flex h-16 items-end gap-1">
          {Array.from({ length: 12 }).map((_, i) => {
            const barP = Math.max(0, Math.min(1, (progress * 12 - i) / 3));
            const h = 20 + i * 6;
            return (
              <div
                key={i}
                style={{ height: `${h * barP}%` }}
                className="flex-1 rounded-sm bg-gradient-to-t from-yellow-300 to-white"
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Shot4_MethodBreakdown({ visible, progress }: { visible: boolean; progress: number }) {
  if (!visible) return null;
  const methods = [
    { label: 'Wave',         pct: 45, color: 'from-cyan-400 to-blue-500', emoji: '🌊' },
    { label: 'Orange Money', pct: 30, color: 'from-orange-400 to-orange-600', emoji: '🟠' },
    { label: 'MTN MoMo',     pct: 15, color: 'from-yellow-300 to-amber-500', emoji: '🟡' },
    { label: 'Moov Money',   pct:  5, color: 'from-sky-400 to-indigo-500', emoji: '🔵' },
    { label: 'Carte',        pct:  5, color: 'from-slate-300 to-slate-500', emoji: '💳' },
  ];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-white">
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/70">
        Encaisse en Mobile Money
      </div>
      <div className="mb-4 text-2xl font-black leading-tight text-center">
        Wave · OM · MTN · Moov
      </div>
      <div className="w-full max-w-[320px] space-y-2.5">
        {methods.map((m, i) => {
          const p = Math.max(0, Math.min(1, progress * 2.5 - i * 0.15));
          return (
            <div key={m.label} style={{ opacity: p }} className="rounded-xl bg-white/10 p-3 backdrop-blur-md ring-1 ring-white/10">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-lg">{m.emoji}</span>
                <span className="flex-1 text-sm font-semibold">{m.label}</span>
                <span className="text-sm font-black tabular-nums">{Math.round(m.pct * p)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/20">
                <div
                  style={{ width: `${m.pct * p}%` }}
                  className={`h-full rounded-full bg-gradient-to-r ${m.color}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Shot5_CtaOutro({ visible, progress }: { visible: boolean; progress: number }) {
  if (!visible) return null;
  const scale = 0.9 + progress * 0.1;
  const pulseScale = 1 + Math.sin(progress * Math.PI * 4) * 0.03;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center text-white">
      <div style={{ opacity: Math.min(1, progress * 2), transform: `scale(${scale})` }}>
        <div className="text-5xl font-black leading-tight tracking-tight sm:text-6xl">
          Lance ta
          <br />
          boutique digitale
          <br />
          <span className="text-yellow-200">gratuitement</span>
        </div>
      </div>

      <div
        style={{ opacity: Math.min(1, (progress - 0.3) * 3), transform: `scale(${pulseScale})` }}
        className="mt-4 rounded-full bg-white px-10 py-4 text-lg font-black text-fuchsia-700 shadow-2xl"
      >
        FlexioPage.com
      </div>

      <div style={{ opacity: Math.min(1, (progress - 0.5) * 3) }} className="mt-2 text-sm font-semibold text-white/90">
        En 3 minutes. Sans carte bancaire.
      </div>
    </div>
  );
}

function ProgressBar({ t }: { t: number }) {
  const w = Math.min(100, (t / TOTAL_MS) * 100);
  return (
    <div className="absolute left-0 right-0 top-0 h-1 bg-white/10">
      <div style={{ width: `${w}%` }} className="h-full bg-white transition-none" />
    </div>
  );
}
