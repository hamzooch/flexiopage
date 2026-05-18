'use client';

/**
 * Thin wrapper around @react-oauth/google's <GoogleOAuthProvider>. Lives
 * in a client component so we can mount it at the /login and /register
 * pages without forcing the whole app's root layout to be client-side.
 *
 * When NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing, we still render children
 * (the GoogleSignInButton itself handles the "not configured" hint).
 */

import { GoogleOAuthProvider } from '@react-oauth/google';

export function GoogleOAuthWrapper({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  if (!clientId) return <>{children}</>;
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
}
