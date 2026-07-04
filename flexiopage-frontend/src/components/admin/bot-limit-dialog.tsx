'use client';

import { useState } from 'react';
import { adminApi, type AdminBotLimit } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, Loader2 } from 'lucide-react';

type Bot = AdminBotLimit;

/**
 * Éditeur admin des limites du chatbot d'une boutique.
 * - Quota conversations/mois (conversations_limit) = ce qui COUPE réellement le
 *   bot une fois atteint (défaut 50). C'est la limite à monter pour débloquer.
 * - Plafond (messages_limit_max) = max de messages que l'owner peut se donner.
 * - Limite imposée messages (messages_limit, optionnel) = valeur forcée ; vide/0
 *   = illimité (metering OPT-IN, le bot n'est jamais coupé par les messages).
 */
export function BotLimitDialog({
  storeId,
  storeName,
  onSaved,
}: {
  storeId: string;
  storeName: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [cap, setCap] = useState<string>('');
  const [limit, setLimit] = useState<string>('');
  const [convLimit, setConvLimit] = useState<string>('');
  const [msg, setMsg] = useState<string>('');

  async function load() {
    setLoading(true);
    setMsg('');
    try {
      const res = await adminApi.getStoreBotLimits(storeId);
      const list = res.data.bots || [];
      setBots(list);
      // Pré-remplit avec le 1er bot (les canaux partagent en général la même config).
      const first = list[0];
      setCap(first?.messages_limit_max != null ? String(first.messages_limit_max) : '');
      setLimit(first?.messages_limit != null ? String(first.messages_limit) : '');
      setConvLimit(first?.conversations_limit != null ? String(first.conversations_limit) : '');
    } catch {
      setBots([]);
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) void load();
  }

  async function save() {
    const capN = Number(cap);
    if (!Number.isInteger(capN) || capN < 0 || capN > 1_000_000) {
      setMsg('Le plafond doit être un entier entre 0 et 1 000 000.');
      return;
    }
    if (convLimit.trim() !== '') {
      const cN = Number(convLimit);
      if (!Number.isInteger(cN) || cN < 0 || cN > 1_000_000) {
        setMsg('Les conversations/mois doivent être un entier entre 0 et 1 000 000.');
        return;
      }
    }
    setSaving(true);
    setMsg('');
    try {
      const data: { messages_limit_max: number; messages_limit?: number; conversations_limit?: number } = { messages_limit_max: capN };
      if (limit.trim() !== '') data.messages_limit = Number(limit);
      if (convLimit.trim() !== '') data.conversations_limit = Number(convLimit);
      const res = await adminApi.setStoreBotLimits(storeId, data);
      setBots(res.data.bots || []);
      setMsg('✓ Enregistré.');
      onSaved?.();
    } catch {
      setMsg('Échec de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Limite messages du chatbot"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Bot
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader title={`Limite chatbot — ${storeName}`} />
          <DialogBody className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : !bots?.length ? (
              <p className="text-sm text-muted-foreground">Cette boutique n’a aucun chatbot connecté (Messenger/WhatsApp).</p>
            ) : (
              <>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                  <p className="mb-1 font-semibold text-muted-foreground">Bots actuels :</p>
                  {bots.map((b) => {
                    const capped = b.conversations_limit != null && b.conversations_used_this_month >= b.conversations_limit;
                    return (
                      <div key={b.channel} className="flex justify-between gap-2">
                        <span className="capitalize">{b.channel}</span>
                        <span className="tabular-nums text-muted-foreground">
                          <span className={capped ? 'font-semibold text-amber-600' : ''}>
                            {b.conversations_used_this_month}/{b.conversations_limit ?? '∞'} conv.{capped ? ' ⚠️' : ''}
                          </span>
                          {' · '}msg {b.messages_limit ?? '∞'}/{b.messages_limit_max ?? '∞'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Conversations / mois (quota qui coupe le bot)</label>
                  <input
                    type="number" min={0} value={convLimit}
                    onChange={(e) => setConvLimit(e.target.value)}
                    placeholder="ex. 1000"
                    className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    <strong>C’est cette limite qui bloque réellement le bot</strong> une fois atteinte (défaut 50/mois). Monte-la pour débloquer le vendeur.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Plafond max (messages/mois)</label>
                  <input
                    type="number" min={0} value={cap}
                    onChange={(e) => setCap(e.target.value)}
                    placeholder="ex. 1000"
                    className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">Le maximum que l’owner peut se fixer.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Limite imposée (optionnel)</label>
                  <input
                    type="number" min={0} value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="vide ou 0 = illimité"
                    className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Au-delà, chaque message est prélevé du solde IA du vendeur. <strong>Vide ou 0 = illimité</strong> (le bot n’est jamais coupé).
                  </p>
                </div>

                {msg && <p className={msg.startsWith('✓') ? 'text-xs text-emerald-600' : 'text-xs text-red-600'}>{msg}</p>}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fermer</Button>
            {!!bots?.length && (
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Enregistrer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
