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
import { CheckCircle2, Loader2, MailCheck, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    </div>
  );
}
