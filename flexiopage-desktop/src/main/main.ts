import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  ipcMain,
  Tray,
} from 'electron';
import * as path from 'path';
import isDev from 'electron-is-dev';
import log from 'electron-log';
import { NotificationService } from './services/NotificationService';
import { AppUpdater } from './services/AppUpdater';

let mainWindow: BrowserWindow | null;
let tray: Tray | null;
let notificationService: NotificationService;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  const startUrl = isDev
    ? 'http://localhost:3002'
    : `file://${path.join(__dirname, '../../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });

  mainWindow.on('close', (event) => {
    if (mainWindow && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  return mainWindow;
};

const createTray = () => {
  const iconPath = path.join(__dirname, '../../assets/icon-tray.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
};

const createMenu = () => {
  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.on('ready', () => {
  log.info('App starting...');
  createWindow();
  createTray();
  createMenu();

  notificationService = new NotificationService(mainWindow!);
  notificationService.start();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// IPC Handlers for notifications
ipcMain.on('show-notification', (event, { title, body, icon }) => {
  if (mainWindow && !mainWindow.isFocused()) {
    new Notification({
      title,
      body,
      icon: icon || path.join(__dirname, '../../assets/icon.png'),
    }).show();
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Keep app reference in production
declare global {
  var app: Electron.App;
}
