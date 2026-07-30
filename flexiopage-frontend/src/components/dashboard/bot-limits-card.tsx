'use client';

/**
 * Bloc "Limites & usage" du chatbot pour le dashboard vendeur.
 * Affiche :
 *  - Le compteur de conversations (progress bar colorée selon % du quota).
 *  - La date du prochain reset mensuel.
 *  - Une alerte visible quand le bot est proche/atteint la limite.
 *  - Un dialogue pour ajuster `messages_limit` dans la borne `messages_limit_max`.
 *
 * Le champ `messages_limit` est OPT-IN : vide = illimité, le bot n'est jamais
 * coupé côté messages. Utile pour un owner qui veut plafonner sa dépense IA.
 */
import { useState } from 'react';
import { AlertTriangle, MessageSquare, Settings2, Loader2, Check, Info, RefreshCw } from 'lucide-react';
import { messengerBotApi, whatsappBotApi, extractApiError, type MessengerBotConfig } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Channel = 'messenger' | 'whatsapp';

interface Props {
  storeId: string;
  channel: Channel;
  config: MessengerBotConfig;
  onSaved?: () => void;
}

function formatResetDate(iso?: string | null): string {
  if (!iso) return 'le 1er du mois prochain';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function BotLimitsCard({ storeId, channel, config, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const used = config.conversations_used_this_month ?? 0;
  const limit = config.conversations_limit ?? 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const messagesLimitMax = config.messages_limit_max ?? null;
  const messagesLimit = config.messages_limit ?? null;

  // Palette selon le remplissage : vert < 60%, ambre 60-85%, rouge > 85%.
  const barColor = pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
  const state: 'ok' | 'warn' | 'capped' = pct >= 100 ? 'capped' : pct >= 80 ? 'warn' : 'ok';

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-indigo-600" />
            Limites & usage du chatbot
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Renouvellement automatique {formatResetDate(config.month_reset_date)}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" />
          Gérer
        </Button>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-muted-foreground">Conversations ce mois</span>
          <span className="tabular-nums font-semibold">
            {used}
            <span className="text-muted-foreground"> / {limit || '∞'}</span>
            {limit > 0 && <span className="ml-1.5 text-muted-foreground">({pct}%)</span>}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {state === 'warn' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Tu approches ta limite mensuelle. Passé <strong>{limit} conversations</strong>, le bot
            ne répondra plus aux nouveaux clients jusqu'au renouvellement.
          </p>
        </div>
      )}
      {state === 'capped' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            <strong>Limite atteinte.</strong> Le bot ne répond plus aux nouvelles conversations
            jusqu'à {formatResetDate(config.month_reset_date)}. Contacte le support pour
            débloquer plus tôt.
          </p>
        </div>
      )}

      {/* Plafond messages (opt-in) : sert au vendeur qui veut cadrer sa dépense IA. */}
      {messagesLimitMax != null && messagesLimitMax > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Plafond messages : <strong className="text-foreground tabular-nums">{messagesLimit ?? '∞'}</strong> / {messagesLimitMax}
          </span>
          <span className="text-muted-foreground">
            au-delà : prélevé sur le solde IA
          </span>
        </div>
      )}

      <ManageDialog
        open={open}
        onOpenChange={setOpen}
        storeId={storeId}
        channel={channel}
        config={config}
        onSaved={() => { onSaved?.(); setOpen(false); }}
      />
    </section>
  );
}

function ManageDialog({
  open,
  onOpenChange,
  storeId,
  channel,
  config,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  channel: Channel;
  config: MessengerBotConfig;
  onSaved: () => void;
}) {
  // "" = illimité (opt-out du metering côté backend)
  const [value, setValue] = useState<string>(
    config.messages_limit != null && config.messages_limit > 0 ? String(config.messages_limit) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const cap = config.messages_limit_max ?? 0;

  async function save() {
    setError('');
    setSaved(false);
    let n: number;
    if (value.trim() === '') {
      n = 0; // 0 = illimité côté backend
    } else {
      n = Number(value);
      if (!Number.isInteger(n) || n < 0) {
        setError('Entrer un entier positif (ou vide pour illimité).');
        return;
      }
      if (cap > 0 && n > cap) {
        setError(`Maximum ${cap} — plafond fixé par l'admin.`);
        return;
      }
    }
    setSaving(true);
    try {
      const client = channel === 'whatsapp' ? whatsappBotApi : messengerBotApi;
      await client.updateConfig(storeId, { messages_limit: n });
      setSaved(true);
      setTimeout(onSaved, 400);
    } catch (err) {
      setError(extractApiError(err, 'Échec de l\'enregistrement.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Gérer les limites du chatbot" />
        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" /> Conversations mensuelles
            </div>
            <p className="mt-1 text-muted-foreground">
              Ton quota est de <strong className="text-foreground">{config.conversations_limit}</strong> conversations
              par mois ({config.conversations_used_this_month} utilisées). Pour l'augmenter, contacte le support —
              c'est un réglage admin.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Plafond messages / mois (facultatif)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={cap || undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="vide = illimité"
                className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {value && (
                <button
                  type="button"
                  onClick={() => setValue('')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Jusqu'à cette limite, les messages sont inclus. Au-delà, chaque message est prélevé
              de ton solde IA. Utile pour <strong>cadrer ta dépense</strong>.
              {cap > 0 && (
                <> Maximum autorisé : <strong className="text-foreground">{cap}</strong>.</>
              )}
            </p>
          </div>

          {error && <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{error}</p>}
          {saved && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Enregistré.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
