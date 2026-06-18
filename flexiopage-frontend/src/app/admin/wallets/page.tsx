'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi, type AdminWallet, type WalletBucket } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import {
  Loader2, Wallet as WalletIcon, Sparkles, X, AlertTriangle, Check, ArrowDownToLine, Plus, Minus, Search,
} from 'lucide-react';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Solde IA = compteur de tokens (depuis juin 2026). */
function fmtTokens(amount: number): string {
  const n = Math.round(amount);
  return `${n.toLocaleString()} token${Math.abs(n) === 1 ? '' : 's'}`;
}

/** Ratio par défaut si le backend ne le renvoie pas (devrait pas arriver). */
const DEFAULT_USD_TO_TOKENS = 1.5;

export default function AdminWalletsPage() {
  const me = useAuthStore((s) => s.user);
  const isSuperAdmin = (me as { role?: string } | null)?.role === 'superadmin';
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState<{ wallet: AdminWallet; mode: 'add' | 'withdraw' } | null>(null);
  const [crediting, setCrediting] = useState<AdminWallet | null>(null);
  const [search, setSearch] = useState('');
  type WalletFilter = 'all' | 'low' | 'zero';
  const [filter, setFilter] = useState<WalletFilter>('all');

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.wallets();
      setWallets(res.data.wallets);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = wallets;
    if (filter === 'low') list = list.filter((w) => (w.balance + w.aiBalance) > 0 && (w.balance + w.aiBalance) < 10);
    else if (filter === 'zero') list = list.filter((w) => (w.balance + w.aiBalance) === 0);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((w) =>
        (w.userId?.name?.toLowerCase() || '').includes(q) ||
        (w.userId?.email?.toLowerCase() || '').includes(q)
      );
    }
    return list;
  }, [wallets, filter, search]);

  const counts = useMemo(() => ({
    low:  wallets.filter((w) => (w.balance + w.aiBalance) > 0 && (w.balance + w.aiBalance) < 10).length,
    zero: wallets.filter((w) => (w.balance + w.aiBalance) === 0).length,
  }), [wallets]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Wallets vendeurs ({wallets.length})</CardTitle>
          <CardDescription>Solde principal + solde IA de chaque vendeur. Clique sur un wallet pour ajuster.</CardDescription>

          {/* Filters */}
          <div className="mt-4 flex flex-col gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom ou email…"
                className="h-9 rounded-lg pl-9 text-xs sm:text-sm"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Effacer">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <WChip active={filter === 'all'} onClick={() => setFilter('all')}>Tous ({wallets.length})</WChip>
              <WChip active={filter === 'low'} onClick={() => setFilter('low')} tint="amber">Solde bas &lt; 10 ({counts.low})</WChip>
              <WChip active={filter === 'zero'} onClick={() => setFilter('zero')} tint="rose">Vide ({counts.zero})</WChip>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              {wallets.length === 0 ? 'Aucun wallet.' : 'Aucun résultat pour ces filtres.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((w) => (
                <li key={w._id} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-fuchsia-500 text-xs font-semibold text-white shadow-md">
                    {w.userId?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{w.userId?.name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{w.userId?.email || w._id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill icon={<WalletIcon className="h-3 w-3" />} tone="emerald" amount={w.balance} currency={w.currency} label="Principal" unit="currency" />
                    <Pill icon={<Sparkles className="h-3 w-3" />} tone="fuchsia" amount={w.aiBalance} currency={w.currency} label="IA" unit="tokens" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isSuperAdmin && (
                      <Button
                        size="sm"
                        onClick={() => setCrediting(w)}
                        className="gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                        Recharger
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAdjusting({ wallet: w, mode: 'add' })}
                      className="gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Ajouter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAdjusting({ wallet: w, mode: 'withdraw' })}
                      className="gap-1.5 border-rose-500/40 text-rose-700 hover:bg-rose-500/10"
                    >
                      <Minus className="h-3.5 w-3.5" />
                      Retirer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {adjusting && (
        <AdjustModal
          wallet={adjusting.wallet}
          mode={adjusting.mode}
          onClose={() => setAdjusting(null)}
          onDone={() => { setAdjusting(null); load(); }}
        />
      )}
      {crediting && (
        <CreditModal
          wallet={crediting}
          onClose={() => setCrediting(null)}
          onDone={() => { setCrediting(null); load(); }}
        />
      )}
    </>
  );
}

function CreditModal({
  wallet,
  onClose,
  onDone,
}: {
  wallet: AdminWallet;
  onClose: () => void;
  onDone: () => void;
}) {
  const [bucket, setBucket] = useState<WalletBucket>('main');
  const [amount, setAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess(false);
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Le montant doit être positif.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminApi.creditWallet(wallet.userId?._id || '', {
        amount: value,
        target: bucket,
        paymentReference: paymentRef.trim() || undefined,
      });
      if (res.data.alreadyApplied) {
        setError('Cette référence de paiement a déjà été utilisée.');
      } else {
        setSuccess(true);
        window.setTimeout(onDone, 700);
      }
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              <ArrowDownToLine className="h-3 w-3" /> Recharger
            </div>
            <h2 className="mt-1.5 text-lg font-bold">Créditer le solde</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{wallet.userId?.email}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-700">
            <div className="font-bold uppercase tracking-wider">Solde principal actuel</div>
            <div className="mt-0.5 text-base font-bold">{fmt(wallet.balance, wallet.currency)}</div>
          </div>
          <div className="rounded-lg bg-fuchsia-500/10 p-2.5 text-fuchsia-700">
            <div className="font-bold uppercase tracking-wider">Solde IA actuel</div>
            <div className="mt-0.5 text-base font-bold">{fmtTokens(wallet.aiBalance)}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Cible</Label>
            <div className="mt-1 inline-flex rounded-lg bg-muted/40 p-1">
              <button type="button" onClick={() => setBucket('main')}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${bucket === 'main' ? 'bg-card text-emerald-700 shadow' : 'text-muted-foreground'}`}>
                <WalletIcon className="h-3 w-3" /> Solde principal
              </button>
              <button type="button" onClick={() => setBucket('ai')}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${bucket === 'ai' ? 'bg-card text-fuchsia-700 shadow' : 'text-muted-foreground'}`}>
                <Sparkles className="h-3 w-3" /> Solde IA
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="credit-amount" className="text-xs">
              {bucket === 'ai' ? 'Montant payé (USD)' : `Montant à créditer (${wallet.currency})`}
            </Label>
            <Input
              id="credit-amount"
              type="number"
              inputMode="numeric"
              placeholder={bucket === 'ai' ? 'Ex: 10' : 'Ex: 10000'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              min={1}
              required
            />
            {bucket === 'ai' ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {Number(amount) > 0
                  ? `→ ${fmtTokens(Number(amount) * DEFAULT_USD_TO_TOKENS)} crédités (1 USD = ${DEFAULT_USD_TO_TOKENS} tokens).`
                  : `1 USD = ${DEFAULT_USD_TO_TOKENS} tokens crédités. Ratio modifiable dans /admin/settings.`}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Crédit positif uniquement. Pour un débit, utilise « Ajuster ».
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="payment-ref" className="text-xs">Référence paiement (optionnel)</Label>
            <Input
              id="payment-ref"
              placeholder="WAVE-12345 / OM-987 / Bank-…"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Anti-doublon : si tu réutilises la même réf, le crédit n&apos;est pas appliqué deux fois.</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-700">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Crédit appliqué.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Annuler</Button>
            <Button
              type="submit"
              disabled={submitting}
              size="sm"
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              <span className="ml-1.5">Créditer</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Pill({
  icon,
  tone,
  amount,
  currency,
  label,
  unit,
}: {
  icon: React.ReactNode;
  tone: 'emerald' | 'fuchsia';
  amount: number;
  currency: string;
  label: string;
  unit: 'currency' | 'tokens';
}) {
  const tw = tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-fuchsia-500/10 text-fuchsia-700';
  return (
    <div className={`hidden flex-col rounded-lg px-2.5 py-1.5 text-right sm:flex ${tw}`}>
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider opacity-80">{icon} {label}</span>
      <span className="text-sm font-bold">{unit === 'tokens' ? fmtTokens(amount) : fmt(amount, currency)}</span>
    </div>
  );
}

function WChip({
  children, active, onClick, tint,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tint?: 'amber' | 'rose';
}) {
  const tintCls = {
    amber: 'border-amber-500 bg-amber-500 text-white',
    rose:  'border-rose-500 bg-rose-500 text-white',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? tint ? tintCls[tint] : 'border-primary bg-primary text-primary-foreground'
          : 'border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function AdjustModal({
  wallet,
  mode,
  onClose,
  onDone,
}: {
  wallet: AdminWallet;
  mode: 'add' | 'withdraw';
  onClose: () => void;
  onDone: () => void;
}) {
  const isAdd = mode === 'add';
  const [bucket, setBucket] = useState<WalletBucket>('main');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const userId = wallet.userId?._id || '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess(false);
    const positive = Math.abs(Number(amount));
    if (!positive || !Number.isFinite(positive)) {
      setError('Montant invalide.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Raison requise (au moins 3 caractères).');
      return;
    }
    const signed = isAdd ? positive : -positive;
    const currentBalance = bucket === 'main' ? wallet.balance : wallet.aiBalance;
    if (!isAdd && positive > currentBalance) {
      setError(`Le solde ${bucket === 'main' ? 'principal' : 'IA'} (${currentBalance}) est inférieur au retrait demandé.`);
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.adjustWallet(userId, { amount: signed, bucket, reason: reason.trim() });
      setSuccess(true);
      window.setTimeout(onDone, 600);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl ${isAdd ? 'border-emerald-500/30' : 'border-rose-500/30'}`}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isAdd ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}>
              {isAdd ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {isAdd ? 'Ajouter au solde' : 'Retirer du solde'}
            </div>
            <h2 className="mt-1.5 text-lg font-bold">{isAdd ? 'Créditer le wallet' : 'Débiter le wallet'}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{wallet.userId?.email}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-700">
            <div className="font-bold uppercase tracking-wider">Solde principal</div>
            <div className="mt-0.5 text-base font-bold">{fmt(wallet.balance, wallet.currency)}</div>
          </div>
          <div className="rounded-lg bg-fuchsia-500/10 p-2.5 text-fuchsia-700">
            <div className="font-bold uppercase tracking-wider">Solde IA</div>
            <div className="mt-0.5 text-base font-bold">{fmtTokens(wallet.aiBalance)}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Cible</Label>
            <div className="mt-1 inline-flex rounded-lg bg-muted/40 p-1">
              <button type="button" onClick={() => setBucket('main')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${bucket === 'main' ? 'bg-card text-foreground shadow' : 'text-muted-foreground'}`}>
                Principal
              </button>
              <button type="button" onClick={() => setBucket('ai')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${bucket === 'ai' ? 'bg-card text-foreground shadow' : 'text-muted-foreground'}`}>
                IA
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="amount" className="text-xs">
              Montant à {isAdd ? 'ajouter' : 'retirer'} ({bucket === 'ai' ? 'tokens' : wallet.currency})
            </Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder={bucket === 'ai' ? 'Ex: 5' : 'Ex: 5000'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
            {bucket === 'ai' && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ajustement direct en tokens, sans conversion (le wallet IA est un compteur).
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="reason" className="text-xs">Raison</Label>
            <Input
              id="reason"
              placeholder="Ex: Remboursement commande #ORD-1234"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
              required
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-700">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {isAdd ? 'Montant ajouté.' : 'Montant retiré.'}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Annuler</Button>
            <Button
              type="submit"
              disabled={submitting}
              size="sm"
              className={isAdd
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                : 'bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-700 hover:to-orange-700'}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAdd ? 'Ajouter' : 'Retirer')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
