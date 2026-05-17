'use client';

/**
 * Mounts the FlexioPage marketing chatbot on every "platform" page —
 * landing, login, register, dashboard, admin — while staying out of the
 * customer-facing storefront where each store renders its own
 * `buildStoreScript()` widget (different brand, different persona).
 *
 * Lives in the root layout so route changes (dashboard ↔ admin ↔ login)
 * keep the same conversation thanks to the shared localStorage key.
 */
import { usePathname } from 'next/navigation';
import { ChatBot } from './ChatBot';
import { flexiopageScript } from './scripts';

/** Path prefixes where a storefront-scoped chatbot is already mounted —
 * we MUST skip rendering here to avoid two stacked widgets. */
const STOREFRONT_PREFIXES = ['/store', '/thanks', '/preview', '/d/'];

export function PlatformChatBot() {
  const pathname = usePathname() || '';
  for (const prefix of STOREFRONT_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return null;
  }
  return <ChatBot script={flexiopageScript} storageKey="flexiopage-platform-chat" />;
}
