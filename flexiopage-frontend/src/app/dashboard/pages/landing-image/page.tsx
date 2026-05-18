'use client';

/**
 * Legacy route — Landing AI was merged into the unified Studio IA page
 * (/dashboard/pages/poster) which now hosts both poster + landing tabs.
 * This file just forwards the user, preserving the storeId query param.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LandingImageLegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'landing');
    router.replace(`/dashboard/pages/poster?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="grid place-items-center py-20 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <p className="mt-2 text-xs">Redirection vers le Studio IA…</p>
    </div>
  );
}
