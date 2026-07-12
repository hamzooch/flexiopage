import { BrowserWindow, Notification } from 'electron';
import axios from 'axios';
import log from 'electron-log';
import * as path from 'path';

export interface NotificationEvent {
  type: 'order' | 'message' | 'payment' | 'alert' | 'system';
  title: string;
  body: string;
  data?: any;
}

export class NotificationService {
  private mainWindow: BrowserWindow;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastCheckTime: number = Date.now();
  private backendUrl: string = 'http://localhost:3001';
  private pollInterval: number = 10000; // 10 seconds

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupListeners();
  }

  start() {
    log.info('NotificationService started');
    // Start polling for events
    this.poll();
    this.pollingInterval = setInterval(() => this.poll(), this.pollInterval);
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    log.info('NotificationService stopped');
  }

  private setupListeners() {
    // Listen for custom events from the frontend
    this.mainWindow.webContents.on('ipc-message', (event, channel, data) => {
      if (channel === 'notification') {
        this.handleNotification(data);
      }
    });
  }

  private async poll() {
    try {
      const response = await axios.get(`${this.backendUrl}/api/notifications/recent`, {
        params: {
          since: this.lastCheckTime,
        },
        timeout: 5000,
      });

      if (response.data && Array.isArray(response.data)) {
        response.data.forEach((notification: NotificationEvent) => {
          this.showNotification(notification);
        });
      }

      this.lastCheckTime = Date.now();
    } catch (error) {
      // Silently fail - backend may not be available
      log.debug('Poll failed:', error);
    }
  }

  private handleNotification(event: NotificationEvent) {
    this.showNotification(event);
  }

  private showNotification(event: NotificationEvent) {
    if (!this.mainWindow || this.mainWindow.isFocused()) {
      return;
    }

    const notification = new Notification({
      title: event.title,
      body: event.body,
      icon: this.getIconForType(event.type),
      timeoutType: 'default',
      tag: event.type,
    });

    notification.on('click', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();

        // Send event to frontend to navigate if needed
        if (event.data) {
          this.mainWindow.webContents.send('notification-clicked', event);
        }
      }
    });

    notification.show();
    log.info(`Notification shown: ${event.title}`);
  }

  private getIconForType(type: NotificationEvent['type']): string {
    const iconMap: Record<string, string> = {
      order: path.join(__dirname, '../../assets/icons/order.png'),
      message: path.join(__dirname, '../../assets/icons/message.png'),
      payment: path.join(__dirname, '../../assets/icons/payment.png'),
      alert: path.join(__dirname, '../../assets/icons/alert.png'),
      system: path.join(__dirname, '../../assets/icon.png'),
    };
    return iconMap[type] || path.join(__dirname, '../../assets/icon.png');
  }
}
