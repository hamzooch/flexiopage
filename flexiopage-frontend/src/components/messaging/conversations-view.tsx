'use client';

/**
 * Vue de discussions plein écran (type WhatsApp Web), partagée par les canaux
 * WhatsApp et Messenger. Channel-aware via la prop `api` (même shape pour les
 * deux) + `channel` pour les libellés et le garde-fou de la fenêtre 24h.
 *
 * Fonctions : liste + recherche, fil avec polling quasi temps réel, reprise en
 * main (takeover → le bot se tait), réponse manuelle (envoi optimiste).
 * Responsive : sur mobile, liste puis fil plein écran.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Search, Send, RefreshCw, Hand, ShoppingBag, MessageSquare, Clock } from 'lucide-react';
import { extractApiError, type MessengerConversation, type MessengerMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LIST_POLL_MS = 8000;
const THREAD_POLL_MS = 4000;
const WINDOW_MS = 24 * 60 * 60 * 1000; // fenêtre de messagerie Meta : 24h.

type Res<T> = { data: T };

/** Sous-ensemble d'API commun à whatsappBotApi et messengerBotApi. */
export interface MessagingApi {
  listConversations: (storeId: string, params?: { status?: string; limit?: number; skip?: number }) => Promise<Res<{ conversations: MessengerConversation[]; total: number }>>;
  getConversation: (storeId: string, id: string) => Promise<Res<{ conversation: MessengerConversation; messages: MessengerMessage[] }>>;
  takeover: (storeId: string, id: string) => Promise<Res<unknown>>;
  release: (storeId: string, id: string) => Promise<Res<unknown>>;
  sendManual: (storeId: string, id: string, message: string) => Promise<Res<unknown>>;
}

