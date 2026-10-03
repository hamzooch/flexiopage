'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCircle2,
  Link2,
  Unlink,
  Bell,
  BellOff,
  MessageSquare,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  LogIn,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { telegramApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';

interface TgStatus {
  configured: boolean;
  linked: boolean;
  paused: boolean;
  username: string | null;
  firstName: string | null;
  linkedAt: string | null;
}

type LoadState = 'loading' | 'ok' | 'unauthenticated' | 'error';

/** Formate "il y a 3 jours" simplement, sans dépendance externe. */
function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString();
}

export default function TelegramBotPage() {
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [working, setWorking] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async (): Promise<TgStatus | null> => {
    try {
      const res = await telegramApi.status();
      setStatus(res.data);
      setLoadState('ok');
      return res.data;
    } catch (err) {
      // Distingue "pas connecté" (401) de "erreur serveur" pour afficher
      // un message précis — avant on affichait "bot non activé" dans les
      // deux cas, ce qui envoyait le vendeur sur une fausse piste.
      const status = (err as { response?: { status?: number } })?.response?.status;
      setStatus(null);
      setLoadState(status === 401 ? 'unauthenticated' : 'error');
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load]);

  const handleLink = useCallback(async () => {
    setWorking(true);
    setTestMsg(null);
    try {
      const res = await telegramApi.link();
      setDeepLink(res.data.deepLink);
      window.open(res.data.deepLink, '_blank', 'noopener,noreferrer');
      // Poll status (~2 min max). On s'arrête dès que linked passe à true.
      let n = 0;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        n += 1;
        const s = await load();
        if (s?.linked || n > 40) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          if (s?.linked) setDeepLink(null);
        }
      }, 3000);
    } finally {
      setWorking(false);
    }
  }, [load]);

  const handleUnlink = useCallback(async () => {
    setWorking(true);
    try {
      await telegramApi.unlink();
      setTestMsg(null);
      await load();
    } finally {
      setWorking(false);
    }
  }, [load]);

  const handleTogglePause = useCallback(async () => {
    if (!status) return;
    setWorking(true);
    try {
      await telegramApi.setPreferences(status.paused);
      await load();
    } finally {
      setWorking(false);
    }
  }, [status, load]);

  const handleTest = useCallback(async () => {
    setWorking(true);
    setTestMsg(null);
    try {
      await telegramApi.test();
      setTestMsg({ ok: true, text: 'Message de test envoyé — vérifie Telegram !' });
    } catch (err) {
      const reason = (err as { response?: { data?: { reason?: string } } })?.response?.data?.reason;
      const map: Record<string, string> = {
        not_configured: 'Bot pas configuré côté serveur.',
        not_linked: 'Aucun compte Telegram lié.',
        disabled: 'Notifications en pause — réactive-les avant de tester.',
        send_failed: "Échec d'envoi — le chat Telegram est peut-être fermé.",
      };
      setTestMsg({ ok: false, text: map[reason || ''] || "Échec d'envoi." });
    } finally {
      setWorking(false);
    }
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!deepLink) return;
    await navigator.clipboard.writeText(deepLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [deepLink]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-card">
        <div className="container max-w-4xl gap-4 px-4 py-4 sm:px-6">
          <Link href="/dashboard/apps" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Retour aux applications
          </Link>
        </div>
      </div>

      <div className="container max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-500/10 text-sky-600">
            <Send className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">Bot Telegram</h1>
            <p className="mt-1 text-muted-foreground">
              Reçois tes notifications (commandes, livraisons, solde) directement sur Telegram. Gratuit et instantané.
            </p>
          </div>
          {status?.linked && !status.paused && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Connecté
            </span>
          )}
          {status?.paused && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-700">
              <BellOff className="h-4 w-4" /> En pause
            </span>
          )}
        </div>

        {/* Main Content */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          {loadState === 'loading' ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement…
            </div>
          ) : loadState === 'unauthenticated' || !token ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
              <LogIn className="mx-auto h-10 w-10 text-amber-600" />
              <h3 className="mt-3 font-semibold text-amber-900">Session expirée</h3>
              <p className="mt-1 text-sm text-amber-800">
                Reconnecte-toi pour gérer ton bot Telegram.
              </p>
              <Link href="/login" className="mt-4 inline-block">
                <Button variant="default" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Se connecter
                </Button>
              </Link>
            </div>
          ) : loadState === 'error' ? (
            <div className="rounded-xl border border-dashed border-red-300 bg-red-50 p-6 text-center">
              <p className="text-sm text-red-900">Impossible de joindre le serveur. Réessaie dans un instant.</p>
              <Button onClick={() => void load()} variant="outline" size="sm" className="mt-3 gap-2">
                <RefreshCw className="h-4 w-4" />
                Réessayer
              </Button>
            </div>
          ) : !status?.configured ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Le bot Telegram n'est pas encore activé sur cette plateforme. Reviens bientôt.
              </p>
            </div>
          ) : status.linked ? (
            // ─── Compte lié ────────────────────────────────────────────
            <div className="space-y-6">
              <div className={`rounded-lg border p-4 ${status.paused ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="flex items-start gap-3">
                  {status.paused ? (
                    <BellOff className="mt-0.5 h-5 w-5 text-amber-600" />
                  ) : (
                    <Bell className="mt-0.5 h-5 w-5 text-emerald-600" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${status.paused ? 'text-amber-900' : 'text-emerald-900'}`}>
                      {status.paused ? 'Notifications en pause' : 'Notifications actives'}
                    </p>
                    <div className={`mt-1 space-y-0.5 text-sm ${status.paused ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {status.firstName && (
                        <p>
                          Compte Telegram&nbsp;: <span className="font-medium">{status.firstName}</span>
                          {status.username && (
                            <span className="font-mono text-xs"> (@{status.username})</span>
                          )}
                        </p>
                      )}
                      {status.linkedAt && (
                        <p className="text-xs opacity-75">Lié {formatRelative(status.linkedAt)}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Résultat du test */}
              {testMsg && (
                <div className={`rounded-lg border p-3 text-sm ${testMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                  {testMsg.text}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleTest}
                  disabled={working || status.paused}
                  className="gap-1.5 bg-sky-600 hover:bg-sky-700"
                >
                  {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Envoyer un test
                </Button>
                <Button onClick={handleTogglePause} disabled={working} variant="outline" className="gap-1.5">
                  {working ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : status.paused ? (
                    <Bell className="h-4 w-4" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                  {status.paused ? 'Réactiver' : 'Mettre en pause'}
                </Button>
                <Button onClick={handleUnlink} disabled={working} variant="outline" className="gap-1.5">
                  {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  Délier
                </Button>
              </div>

              {/* Ce que tu reçois */}
              <div className="space-y-3 pt-2">
                <h3 className="font-semibold">Tu reçois&nbsp;:</h3>
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  {[
                    'Nouvelles commandes',
                    'Statuts de livraison',
                    'Alertes de solde',
                    'Événements de l\'équipe',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Commandes dispo dans Telegram */}
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <h3 className="mb-2 text-sm font-semibold">Commandes dans Telegram</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>
                    <code className="font-mono text-sky-700">/stop</code> — couper les notifications
                  </li>
                  <li>
                    <code className="font-mono text-sky-700">/aide</code> — afficher l'aide
                  </li>
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Astuce&nbsp;: tu peux aussi gérer la pause depuis cette page.
                </p>
              </div>
            </div>
          ) : (
            // ─── Compte NON lié ────────────────────────────────────────
            <div className="space-y-6">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  Lie ton compte Telegram pour commencer à recevoir des notifications. C'est gratuit et prend 30 secondes.
                </p>
              </div>

              {/* Mode compact : bouton + QR code */}
              {deepLink ? (
                <div className="grid gap-6 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-[auto,1fr]">
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-lg bg-white p-3 shadow-sm">
                      <QRCodeSVG value={deepLink} size={160} />
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <QrCode className="h-3 w-3" />
                      Scanne avec ton mobile
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm">
                      <strong>Prochaine étape&nbsp;:</strong> ouvre le lien dans Telegram et appuie sur « Démarrer ».
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
                      >
                        <Send className="h-4 w-4" />
                        Ouvrir Telegram
                      </a>
                      <Button onClick={handleCopyLink} variant="outline" size="sm" className="gap-1.5">
                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copié' : 'Copier'}
                      </Button>
                    </div>
                    <p className="flex items-center gap-2 text-sm text-amber-700">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      En attente de ta confirmation dans Telegram…
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Lien valide 15 minutes. Expiré ? Clique à nouveau sur « Lier mon Telegram ».
                    </p>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={handleLink}
                  disabled={working}
                  size="lg"
                  className="gap-2 bg-sky-600 hover:bg-sky-700"
                >
                  {working ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
                  Lier mon Telegram
                </Button>
              )}

              <div className="space-y-3">
                <h3 className="font-semibold">Tu recevras&nbsp;:</h3>
                <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  {[
                    'Nouvelles commandes',
                    'Mises à jour de statut de livraison',
                    'Alertes de solde et retraits',
                    'Événements équipe',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
