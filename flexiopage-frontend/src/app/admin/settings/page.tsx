'use client';

/**
 * Admin → Réglages plateforme.
 *
 * Toggles globaux qui modifient le comportement du signup / dashboard
 * sans redéploiement. Aujourd'hui : kill-switch vérification email.
 * Extensible — chaque section est un Card indépendant.
 *
 * Lecture ouverte à tout admin, écriture réservée aux superadmins :
 * l'UI laisse le read-only admin atterrir mais désactive le toggle.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MailCheck, ShieldAlert, Percent, Banknote } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { adminApi, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'saving' | 'saved' | 'error';

export default function AdminSettingsPage() {
  const isSuperAdmin = useAuthStore((s) => ['superadmin', 'owner'].includes(String(s.user?.role)));
  const confirm = useConfirm();

  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    adminApi
      .getAuthSettings()
      .then((res) => {
        setEmailVerificationEnabled(res.data.auth.emailVerificationEnabled);
        setUpdatedAt(res.data.updatedAt);
      })
      .catch((err) => {
        setErrorMessage(extractApiError(err, 'Impossible de charger les réglages.'));
        setStatus('error');
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleEmailVerification() {
    if (!isSuperAdmin) return;
    const next = !emailVerificationEnabled;
    const ok = await confirm({
      title: next
        ? 'Réactiver la vérification email ?'
        : 'Désactiver la vérification email ?',
      description: next
        ? 'Les nouveaux signups email/password recevront à nouveau un mail Resend et devront cliquer le lien avant que la bannière disparaisse.'
        : 'Les nouveaux signups seront marqués comme vérifiés automatiquement, aucun mail ne partira. Utile si Resend est en panne ou pour une promo sans friction. Les comptes non vérifiés existants ne verront plus la bannière.',
      confirmLabel: next ? 'Réactiver' : 'Désactiver',
      tone: next ? 'success' : 'warning',
    });
    if (!ok) return;

    setStatus('saving');
    setErrorMessage('');
    try {
      const res = await adminApi.updateAuthSettings({ emailVerificationEnabled: next });
      setEmailVerificationEnabled(res.data.auth.emailVerificationEnabled);
      setUpdatedAt(res.data.updatedAt);
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 2200);
    } catch (err) {
      setErrorMessage(extractApiError(err, 'Sauvegarde échouée.'));
      setStatus('error');
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldAlert className="h-6 w-6 text-primary" />
          Réglages plateforme
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toggles globaux qui prennent effet immédiatement, sans redéploiement.
        </p>
      </header>

      {!isSuperAdmin && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900">
          Lecture seule — seuls les <strong>superadmins</strong> peuvent modifier ces réglages.
        </div>
      )}

      {/* ── Vérification email ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailCheck className="h-4 w-4" />
            Vérification d&apos;email au signup
          </CardTitle>
          <CardDescription>
            Quand activée, les nouveaux signups email/password reçoivent un mail Resend avec un lien à cliquer. Tant qu&apos;ils ne cliquent pas, une bannière persiste en haut du dashboard. Les comptes Google ne sont pas affectés (Google a déjà vérifié l&apos;email).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={toggleEmailVerification}
            disabled={!isSuperAdmin || status === 'saving'}
            className={cn(
              'flex w-full items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4 text-left transition-colors',
              isSuperAdmin
                ? 'border-border/60 hover:border-primary/40 hover:bg-muted/40'
                : 'cursor-not-allowed border-border/40 opacity-70',
            )}
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {emailVerificationEnabled ? 'Activée' : 'Désactivée'}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {emailVerificationEnabled
                  ? 'Les signups doivent confirmer leur email pour considérer le compte comme « vérifié ».'
                  : 'Mode bypass — tous les signups sont auto-marqués vérifiés. Aucun mail ne part.'}
              </p>
            </div>
            <div
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                emailVerificationEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform',
                  emailVerificationEnabled ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </div>
          </button>

          {updatedAt && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Dernière modification : {new Date(updatedAt).toLocaleString('fr-FR')}
            </p>
          )}

          {status === 'saved' && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Réglages sauvegardés
            </div>
          )}

          {errorMessage && (
            <p className="mt-3 text-xs text-rose-600">{errorMessage}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Commission plateforme + seuils de retrait ────────────── */}
      <PlatformSettingsCard isSuperAdmin={isSuperAdmin} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Platform commercials — commission on online sales + payout minimums
// ─────────────────────────────────────────────────────────────────────

interface PlatformState {
  commissionRate: number;
  payoutMinimums: Record<string, number>;
}

const CURRENCY_ORDER = ['XOF', 'USD', 'EUR', 'NGN', 'GHS', 'KES', 'MAD'];

function PlatformSettingsCard({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [commissionPct, setCommissionPct] = useState('15');
  const [minimums, setMinimums] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .getPlatformSettings()
      .then((res) => {
        setPlatform(res.data.platform);
        setCommissionPct(String(Math.round(res.data.platform.commissionRate * 100)));
        const asStrings: Record<string, string> = {};
        for (const [cur, val] of Object.entries(res.data.platform.payoutMinimums)) {
          asStrings[cur] = String(val);
        }
        setMinimums(asStrings);
      })
      .catch((err) => setError(extractApiError(err, 'Impossible de charger les réglages.')))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!isSuperAdmin) return;
    setError('');
    setSaved(false);

    const pct = Number(commissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('La commission doit être entre 0 et 100.');
      return;
    }
    const payoutMinimums: Record<string, number> = {};
    for (const [cur, val] of Object.entries(minimums)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) {
        setError(`Minimum ${cur} invalide.`);
        return;
      }
      payoutMinimums[cur] = n;
    }

    setSaving(true);
    try {
      const res = await adminApi.updatePlatformSettings({
        commissionRate: pct / 100,
        payoutMinimums,
      });
      setPlatform(res.data.platform);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(extractApiError(err, 'Sauvegarde échouée.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!platform) return null;

  const currencies = Array.from(new Set([...CURRENCY_ORDER, ...Object.keys(platform.payoutMinimums)]));
  const previewNet = Math.round(10000 * (1 - Number(commissionPct) / 100));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4" />
          Commission plateforme &amp; seuils de retrait
        </CardTitle>
        <CardDescription>
          Le vendeur reçoit <strong>(montant vente − commission)</strong> dans son solde &quot;Revenus&quot;, et peut demander un versement une fois le seuil atteint pour sa devise.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Commission */}
        <div>
          <Label htmlFor="commissionPct">Taux de commission (%)</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="commissionPct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              disabled={!isSuperAdmin}
              className="max-w-[150px]"
            />
            <span className="text-xs text-muted-foreground">
              Sur 10 000 XOF le vendeur reçoit <strong>{previewNet} XOF</strong>
            </span>
          </div>
        </div>

        {/* Payout minimums */}
        <div>
          <Label className="flex items-center gap-1.5">
            <Banknote className="h-3.5 w-3.5" />
            Minimums de retrait par devise
          </Label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {currencies.map((cur) => (
              <div key={cur} className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {cur}
                </span>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={minimums[cur] ?? ''}
                  onChange={(e) => setMinimums({ ...minimums, [cur]: e.target.value })}
                  disabled={!isSuperAdmin}
                  className="text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={!isSuperAdmin || saving} className="gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Sauvegardé
            </span>
          )}
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
