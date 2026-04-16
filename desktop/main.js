const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

const TARGET_URL = process.env.NEXRESTO_DESKTOP_URL || 'https://nexresto.in';
const TARGET_ORIGIN = new URL(TARGET_URL).origin;

let mainWindow;

app.setName('NexResto');
if (process.platform === 'win32') {
  app.setAppUserModelId('in.nexresto.desktop');
}

function resolveWindowIcon() {
  const devIconPath = path.join(__dirname, 'assets', 'icon.ico');
  if (!app.isPackaged) {
    return devIconPath;
  }

  // Windows executables embed the app icon, so this fallback is optional.
  return undefined;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'NexResto',
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep the shell identity stable regardless of page title changes.
  mainWindow.setTitle('NexResto');
  mainWindow.setRepresentedFilename('NexResto');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isInternal = (() => {
      try {
        return new URL(url).origin === TARGET_ORIGIN;
      } catch {
        return false;
      }
    })();
    if (!isInternal) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle('NexResto');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle('NexResto');
  });

  mainWindow.loadURL(TARGET_URL);
}

function setupAutoUpdates() {
  if (!app.isPackaged) {
    log.info('Skip auto-updates in development mode');
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version}`);
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error', err);
  });

  autoUpdater.on('update-downloaded', (info) => {
    const detail = `Version ${info.version} has been downloaded. Restart now to finish updating.`;
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update Ready',
        message: 'A new NexResto desktop update is ready.',
        detail,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 6 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  createMainWindow();
  setupAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
