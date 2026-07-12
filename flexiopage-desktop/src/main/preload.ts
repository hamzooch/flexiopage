import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (title: string, body: string, icon?: string) => {
    ipcRenderer.send('show-notification', { title, body, icon });
  },
  onNotificationClicked: (callback: (event: any) => void) => {
    ipcRenderer.on('notification-clicked', (event, data) => {
      callback(data);
    });
  },
  getAppVersion: async () => {
    return await ipcRenderer.invoke('get-app-version');
  },
  openExternalLink: (url: string) => {
    ipcRenderer.send('open-external-link', url);
  },
});
