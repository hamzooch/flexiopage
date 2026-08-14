'use client';

import { useEffect, useRef, useState } from 'react';
import { BellOff, X } from 'lucide-react';
import { pushApi } from '@/lib/api';

/**
 * Enregistre le token push de l'app mobile. L'app (WebView native) injecte
 * `window.__FLEXIO_PUSH_TOKEN__` + `window.__FLEXIO_PUSH_STATUS__` puis émet
 * l'event `flexio-push-token`. Ce composant — rendu dans le dashboard
 * authentifié — envoie le token au backend avec l'auth du site, et affiche
 * une bannière si les notifications sont refusées côté système (avant, un
 * refus de permission était totalement silencieux : le vendeur croyait les
 * push actives alors qu'aucun token n'était jamais enregistré).
 * No-op dans un navigateur classique (rien d'injecté).
 */

type InjectedWindow = Window & {
  __FLEXIO_PUSH_TOKEN__?: string | null;
  __FLEXIO_PUSH_STATUS__?: string | null;
  ReactNativeWebView?: { postMessage: (msg: string) => void };
};

export function PushRegistration() {
  const registered = useRef<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const sync = () => {
      const w = window as unknown as InjectedWindow;
      setStatus(w.__FLEXIO_PUSH_STATUS__ || null);
      const token = w.__FLEXIO_PUSH_TOKEN__;
      if (!token || registered.current === token) return;
      registered.current = token;
      pushApi.register(token).catch(() => {
        // Réessaiera à la prochaine injection (navigation) si l'appel échoue.
        registered.current = null;
      });
    };
    sync(); // token/statut peut-être déjà injectés
    window.addEventListener('flexio-push-token', sync);
    return () => window.removeEventListener('flexio-push-token', sync);
  }, []);

  // Bannière uniquement quand l'app signale un refus de permission — les
  // autres statuts (emulator, error) ne sont pas actionnables par le vendeur.
  if (status !== 'denied' || dismissed) return null;

  return (
    <div className="flex items-center gap-3 bg-amber-500/15 px-4 py-2.5 text-amber-900">
      <BellOff className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-xs sm:text-sm">
        Les notifications sont désactivées — tu ne seras pas alerté des nouvelles
        commandes sur ce téléphone.
      </p>
      <button
        type="button"
        onClick={() =>
          (window as unknown as InjectedWindow).ReactNativeWebView?.postMessage(
            'flexio-open-settings'
          )
        }
        className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
      >
        Activer
      </button>
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md p-1 hover:bg-amber-500/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
