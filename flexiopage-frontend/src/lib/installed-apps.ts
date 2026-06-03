/**
 * Source unique de vérité pour les "apps" tierces que le vendeur peut
 * connecter (Messenger Bot, WhatsApp Bot, Google Sheets, …). Partagé entre la
 * page /dashboard/apps et la sidebar pour éviter la duplication de la liste
 * et garder un comportement cohérent.
 */
'use client';

import { useEffect, useState } from 'react';
import { Bot, MessageSquare, FileSpreadsheet } from 'lucide-react';
import { messengerBotApi, whatsappBotApi, storesApi } from '@/lib/api';

export type InstalledAppId = 'messenger-bot' | 'whatsapp-bot' | 'google-sheets';

export interface InstalledApp {
  id: InstalledAppId;
  name: string;
  /** Lien direct vers la page de gestion (toujours suffixé du storeId). */
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Classes tailwind pour le gradient — sert au "logo" visuel. */
  accent: string;
}

const META: Record<InstalledAppId, Omit<InstalledApp, 'href'>> = {
  'messenger-bot': {
    id: 'messenger-bot',
    name: 'Messenger Bot',
    icon: Bot,
    accent: 'from-blue-500 to-indigo-600',
  },
  'whatsapp-bot': {
    id: 'whatsapp-bot',
    name: 'WhatsApp Bot',
    icon: MessageSquare,
    accent: 'from-green-500 to-emerald-600',
  },
  'google-sheets': {
    id: 'google-sheets',
    name: 'Google Sheets',
    icon: FileSpreadsheet,
    accent: 'from-emerald-500 to-green-600',
  },
};

const hrefFor = (id: InstalledAppId, storeId: string): string => {
  const sid = encodeURIComponent(storeId);
  if (id === 'messenger-bot') return `/dashboard/apps/messenger-bot?storeId=${sid}`;
  if (id === 'whatsapp-bot') return `/dashboard/apps/whatsapp-bot?storeId=${sid}`;
  return `/dashboard/apps?storeId=${sid}`; // google-sheets vit dans la page apps elle-même
};

/**
 * Hook : retourne les apps actuellement connectées pour `storeId`. Best-effort,
 * silencieux en cas d'échec (la sidebar reste utilisable). Idempotent : si on
 * change de boutique active, on re-fetch.
 */
export function useInstalledApps(storeId: string | null | undefined): InstalledApp[] {
  const [apps, setApps] = useState<InstalledApp[]>([]);

  useEffect(() => {
    if (!storeId) { setApps([]); return; }
    let cancelled = false;
    void (async () => {
      const [mb, wb, store] = await Promise.all([
        messengerBotApi.getConfig(storeId).catch(() => null),
        whatsappBotApi.getConfig(storeId).catch(() => null),
        storesApi.get(storeId).catch(() => null),
      ]);
      if (cancelled) return;
      const list: InstalledApp[] = [];
      if (mb?.data.connected) list.push({ ...META['messenger-bot'], href: hrefFor('messenger-bot', storeId) });
      if (wb?.data.connected) list.push({ ...META['whatsapp-bot'], href: hrefFor('whatsapp-bot', storeId) });
      const gs = (store?.data as { store?: { integrations?: { googleSheets?: { enabled?: boolean; webhookUrl?: string } } } })?.store?.integrations?.googleSheets;
      if (gs?.enabled && gs.webhookUrl) list.push({ ...META['google-sheets'], href: hrefFor('google-sheets', storeId) });
      setApps(list);
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  return apps;
}
