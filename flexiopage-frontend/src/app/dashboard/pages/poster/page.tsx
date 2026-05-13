'use client';

/**
 * Poster generator — single tall image ad (TryAd-like) flow:
 *   1. Pick store + product + theme + language
 *   2. Submit → backend /generate-poster (~30-60s) → returns PosterContent
 *   3. Render with <PosterCanvas/> + button to download as PNG/JPG via html-to-image
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as htmlToImage from 'html-to-image';
import {
  Loader2, Sparkles, Download, ArrowLeft, Image as ImageIcon, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { storesApi, type PosterContent, type PosterTheme } from '@/lib/api';
import { PosterCanvas } from '@/components/poster/poster-canvas';
import { useWalletStore } from '@/stores/wallet-store';
import { useAuthStore } from '@/stores/auth-store';

interface StoreLite { _id: string; name: string; slug: string; settings?: { country?: string; language?: string; currency?: string } }
interface ProductLite { _id: string; name: string; price: number; compareAtPrice?: number; images?: string[] }

const THEMES: { value: PosterTheme; label: string; description: string; preview: string }[] = [
  { value: 'gold-dark', label: 'Or & Noir',   description: 'Luxury · accents dorés sur fond sombre', preview: 'linear-gradient(135deg,#0d0a08 0%,#1a1410 50%,#d9b56a 100%)' },
  { value: 'cinema',    label: 'Cinéma',      description: 'Noir profond + jaune cinéma',           preview: 'linear-gradient(135deg,#050505 0%,#141416 50%,#f5d76e 100%)' },
  { value: 'warm-tan',  label: 'Sable',       description: 'Beige chaud, artisanat éditorial',      preview: 'linear-gradient(135deg,#f5ebd9 0%,#e8d5b4 50%,#a8743a 100%)' },
];

const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية (RTL)' },
  { code: 'en', label: 'English' },
];

export default function PosterGenerationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStoreId = searchParams.get('storeId') || '';

  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState(initialStoreId);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productId, setProductId] = useState('');
  const [theme, setTheme] = useState<PosterTheme>('gold-dark');
  const [language, setLanguage] = useState<string>('fr');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [poster, setPoster] = useState<PosterContent | null>(null);

  const exportRef = useRef<HTMLDivElement | null>(null);
  const refreshWallet = useWalletStore((s) => s.refresh);
  const wallet = useWalletStore((s) => s.wallet);
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  // Load stores
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

  // Load products of selected store
  useEffect(() => {
    if (!storeId) return;
    storesApi.listProducts(storeId, { published: 'true' })
      .then((res) => {
        const list = (res.data as { products: ProductLite[] }).products;
        setProducts(list);
        if (list.length > 0 && !productId) setProductId(list[0]._id);
      })
      .catch(() => setProducts([]));
    // Set language hint from store settings
    const store = stores.find((s) => s._id === storeId);
    if (store?.settings?.language) setLanguage(store.settings.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function handleGenerate() {
    setError(''); setPoster(null);
    if (!storeId || !productId) {
      setError('Sélectionne une boutique et un produit.');
      return;
    }
    setGenerating(true);
    try {
      const res = await storesApi.generatePoster(storeId, { productId, theme, language });
      setPoster(res.data.poster);
      refreshWallet();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; code?: string } } };
      const msg = e.response?.data?.error || 'Erreur lors de la génération';
      setError(msg);
      if (e.response?.data?.code === 'insufficient_ai_balance') {
        setError(msg + ' — Recharge ton solde IA dans /dashboard/wallet.');
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(format: 'png' | 'jpg') {
    if (!exportRef.current) return;
    try {
      const opts = { pixelRatio: 2, cacheBust: true, backgroundColor: '#000' };
      const dataUrl = format === 'jpg'
        ? await htmlToImage.toJpeg(exportRef.current, { ...opts, quality: 0.95 })
        : await htmlToImage.toPng(exportRef.current, opts);
      const link = document.createElement('a');
      link.download = `poster-${Date.now()}.${format}`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      setError(`Téléchargement échoué : ${(err as Error).message}`);
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
            <ImageIcon className="h-7 w-7 text-fuchsia-500" />
            Affiche IA
          </h1>
          <p className="text-muted-foreground">
            Génère une affiche verticale complète (photo + features + témoignages + CTA) à télécharger en PNG/JPG.
          </p>
        </div>
        {wallet && (
          <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 px-4 py-2 text-xs">
            <span className="font-semibold text-fuchsia-700">Solde IA</span> · {wallet.aiBalance} {wallet.currency} · coût ≈ {wallet.aiCosts.landing}
          </div>
        )}
      </div>

      {!poster && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>L&apos;IA prend ~30 à 60s pour rédiger le copy + générer 2 photos avatar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Store + product */}
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

            {/* Theme */}
            <div>
              <Label className="text-xs">Style visuel</Label>
              <div className="mt-1.5 grid gap-3 sm:grid-cols-3">
                {THEMES.map((opt) => {
                  const active = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTheme(opt.value)}
                      className={`overflow-hidden rounded-xl border-2 text-left transition-all ${
                        active ? 'border-primary ring-4 ring-primary/15' : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <div style={{ background: opt.preview, height: 80 }} />
                      <div className="p-3">
                        <div className="text-sm font-semibold">{opt.label}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{opt.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language */}
            <div>
              <Label className="text-xs">Langue</Label>
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
              {generating ? 'Génération en cours…' : 'Générer l\'affiche'}
            </Button>
            {generating && (
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? 'Étape 1/2 : copywriting (Claude) · Étape 2/2 : génération des avatars (FLUX)'
                  : 'Étape 1/2 : rédaction du texte · Étape 2/2 : génération des avatars'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {poster && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setPoster(null)}>← Refaire</Button>
            <div className="flex gap-2">
              <Button onClick={() => handleDownload('png')} className="gap-1.5">
                <Download className="h-4 w-4" /> Télécharger PNG
              </Button>
              <Button onClick={() => handleDownload('jpg')} variant="outline" className="gap-1.5">
                <Download className="h-4 w-4" /> JPG
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border/60 bg-muted/30 p-6">
            <div className="mx-auto" style={{ width: 768 }}>
              <PosterCanvas content={poster} exportRef={exportRef} />
            </div>
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
