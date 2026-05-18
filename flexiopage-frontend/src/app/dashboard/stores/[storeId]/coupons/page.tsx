'use client';

/**
 * Coupons index — flat list with create CTA. Each row shows the code, the
 * discount amount, an active/inactive badge and a usage counter.
 *
 * The "Nouveau code" CTA opens a modal to capture code + type + value in
 * one step, then routes to the per-coupon editor for the rest.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, BadgePercent, Plus, Loader2, Eye, EyeOff,
  Trash2, Copy, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, extractApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Coupon } from '@/types/coupon';

export default function CouponsListPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('TND');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeRes, couponsRes] = await Promise.all([
        storesApi.get(storeId),
        storesApi.listCoupons(storeId),
      ]);
      const s = (storeRes.data as { store: { settings?: { currency?: string } } }).store;
      if (s?.settings?.currency) setCurrency(s.settings.currency);
      setCoupons((couponsRes.data as { coupons: Coupon[] }).coupons || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(c: Coupon) {
    if (!window.confirm(`Supprimer le code « ${c.code} » ?\n\nLes commandes déjà passées avec ce code restent intactes.`)) return;
    await storesApi.deleteCoupon(storeId, c._id);
    setCoupons((arr) => arr.filter((row) => row._id !== c._id));
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 1800);
    } catch {
      // Older browsers — silently fail rather than show an error toast.
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/stores/${storeId}`)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Codes promo</h1>
            <p className="text-sm text-muted-foreground">
              Créé des codes (« PROMO10 », « LIVRAISON-OFFERTE »…) — tes clients les saisissent
              dans le formulaire COD.
            </p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5 gradient-brand text-white">
          <Plus className="h-3.5 w-3.5" />
          Nouveau code
        </Button>
      </header>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
          <BadgePercent className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-base font-semibold">Aucun code promo</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Lance ta première promo — un code court (ex: <code className="rounded bg-muted px-1">BIENVENUE10</code>) suffit pour booster la conversion sur les nouvelles annonces.
          </p>
          <Button onClick={() => setOpen(true)} className="mt-5 gap-1.5 gradient-brand text-white">
            <Plus className="h-4 w-4" />
            Créer mon premier code
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {coupons.map((c) => {
            const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
            const exhausted = typeof c.maxUses === 'number' && c.usedCount >= c.maxUses;
            const dead = !c.isActive || expired || exhausted;
            return (
              <li
                key={c._id}
                className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/30"
              >
                <span
                  className={cn(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white',
                    dead
                      ? 'bg-gradient-to-br from-slate-400 to-slate-500'
                      : 'bg-gradient-to-br from-primary to-fuchsia-600 shadow-sm'
                  )}
                >
                  <BadgePercent className="h-4 w-4" />
                </span>
                <Link
                  href={`/dashboard/stores/${storeId}/coupons/${c._id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-bold">{c.code}</code>
                    <span className="text-sm font-semibold">
                      {c.type === 'percent' ? `−${c.value}%` : `−${c.value} ${currency}`}
                    </span>
                    {c.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <Eye className="h-3 w-3" /> Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        <EyeOff className="h-3 w-3" /> Désactivé
                      </span>
                    )}
                    {expired && (
                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        Expiré
                      </span>
                    )}
                    {exhausted && (
                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        Épuisé
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Utilisé {c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''} fois
                    {c.expiresAt ? ` · expire le ${new Date(c.expiresAt).toLocaleDateString('fr-FR')}` : ''}
                    {c.minPurchase ? ` · à partir de ${c.minPurchase} ${currency}` : ''}
                  </div>
                </Link>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => copyCode(c.code)}
                    className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Copier le code"
                  >
                    {copied === c.code ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === c.code ? 'Copié' : 'Copier'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <NewCouponModal
          onClose={() => setOpen(false)}
          onCreated={(c) => router.push(`/dashboard/stores/${storeId}/coupons/${c._id}`)}
          storeId={storeId}
          currency={currency}
          setError={setError}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// New coupon modal — captures the bare minimum (code + type + value)
// then routes to the editor for advanced fields (scope, expiry, etc.).
// ─────────────────────────────────────────────────────────────────────

function NewCouponModal({
  onClose, onCreated, storeId, currency, setError,
}: {
  onClose: () => void;
  onCreated: (c: Coupon) => void;
  storeId: string;
  currency: string;
  setError: (s: string) => void;
}) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !value.trim()) return;
    setSaving(true);
    try {
      const res = await storesApi.createCoupon(storeId, {
        code: code.trim(),
        type,
        value: parseFloat(value) || 0,
        isActive: true,
        appliesTo: 'all',
      });
      onCreated((res.data as { coupon: Coupon }).coupon);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Création échouée.'));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3 sm:p-6" onClick={() => !saving && onClose()}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div>
          <h2 className="text-lg font-semibold">Nouveau code promo</h2>
          <p className="text-xs text-muted-foreground">
            Tu pourras ajuster les conditions (limites, scope, expiration) sur la page suivante.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="code">Code *</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PROMO10"
            required
            className="font-mono uppercase"
          />
          <p className="text-[11px] text-muted-foreground">Court, mémorable, sans espaces. Sera normalisé en majuscules.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { v: 'percent', label: '% sur le total' },
                { v: 'fixed',   label: `${currency} fixe` },
              ] as const).map((opt) => {
                const active = type === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setType(opt.v)}
                    className={cn(
                      'rounded-lg border p-2 text-center text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border/60 text-muted-foreground hover:border-primary/40'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="value">Montant *</Label>
            <div className="relative">
              <Input
                id="value"
                type="number"
                min={0}
                max={type === 'percent' ? 100 : undefined}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                className="pr-10"
                placeholder={type === 'percent' ? '10' : '5'}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                {type === 'percent' ? '%' : currency}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving} className="gap-1.5 gradient-brand text-white">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Créer
          </Button>
        </div>
      </form>
    </div>
  );
}
