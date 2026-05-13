'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi, type AdminWallet, type WalletBucket } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  Loader2, Wallet as WalletIcon, Sparkles, X, AlertTriangle, Check, ArrowDownToLine, Edit3,
} from 'lucide-react';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function AdminWalletsPage() {
  const me = useAuthStore((s) => s.user);
  const isSuperAdmin = (me as { role?: string } | null)?.role === 'superadmin';
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState<AdminWallet | null>(null);
  const [crediting, setCrediting] = useState<AdminWallet | null>(null);

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Wallets vendeurs ({wallets.length})</CardTitle>
          <CardDescription>Solde principal + solde IA de chaque vendeur. Clique sur un wallet pour ajuster.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : wallets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Aucun wallet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {wallets.map((w) => (
                <li key={w._id} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-fuchsia-500 text-xs font-semibold text-white shadow-md">
                    {w.userId?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{w.userId?.name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{w.userId?.email || w._id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill icon={<WalletIcon className="h-3 w-3" />} tone="emerald" amount={w.balance} currency={w.currency} label="Principal" />
                    <Pill icon={<Sparkles className="h-3 w-3" />} tone="fuchsia" amount={w.aiBalance} currency={w.currency} label="IA" />
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
                    <Button variant="outline" size="sm" onClick={() => setAdjusting(w)} className="gap-1.5">
                      <Edit3 className="h-3.5 w-3.5" />
                      Ajuster
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
          wallet={adjusting}
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
            <div className="mt-0.5 text-base font-bold">{fmt(wallet.aiBalance, wallet.currency)}</div>
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
            <Label htmlFor="credit-amount" className="text-xs">Montant à créditer ({wallet.currency})</Label>
            <Input
              id="credit-amount"
              type="number"
              inputMode="numeric"
              placeholder="Ex: 10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              min={1}
              required
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Crédit positif uniquement. Pour un débit, utilise « Ajuster ».
            </p>
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

function Pill({ icon, tone, amount, currency, label }: { icon: React.ReactNode; tone: 'emerald' | 'fuchsia'; amount: number; currency: string; label: string }) {
  const tw = tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-fuchsia-500/10 text-fuchsia-700';
  return (
    <div className={`hidden flex-col rounded-lg px-2.5 py-1.5 text-right sm:flex ${tw}`}>
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider opacity-80">{icon} {label}</span>
      <span className="text-sm font-bold">{fmt(amount, currency)}</span>
    </div>
  );
}

function AdjustModal({
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
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const userId = wallet.userId?._id || '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess(false);
    const value = Number(amount);
    if (!value || !Number.isFinite(value)) {
      setError('Montant invalide. Positif = crédit, négatif = débit.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Raison requise (au moins 3 caractères).');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.adjustWallet(userId, { amount: value, bucket, reason: reason.trim() });
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
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Ajuster le wallet</h2>
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
            <div className="mt-0.5 text-base font-bold">{fmt(wallet.aiBalance, wallet.currency)}</div>
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
            <Label htmlFor="amount" className="text-xs">Montant ({wallet.currency})</Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              placeholder="Ex: 5000 (crédit) ou -2000 (débit)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Positif = crédit · Négatif = débit</p>
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
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Ajustement appliqué.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Appliquer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
