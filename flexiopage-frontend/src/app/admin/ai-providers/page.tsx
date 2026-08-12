'use client';

/**
 * Admin — Fournisseurs IA utilisés par FlexioPage.
 *
 * Catalogue statique des services LLM/IA externes intégrés dans la plateforme,
 * enrichi d'un statut « configuré / non configuré » lu côté backend (env vars
 * présentes) + des liens vers les consoles où le vrai suivi de conso $$$ se
 * fait. La page /admin/ai-consumption reste l'endroit pour voir la conso
 * agrégée côté FlexioPage (tokens débités par utilisateur).
 *
 * Aucune clé API n'est jamais exposée : le backend renvoie uniquement des
 * booléens et les noms de modèles publics (déjà présents dans .env.example).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { adminApi } from '@/lib/api';
import {
  Loader2,
  Sparkles,
  Check,
  X,
  ExternalLink,
  Info,
  KeyRound,
  BookOpen,
  BarChart3,
  CreditCard,
} from 'lucide-react';

type ProviderId = 'anthropic' | 'openrouter' | 'openai' | 'fal';

interface ProviderStatus {
  id: ProviderId;
  envVar: string;
  configured: boolean;
  primaryModel?: string | null;
  fallbackModel?: string | null;
  llmModel?: string | null;
  imageModel?: string | null;
  avatarModel?: string | null;
  imagesEnabled?: boolean;
}

interface PricingRow {
  /** Ex. `fal-ai/flux/schnell` — cliquable vers la page modèle sur fal. */
  model: string;
  /** Ce à quoi sert ce modèle chez FlexioPage. */
  purpose: string;
  /** Unité de facturation (ex. "1 image 1MP", "1M tokens output", "5s vidéo 1080p"). */
  unit: string;
  /** Prix indicatif — préfixer `~` pour signaler que c'est un ordre de grandeur.
   *  On garde en USD car c'est la devise de facturation de fal.ai. */
  priceUsd: string;
  /** Note libre (ex. "prix pass-through selon LLM choisi", "varie avec la taille"). */
  note?: string;
}

interface ProviderCatalog {
  id: ProviderId;
  name: string;
  tagline: string;
  /** Ce que FlexioPage fait avec ce provider (2-4 features). */
  usedFor: string[];
  /** Lien direct vers la page de suivi de conso / billing. */
  usageUrl: string;
  /** Fallback : dashboard principal si l'URL de conso n'est pas stable. */
  dashboardUrl: string;
  /** Doc API — utile pour l'équipe technique. */
  docsUrl: string;
  /** Page tarifs officielle. */
  pricingUrl: string;
  /** Palette du gradient d'entête (from-… to-…). */
  accent: string;
  /** Où le vendeur récupère sa clé (obtenu au signup provider). */
  keyOrigin: string;
  /** Coûts par modèle (uniquement les providers "à la génération" comme fal).
   *  Prix indicatifs — la vérité vit sur la page pricingUrl officielle. */
  pricing?: PricingRow[];
}

