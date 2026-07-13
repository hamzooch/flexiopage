'use client';

/**
 * Admin payout queue.
 *
 * Shows all seller payout requests. Owners can mark them paid (records a
 * wallet.payout_debit audit entry) or reject them (refunds the frozen amount
 * back to the seller's payoutBalance). The money movement itself happens
 * out-of-band — Wave/OM/MTN/bank — and the admin records the external
 * transaction reference here for the ledger.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Loader2,
  Banknote,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';

type PayoutWithUser = Awaited<ReturnType<typeof adminApi.listPayouts>>['data']['payouts'][number];
type PayoutStats = Awaited<ReturnType<typeof adminApi.getPayoutStats>>['data'];

const METHOD_LABELS: Record<string, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
  mtn_momo: 'MTN Mobile Money',
  bank_transfer: 'Virement bancaire',
};

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

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutWithUser[]>([]);
  const [stats, setStats] = useState<PayoutStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'paid' | 'rejected' | 'all'>('pending');
  const [processing, setProcessing] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Action modal state
  const [modalPayout, setModalPayout] = useState<PayoutWithUser | null>(null);
  const [modalAction, setModalAction] = useState<'paid' | 'rejected'>('paid');
  const [modalExternalRef, setModalExternalRef] = useState('');
  const [modalNote, setModalNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        adminApi.listPayouts({ status: tab === 'all' ? undefined : tab, limit: 100 }),
        adminApi.getPayoutStats(),
      ]);
      setPayouts(pRes.data.payouts);
      setStats(sRes.data);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  function openModal(p: PayoutWithUser, action: 'paid' | 'rejected') {
    setModalPayout(p);
    setModalAction(action);
    setModalExternalRef('');
    setModalNote('');
  }

  async function handleConfirm() {
    if (!modalPayout) return;
    setProcessing(modalPayout._id);
    try {
      await adminApi.updatePayout(modalPayout._id, {
        status: modalAction,
        externalRef: modalExternalRef.trim() || undefined,
        adminNote: modalNote.trim() || undefined,
      });
      setModalPayout(null);
      await load();
    } catch (err: unknown) {
      alert('Erreur: ' + ((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'inconnue'));
    } finally {
      setProcessing(null);
    }
  }

  function copyDestination(p: PayoutWithUser) {
    const dest = p.destination.phone || p.destination.iban || '';
    if (!dest) return;
    navigator.clipboard.writeText(dest);
    setCopiedId(p._id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filteredPayouts = useMemo(() => payouts, [payouts]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Versements aux vendeurs</h1>
          <p className="text-xs text-muted-foreground">
            File d&apos;attente des demandes de payout
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                En attente
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-600">{stats.pendingCount}</span>
                <span className="text-xs text-muted-foreground">demande(s)</span>
              </div>
              {stats.pendingByCurrency.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Total: {stats.pendingByCurrency.map((c) => fmt(c.amount, c.currency)).join(' · ')}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Versés sur 30 jours
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-600">{stats.paid30dCount}</span>
                <span className="text-xs text-muted-foreground">payout(s)</span>
              </div>
              {stats.paid30dByCurrency.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Total: {stats.paid30dByCurrency.map((c) => fmt(c.amount, c.currency)).join(' · ')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
        {(['pending', 'paid', 'rejected', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'pending' ? 'En attente' : t === 'paid' ? 'Versés' : t === 'rejected' ? 'Rejetés' : 'Tous'}
          </button>
        ))}
      </div>

      {/* Payouts list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPayouts.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Aucune demande {tab === 'pending' ? 'en attente' : tab === 'paid' ? 'validée' : tab === 'rejected' ? 'rejetée' : ''}.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {filteredPayouts.map((p) => (
                <li key={p._id} className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <StatusIcon status={p.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold tabular-nums">{fmt(p.amount, p.currency)}</span>
                        <StatusBadge status={p.status} />
                        <span className="text-xs text-muted-foreground">
                          {METHOD_LABELS[p.method] || p.method}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <strong>{p.user?.name || p.user?.email || 'Vendeur inconnu'}</strong>
                        {p.user?.email && p.user?.name && <span> · {p.user.email}</span>}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Demandé le {fmtDate(p.requestedAt)}
                        {p.processedAt && ` · Traité le ${fmtDate(p.processedAt)}`}
                      </div>

                      {/* Destination — the money target */}
                      <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                          Destinataire
                        </div>
                        {p.destination.phone && (
                          <div className="flex items-center gap-2 font-mono text-xs">
                            📱 {p.destination.phone}
                            <button
                              onClick={() => copyDestination(p)}
                              className="ml-auto rounded p-1 hover:bg-background"
                            >
                              {copiedId === p._id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        )}
                        {p.destination.iban && (
                          <>
                            {p.destination.accountName && (
                              <div className="text-xs">👤 {p.destination.accountName}</div>
                            )}
                            <div className="flex items-center gap-2 font-mono text-xs">
                              🏦 {p.destination.iban}
                              <button
                                onClick={() => copyDestination(p)}
                                className="ml-auto rounded p-1 hover:bg-background"
                              >
                                {copiedId === p._id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                            {p.destination.bankName && (
                              <div className="text-xs text-muted-foreground">{p.destination.bankName}</div>
                            )}
                          </>
                        )}
                      </div>

                      {p.sellerNote && (
                        <div className="mt-2 rounded bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                          <strong>Vendeur:</strong> {p.sellerNote}
                        </div>
                      )}
                      {p.adminNote && (
                        <div className="mt-1 rounded bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-800">
                          <strong>Admin:</strong> {p.adminNote}
                        </div>
                      )}
                      {p.externalRef && (
                        <div className="mt-1 text-[10px] text-muted-foreground">Ref transfert: {p.externalRef}</div>
                      )}
                    </div>

                    {/* Actions */}
                    {p.status === 'pending' && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => openModal(p, 'paid')}
                          disabled={processing === p._id}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Marquer versé
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-rose-600"
                          onClick={() => openModal(p, 'rejected')}
                          disabled={processing === p._id}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rejeter
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Confirmation modal */}
      {modalPayout && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">
                {modalAction === 'paid' ? 'Confirmer le versement' : 'Rejeter la demande'}
              </CardTitle>
              <CardDescription className="text-xs">
                {modalAction === 'paid'
                  ? `Confirme que ${fmt(modalPayout.amount, modalPayout.currency)} ont été envoyés à ${modalPayout.destination.phone || modalPayout.destination.iban}.`
                  : `Le montant de ${fmt(modalPayout.amount, modalPayout.currency)} sera remboursé au solde du vendeur.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {modalAction === 'paid' && (
                <div>
                  <Label htmlFor="externalRef">Référence du transfert (optionnel)</Label>
                  <Input
                    id="externalRef"
                    value={modalExternalRef}
                    onChange={(e) => setModalExternalRef(e.target.value)}
                    placeholder="Ex: transaction Wave WV-123..."
                  />
                </div>
              )}
              <div>
                <Label htmlFor="adminNote">Note (optionnel)</Label>
                <Input
                  id="adminNote"
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  placeholder={modalAction === 'rejected' ? 'Raison du rejet' : 'Note interne'}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleConfirm}
                  disabled={processing === modalPayout._id}
                  className={cn('flex-1', modalAction === 'rejected' && 'bg-rose-600 hover:bg-rose-700')}
                >
                  {processing === modalPayout._id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                  {modalAction === 'paid' ? 'Confirmer versé' : 'Confirmer rejet'}
                </Button>
                <Button variant="outline" onClick={() => setModalPayout(null)}>
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: 'pending' | 'paid' | 'rejected' }) {
  if (status === 'paid') {
    return (
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
        <CheckCircle2 className="h-5 w-5" />
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-600">
        <XCircle className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600">
      <Clock className="h-5 w-5" />
    </div>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'paid' | 'rejected' }) {
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
