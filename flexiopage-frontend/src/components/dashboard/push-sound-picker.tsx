'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { pushApi } from '@/lib/api';
import { BellRing, Check, Loader2, Send } from 'lucide-react';

/**
 * Gestion des notifications push (app mobile) :
 *   - choix du son (parmi ceux proposés) ;
 *   - bouton « Tester » qui envoie une notif de test sur les appareils
 *     enregistrés → valide token + FCM + son sans passer de commande.
 * Le choix du son est stocké côté backend et appliqué à chaque push.
 */
export function PushSoundPicker() {
  const [sounds, setSounds] = useState<Array<{ key: string; label: string }>>([]);
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

  useEffect(() => {
    pushApi.getSounds()
      .then((res) => {
        setSounds(res.data.sounds || []);
        setSelected(res.data.selected || res.data.default || '');
      })
      .catch(() => setSounds([]));
  }, []);

  async function pick(key: string) {
    if (key === selected || saving) return;
    setSaving(key);
    const prev = selected;
    setSelected(key);
    try {
      await pushApi.setSound(key);
    } catch {
      setSelected(prev);
    } finally {
      setSaving(null);
    }
  }

  async function test() {
    setTesting(true);
    setTestMsg(null);
    try {
      const d = (await pushApi.test()).data;
      if (d.diagnostic === 'ok') {
        setTestMsg({ kind: 'ok', text: `Notification envoyée ✓ — regarde ton téléphone 📱 (${d.sent} appareil${d.sent > 1 ? 's' : ''}). Si rien n'arrive, la clé FCM manque côté serveur.` });
      } else if (d.diagnostic === 'no_device') {
        setTestMsg({ kind: 'warn', text: "Aucun appareil enregistré. Ouvre l'app mobile FlexioPage, connecte-toi et AUTORISE les notifications, puis reviens tester ici." });
      } else if (d.diagnostic === 'expo_error') {
        setTestMsg({ kind: 'warn', text: `Appareil enregistré (${d.tokens}) mais Expo/FCM refuse : ${d.errors.join(' · ')}. → c'est la clé FCM à configurer dans EAS.` });
      } else {
        setTestMsg({ kind: 'warn', text: 'Envoi effectué mais statut incertain. Réessaie.' });
      }
    } catch {
      setTestMsg({ kind: 'warn', text: 'Échec de l’envoi du test. Réessaie.' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Notifications mobiles</CardTitle>
        <CardDescription>Son joué sur ton téléphone à chaque nouvelle commande (app mobile), et test de la configuration.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sounds.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-3">
            {sounds.map((s) => {
              const active = selected === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => pick(s.key)}
                  disabled={!!saving}
                  className={
                    'flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors ' +
                    (active
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:bg-muted/40')
                  }
                >
                  {s.label}
                  {saving === s.key ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : active ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-br from-primary to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-60"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Tester la notification
          </button>
          {testMsg && (
            <span className={testMsg.kind === 'ok' ? 'text-xs font-medium text-emerald-600' : 'text-xs font-medium text-amber-600'}>
              {testMsg.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
