'use client';

import { useEffect, useRef } from 'react';
import { pushApi } from '@/lib/api';

/**
 * Enregistre le token push de l'app mobile. L'app (WebView native) injecte
 * `window.__FLEXIO_PUSH_TOKEN__` puis émet l'event `flexio-push-token`. Ce
 * composant — rendu dans le dashboard authentifié — envoie le token au backend
 * avec l'auth du site. No-op dans un navigateur classique (pas de token injecté).
 */
export function PushRegistration() {
  const registered = useRef<string | null>(null);

  useEffect(() => {
    const tryRegister = () => {
      const token = (window as unknown as { __FLEXIO_PUSH_TOKEN__?: string }).__FLEXIO_PUSH_TOKEN__;
      if (!token || registered.current === token) return;
      registered.current = token;
      pushApi.register(token).catch(() => {
        // Réessaiera à la prochaine injection (navigation) si l'appel échoue.
        registered.current = null;
      });
    };
    tryRegister(); // le token est peut-être déjà injecté
    window.addEventListener('flexio-push-token', tryRegister);
    return () => window.removeEventListener('flexio-push-token', tryRegister);
  }, []);

  return null;
}
