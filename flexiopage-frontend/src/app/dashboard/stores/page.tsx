'use client';

/**
 * The legacy stores hub lives on /dashboard/profile now — creation, listing,
 * and switching all happen there. Any old links (bookmarks, dashboard CTAs)
 * land here and get bounced to the new home.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LegacyStoresRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/profile#stores');
  }, [router]);
  return (
    <div className="grid place-items-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