const PROVIDERS: ProviderCatalog[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    tagline: 'LLM principal — Claude Haiku 4.5 & Sonnet 4.5. Prompt caching activé.',
    usedFor: [
      'Chatbot Messenger / WhatsApp (`messenger-bot`)',
      'Botstore — chatbot sur la storefront',
      'Classification d\'intention côté bot',
    ],
    usageUrl: 'https://console.anthropic.com/settings/usage',
    dashboardUrl: 'https://console.anthropic.com/',
    docsUrl: 'https://docs.claude.com/en/docs',
    pricingUrl: 'https://www.anthropic.com/pricing',
    accent: 'from-orange-500 to-amber-600',
    keyOrigin: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'Proxy multi-provider — utilisé en fallback du chatbot pour FR/EN (routing coût).',
    usedFor: [
      'Fallback LLM pour messenger-bot en français / anglais',
      'Bascule automatique si Anthropic direct échoue',
      'Accès à des modèles alternatifs (OpenAI, Google) via une seule clé',
    ],
    usageUrl: 'https://openrouter.ai/activity',
    dashboardUrl: 'https://openrouter.ai/settings/credits',
    docsUrl: 'https://openrouter.ai/docs',
    pricingUrl: 'https://openrouter.ai/models',
    accent: 'from-violet-500 to-purple-600',
    keyOrigin: 'https://openrouter.ai/settings/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'Optionnel — utilisé pour la génération de landing pages IA.',
    usedFor: [
      'Génération de contenu pour les landing pages (fallback templates)',
      'Non requis pour le chatbot (Anthropic assure)',
    ],
    usageUrl: 'https://platform.openai.com/usage',
    dashboardUrl: 'https://platform.openai.com/',
    docsUrl: 'https://platform.openai.com/docs',
    pricingUrl: 'https://openai.com/api/pricing',
    accent: 'from-emerald-500 to-teal-600',
    keyOrigin: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'fal',
    name: 'fal.ai',
    tagline: 'LLM + génération d\'images (FLUX, nano-banana) pour les landing pages IA.',
    usedFor: [
      'Landing pages IA — texte via any-llm (Claude/GPT/Gemini)',
      'Images héro, galerie, produits (nano-banana par défaut)',
      'Avatars pour les blocs témoignages',
    ],
    usageUrl: 'https://fal.ai/dashboard/usage',
    dashboardUrl: 'https://fal.ai/dashboard',
    docsUrl: 'https://fal.ai/docs',
    pricingUrl: 'https://fal.ai/pricing',
    accent: 'from-fuchsia-500 to-pink-600',
    keyOrigin: 'https://fal.ai/dashboard/keys',
    // Coûts par modèle — ordre de grandeur (source: fal.ai/pricing).
    // Le prix exact peut varier selon résolution, durée, tokens. Le lien
    // « Tarifs » en bas de la carte renvoie vers la source de vérité.
    pricing: [
      // ── Images (utilisés dans landing IA + génération produit) ──
      {
        model: 'fal-ai/flux/schnell',
        purpose: 'Landing IA — génération image rapide (défaut)',
        unit: '1 image 1MP',
        priceUsd: '$0.003',
      },
      {
        model: 'fal-ai/flux-pro/v1',
        purpose: 'Landing IA — image premium (hero, produits)',
        unit: '1 image 1MP',
        priceUsd: '$0.05',
      },
      {
        model: 'fal-ai/flux-pro/kontext',
        purpose: 'Édition image basée sur contexte (retouches)',
        unit: '1 image',
        priceUsd: '$0.04',
      },
      {
        model: 'fal-ai/flux-realism',
        purpose: 'Portraits / photos ultra-réalistes',
        unit: '1 image 1MP',
        priceUsd: '$0.05',
      },
      {
        model: 'fal-ai/nano-banana',
        purpose: 'Google Gemini Flash Image — génération éco',
        unit: '1 image',
        priceUsd: '$0.039',
      },
      {
        model: 'fal-ai/nano-banana/edit',
        purpose: 'Édition d\'image (variations, in-painting)',
        unit: '1 image',
        priceUsd: '$0.039',
      },
      {
        model: 'fal-ai/ideogram/v3',
        purpose: 'Génération image avec texte lisible (posters)',
        unit: '1 image',
        priceUsd: '$0.08',
      },
      // ── Utilitaires image (upscale, background removal, captioning) ──
      {
        model: 'fal-ai/clarity-upscaler',
        purpose: 'Upscale HD des visuels produits',
        unit: '1 image',
        priceUsd: '~$0.03',
        note: 'Varie selon résolution de sortie',
      },
      {
        model: 'fal-ai/rembg',
        purpose: 'Suppression de fond automatique',
        unit: '1 image',
        priceUsd: '$0.001',
      },
      {
        model: 'fal-ai/imageutils/rembg',
        purpose: 'Alias imageutils — rembg + resize/crop',
        unit: '1 image',
        priceUsd: '$0.001',
      },
      {
        model: 'fal-ai/florence-2-large/more-detailed-caption',
        purpose: 'Alt-text automatique (accessibilité, SEO)',
        unit: '1 image',
        priceUsd: '$0.003',
      },
      // ── LLM (any-llm route vers différents providers, prix pass-through) ──
      {
        model: 'fal-ai/any-llm',
        purpose: 'Router LLM — copywriting landings, descriptions produit',
        unit: '1M tokens (in+out)',
        priceUsd: '$0.72 – $18',
        note: 'Prix pass-through — dépend du modèle (Llama 3.3 → Claude Sonnet)',
      },
      {
        model: 'fal-ai/any-llm/vision',
        purpose: 'LLM avec vision — analyse d\'images uploadées',
        unit: '1M tokens',
        priceUsd: '$3 – $15',
        note: 'Claude 3.5 Sonnet vision par défaut',
      },
      // ── Vidéo (Seedance — pas encore intégré, prévu) ──
      {
        model: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
        purpose: 'Vidéo produit économique (à intégrer)',
        unit: '5s en 720p',
        priceUsd: '$0.18',
        note: 'ByteDance Seedance Lite — non encore branché',
      },
      {
        model: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
        purpose: 'Vidéo produit premium (à intégrer)',
        unit: '5s en 1080p',
        priceUsd: '$0.62',
        note: 'ByteDance Seedance Pro — non encore branché',
      },
    ],
  },
];

