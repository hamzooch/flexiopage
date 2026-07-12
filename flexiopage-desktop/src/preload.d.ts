export interface ElectronAPI {
  showNotification: (title: string, body: string, icon?: string) => void;
  onNotificationClicked: (callback: (event: any) => void) => void;
  getAppVersion: () => Promise<string>;
  openExternalLink: (url: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
