'use client';

/**
 * Réglages globaux (superadmin) : défauts appliqués à chaque NOUVELLE BotConfig
 * — `defaultConversationsLimit` (quota mensuel) et `defaultMessagesLimitMax`
 * (plafond messages que l'owner peut se fixer). N'affecte PAS les bots
 * existants — passer par le dialog par boutique pour ça.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi, extractApiError } from '@/lib/api';
import { Loader2, Save, Sliders, Check } from 'lucide-react';

export function BotLimitDefaultsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conv, setConv] = useState('');
  const [msg, setMsg] = useState('');
  const [fallback, setFallback] = useState<{ defaultConversationsLimit: number; defaultMessagesLimitMax: number } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    adminApi.getBotLimitDefaults()
      .then((res) => {
        if (!alive) return;
        setConv(String(res.data.defaultConversationsLimit));
        setMsg(String(res.data.defaultMessagesLimitMax));
        setFallback(res.data.fallbacks);
      })
      .catch((err) => setStatus({ ok: false, text: extractApiError(err, 'Chargement impossible.') }))
      .finally(() => setLoading(false));
    return () => { alive = false; };
  }, []);

  async function save() {
    const convN = Number(conv);
    const msgN = Number(msg);
    if (!Number.isInteger(convN) || convN < 0) {
      setStatus({ ok: false, text: 'Défaut conversations : entier positif requis.' });
      return;
    }
    if (!Number.isInteger(msgN) || msgN < 0) {
      setStatus({ ok: false, text: 'Défaut messages : entier positif requis.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await adminApi.setBotLimitDefaults({ defaultConversationsLimit: convN, defaultMessagesLimitMax: msgN });
      setStatus({ ok: true, text: 'Défauts enregistrés.' });
    } catch (err) {
      setStatus({ ok: false, text: extractApiError(err, 'Échec de l\'enregistrement.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Sliders className="h-4 w-4 text-indigo-600" />
          Défauts globaux (nouvelles boutiques)
        </CardTitle>
        <CardDescription className="text-xs">
          Appliqués à chaque nouvelle BotConfig. Ne modifie pas les bots existants.
          {fallback && <> Fallbacks intégrés : {fallback.defaultConversationsLimit} conv / {fallback.defaultMessagesLimitMax} msg.</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Conversations / mois (défaut)</label>
              <input
                type="number"
                min={0}
                value={conv}
                onChange={(e) => setConv(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Plafond messages / mois (défaut)</label>
              <input
                type="number"
                min={0}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <Button onClick={save} disabled={saving} className="h-10 gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
        )}
        {status && (
          <p className={status.ok ? 'mt-2 flex items-center gap-1.5 text-xs text-emerald-600' : 'mt-2 text-xs text-rose-600'}>
            {status.ok && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            {status.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
