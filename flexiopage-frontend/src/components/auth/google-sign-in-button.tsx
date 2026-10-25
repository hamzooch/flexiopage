'use client';

/**
 * Wraps Google's official @react-oauth/google button + handles the
 * round-trip with our backend. On success, stores the returned JWT in
 * the auth store and triggers the parent's onSuccess (which usually
 * does router.push('/select-store')).
 *
 * The button is intentionally a thin wrapper so the Google button keeps
 * its standard look (Google's brand guidelines require it). The "ou"
 * divider and outer layout live in the parent /login or /register page.
 *
 * No Google Client ID configured? The component renders a graceful
 * "à configurer" placeholder so deploys without the env var don't crash.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { authApi, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

interface Props {
  /** Called with the user after the backend confirms the sign-in. */
  onSuccess?: () => void;
  /** Drives the visible label — "signin_with" / "signup_with" / "continue_with". */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

export function GoogleSignInButton({ onSuccess, text = 'continue_with' }: Props) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // No client ID configured → render nothing. The parent pages (/login,
  // /register) also drop the surrounding divider via isGoogleAuthAvailable()
  // so the email form keeps its original layout while Google is off.
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  // Google's button ignores CSS width ("100%") and paints a fixed iframe.
  // Measure the form column and pass that pixel width so it matches the
  // email fields on a phone.
  useLayoutEffect(() => {
    if (!clientId) return;
    const el = boxRef.current;
    if (!el) return;
    const apply = () => {
      const next = Math.floor(el.clientWidth);
      if (next < 200) return;
      const capped = Math.min(400, next);
      setWidth((prev) => (Math.abs(prev - capped) > 1 ? capped : prev));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [clientId]);

  if (!clientId) return null;

  async function handleSuccess(res: CredentialResponse) {
    if (!res.credential) {
      setError('Token Google manquant — réessaie.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await authApi.google({ credential: res.credential });
      const d = data as { user: { _id: string; email: string; name: string }; token: string };
      setAuth(d.user, d.token);
      onSuccess?.();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Connexion Google échouée.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-2">
      <div ref={boxRef} className={`w-full min-h-11 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
        {width > 0 && (
          <GoogleLogin
            key={width}
            onSuccess={handleSuccess}
            onError={() => setError('Erreur Google — réessaie ou utilise l\'email.')}
            text={text}
            shape="rectangular"
            theme="outline"
            size="large"
            width={width}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