export default function AdminAiProvidersPage() {
  const [status, setStatus] = useState<ProviderStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await adminApi.getAiProviders();
        setStatus(res.data.providers);
        setCheckedAt(res.data.checkedAt);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getStatus = (id: ProviderId): ProviderStatus | undefined =>
    status?.find((p) => p.id === id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" />
          Fournisseurs IA
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Services LLM et IA externes intégrés dans FlexioPage. Chaque carte pointe vers la
          console du fournisseur — c'est là que se fait le vrai suivi de facturation et de quota.
        </p>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p>
              Cette page liste où <strong>surveiller la consommation en dollars</strong> côté
              fournisseur. Pour la conso agrégée côté FlexioPage (tokens débités par vendeur), va
              sur{' '}
              <Link href="/admin/ai-consumption" className="font-medium text-primary hover:underline">
                Conso IA
              </Link>
              .
            </p>
            <p className="mt-1 text-muted-foreground">
              Le statut « configuré » signifie que la variable d'environnement correspondante est
              renseignée sur ce déploiement — la clé elle-même n'est jamais exposée.
            </p>
          </div>
        </div>
      </div>

      {loading || !status ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.id} provider={p} status={getStatus(p.id)} />
          ))}
        </div>
      )}

      {checkedAt && (
        <p className="text-center text-[11px] text-muted-foreground">
          Statut vérifié à {new Date(checkedAt).toLocaleString('fr-FR')}
        </p>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  status,
}: {
  provider: ProviderCatalog;
  status?: ProviderStatus;
}) {
  const configured = !!status?.configured;

  // Petits chips pour afficher les modèles / options remontés par le backend.
  const details: Array<{ label: string; value: string }> = [];
  if (status?.primaryModel) details.push({ label: 'Modèle principal', value: status.primaryModel });
  if (status?.fallbackModel) details.push({ label: 'Modèle fallback', value: status.fallbackModel });
  if (status?.llmModel) details.push({ label: 'LLM', value: status.llmModel });
  if (status?.imageModel) details.push({ label: 'Modèle image', value: status.imageModel });
  if (status?.avatarModel && status.avatarModel !== status.imageModel) {
    details.push({ label: 'Avatars', value: status.avatarModel });
  }
  if (status?.imagesEnabled === false) {
    details.push({ label: 'Images', value: 'Désactivé (LANDING_AI_IMAGES_ENABLED=false)' });
  }

  return (
    <Card className="overflow-hidden">
      <div className={cn('h-1.5 w-full bg-gradient-to-r', provider.accent)} aria-hidden />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className={cn('grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm', provider.accent)}>
                <Sparkles className="h-4 w-4" />
              </span>
              {provider.name}
            </CardTitle>
            <CardDescription className="mt-1">{provider.tagline}</CardDescription>
          </div>
          {configured ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <Check className="h-3 w-3" strokeWidth={3} />
              Configuré
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700">
              <X className="h-3 w-3" strokeWidth={3} />
              Non configuré
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Env var */}
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
          <code className="font-mono text-[11px]">{status?.envVar || 'inconnu'}</code>
        </div>

        {/* Used for */}
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Utilisé pour
          </div>
          <ul className="space-y-1">
            {provider.usedFor.map((u, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-snug">
                <span
                  className={cn(
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br',
                    provider.accent,
                  )}
                />
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Detected models */}
        {details.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Configuration détectée
            </div>
            <div className="space-y-1">
              {details.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1 text-[11px]">
                  <span className="text-muted-foreground">{d.label}</span>
                  <code className="font-mono">{d.value}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coûts par modèle — providers "à la génération" (fal.ai). */}
        {provider.pricing && provider.pricing.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Coûts par modèle (indicatifs)
              </div>
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                USD
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/60">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">Modèle</th>
                    <th className="px-2 py-1.5 text-left">Unité</th>
                    <th className="px-2 py-1.5 text-right">Prix</th>
                  </tr>
                </thead>
                <tbody>
                  {provider.pricing.map((r) => (
                    <tr key={r.model} className="border-t border-border/60 align-top">
                      <td className="px-2 py-1.5">
                        <a
                          href={`https://fal.ai/models/${r.model}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10.5px] leading-tight text-primary hover:underline"
                        >
                          {r.model}
                        </a>
                        <div className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                          {r.purpose}
                        </div>
                        {r.note && (
                          <div className="mt-0.5 text-[10px] italic leading-snug text-amber-700/80">
                            {r.note}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[10.5px] text-muted-foreground">{r.unit}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums">
                        {r.priceUsd}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
              Ordres de grandeur — la vérité vit sur{' '}
              <a href={provider.pricingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {provider.pricingUrl.replace(/^https?:\/\//, '')}
              </a>
              . À revérifier avant chaque forte volumétrie.
            </p>
          </div>
        )}

        {/* CTA links — deep links vers les consoles */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <a href={provider.usageUrl} target="_blank" rel="noopener noreferrer" className="col-span-2">
            <Button size="sm" className={cn('w-full gap-1.5 bg-gradient-to-r text-white', provider.accent)}>
              <BarChart3 className="h-3.5 w-3.5" />
              Voir la consommation
              <ExternalLink className="h-3 w-3 opacity-80" />
            </Button>
          </a>
          <a href={provider.pricingUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="w-full gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Tarifs
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Button>
          </a>
          <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="w-full gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Docs
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Button>
          </a>
          <a href={provider.keyOrigin} target="_blank" rel="noopener noreferrer" className="col-span-2">
            <Button size="sm" variant="ghost" className="w-full gap-1.5 text-[11px]">
              <KeyRound className="h-3 w-3" />
              {configured ? 'Gérer la clé API' : 'Créer / récupérer une clé API'}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
