'use client';

/**
 * Thin wrapper around @react-oauth/google's <GoogleOAuthProvider>. Lives
 * in a client component so we can mount it at the /login and /register
 * pages without forcing the whole app's root layout to be client-side.
 *
 * When NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing, this wrapper renders
 * NOTHING — the parent page should gate the surrounding divider via
 * `isGoogleAuthAvailable()` so the email form keeps its native top spacing.
 */

import { GoogleOAuthProvider } from '@react-oauth/google';

/** True when the frontend has a Google Client ID configured. Cheap,
 *  safe to call on every client render. */
export function isGoogleAuthAvailable(): boolean {
  return !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
}

export function GoogleOAuthWrapper({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  if (!clientId) return null;
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
}
