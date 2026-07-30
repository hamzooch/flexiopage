'use client';

/**
 * Drawer/Dialog listant les mutations récentes de limites bot (action=store.bot_limit).
 * Sert au support pour retrouver "qui a monté quel quota, quand, à combien".
 * Recharge en pagination cursor-based via `adminApi.audit`.
 */
import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { adminApi, extractApiError, type AdminAuditLog } from '@/lib/api';
import { Loader2, History, RefreshCw, ExternalLink } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function BotLimitAuditDrawer({ open, onOpenChange }: Props) {
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (cur?: string | null) => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.audit({ action: 'store.bot_limit', limit: 30, cursor: cur || undefined });
      setItems((prev) => (cur ? [...prev, ...res.data.items] : res.data.items));
      setCursor(res.data.nextCursor);
    } catch (err) {
      setError(extractApiError(err, 'Chargement impossible.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setItems([]);
      setCursor(null);
      void load();
    }
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          title={
            <span className="flex items-center gap-1.5">
              <History className="h-4 w-4 text-indigo-600" /> Historique — limites bot
            </span>
          }
        />
        <DialogBody className="max-h-[60vh] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucune mutation de limite bot enregistrée.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it._id} className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm">{it.summary}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(it.createdAt).toLocaleString('fr-FR')} · {it.actorEmail} ({it.actorRole})
                      </p>
                    </div>
                    {it.targetId && (
                      <a
                        href={`/admin/stores/${it.targetId}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Ouvrir la boutique"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Boutique
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Rafraîchir
          </Button>
          {cursor && (
            <Button size="sm" onClick={() => void load(cursor)} disabled={loading} className="gap-1.5">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Charger plus
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
