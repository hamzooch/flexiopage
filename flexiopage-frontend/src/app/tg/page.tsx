'use client';

/**
 * Arrivée depuis le bouton Telegram « Ouvrir dans FlexioPage ».
 * Le jeton du lien ouvre la session, puis on envoie le vendeur sur sa page.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { telegramApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

function OpenFromTelegram() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = searchParams.get('k') || '';
    if (!key) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    telegramApi.open(key)
      .then((res) => {
        if (cancelled) return;
        setAuth(res.data.user, res.data.token);
        const next = res.data.next?.startsWith('/') && !res.data.next.startsWith('//')
          ? res.data.next
          : '/dashboard';
        router.replace(next);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Ce lien a expiré. Connecte-toi pour ouvrir ta boutique.');
      });
    return () => {
      cancelled = true;
    };
  }, [router, searchParams, setAuth]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="max-w-sm text-center">
        {error ? (
          <>
            <p className="text-sm text-muted-foreground">{error}</p>
            <a href="/login" className="mt-4 inline-block text-sm font-medium text-primary">
              Se connecter
            </a>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ouverture de ta boutique…
          </p>
        )}
      </div>
    </div>
  );
}

export default function TelegramOpenPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Ouverture…</div>}>
      <OpenFromTelegram />
    </Suspense>
  );
}
