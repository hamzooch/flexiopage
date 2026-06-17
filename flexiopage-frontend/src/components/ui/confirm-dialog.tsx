'use client';

/**
 * Remplacement themé pour `window.confirm` et `window.prompt`.
 *
 * Usage :
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Supprimer ?',
 *     description: 'Action irréversible',
 *     confirmLabel: 'Supprimer',
 *     tone: 'destructive',
 *   });
 *   if (!ok) return;
 *
 *   const prompt = usePrompt();
 *   const reason = await prompt({
 *     title: 'Raison du refus',
 *     description: 'Gardée dans l\'historique',
 *     defaultValue: 'Refusé à la confirmation',
 *     placeholder: 'Ex: client absent…',
 *     multiline: true,
 *   });
 *   if (reason === null) return; // user a annulé
 *
 * Le provider `<DialogProvider>` doit être monté une seule fois dans
 * l'arbre (root layout) — il gère la file de dialogues globalement.
 */

import * as React from 'react';
import { AlertTriangle, HelpCircle, Loader2, PenLine, Trash2 } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from './dialog';

// ─── Types ─────────────────────────────────────────────────────────
export type DialogTone = 'default' | 'destructive' | 'warning' | 'success';

export interface ConfirmOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Icône + couleur d'accent. `destructive` cible les suppressions. */
  tone?: DialogTone;
  /** Largeur max du dialog. */
  size?: 'sm' | 'md' | 'lg';
}

export interface PromptOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use a `<textarea>` au lieu d'un `<Input>` quand la réponse est longue. */
  multiline?: boolean;
  /** Au moins N caractères requis pour activer le confirm. */
  minLength?: number;
  tone?: DialogTone;
}

// ─── Context interne ───────────────────────────────────────────────
interface DialogState {
  open: boolean;
  kind: 'confirm' | 'prompt' | null;
  confirmOpts: ConfirmOptions | null;
  promptOpts: PromptOptions | null;
  promptValue: string;
  resolver: ((value: boolean | string | null) => void) | null;
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DialogState>({
    open: false,
    kind: null,
    confirmOpts: null,
    promptOpts: null,
    promptValue: '',
    resolver: null,
  });

  const resolverRef = React.useRef<DialogState['resolver']>(null);
  resolverRef.current = state.resolver;

  // Ferme le dialogue avec la valeur fournie. `value` peut être :
  //   - true / false pour confirm
  //   - string / null pour prompt (null = annulation)
  const close = React.useCallback((value: boolean | string | null) => {
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
    setState((s) => ({ ...s, open: false }));
  }, []);

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({
        open: true,
        kind: 'confirm',
        confirmOpts: opts,
        promptOpts: null,
        promptValue: '',
        resolver: (v) => resolve(v === true),
      });
    });
  }, []);

  const prompt = React.useCallback((opts: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setState({
        open: true,
        kind: 'prompt',
        confirmOpts: null,
        promptOpts: opts,
        promptValue: opts.defaultValue || '',
        resolver: (v) => resolve(v === null ? null : typeof v === 'string' ? v : null),
      });
    });
  }, []);

  // Quand Radix gère la fermeture (Escape, clic overlay) on résout en
  // « annulation » pour ne pas laisser le caller bloqué sur sa promesse.
  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen) close(state.kind === 'confirm' ? false : null);
  }, [close, state.kind]);

  const ctxValue = React.useMemo<DialogContextValue>(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <DialogContext.Provider value={ctxValue}>
      {children}
      <GlobalDialog state={state} onOpenChange={handleOpenChange} onClose={close} setPromptValue={(v) => setState((s) => ({ ...s, promptValue: v }))} />
    </DialogContext.Provider>
  );
}

// ─── Render dialog ─────────────────────────────────────────────────
function GlobalDialog({
  state,
  onOpenChange,
  onClose,
  setPromptValue,
}: {
  state: DialogState;
  onOpenChange: (open: boolean) => void;
  onClose: (value: boolean | string | null) => void;
  setPromptValue: (v: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (state.open) setBusy(false);
  }, [state.open]);

  if (!state.open || !state.kind) return null;

  if (state.kind === 'confirm') {
    const opts = state.confirmOpts!;
    const tone = opts.tone || 'default';
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent size={opts.size} hideClose>
          <DialogHeader
            title={opts.title}
            description={opts.description}
            tone={tone}
            icon={tone === 'destructive' ? <Trash2 className="h-5 w-5" /> : tone === 'warning' ? <AlertTriangle className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onClose(false)}
              disabled={busy}
            >
              {opts.cancelLabel || 'Annuler'}
            </Button>
            <Button
              type="button"
              onClick={() => onClose(true)}
              disabled={busy}
              className={tone === 'destructive' ? 'bg-rose-600 text-white hover:bg-rose-700' : undefined}
            >
              {opts.confirmLabel || 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Prompt ───────────────────────────────────────────────────
  const opts = state.promptOpts!;
  const tone = opts.tone || 'default';
  const min = opts.minLength ?? 0;
  const valid = state.promptValue.trim().length >= min;

  function submit() {
    if (!valid) return;
    setBusy(true);
    onClose(state.promptValue);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="md" hideClose>
        <DialogHeader
          title={opts.title}
          description={opts.description}
          tone={tone}
          icon={<PenLine className="h-5 w-5" />}
        />
        <DialogBody>
          {opts.multiline ? (
            <textarea
              autoFocus
              value={state.promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={opts.placeholder}
              rows={4}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
              onKeyDown={(e) => {
                // Ctrl/Cmd+Enter pour valider rapidement.
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          ) : (
            <Input
              autoFocus
              value={state.promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={opts.placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          )}
          {min > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Min {min} caractères ({state.promptValue.trim().length}/{min})
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onClose(null)} disabled={busy}>
            {opts.cancelLabel || 'Annuler'}
          </Button>
          <Button type="button" onClick={submit} disabled={!valid || busy}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {opts.confirmLabel || 'Valider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hooks publics ────────────────────────────────────────────────
function useDialogContext() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    throw new Error('useConfirm / usePrompt doit être utilisé sous <DialogProvider />.');
  }
  return ctx;
}

export function useConfirm() {
  return useDialogContext().confirm;
}

export function usePrompt() {
  return useDialogContext().prompt;
}
