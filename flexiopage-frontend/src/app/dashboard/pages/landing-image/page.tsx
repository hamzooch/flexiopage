'use client';

/**
 * Landing IA (image) — generates a full 9:16 landing-page DESIGN as a single
 * AI image (TryAd-style). Pipeline on the backend:
 *   1. LLM writes the real copy in the target language
 *   2. An image model composes the whole designed page, product photo baked in
 * The page just picks store + product + language, fires it, shows + downloads.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, Sparkles, Download, ArrowLeft, LayoutTemplate, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { storesApi, type LandingImageResult } from '@/lib/api';
import { useWalletStore } from '@/stores/wallet-store';

interface StoreLite { _id: string; name: string; slug: string; settings?: { country?: string; language?: string; currency?: string } }
interface ProductLite { _id: string; name: string; price: number; compareAtPrice?: number; images?: string[] }

const LANGS = [
  { code: 'ar', label: 'العربية (RTL)' },
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
];

export default function LandingImagePage() {
  const searchParams = useSearchParams();
  const initialStoreId = searchParams.get('storeId') || '';

  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState(initialStoreId);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productId, setProductId] = useState('');
  const [language, setLanguage] = useState<string>('ar');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<LandingImageResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  const refreshWallet = useWalletStore((s) => s.refresh);
  const wallet = useWalletStore((s) => s.wallet);

  useEffect(() => {
    storesApi.list()
      .then((res) => {
        const list = (res.data as { stores: StoreLite[] }).stores;
        setStores(list);
        if (!storeId && list.length > 0) setStoreId(list[0]._id);
      })
      .catch(() => setStores([]));
    refreshWallet();
  }, [refreshWallet, storeId]);

  useEffect(() => {
    if (!storeId) return;
    storesApi.listProducts(storeId, { published: 'true' })
      .then((res) => {
        const list = (res.data as { products: ProductLite[] }).products;
        setProducts(list);
        if (list.length > 0) setProductId(list[0]._id);
      })
      .catch(() => setProducts([]));
    const store = stores.find((s) => s._id === storeId);
    if (store?.settings?.language) setLanguage(store.settings.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function handleGenerate() {
    setError('');
    setResult(null);
    if (!storeId || !productId) {
      setError('Sélectionne une boutique et un produit.');
      return;
    }
    setGenerating(true);
    try {
      const res = await storesApi.generateLandingImage(storeId, { productId, language });
      setResult(res.data.result);
      refreshWallet();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; code?: string } } };
      const msg = e.response?.data?.error || 'Erreur lors de la génération';
      setError(
        e.response?.data?.code === 'insufficient_ai_balance'
          ? msg + ' — Recharge ton solde IA dans /dashboard/wallet.'
          : msg
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    if (!result) return;
    setDownloading(true);
    try {
      const res = await fetch(result.imageUrl, { cache: 'no-store' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `landing-${Date.now()}.jpg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // Cross-origin blob fetch can fail — fall back to opening the image.
      window.open(result.imageUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/pages" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-tight">
            <LayoutTemplate className="h-7 w-7 text-fuchsia-500" />
            Landing IA (image)
          </h1>
          <p className="text-muted-foreground">
            Génère une landing page complète en une seule image verticale 9:16 — hero, bénéfices,
            preuves sociales, CTA — prête à télécharger.
          </p>
        </div>
        {wallet && (
          <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 px-4 py-2 text-xs">
            <span className="font-semibold text-fuchsia-700">Solde IA</span> · {wallet.aiBalance} {wallet.currency} · coût ≈ {wallet.aiCosts.landing}
          </div>
        )}
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              L&apos;IA écrit d&apos;abord le texte dans la langue choisie, puis compose le design complet
              avec la photo de ton produit (~30 à 90s).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="store" className="text-xs">Boutique</Label>
                <select
                  id="store"
                  value={storeId}
                  onChange={(e) => { setStoreId(e.target.value); setProductId(''); }}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Choisir —</option>
                  {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="product" className="text-xs">Produit</Label>
                <select
                  id="product"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  disabled={!storeId}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                >
                  <option value="">— Choisir —</option>
                  {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Langue de la landing</Label>
              <div className="mt-1.5 inline-flex rounded-lg bg-muted/40 p-1">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLanguage(l.code)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      language === l.code ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={generating || !storeId || !productId}
              size="lg"
              className="w-full gap-2 sm:w-auto gradient-brand"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Génération en cours…' : 'Générer la landing'}
            </Button>
            {generating && (
              <p className="text-xs text-muted-foreground">
                Étape 1/2 : rédaction du texte · Étape 2/2 : composition du design
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setResult(null)}>← Refaire</Button>
            <div className="flex gap-2">
              <Button onClick={handleDownload} disabled={downloading} className="gap-1.5">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Télécharger
              </Button>
              <Button variant="outline" asChild className="gap-1.5">
                <a href={result.imageUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Ouvrir
                </a>
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
            {/* The generated landing image */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/30 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.imageUrl}
                alt="Landing page générée"
                className="mx-auto w-full rounded-lg"
              />
            </div>

            {/* The copy used (so the seller can reuse it elsewhere) */}
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">Texte généré</CardTitle>
                <CardDescription>Le copy que l&apos;IA a écrit et intégré dans le design.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Field label="Titre" value={result.copy.headline} />
                {result.copy.subheadline && <Field label="Sous-titre" value={result.copy.subheadline} />}
                <Field label="Réassurance" value={result.copy.reassurance.join(' · ')} />
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">Bénéfices</div>
                  <ul className="mt-1 space-y-1.5">
                    {result.copy.benefits.filter((b) => b.title || b.body).map((b, i) => (
                      <li key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                        <span className="font-medium">{b.title}</span>
                        {b.body && <span className="text-muted-foreground"> — {b.body}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <Field label="CTA" value={`${result.copy.cta} · ${result.copy.ctaReassurance}`} />
              </CardContent>
            </Card>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
