'use client';

/**
 * Modern scripted chatbot widget — floating bottom-right.
 *
 * - Compact pill trigger that expands into a panel on click
 * - Bot ↔ user message log, with typing-dot animation between messages
 * - Quick-reply buttons drive the conversation (no free-text input —
 *   it's a scripted FSM, not an AI bot)
 * - Conversation state (messages + current node) persists in
 *   localStorage so closing/reopening keeps history
 * - Brand orange gradient header and primary buttons
 *
 * Accepts any ChatScript (see ./scripts.ts) so the same widget powers
 * the FlexioPage marketing landing AND each customer-facing shop.
 */

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, ArrowDown, RefreshCw } from 'lucide-react';
import type { ChatScript } from './scripts';

type Msg =
  | { id: string; role: 'bot'; text: string }
  | { id: string; role: 'user'; text: string };

interface Props {
  script: ChatScript;
  /** localStorage key — separate marketing/store conversations. */
  storageKey?: string;
  /** Override the trigger pill's label (default: "Une question ?"). */
  triggerLabel?: string;
}

/**
 * Generate a unique message id. Prefers `crypto.randomUUID` (modern browsers
 * over HTTPS / localhost) but falls back to a Math.random string when
 * unavailable — e.g. on insecure-context dev URLs like `<slug>.lvh.me:3002`
 * where `crypto.randomUUID` is undefined in some Chrome builds.
 */
function safeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* fall through */ }
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ChatBot({
  script,
  storageKey = 'flexiopage-chat',
  triggerLabel = 'Une question ?',
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [currentNode, setCurrentNode] = useState<string>(script.start);
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Hydrate from localStorage ──────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { messages: Msg[]; node: string };
        if (Array.isArray(saved.messages) && saved.messages.length > 0) {
          setMessages(saved.messages);
          setCurrentNode(saved.node || script.start);
          return;
        }
      }
    } catch {
      /* swallow — bad JSON is harmless, we just start fresh */
    }
    // First-time: seed with the welcome message
    pushBot(script.nodes[script.start].message);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist on every change ────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ messages, node: currentNode }),
      );
    } catch {
      /* localStorage disabled — fine, we lose persistence only */
    }
  }, [messages, currentNode, storageKey]);

  // ── Auto-scroll to last message when opened or a new msg arrives ──
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 60);
    return () => clearTimeout(t);
  }, [open, messages, typing]);

  // ── Clear unread badge when panel opens ────────────────────────────
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  function pushBot(text: string) {
    setMessages((m) => [
      ...m,
      { id: safeId(), role: 'bot', text },
    ]);
    if (!open) setUnread((u) => u + 1);
  }

  function pushUser(text: string) {
    setMessages((m) => [
      ...m,
      { id: safeId(), role: 'user', text },
    ]);
  }

  function handleQuickReply(label: string, goto?: string, href?: string) {
    pushUser(label);
    if (href) {
      // Same-tab navigation for internal links; new tab for external/tel/mailto
      const isInternal = href.startsWith('/') || href.startsWith('#');
      if (isInternal) {
        window.location.href = href;
      } else {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    if (goto) {
      setTyping(true);
      // Tiny delay to feel like the bot is "thinking" — 500-700 ms is the
      // sweet spot per UX research (faster feels mechanical, slower drags)
      setTimeout(() => {
        const next = script.nodes[goto];
        if (next) {
          pushBot(next.message);
          setCurrentNode(goto);
        }
        setTyping(false);
      }, 550);
    }
  }

  function resetConversation() {
    setMessages([]);
    setCurrentNode(script.start);
    setTyping(true);
    setTimeout(() => {
      pushBot(script.nodes[script.start].message);
      setTyping(false);
    }, 300);
  }

  const node = script.nodes[currentNode] ?? script.nodes[script.start];

  return (
    <>
      {/* ── PANEL ──────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed bottom-20 right-4 z-[60] flex h-[560px] max-h-[calc(100vh-6rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/20 animate-fade-in-up sm:bottom-6 sm:right-6 sm:max-h-[calc(100vh-2rem)]">
          {/* Header */}
          <div className="relative flex items-center gap-3 bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 px-4 py-3.5 text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.3),transparent_60%)]" aria-hidden />
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur ring-1 ring-white/30">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="relative min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                {script.botName}
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 ring-2 ring-emerald-300/30" />
              </div>
              {script.botRole && (
                <div className="truncate text-[11px] text-white/85">{script.botRole}</div>
              )}
            </div>
            <div className="relative flex items-center gap-1">
              <button
                onClick={resetConversation}
                aria-label="Recommencer la conversation"
                title="Recommencer"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer le chat"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-4 py-4"
          >
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role} text={m.text} />
            ))}
            {typing && (
              <div className="flex items-center gap-1 px-3">
                <Dot delay={0} />
                <Dot delay={150} />
                <Dot delay={300} />
              </div>
            )}
          </div>

          {/* Quick replies */}
          {!typing && node.quickReplies && node.quickReplies.length > 0 && (
            <div className="border-t border-border/60 bg-card px-3 py-3">
              <div className="flex flex-wrap gap-2">
                {node.quickReplies.map((qr, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickReply(qr.label, qr.goto, qr.href)}
                    className={
                      qr.primary
                        ? 'inline-flex items-center rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-orange-500/25 transition-transform hover:scale-[1.03]'
                        : 'inline-flex items-center rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted'
                    }
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TRIGGER PILL ───────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fermer le chat' : 'Ouvrir le chat'}
        className="group fixed bottom-20 right-4 z-[59] inline-flex h-14 items-center gap-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 pl-4 pr-5 text-sm font-semibold text-white shadow-2xl shadow-orange-500/40 ring-1 ring-white/20 transition-all hover:scale-[1.04] hover:from-amber-600 hover:to-orange-700 sm:bottom-6 sm:right-6"
      >
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-white/15 ring-1 ring-white/30">
          {open ? <ArrowDown className="h-4 w-4" /> : <MessageCircle className="h-4.5 w-4.5" />}
          {!open && unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold ring-2 ring-white">
              {unread}
            </span>
          )}
        </span>
        <span className="hidden pr-1 sm:inline">{open ? 'Fermer' : triggerLabel}</span>
      </button>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────
function Bubble({ role, text }: { role: 'bot' | 'user'; text: string }) {
  const isBot = role === 'bot';
  return (
    <div className={isBot ? 'flex justify-start' : 'flex justify-end'}>
      <div
        className={
          isBot
            ? 'max-w-[80%] rounded-2xl rounded-tl-md border border-border/60 bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm'
            : 'max-w-[80%] rounded-2xl rounded-tr-md bg-gradient-to-br from-amber-500 to-orange-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-md shadow-orange-500/25'
        }
      >
        {renderMarkdown(text)}
      </div>
    </div>
  );
}

/** Minimal markdown: just `**bold**` — enough for accent in scripted replies. */
function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-semibold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60"
      style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
    />
  );
}
