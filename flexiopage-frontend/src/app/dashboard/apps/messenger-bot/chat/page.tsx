'use client';

/** Messagerie plein écran Messenger — réutilise le composant partagé. */

import { useSearchParams } from 'next/navigation';
import { messengerBotApi } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { ConversationsView } from '@/components/messaging/conversations-view';

export default function MessengerChatPage() {
  const params = useSearchParams();
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const storeId = params.get('storeId') || currentStoreId || '';

  return (
    <ConversationsView
      storeId={storeId}
      api={messengerBotApi}
      channel="messenger"
      title="Discussions Messenger"
      backHref={`/dashboard/apps/messenger-bot?storeId=${encodeURIComponent(storeId)}`}
    />
  );
}
