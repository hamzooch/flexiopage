'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { pushApi } from '@/lib/api';
import { BellRing, Check, Loader2 } from 'lucide-react';

/**
 * Sélecteur du son de notification push (app mobile). 3 sons proposés ; le
 * choix est stocké côté backend et appliqué à chaque push (canal Android /
 * sound iOS). Visible dans les réglages ; sans effet tant que l'app mobile
 * n'est pas installée, mais le choix est mémorisé.
 */
export function PushSoundPicker() {
  const [sounds, setSounds] = useState<Array<{ key: string; label: string }>>([]);
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState<string | null>(null);

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
      setSelected(prev); // rollback si l'appel échoue
    } finally {
      setSaving(null);
    }
  }

  if (!sounds.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Son des notifications</CardTitle>
        <CardDescription>Choisis le son joué sur ton téléphone à chaque nouvelle commande (app mobile).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
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
      </CardContent>
    </Card>
  );
}
