'use client';

/**
 * Bridge between per-page `selectedStoreId` state and the global
 * `currentStoreId` set by the post-login picker + header switcher.
 *
 * Pages that historically owned their own dropdown still work — they just
 * read the initial value from the global store and push their changes back
 * up so every page agrees on the active store.
 *
 * Priority order for the initial value:
 *   1. `?storeId=` in the URL (sticky deep links from outside)
 *   2. The global `currentStoreId` (chosen via /select-store or header)
 *   3. null — caller falls back to its own logic (usually first in list)
 */

import { useEffect, useState } from 'react';
import { useStoreStore } from '@/stores/store-store';

export function useScopedStoreId(urlParamId?: string | null) {
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);

  const [storeId, setStoreIdState] = useState<string | null>(
    urlParamId || currentStoreId || null
  );

  // External change from the header switcher / select-store picker.
  useEffect(() => {
    if (currentStoreId && currentStoreId !== storeId) {
      setStoreIdState(currentStoreId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStoreId]);

  // URL param changes (e.g. navigating from another page that included
  // ?storeId=…). The deep link wins because it's an explicit intent.
  useEffect(() => {
    if (urlParamId && urlParamId !== storeId) {
      setStoreIdState(urlParamId);
      setCurrentStore(urlParamId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParamId]);

  function setStoreId(id: string | null) {
    setStoreIdState(id);
    if (id) setCurrentStore(id);
  }

  return { storeId, setStoreId };
}
