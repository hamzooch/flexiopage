'use client';

/**
 * Revenus — vendor view of online sales earnings and payout requests.
 *
 * Flow:
 *   1. Buyer pays online → order finalized → seller credited (amount − commission)
 *      to `wallet.payoutBalance`.
 *   2. Seller requests a payout here → amount frozen, admin sees the request.
 *   3. Admin transfers money out-of-band (Wave / OM / MTN / bank) → marks as paid.
 *   4. Sale ledger (kind='sale_credit') stays visible on this page as history.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Banknote,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Info,
  ArrowDownToLine,
  ArrowUpRight,
} from 'lucide-react';
import { walletApi, type WalletState, type Payout, type PayoutMethod } from '@/lib/api';
import { cn } from '@/lib/utils';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const METHOD_LABELS: Record<PayoutMethod, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
  mtn_momo: 'MTN Mobile Money',
  bank_transfer: 'Virement bancaire',
};

export default function EarningsPage() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayoutMethod>('wave');
  const [phone, setPhone] = useState('');
  const [accountName, setAccountName] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [sellerNote, setSellerNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, p] = await Promise.all([walletApi.get(), walletApi.listPayouts()]);
      setWallet(w.data.wallet);
      setPayouts(p.data.payouts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const salesLedger = useMemo(
    () => (wallet?.transactions || []).filter(
      (t) => t.kind === 'sale_credit' || t.kind === 'payout_debit',
    ).slice(0, 20),
    [wallet],
  );

  const pendingPayoutTotal = useMemo(
    () => payouts.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),
    [payouts],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Le montant doit être positif.');
      return;
    }
    if (!wallet) return;
    if (value < wallet.payoutMinimum) {
      setError(`Minimum ${fmt(wallet.payoutMinimum, wallet.currency)}.`);
      return;
    }
    if (value > wallet.payoutBalance) {
      setError('Montant supérieur au solde disponible.');
      return;
    }

    const destination: Record<string, string> = {};
    if (method === 'bank_transfer') {
      if (!accountName.trim() || !iban.trim()) {
        setError('Nom et IBAN requis pour le virement bancaire.');
        return;
      }
      destination.accountName = accountName.trim();
      destination.iban = iban.trim();
      if (bankName.trim()) destination.bankName = bankName.trim();
    } else {
      if (!phone.trim()) {
        setError('Numéro de téléphone requis.');
        return;
      }
      destination.phone = phone.trim();
    }

    setSubmitting(true);
    try {
      await walletApi.requestPayout({
        amount: value,
        method,
        destination,
        sellerNote: sellerNote.trim() || undefined,
      });
      setShowRequestForm(false);
      setAmount(''); setPhone(''); setAccountName(''); setIban(''); setBankName(''); setSellerNote('');
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Impossible de créer la demande.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !wallet) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canRequest = wallet.payoutBalance >= wallet.payoutMinimum;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Mes revenus</h1>
          <p className="text-xs text-muted-foreground">Ventes en ligne + demandes de versement</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Actualiser
        </Button>
      </div>

      {/* Solde principal */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Solde disponible
              </div>
              <div className="mt-2 text-3xl font-bold tabular-nums text-emerald-600">
                {fmt(wallet.payoutBalance, wallet.currency)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Minimum retrait: {fmt(wallet.payoutMinimum, wallet.currency)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                En attente de versement
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-amber-600">
                {fmt(pendingPayoutTotal, wallet.currency)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {payouts.filter((p) => p.status === 'pending').length} demande(s) en cours
              </div>
            </div>
            <div className="flex items-center sm:justify-end">
              <Button
                className="w-full gap-2 sm:w-auto"
                disabled={!canRequest}
                onClick={() => setShowRequestForm((v) => !v)}
              >
                <ArrowUpRight className="h-4 w-4" />
                Demander un versement
              </Button>
            </div>
          </div>
          {!canRequest && wallet.payoutBalance > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                Votre solde est inférieur au minimum de retrait de{' '}
                <strong>{fmt(wallet.payoutMinimum, wallet.currency)}</strong>.
                Continuez à vendre pour débloquer votre premier versement !
              </div>
            </div>
          )}
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <strong>Commission plateforme: {(wallet.platformCommissionRate * 100).toFixed(0)}%</strong> sur chaque vente en ligne.
                Sur une vente de 10 000 XOF, vous recevez {(10000 * (1 - wallet.platformCommissionRate)).toFixed(0)} XOF.
                Les paiements à la livraison (COD) ne sont pas concernés.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payout request form */}
      {showRequestForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nouvelle demande de versement</CardTitle>
            <CardDescription className="text-xs">
              Nous versons manuellement sous 72h. Vérifie bien tes coordonnées.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="amount">Montant ({wallet.currency})</Label>
                <Input
                  id="amount"
                  type="number"
                  min={wallet.payoutMinimum}
                  max={wallet.payoutBalance}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Max: ${fmt(wallet.payoutBalance, wallet.currency)}`}
                  required
                />
              </div>
              <div>
                <Label>Méthode de versement</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['wave', 'orange_money', 'mtn_momo', 'bank_transfer'] as PayoutMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={cn(
                        'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                        method === m
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/60 hover:border-border',
                      )}
                    >
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
              {method === 'bank_transfer' ? (
                <>
                  <div>
                    <Label htmlFor="accountName">Nom du titulaire</Label>
                    <Input id="accountName" value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="iban">IBAN / Numéro de compte</Label>
                    <Input id="iban" value={iban} onChange={(e) => setIban(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="bankName">Banque (optionnel)</Label>
                    <Input id="bankName" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                  </div>
                </>
              ) : (
                <div>
                  <Label htmlFor="phone">Numéro {METHOD_LABELS[method]}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+221 77 123 45 67"
                    required
                  />
                </div>
              )}
              <div>
                <Label htmlFor="note">Note (optionnel)</Label>
                <Input
                  id="note"
                  value={sellerNote}
                  onChange={(e) => setSellerNote(e.target.value)}
                  placeholder="Précision pour l'équipe (facultatif)"
                />
              </div>
              {error && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-2 text-xs text-rose-800">
                  {error}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Envoyer la demande
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowRequestForm(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Payouts history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des versements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucun versement demandé.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {payouts.map((p) => (
                <li key={p._id} className="flex items-start gap-3 p-3 sm:p-4">
                  <PayoutStatusIcon status={p.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{fmt(p.amount, p.currency)}</span>
                      <PayoutStatusBadge status={p.status} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {METHOD_LABELS[p.method]} · {fmtDate(p.requestedAt)}
                    </div>
                    {p.destination.phone && (
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">→ {p.destination.phone}</div>
                    )}
                    {p.destination.iban && (
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">→ {p.destination.iban}</div>
                    )}
                    {p.adminNote && (
                      <div className="mt-1 rounded bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                        <strong>Admin:</strong> {p.adminNote}
                      </div>
                    )}
                    {p.externalRef && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">Ref: {p.externalRef}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Sales ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dernières ventes</CardTitle>
          <CardDescription className="text-xs">
            Ventes en ligne créditées à votre solde (après commission)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {salesLedger.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Aucune vente en ligne encore. Activez le paiement en ligne sur vos boutiques digitales pour recevoir vos premiers revenus.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {salesLedger.map((t) => (
                <li key={t.id} className="flex items-center gap-3 p-3">
                  {t.kind === 'sale_credit' ? (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
                      <ArrowDownToLine className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-600">
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {t.kind === 'sale_credit' ? 'Vente en ligne' : 'Versement effectué'}
                      {t.orderNumber && <span className="ml-1 text-muted-foreground">· #{t.orderNumber}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.note} · {fmtDate(t.createdAt)}
                    </div>
                  </div>
                  <div className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    t.amount > 0 ? 'text-emerald-600' : 'text-rose-600',
                  )}>
                    {t.amount > 0 ? '+' : ''}{fmt(t.amount, wallet.currency)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayoutStatusIcon({ status }: { status: 'pending' | 'paid' | 'rejected' }) {
  if (status === 'paid') {
    return (
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
        <CheckCircle2 className="h-4 w-4" />
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-600">
        <XCircle className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600">
      <Clock className="h-4 w-4" />
    </div>
  );
}

function PayoutStatusBadge({ status }: { status: 'pending' | 'paid' | 'rejected' }) {
  const map = {
    pending:  { cls: 'bg-amber-500/10 text-amber-600',   label: 'En attente' },
    paid:     { cls: 'bg-emerald-500/10 text-emerald-600', label: 'Versé' },
    rejected: { cls: 'bg-rose-500/10 text-rose-600',     label: 'Rejeté' },
  };
  const c = map[status];
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', c.cls)}>
      {c.label}
    </span>
  );
}
