'use client';

/**
 * Studio IA — Hub.
 *
 * Landing sombre premium (glassmorphism + accents orange). Chaque outil
 * (Affiche / Landing / Vidéo / UGC) est une carte qui deep-link vers
 * `/dashboard/studio/creator?tab=…&source=…`.
 *
 * Le vrai éditeur (formulaires + preview + génération) reste dans
 * `/dashboard/studio/creator`. Ce hub est volontairement léger : découverte,
 * pricing en un coup d'œil, et accès rapide aux créations récentes.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Wand2, LayoutTemplate, Video as VideoIcon, Mic2,
  ArrowRight, Loader2, Wallet, Plus, ImageIcon, Play, Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storesApi, type AiGenerationItem } from '@/lib/api';
import { useWalletStore } from '@/stores/wallet-store';
import { mediaUrl, cn } from '@/lib/utils';

interface StoreLite { _id: string; name: string; slug: string }
type RecentKind = 'all' | 'poster' | 'landing' | 'video';

interface ToolCard {
  key: 'poster' | 'landing' | 'video' | 'ugc';
  href: string;
  label: string;
  tagline: string;
  bullets: string[];
  duration: string;
  icon: typeof Sparkles;
  accent: 'amber' | 'sky' | 'violet' | 'orange';
  featured?: boolean;
  costKey: 'poster' | 'landing' | 'video' | 'video_ugc_talking';
}

const TOOLS: ToolCard[] = [
  {
    key: 'poster',
    href: '/dashboard/studio/creator?tab=poster',
    label: 'Affiche',
    tagline: 'Post ou story prête à publier',
    bullets: ['Story 9:16', 'Post carré', 'Bannière 40:21'],
    duration: '~30 sec',
    icon: LayoutTemplate,
    accent: 'amber',
    costKey: 'poster',
  },
  {
    key: 'landing',
    href: '/dashboard/studio/creator?tab=landing',
    label: 'Landing',
    tagline: 'Page de vente 9:16 en une image',
    bullets: ['Hero + bénéfices', 'Témoignages', 'CTA visible'],
    duration: '~45 sec',
    icon: Wand2,
    accent: 'sky',
    costKey: 'landing',
  },
  {
    key: 'video',
    href: '/dashboard/studio/creator?tab=video',
    label: 'Vidéo produit',
    tagline: '5 à 12 s avec voix off optionnelle',
    bullets: ['720p MP4', 'Voix IA', 'Prêt TikTok/Reels'],
    duration: '~90 sec',
    icon: VideoIcon,
    accent: 'violet',
    costKey: 'video',
  },
  {
    key: 'ugc',
    href: '/dashboard/studio/creator?tab=video&source=ugc',
    label: 'UGC — Avatar',
    tagline: 'Testimonial parlant, comme un vrai créateur',
    bullets: ['Lip-sync avatar', 'Script personnalisé', 'Mode lifestyle'],
    duration: '~2 min',
    icon: Mic2,
    accent: 'orange',
    featured: true,
    costKey: 'video_ugc_talking',
  },
];

export default function StudioHubPage() {
  const router = useRouter();
  const wallet = useWalletStore((s) => s.wallet);
  const refreshWallet = useWalletStore((s) => s.refresh);

  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState('');
  const [recent, setRecent] = useState<AiGenerationItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [filter, setFilter] = useState<RecentKind>('all');

  useEffect(() => { refreshWallet(); }, [refreshWallet]);

  useEffect(() => {
    storesApi.list()
      .then((res) => {
        const list = res.data.stores as StoreLite[];
        setStores(list);
        if (list[0]) setStoreId(list[0]._id);
      })
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    if (!storeId) { setRecent([]); setRecentLoading(false); return; }
    setRecentLoading(true);
    Promise.all([
      storesApi.listAiGenerations(storeId, { kind: 'poster', limit: 4 }).then((r) => r.data.items).catch(() => []),
      storesApi.listAiGenerations(storeId, { kind: 'landing', limit: 4 }).then((r) => r.data.items).catch(() => []),
      storesApi.listAiGenerations(storeId, { kind: 'video', limit: 4 }).then((r) => r.data.items).catch(() => []),
    ]).then(([p, l, v]) => {
      const merged = [...p, ...l, ...v].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRecent(merged);
      setRecentLoading(false);
    });
  }, [storeId]);

  const filtered = useMemo(
    () => filter === 'all' ? recent : recent.filter((r) => r.kind === filter),
    [recent, filter],
  );

  const balance = wallet ? Math.round(wallet.aiBalance) : null;

  const costFor = (key: ToolCard['costKey']): number | null => {
    if (!wallet) return null;
    const c = wallet.aiCosts as Record<string, number | undefined>;
    return c[key] ?? c.landing ?? null;
  };

  const goToCreator = (href: string) => {
    const url = storeId
      ? `${href}${href.includes('?') ? '&' : '?'}storeId=${storeId}`
      : href;
    router.push(url);
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] -mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8">
      {/* Fond sombre premium — gradient radial orange en top-left, discret. */}
      <div className="absolute inset-0 bg-[#0a0a0f] overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute top-0 right-0 h-[400px] w-[400px] rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.04),transparent_60%)]" />
      </div>

      <div className="relative px-4 md:px-6 lg:px-8 pt-6 md:pt-10 pb-16 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 mb-3 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-orange-400" />
              Powered by Claude · FLUX · Seedance · Hedra
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Studio IA
            </h1>
            <p className="mt-2 text-white/60 text-sm md:text-base max-w-xl">
              Crée visuels, vidéos et voix off pour tes produits en moins d&apos;une minute. Choisis un outil pour commencer.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Link
              href="/dashboard/wallet"
              className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur hover:border-orange-400/40 hover:bg-white/10 transition"
            >
              <Wallet className="h-4 w-4 text-orange-400" />
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-white/50 leading-none">Solde IA</div>
                <div className="text-white font-semibold text-sm">
                  {balance === null ? '—' : balance.toLocaleString('fr-FR')} tokens
                </div>
              </div>
              <Plus className="h-3.5 w-3.5 text-white/40 group-hover:text-orange-400 transition" />
            </Link>
            {stores.length > 1 && (
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 backdrop-blur focus:outline-none focus:border-orange-400/40"
              >
                {stores.map((s) => <option key={s._id} value={s._id} className="bg-[#0a0a0f]">{s.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Grid outils */}
        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <ToolTile
              key={t.key}
              tool={t}
              cost={costFor(t.costKey)}
              onClick={() => goToCreator(t.href)}
            />
          ))}
        </div>

        {/* Section récentes */}
        <div className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Créations récentes</h2>
              <p className="text-xs text-white/50">Reprends une génération pour la re-télécharger ou t&apos;en inspirer.</p>
            </div>
            <FilterChips value={filter} onChange={setFilter} />
          </div>

          {recentLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[9/16] rounded-xl bg-white/5 border border-white/5 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
              <ImageIcon className="h-8 w-8 text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/60">
                {recent.length === 0
                  ? 'Aucune création pour l\'instant — choisis un outil ci-dessus.'
                  : 'Aucune création de ce type. Change le filtre pour voir les autres.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.slice(0, 12).map((item) => (
                <RecentTile key={item._id} item={item} storeId={storeId} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

const ACCENTS: Record<ToolCard['accent'], { glow: string; icon: string; ring: string }> = {
  amber:  { glow: 'from-amber-500/20 to-transparent',  icon: 'text-amber-300 bg-amber-500/10 border-amber-400/20',  ring: 'group-hover:border-amber-400/40' },
  sky:    { glow: 'from-sky-500/20 to-transparent',    icon: 'text-sky-300 bg-sky-500/10 border-sky-400/20',        ring: 'group-hover:border-sky-400/40' },
  violet: { glow: 'from-violet-500/20 to-transparent', icon: 'text-violet-300 bg-violet-500/10 border-violet-400/20', ring: 'group-hover:border-violet-400/40' },
  orange: { glow: 'from-orange-500/30 to-transparent', icon: 'text-orange-200 bg-orange-500/15 border-orange-400/30', ring: 'group-hover:border-orange-400/60' },
};

function ToolTile({ tool, cost, onClick }: { tool: ToolCard; cost: number | null; onClick: () => void }) {
  const A = ACCENTS[tool.accent];
  const Icon = tool.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left backdrop-blur-xl transition-all',
        'hover:bg-white/[0.06] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/40',
        A.ring,
        tool.featured && 'border-orange-400/30 bg-gradient-to-br from-orange-500/[0.08] to-white/[0.02]',
      )}
    >
      {/* Glow accent en top-left */}
      <div className={cn('absolute -top-20 -left-20 h-40 w-40 rounded-full bg-gradient-to-br blur-2xl opacity-60', A.glow)} />

      {tool.featured && (
        <div className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-orange-500/20 border border-orange-400/40 px-2 py-0.5 text-[10px] font-semibold text-orange-200 uppercase tracking-wider">
          <Flame className="h-3 w-3" /> Premium
        </div>
      )}

      <div className="relative">
        <div className={cn('inline-flex h-11 w-11 items-center justify-center rounded-xl border', A.icon)}>
          <Icon className="h-5 w-5" />
        </div>

        <h3 className="mt-4 text-xl font-semibold text-white">{tool.label}</h3>
        <p className="mt-1 text-sm text-white/60">{tool.tagline}</p>

        <ul className="mt-4 space-y-1.5">
          {tool.bullets.map((b) => (
            <li key={b} className="flex items-center gap-2 text-xs text-white/50">
              <span className="h-1 w-1 rounded-full bg-white/40" /> {b}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center justify-between pt-4 border-t border-white/5">
          <div className="text-[11px] text-white/40">
            {tool.duration}
            {cost !== null && (
              <span className="ml-2 text-white/60 font-medium">
                · {cost.toLocaleString('fr-FR')} tokens
              </span>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition" />
        </div>
      </div>
    </button>
  );
}

function FilterChips({ value, onChange }: { value: RecentKind; onChange: (v: RecentKind) => void }) {
  const items: Array<{ key: RecentKind; label: string }> = [
    { key: 'all',     label: 'Tout' },
    { key: 'poster',  label: 'Affiche' },
    { key: 'landing', label: 'Landing' },
    { key: 'video',   label: 'Vidéo' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1 backdrop-blur">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition',
            value === it.key
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/50 hover:text-white/80',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function RecentTile({ item, storeId }: { item: AiGenerationItem; storeId: string }) {
  const isVideo = item.kind === 'video';
  const thumb = item.preview?.thumbnailUrl;
  const tab = item.kind;
  const href = `/dashboard/studio/creator?tab=${tab}${storeId ? `&storeId=${storeId}` : ''}`;

  return (
    <Link
      href={href}
      className="group relative block aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/30 transition"
    >
      {thumb && mediaUrl(thumb) ? (
        <Image
          src={mediaUrl(thumb) as string}
          alt={item.preview?.title || item.kind}
          fill
          unoptimized
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(min-width:1024px) 240px, (min-width:640px) 33vw, 50vw"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-white/20">
          {isVideo ? <VideoIcon className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
        </div>
      )}

      {isVideo && (
        <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-80 group-hover:opacity-100 transition">
          <div className="h-9 w-9 rounded-full bg-white/95 grid place-items-center shadow-lg">
            <Play className="h-4 w-4 text-black translate-x-[1px]" fill="currentColor" />
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-white/70">
          {item.kind === 'poster' ? 'Affiche' : item.kind === 'landing' ? 'Landing' : 'Vidéo'}
        </div>
      </div>
    </Link>
  );
}
