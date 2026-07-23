'use client';

/**
 * Botstore — bulle de chat IA affichée sur la storefront.
 *
 * Cycle : le vendeur active la feature dans /dashboard/apps/botstore →
 * `settings.botstore.enabled = true` → cette bulle apparaît sur toutes les
 * pages du storefront (mount depuis app/store/[storeSlug]/layout.tsx).
 *
 * Persistance : historique dans sessionStorage (par onglet, par visite) —
 * pas de compte visiteur, pas de tracking cross-page. Le backend n'enregistre
 * rien dans ce MVP (l'historique dashboard vient plus tard).
 *
 * Fallback WhatsApp : quand la réponse du bot arrive avec
 * `offerWhatsappFallback=true` (le bot signale qu'il ne sait pas) ou quand le
 * vendeur a coché "alwaysOffer", on affiche un CTA `wa.me/…` sous la réponse.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WhatsappConfig } from './whatsapp-button';

export interface BotstoreConfig {
  enabled?: boolean;
  persona?: string;
  instructions?: string;
  position?: 'bottom-right' | 'bottom-left';
  accentColor?: string;
  greeting?: string;
  launcherLabel?: string;
  whatsappFallback?: {
    enabled?: boolean;
    alwaysOffer?: boolean;
    ctaLabel?: string;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Si le bot signale qu'il ne sait pas, on affiche un CTA WhatsApp sous la bulle. */
  offerWhatsapp?: boolean;
}

