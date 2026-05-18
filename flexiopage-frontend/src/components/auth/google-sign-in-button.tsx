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

import { useState } from 'react';
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

  // Detect missing client ID and tell the seller why nothing happens.
  // The OAuth provider in the layout already short-circuits; this is the
  // user-visible message so we don't ship a dead silent button.
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-3 text-center text-[11px] text-muted-foreground">
        Google sign-in à configurer (variable <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> manquante).
      </div>
    );
  }

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
    <div className="space-y-2">
      <div className={loading ? 'opacity-60 pointer-events-none' : ''}>
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => setError('Erreur Google — réessaie ou utilise l\'email.')}
          text={text}
          shape="rectangular"
          theme="outline"
          size="large"
          width="100%"
          locale="fr"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
