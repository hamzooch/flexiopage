'use client';

/**
 * Carte « Bot Telegram » (Intégrations) — Phase 1 : liaison + notifications.
 *
 * Le vendeur clique « Lier mon Telegram » → on ouvre le deep-link du bot
 * plateforme dans un nouvel onglet ; il fait /start, et on sonde le statut
 * jusqu'à ce que la liaison soit confirmée. Ensuite il reçoit ses notifs
 * (commandes, livraisons, solde) directement sur Telegram — gratuitement.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, CheckCircle2, Link2, Unlink, Bell } from 'lucide-react';
import { telegramApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface TgStatus {
  configured: boolean;
  linked: boolean;
  username: string | null;
}

export function TelegramCard() {
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
      // Sonde le statut jusqu'à la liaison (≈ 2 min max).
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
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600">
          <Send className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Bot Telegram</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reçois tes notifications (commandes, livraisons, solde) directement sur Telegram. Gratuit.
          </p>
        </div>
        {status?.linked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connecté
          </span>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
          </div>
        ) : !status?.configured ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Le bot Telegram n’est pas encore activé sur cette plateforme. Reviens bientôt.
          </div>
        ) : status.linked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-foreground/80">
              <Bell className="h-4 w-4 text-emerald-600" />
              Notifications actives{status.username ? <> · <span className="font-medium">@{status.username}</span></> : null}
            </div>
            <Button variant="outline" size="sm" onClick={handleUnlink} disabled={working} className="gap-1.5">
              {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
              Délier
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button onClick={handleLink} disabled={working} className="w-full gap-2 bg-sky-600 hover:bg-sky-700 sm:w-auto">
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Lier mon Telegram
            </Button>
            {waiting && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                En attente… ouvre Telegram, appuie sur « Démarrer », puis reviens ici.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
