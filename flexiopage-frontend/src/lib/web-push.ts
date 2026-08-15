/**
 * Abonnement Web Push côté navigateur : enregistre le service worker,
 * souscrit auprès du push service du navigateur avec la clé VAPID publique
 * du backend, puis envoie l'abonnement à /api/push/web/subscribe.
 *
 * À appeler quand la permission Notification est (déjà) accordée — no-op
 * sinon. Idempotent : re-souscrire renvoie l'abonnement existant.
 */
import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function ensureWebPushSubscription(): Promise<'subscribed' | 'unsupported' | 'no-permission' | 'error'> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  if (Notification.permission !== 'granted') return 'no-permission';

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { data } = await api.get<{ publicKey: string }>('/push/web/public-key');
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }
    await api.post('/push/web/subscribe', sub.toJSON());
    return 'subscribed';
  } catch {
    return 'error';
  }
}
