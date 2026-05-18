'use client';

/**
 * AI description helper for the product creation/edit pages.
 *
 * Renders an inline "Générer avec l'IA" button next to the description
 * textarea. Clicking it expands a compact panel where the seller picks
 * the tone + optional keywords (and, when the language is Arabic, the
 * country dialect). Calls `storesApi.generateProductDescription`, then
 * fills the textarea via `onResult`.
 *
 * Charged from the seller's AI wallet (text_only bucket) — same plumbing
 * as the landing-page generators.
 */

import { useState } from 'react';
import { Sparkles, Loader2, X, AlertTriangle, Wand2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { useWalletStore } from '@/stores/wallet-store';
import { cn } from '@/lib/utils';

type Tone = 'engaging' | 'professional' | 'luxury' | 'youthful' | 'minimal';

const TONES: { value: Tone; label: string; hint: string }[] = [
  { value: 'engaging',     label: 'Vendeur',       hint: 'Scroll-stopper, direct, ad-style' },
  { value: 'professional', label: 'Pro',           hint: 'Neutre, clair, qui rassure' },
  { value: 'luxury',       label: 'Luxe',          hint: 'Quiet luxury, sensoriel' },
  { value: 'youthful',     label: 'Jeune',         hint: 'Casual, TikTok, comme un pote' },
  { value: 'minimal',      label: 'Minimal',       hint: 'Éditorial, sec, court' },
];

const ARAB_COUNTRIES: { code: string; label: string; flag: string }[] = [
  { code: 'TN', label: 'Tunisie',  flag: '🇹🇳' },
  { code: 'MA', label: 'Maroc',    flag: '🇲🇦' },
  { code: 'DZ', label: 'Algérie',  flag: '🇩🇿' },
  { code: 'EG', label: 'Égypte',   flag: '🇪🇬' },
  { code: 'SA', label: 'Arabie',   flag: '🇸🇦' },
];

interface Props {
  storeId: string;
  /** Product name (current value in the form). Required for the AI to write anything sensible. */
  productName: string;
  /** Optional context the seller already typed. */
  category?: string;
  price?: number;
  currency?: string;
  /** Default store language — used to pre-select the language toggle. */
  defaultLanguage?: string;
  /** Default store country (used to pre-pick the Arabic dialect when relevant). */
  defaultCountry?: string;
  /** Receives the AI-generated text. The parent decides whether to replace or append. */
  onResult: (text: string) => void;
}

export function AiDescriptionButton({
  storeId,
  productName,
  category,
  price,
  currency,
  defaultLanguage,
  defaultCountry,
  onResult,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<Tone>('engaging');
  const [keywords, setKeywords] = useState('');
  const [language, setLanguage] = useState(defaultLanguage || 'fr');
  const [country, setCountry] = useState(defaultCountry || 'TN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refreshWallet = useWalletStore((s) => s.refresh);

  const canGenerate = !!productName.trim() && !loading;
  const isArabic = language === 'ar';

  async function handleGenerate() {
    if (!productName.trim()) {
      setError('Renseigne d\'abord le nom du produit pour que l\'IA ait de quoi travailler.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await storesApi.generateProductDescription(storeId, {
        name: productName.trim(),
        category: category?.trim() || undefined,
        keywords: keywords.trim() || undefined,
        language,
        country: isArabic ? country : undefined,
        tone,
        price,
        currency,
      });
      onResult(res.data.description);
      refreshWallet();
      // Keep the panel open so the seller can re-roll with a different tone if needed
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; code?: string; cost?: number } } };
      const msg = e.response?.data?.error || 'La génération a échoué. Réessaie.';
      if (e.response?.data?.code === 'insufficient_ai_balance') {
        setError(`${msg} — recharge ton solde IA dans /dashboard/wallet (coût ≈ ${e.response.data.cost ?? '?'}).`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-500/10 to-pink-500/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-700 transition-all hover:from-fuchsia-500/20 hover:to-pink-500/20 hover:shadow-sm"
        title="Générer avec l'IA"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Générer avec l&apos;IA
      </button>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 via-card to-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-fuchsia-500/20 bg-fuchsia-500/5 px-3 py-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-fuchsia-800">
          <Wand2 className="h-3.5 w-3.5" />
          Description par IA
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Fermer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        {/* Keywords + tone */}
        <div className="grid gap-3 sm:grid-cols-[2fr_3fr]">
          <div className="space-y-1">
            <Label htmlFor="ai-keywords" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mots-clés (optionnel)
            </Label>
            <Input
              id="ai-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="cuir, fait main, 6 couleurs…"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ton du texte
            </Label>
            <div className="flex flex-wrap gap-1">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTone(t.value)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px] font-medium transition-all',
                    tone === t.value
                      ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-800 shadow-sm'
                      : 'border-border/60 text-muted-foreground hover:border-fuchsia-500/40 hover:text-foreground'
                  )}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Language + Arabic country picker */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Langue de la description
          </Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { code: 'fr', label: 'Français', flag: '🇫🇷' },
              { code: 'ar', label: 'العربية',  flag: '🇸🇦' },
              { code: 'en', label: 'English',  flag: '🇬🇧' },
            ].map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLanguage(l.code)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-all',
                  language === l.code
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <span>{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>
          {isArabic && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                Dialecte
              </span>
              {ARAB_COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCountry(c.code)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                    country === c.code
                      ? 'border-amber-500 bg-amber-500/15 text-amber-900'
                      : 'border-amber-500/30 bg-card/60 text-amber-800 hover:bg-amber-500/10'
                  )}
                >
                  <span>{c.flag}</span>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            ~3-5s · facturé sur ton solde IA
          </p>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            size="sm"
            className="h-9 gap-1.5 gradient-brand text-white"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {loading ? 'Génération…' : 'Générer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
