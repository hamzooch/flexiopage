import { useEffect, useCallback } from 'react';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  type?: 'order' | 'message' | 'payment' | 'alert' | 'system';
  /** Dédoublonne les notifications navigateur portant le même tag. */
  tag?: string;
  /** Navigateur uniquement : action au clic (focus fenêtre + navigation). */
  onClick?: () => void;
}

export const useNotifications = () => {
  const isElectron = () => {
    return typeof window !== 'undefined' && (window as any).electronAPI;
  };

  const showNotification = useCallback((options: NotificationOptions) => {
    if (!isElectron()) {
      // Fallback to browser notifications
      // Onglet déjà au premier plan → l'utilisateur voit la cloche se mettre
      // à jour ; une alerte système serait redondante (même règle qu'Electron,
      // qui n'affiche que fenêtre non focus).
      if (document.visibilityState === 'visible' && document.hasFocus()) return;
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(options.title, {
          body: options.body,
          icon: options.icon,
          tag: options.tag || options.type,
        });
        n.onclick = () => {
          window.focus();
          options.onClick?.();
          n.close();
        };
      }
      return;
    }

    // Use Electron API
    (window as any).electronAPI.showNotification(options.title, options.body, options.icon);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isElectron() && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
      return Notification.permission === 'granted';
    }
    return true;
  }, []);

  useEffect(() => {
    if (isElectron()) {
      (window as any).electronAPI.onNotificationClicked((event: any) => {
        console.log('Notification clicked:', event);
      });
    }
  }, []);

  return {
    showNotification,
    requestPermission,
    isElectron: isElectron(),
  };
};
