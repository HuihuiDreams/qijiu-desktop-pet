const { BrowserWindow } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');

let deps = {};

function init(dependencies) {
  deps = dependencies;
}

function sendUpdateProgressPayload(payload) {
  if (!windowManager.updateProgressWindow || windowManager.updateProgressWindow.isDestroyed()) return;
  windowManager.updateProgressWindow.webContents.send('update-progress', payload);
}

function showUpdateProgressWindow(payload) {
  const normalizedPayload = {
    mode: payload.mode,
    title: payload.title,
    message: payload.message,
    percent: payload.percent ?? 0,
  };

  if (!windowManager.updateProgressWindow || windowManager.updateProgressWindow.isDestroyed()) {
    windowManager.updateProgressWindow = new BrowserWindow({
      width: 380,
      height: 172,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: normalizedPayload.title,
      parent: windowManager.mainWindow && !windowManager.mainWindow.isDestroyed() ? windowManager.mainWindow : undefined,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', '..', 'updateProgressPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    windowManager.updateProgressWindow.setMenuBarVisibility(false);
    windowManager.updateProgressWindow.on('closed', () => {
      windowManager.updateProgressWindow = null;
    });
    windowManager.updateProgressWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    windowManager.updateProgressWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    windowManager.updateProgressWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'update-progress.html'));

    windowManager.updateProgressWindow.webContents.once('did-finish-load', () => {
      sendUpdateProgressPayload(normalizedPayload);
    });
    return;
  }

  windowManager.updateProgressWindow.setTitle(normalizedPayload.title);
  windowManager.updateProgressWindow.show();
  windowManager.updateProgressWindow.focus();
  sendUpdateProgressPayload(normalizedPayload);
}

function setUpdateProgress(percent) {
  if (!windowManager.updateProgressWindow || windowManager.updateProgressWindow.isDestroyed()) return;
  sendUpdateProgressPayload({
    mode: 'downloading',
    title: deps.trayText('updateDownloadingTitle', 'Downloading Update'),
    message: deps.trayT('updateDownloadingMsg'),
    percent,
  });
}

function closeUpdateProgressWindow() {
  if (!windowManager.updateProgressWindow || windowManager.updateProgressWindow.isDestroyed()) return;
  windowManager.updateProgressWindow.close();
  windowManager.updateProgressWindow = null;
}

module.exports = {
  init,
  showUpdateProgressWindow,
  setUpdateProgress,
  closeUpdateProgressWindow,
};
