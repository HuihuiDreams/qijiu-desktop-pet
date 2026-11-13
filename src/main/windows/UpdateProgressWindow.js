const { BrowserWindow } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');

let deps = {};
// 页面加载期间发出的消息会因为监听器尚未注册而丢失，所以始终记录最新载荷，
// did-finish-load 时补发它，而不是窗口创建时的初始载荷。
let latestPayload = null;

function init(dependencies) {
  deps = dependencies;
}

function sendUpdateProgressPayload(payload) {
  latestPayload = payload;
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
    latestPayload = normalizedPayload;
    const updateProgressWindow = new BrowserWindow({
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
    windowManager.updateProgressWindow = updateProgressWindow;
    updateProgressWindow.setMenuBarVisibility(false);
    updateProgressWindow.on('closed', () => {
      // close() 会立即清空引用；此时可能已有新窗口占用，只清理仍指向自己的引用
      if (windowManager.updateProgressWindow === updateProgressWindow) {
        windowManager.updateProgressWindow = null;
      }
    });
    updateProgressWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    updateProgressWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    updateProgressWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'update-progress.html'));

    updateProgressWindow.webContents.once('did-finish-load', () => {
      if (latestPayload && !updateProgressWindow.isDestroyed()) {
        updateProgressWindow.webContents.send('update-progress', latestPayload);
      }
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
  latestPayload = null;
}

module.exports = {
  init,
  showUpdateProgressWindow,
  setUpdateProgress,
  closeUpdateProgressWindow,
};
