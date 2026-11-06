const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { normalizeStatusWindowSize } = require('../../../ipcContracts');
const windowManager = require('./WindowManager');
const { isSenderMainWindow, isSenderWindow } = require('../services/IpcSenderAuthorization');

const STATUS_WINDOW_ALWAYS_ON_TOP_LEVEL = 'screen-saver';

let deps = {};
let lastStatusWindowData = null;

function init(dependencies) {
  deps = dependencies;

  ipcMain.on('show-status-window', (event, data) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) return;
    showStatusWindow(data);
  });

  ipcMain.on('hide-status-window', (event) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) return;
    hideStatusWindow();
  });

  ipcMain.on('update-status-window', (event, data) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) return;
    updateStatusWindow(data);
  });

  ipcMain.on('resize-status-window', (event, size) => {
    if (!isSenderWindow(event, windowManager.statusWindow)) return;
    resizeStatusWindow(size);
  });

  ipcMain.handle('status-close-window', (event) => {
    if (!isSenderWindow(event, windowManager.statusWindow)) return { success: false };
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
      preload: path.join(__dirname, '..', '..', '..', 'statusPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (typeof windowManager.statusWindow.setAlwaysOnTop === 'function') {
    windowManager.statusWindow.setAlwaysOnTop(true, STATUS_WINDOW_ALWAYS_ON_TOP_LEVEL);
  }
  if (typeof windowManager.statusWindow.setVisibleOnAllWorkspaces === 'function') {
    windowManager.statusWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
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
  if (process.platform === 'darwin' && typeof app?.focus === 'function' && (typeof win.isFocused !== 'function' || !win.isFocused())) {
    app.focus({ steal: true });
  }
  if (typeof win.isMinimized === 'function' && win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }
  if (typeof win.setAlwaysOnTop === 'function') {
    win.setAlwaysOnTop(true, STATUS_WINDOW_ALWAYS_ON_TOP_LEVEL);
  }
  if (typeof win.moveTop === 'function') {
    win.moveTop();
  }
  if (typeof win.focus === 'function') {
    win.focus();
  }
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