export function ConversationsView({ storeId, api, channel, backHref, title }: {
  storeId: string;
  api: MessagingApi;
  channel: 'whatsapp' | 'messenger';
  backHref: string;
  title: string;
}) {
  const [convs, setConvs] = useState<MessengerConversation[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [query, setQuery] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');

  const selRef = useRef<string | null>(null);
  selRef.current = sel;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selectedConv = useMemo(() => convs.find((c) => c._id === sel) || null, [convs, sel]);

  // Dernier message du client → base de calcul de la fenêtre 24h.
  const outsideWindow = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'customer') {
        const ts = messages[i].timestamp;
        return ts ? Date.now() - new Date(ts).getTime() > WINDOW_MS : false;
      }
    }
    return false;
  }, [messages]);

  const refreshList = useCallback(async (silent = false) => {
    if (!storeId) { setLoadingList(false); return; }
    if (!silent) setLoadingList(true);
    try {
      const res = await api.listConversations(storeId, { limit: 50 });
      setConvs(res.data.conversations);
    } catch (e) {
      if (!silent) setErr(extractApiError(e, 'Chargement des conversations impossible.'));
    } finally {
      setLoadingList(false);
    }
  }, [storeId, api]);

  const loadThread = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const res = await api.getConversation(storeId, id);
      if (selRef.current === id) setMessages(res.data.messages);
    } catch {
      /* silencieux : le polling réessaiera */
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, [storeId, api]);

  useEffect(() => { void refreshList(); }, [refreshList]);
  useEffect(() => {
    const t = setInterval(() => void refreshList(true), LIST_POLL_MS);
    return () => clearInterval(t);
  }, [refreshList]);
  useEffect(() => {
    if (!sel) return;
    const t = setInterval(() => void loadThread(sel, true), THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [sel, loadThread]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function open(id: string) {
    setSel(id);
    setMessages([]);
    void loadThread(id);
  }

  async function takeover() {
    if (!sel) return;
    try {
      await api.takeover(storeId, sel);
      await refreshList(true);
    } catch (e) {
      setErr(extractApiError(e, 'Reprise en main impossible.'));
    }
  }

  async function releaseToBot() {
    if (!sel) return;
    try {
      await api.release(storeId, sel);
      await refreshList(true);
    } catch (e) {
      setErr(extractApiError(e, 'Réactivation du bot impossible.'));
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || !sel) return;
    setSending(true);
    setDraft('');
    const optimistic: MessengerMessage = {
      _id: `tmp-${Date.now()}`, sender: 'human', content: text, timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      await api.sendManual(storeId, sel, text);
      await loadThread(sel, true);
    } catch (e) {
      setErr(extractApiError(e, "Échec de l'envoi."));
      setDraft(text);
      setMessages((m) => m.filter((x) => x._id !== optimistic._id));
    } finally {
      setSending(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter((c) =>
      (c.customer_name || c.customer_psid).toLowerCase().includes(q) ||
      (c.customer_city || '').toLowerCase().includes(q) ||
      (c.customer_phone || '').includes(q));
  }, [convs, query]);

  if (!storeId) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Sélectionne une boutique d&apos;abord.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={backHref}
            className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 text-muted-foreground hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight sm:text-lg">{title}</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Voir les conversations et répondre manuellement.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => void refreshList()}>
          <RefreshCw className={cn('h-3.5 w-3.5', loadingList && 'animate-spin')} />
          <span className="hidden sm:inline">Actualiser</span>
        </Button>
      </div>

      {err && <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-700">{err}</p>}

      <div className="grid h-[calc(100dvh-9.5rem)] min-h-[360px] grid-cols-1 overflow-hidden rounded-2xl border border-border/60 bg-card sm:h-[calc(100dvh-11rem)] md:grid-cols-[320px_1fr] lg:h-[calc(100dvh-12rem)]">
        {/* Liste des conversations */}
        <aside className={cn('flex min-h-0 flex-col border-r border-border/40', sel && 'hidden md:flex')}>
          <div className="border-b border-border/40 p-3">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…"
                className="h-9 w-full bg-transparent text-sm outline-none" />
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto">
            {loadingList && convs.length === 0 && (
              <li className="grid place-items-center p-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></li>
            )}
            {!loadingList && filtered.length === 0 && (
              <li className="p-4 text-xs text-muted-foreground">Aucune conversation.</li>
            )}
            {filtered.map((c) => (
              <li key={c._id}>
                <button type="button" onClick={() => open(c._id)}
                  className={cn('w-full px-4 py-3 text-left transition hover:bg-muted/40', sel === c._id && 'bg-primary/5')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.customer_name || c.customer_psid}</span>
                    {c.last_message_at && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{shortTime(c.last_message_at)}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {c.order_id && <Badge className="bg-emerald-500/10 text-emerald-700"><ShoppingBag className="h-2.5 w-2.5" /> Commande</Badge>}
                    {c.status === 'human_takeover' && <Badge className="bg-amber-500/10 text-amber-700"><Hand className="h-2.5 w-2.5" /> Manuel</Badge>}
                    <span className="truncate text-[11px] text-muted-foreground">{c.customer_city || '—'} · {c.message_count} msg</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Fil de discussion */}
        <section className={cn('flex min-h-0 flex-col', !sel && 'hidden md:flex')}>
          {!sel && (
            <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
              <div className="space-y-2">
                <MessageSquare className="mx-auto h-8 w-8 opacity-40" />
                <p>Sélectionne une conversation pour la consulter.</p>
              </div>
            </div>
          )}

          {sel && (
            <>
              <header className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
                <button type="button" onClick={() => setSel(null)} className="md:hidden">
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{selectedConv?.customer_name || selectedConv?.customer_psid}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {selectedConv?.customer_phone || selectedConv?.customer_psid}{selectedConv?.customer_city ? ` · ${selectedConv.customer_city}` : ''}
                  </div>
                </div>
                {selectedConv?.status === 'human_takeover' ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      <Hand className="h-3 w-3" /> Mode manuel
                    </span>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={releaseToBot} title="Réactiver le bot sur cette conversation">
                      🤖 Rendre au bot
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={takeover}>
                    <Hand className="h-3.5 w-3.5" /> Reprendre la main
                  </Button>
                )}
              </header>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
                {loadingThread && messages.length === 0 && (
                  <div className="grid place-items-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                )}
                {messages.map((m) => (
                  <div key={m._id} className={cn('flex flex-col', m.sender === 'customer' ? 'items-start' : 'items-end')}>
                    <div className={cn('max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                      m.sender === 'customer' ? 'rounded-bl-sm bg-card' :
                      m.sender === 'human' ? 'rounded-br-sm bg-emerald-500 text-white' : 'rounded-br-sm bg-primary/10')}>
                      <p className="whitespace-pre-line">{m.content}</p>
                    </div>
                    <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                      {senderLabel(m.sender)}{m.timestamp ? ` · ${shortTime(m.timestamp)}` : ''}
                    </span>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {outsideWindow && (
                <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-700">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Dernier message du client il y a plus de 24h. {channel === 'whatsapp'
                      ? 'WhatsApp n’autorise les messages libres que dans les 24h ; au-delà, seul un template approuvé passe.'
                      : 'Messenger n’autorise les messages que dans les 24h ; au-delà, l’envoi peut être refusé par Meta.'} L’envoi peut échouer.
                  </span>
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); void send(); }}
                className="flex items-center gap-2 border-t border-border/40 p-3">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Écris un message…"
                  className="h-10 w-full rounded-full border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary" />
                <Button type="submit" disabled={sending || !draft.trim()} className="h-10 w-10 shrink-0 rounded-full p-0 gradient-brand text-white">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold', className)}>
      {children}
    </span>
  );
}

function senderLabel(sender: MessengerMessage['sender']): string {
  return sender === 'customer' ? 'Client' : sender === 'human' ? 'Vous' : 'Bot';
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
