'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, Loader2, CheckCircle2, Link2, Unlink, Bell, MessageSquare } from 'lucide-react';
import { telegramApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface TgStatus {
  configured: boolean;
  linked: boolean;
  username: string | null;
}

export default function TelegramBotPage() {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async (): Promise<TgStatus | null> => {
    try {
      const res = await telegramApi.status();
      setStatus(res.data);
      return res.data;
    } catch {
      setStatus(null);
      return null;
    } finally {
      setLoading(false);
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
    try {
      const res = await telegramApi.link();
      window.open(res.data.deepLink, '_blank', 'noopener,noreferrer');
      setWaiting(true);
      // Poll status for ~2 minutes max.
      let n = 0;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        n += 1;
        const s = await load();
        if (s?.linked || n > 40) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setWaiting(false);
        }
      }, 3000);
    } catch {
      setWaiting(false);
    } finally {
      setWorking(false);
    }
  }, [load]);

  const handleUnlink = useCallback(async () => {
    setWorking(true);
    try {
      await telegramApi.unlink();
      await load();
    } finally {
      setWorking(false);
    }
  }, [load]);

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

      <div className="container max-w-4xl gap-6 px-4 py-8 sm:px-6">
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
          {status?.linked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Connecté
            </span>
          )}
        </div>

        {/* Main Content */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement…
            </div>
          ) : !status?.configured ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Le bot Telegram n'est pas encore activé sur cette plateforme. Reviens bientôt.
              </p>
            </div>
          ) : status.linked ? (
            <div className="space-y-6">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="font-medium text-emerald-900">Notifications actives</p>
                    {status.username && (
                      <p className="text-sm text-emerald-700">
                        Connecté en tant que <span className="font-mono">@{status.username}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Tu reçois:</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Notifications de nouvelles commandes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Mises à jour de statut de livraison</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Alertes de solde et retraits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Complètement gratuit</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleUnlink} disabled={working} variant="outline" className="gap-1.5">
                  {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  Délier mon compte
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  Lie ton compte Telegram pour commencer à recevoir des notifications. C'est gratuit et prend 30 secondes.
                </p>
              </div>

              <Button onClick={handleLink} disabled={working} size="lg" className="gap-2 bg-sky-600 hover:bg-sky-700">
                {working ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
                Lier mon Telegram
              </Button>

              {waiting && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="flex items-center gap-2 text-sm text-amber-900">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    En attente… Ouvre Telegram, appuie sur « Démarrer », puis reviens ici.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="font-semibold">Tu recevras:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <span>Notifications de nouvelles commandes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <span>Mises à jour de statut de livraison</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <span>Alertes de solde et retraits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <span>Complètement gratuit, sans limites</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
