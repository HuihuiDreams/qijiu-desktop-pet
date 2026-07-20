const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { normalizeStatusWindowSize } = require('../../../ipcContracts');
const windowManager = require('./WindowManager');

let deps = {};
let lastStatusWindowData = null;

function init(dependencies) {
  deps = dependencies;

  ipcMain.on('show-status-window', (_event, data) => {
    showStatusWindow(data);
  });

  ipcMain.on('hide-status-window', () => {
    hideStatusWindow();
  });

  ipcMain.on('update-status-window', (_event, data) => {
    updateStatusWindow(data);
  });

  ipcMain.on('resize-status-window', (_event, size) => {
    resizeStatusWindow(size);
  });

  ipcMain.handle('status-close-window', () => {
    closeStatusWindow();
    return { success: true };
  });
}

function sendStatusWindowData() {
  if (!windowManager.statusWindow || windowManager.statusWindow.isDestroyed() || !lastStatusWindowData) return;
  windowManager.statusWindow.webContents.send('status-window-data', lastStatusWindowData);
}

function showStatusWindow(data) {
  lastStatusWindowData = data;
  openStatusWindow();
  deps.refreshTrayMenu();
}

function updateStatusWindow(data) {
  lastStatusWindowData = data;
  sendStatusWindowData();
}

function hideStatusWindow() {
  if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) {
    windowManager.statusWindow.hide();
    deps.refreshTrayMenu();
  }
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send('status-window-closed');
  }
}

function resizeStatusWindow(size) {
  if (!windowManager.statusWindow || windowManager.statusWindow.isDestroyed()) return;

  const { width, height } = normalizeStatusWindowSize(size);
  windowManager.statusWindow.setContentSize(width, height);
}

function getInitialStatusWindowBounds() {
  const width = 400;
  const height = 460;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width: areaWidth, height: areaHeight } = display.workArea;

  return {
    width,
    height,
    x: Math.round(x + (areaWidth - width) / 2),
    y: Math.round(y + (areaHeight - height) / 2),
  };
}

function createStatusWindow() {
  if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) return windowManager.statusWindow;

  const bounds = getInitialStatusWindowBounds();
  windowManager.statusWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windowManager.statusWindow.setAlwaysOnTop(true, 'floating');
  windowManager.statusWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  windowManager.statusWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'status.html'));

  windowManager.statusWindow.webContents.on('did-finish-load', () => sendStatusWindowData());
  windowManager.statusWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.statusWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  windowManager.statusWindow.on('closed', () => {
    windowManager.statusWindow = null;
    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
      windowManager.mainWindow.webContents.send('status-window-closed');
    }
    deps.refreshTrayMenu();
  });

  return windowManager.statusWindow;
}

function openStatusWindow() {
  const win = createStatusWindow();
  if (!win.isVisible()) {
    win.show();
  }
  win.moveTop();
  win.focus();
  sendStatusWindowData();
  return win;
}

function closeStatusWindow() {
  if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) {
    windowManager.statusWindow.close();
  }
}

module.exports = {
  init,
  createStatusWindow,
  openStatusWindow,
  closeStatusWindow,
  showStatusWindow,
  updateStatusWindow,
  hideStatusWindow,
  resizeStatusWindow
};
