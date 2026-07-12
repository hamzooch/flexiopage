import { useEffect, useCallback } from 'react';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  type?: 'order' | 'message' | 'payment' | 'alert' | 'system';
}

export const useNotifications = () => {
  const isElectron = () => {
    return typeof window !== 'undefined' && (window as any).electronAPI;
  };

  const showNotification = useCallback((options: NotificationOptions) => {
    if (!isElectron()) {
      // Fallback to browser notifications
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(options.title, {
          body: options.body,
          icon: options.icon,
          tag: options.type,
        });
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
