const fs = require('fs');

const mainJsPath = 'main.js';
let mainJs = fs.readFileSync(mainJsPath, 'utf8');

const statusCode = `const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');

let deps = {};

function init(dependencies) {
  deps = dependencies;
  
  ipcMain.handle('status-close-window', () => {
    closeStatusWindow();
    return { success: true };
  });
}

function getInitialStatusWindowBounds() {
  const width = 160;
  const height = 180;
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

  windowManager.statusWindow.webContents.on('did-finish-load', () => deps.sendStatusWindowData());
  windowManager.statusWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.statusWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  windowManager.statusWindow.on('closed', () => {
    windowManager.statusWindow = null;
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
  deps.sendStatusWindowData();
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
  closeStatusWindow
};
`;

fs.writeFileSync('src/main/windows/StatusWindow.js', statusCode);
console.log('Created StatusWindow.js');