interface Props {
  storeSlug: string;
  config?: BotstoreConfig;
  whatsapp?: WhatsappConfig;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const DEFAULT_ACCENT = '#4f46e5';
const DEFAULT_GREETING = "Salut 👋 Comment puis-je t'aider ?";
const DEFAULT_LAUNCHER = 'Discuter avec nous';
const DEFAULT_CTA_LABEL = 'Discuter sur WhatsApp';
// On borne la fenêtre d'historique envoyée au backend (le backend a sa propre
// borne aussi — la double borne évite qu'un onglet ouvert 3h envoie 500 msgs).
const MAX_HISTORY_SENT = 12;

const POSITION_CLASSES: Record<NonNullable<BotstoreConfig['position']>, { fab: string; panel: string }> = {
  'bottom-right': {
    fab: 'bottom-20 right-4 sm:bottom-8 sm:right-6',
    panel: 'bottom-36 right-4 sm:bottom-28 sm:right-6',
  },
  'bottom-left': {
    fab: 'bottom-20 left-4 sm:bottom-8 sm:left-6',
    panel: 'bottom-36 left-4 sm:bottom-28 sm:left-6',
  },
};

/** Nettoie un numéro E.164 vers le format que wa.me attend (chiffres seuls). */
function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

/** Clé sessionStorage isolée par slug — évite qu'ouvrir 2 boutiques mélange les historiques. */
function historyKey(slug: string): string {
  return `flexio-botstore:${slug}`;
}

export function BotstoreWidget({ storeSlug, config, whatsapp }: Props) {
  // Preview vendeur (?preview=1) → on masque la bulle pour ne pas couvrir le
  // storefront dans l'iframe du dashboard. Symétrique au WhatsappButton.
  const [isPreviewIframe, setIsPreviewIframe] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsPreviewIframe(new URLSearchParams(window.location.search).get('preview') === '1');
    }
  }, []);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const accent = config?.accentColor || DEFAULT_ACCENT;
  const position = config?.position || 'bottom-right';
  const positionClasses = POSITION_CLASSES[position];
  const greeting = config?.greeting?.trim() || DEFAULT_GREETING;
  const launcherLabel = config?.launcherLabel?.trim() || DEFAULT_LAUNCHER;
  const fallbackCfg = config?.whatsappFallback;
  const whatsappPhone = whatsapp?.phoneNumber ? normalizePhone(whatsapp.phoneNumber) : '';
  const fallbackEnabled = fallbackCfg?.enabled !== false && !!whatsappPhone;
  const alwaysOfferWhatsapp = fallbackEnabled && !!fallbackCfg?.alwaysOffer;
  const ctaLabel = fallbackCfg?.ctaLabel?.trim() || DEFAULT_CTA_LABEL;

  // Hydrate l'historique depuis sessionStorage à l'ouverture. On le fait
  // dans un useEffect séparé (post-mount) pour rester compatible SSR.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(historyKey(storeSlug));
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      /* corrupt storage — repartir de zéro */
    }
  }, [storeSlug]);

  // Sauvegarde à chaque nouveau message. On ne persiste PAS le greeting (il
  // est rejoué automatiquement si l'historique est vide) — évite un doublon
  // lors du rechargement d'onglet.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(historyKey(storeSlug), JSON.stringify(messages));
    } catch {
      /* quota dépassé — silencieux */
    }
  }, [storeSlug, messages]);

  // Auto-scroll vers le bas quand un nouveau message arrive.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, sending]);

  const buildWhatsappHref = useCallback(
    (msg: string): string => {
      if (!whatsappPhone) return '#';
      const prefill = msg
        ? `Bonjour, je viens du chat de la boutique. Ma question : ${msg}`
        : whatsapp?.message || '';
      return `https://wa.me/${whatsappPhone}${prefill ? `?text=${encodeURIComponent(prefill)}` : ''}`;
    },
    [whatsappPhone, whatsapp?.message],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      // Snapshot pré-user pour que l'appel backend ne voie pas déjà le message
      // qu'on ajoute juste après (le backend le reçoit dans `message`, pas dans `history`).
      const historyBeforeSend = messages;
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);
      try {
        const res = await fetch(`${API_URL}/api/public/botstore/${storeSlug}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: historyBeforeSend.slice(-MAX_HISTORY_SENT),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          reply: string;
          offerWhatsappFallback: boolean;
        };
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply,
            offerWhatsapp: fallbackEnabled && (alwaysOfferWhatsapp || data.offerWhatsappFallback),
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              (err as Error).message === 'Failed to fetch'
                ? 'Connexion perdue. Réessaie dans un instant.'
                : `Désolé, une erreur est survenue : ${(err as Error).message}`,
            // Toujours proposer WhatsApp sur les erreurs — l'utilisateur ne
            // doit pas se retrouver bloqué face à une panne.
            offerWhatsapp: fallbackEnabled,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending, storeSlug, fallbackEnabled, alwaysOfferWhatsapp],
  );

  // Contenu visible dans le panneau : on ajoute le greeting virtuel en tête
  // quand l'historique persisté est vide (jamais stocké → jamais dupliqué).
  const displayedMessages = useMemo<ChatMessage[]>(() => {
    if (messages.length > 0) return messages;
    return [{ role: 'assistant', content: greeting }];
  }, [messages, greeting]);

  if (isPreviewIframe) return null;
  if (!config?.enabled) return null;

  return (
    <>
      {/* FAB — bulle flottante toujours visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={launcherLabel}
        className={`flexio-bs-fab fixed z-50 grid h-14 w-14 place-items-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95 ${positionClasses.fab}`}
        style={{ backgroundColor: accent, color: '#ffffff' }}
      >
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Panneau conversationnel */}
      {open && (
        <div
          className={`flexio-bs-panel fixed z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl ${positionClasses.panel}`}
          style={{ maxHeight: 'min(560px, calc(100vh - 10rem))' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 text-white"
            style={{ backgroundColor: accent }}
          >
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-white/20">
                <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8V4H8" />
                  <rect x="4" y="8" width="16" height="12" rx="2" />
                  <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
                </svg>
              </div>
              <div className="text-sm font-semibold">{launcherLabel}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="rounded-md p-1 hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-neutral-50 p-3">
            {displayedMessages.map((m, i) => (
              <MessageBubble
                key={i}
                msg={m}
                accent={accent}
                whatsappHref={m.offerWhatsapp ? buildWhatsappHref(m.content) : null}
                ctaLabel={ctaLabel}
              />
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flexio-bs-typing inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-2 shadow-sm">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-black/5 bg-white p-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Écris ta question…"
              disabled={sending}
              maxLength={1500}
              className="flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Envoyer"
              className="grid h-9 w-9 place-items-center rounded-full text-white transition disabled:opacity-40"
              style={{ backgroundColor: accent }}
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}
      <style>{`
        .flexio-bs-typing span {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: #9ca3af;
          animation: flexioBsTyping 1.2s ease-in-out infinite;
        }
        .flexio-bs-typing span:nth-child(2) { animation-delay: 0.15s; }
        .flexio-bs-typing span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes flexioBsTyping {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%           { transform: translateY(-4px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .flexio-bs-fab { transition: none !important; }
          .flexio-bs-typing span { animation: none; }
        }
      `}</style>
    </>
  );
}

function MessageBubble({
  msg,
  accent,
  whatsappHref,
  ctaLabel,
}: {
  msg: ChatMessage;
  accent: string;
  whatsappHref: string | null;
  ctaLabel: string;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] space-y-1.5">
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
            isUser ? 'text-white' : 'bg-white text-neutral-800'
          }`}
          style={isUser ? { backgroundColor: accent } : undefined}
        >
          {msg.content}
        </div>
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            <svg viewBox="0 0 32 32" aria-hidden className="h-3.5 w-3.5" fill="currentColor">
              <path d="M16.001 3C9.373 3 4 8.373 4 15c0 2.317.673 4.476 1.832 6.297L4 28l6.928-1.798A11.96 11.96 0 0 0 16 27c6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
            </svg>
            {ctaLabel}
          </a>
        )}
      </div>
    </div>
  );
}
