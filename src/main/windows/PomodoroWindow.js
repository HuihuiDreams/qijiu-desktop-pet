const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');
const { isSenderMainWindow, isSenderWindow } = require('../services/IpcSenderAuthorization');

const POMODORO_ALWAYS_ON_TOP_LEVEL = 'screen-saver';
let pomodoroAlwaysOnTop = true;
let deps = {};

function init(dependencies) {
  deps = dependencies;

  ipcMain.handle('pomodoro-open-window', async (event) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) {
      return deps.createIpcFailure('FORBIDDEN', 'Pomodoro access denied');
    }
    try {
      await deps.initStore();
      openPomodoroWindow();
      return deps.createIpcSuccess(deps.getPomodoroSnapshot());
    } catch (error) {
      console.error('Failed to open pomodoro window:', error);
      return deps.createIpcFailure('INTERNAL_ERROR', 'Failed to open pomodoro window');
    }
  });

  ipcMain.handle('pomodoro-get-state', async (event) => {
    if (!isSenderWindow(event, windowManager.pomodoroWindow)) {
      return deps.createIpcFailure('FORBIDDEN', 'Pomodoro access denied');
    }
    try {
      return deps.createIpcSuccess(deps.getPomodoroSnapshot());
    } catch (error) {
      console.error('Failed to read pomodoro state:', error);
      return deps.createIpcFailure('INTERNAL_ERROR', 'Failed to read pomodoro state');
    }
  });

  ipcMain.handle('pomodoro-start', async (event, minutes) => {
    if (!isSenderWindow(event, windowManager.pomodoroWindow)) {
      return deps.createIpcFailure('FORBIDDEN', 'Pomodoro access denied');
    }
    try {
      await deps.startPomodoroSession(minutes);
      return deps.createIpcSuccess(deps.getPomodoroSnapshot());
    } catch (error) {
      console.error('Failed to start pomodoro:', error);
      return deps.createIpcFailure('INTERNAL_ERROR', 'Failed to start pomodoro');
    }
  });

  ipcMain.handle('pomodoro-stop', async (event) => {
    if (!isSenderWindow(event, windowManager.pomodoroWindow)) {
      return deps.createIpcFailure('FORBIDDEN', 'Pomodoro access denied');
    }
    try {
      deps.stopPomodoroSession();
      return deps.createIpcSuccess(deps.getPomodoroSnapshot());
    } catch (error) {
      console.error('Failed to stop pomodoro:', error);
      return deps.createIpcFailure('INTERNAL_ERROR', 'Failed to stop pomodoro');
    }
  });

  ipcMain.handle('pomodoro-close-window', async (event) => {
    if (!isSenderWindow(event, windowManager.pomodoroWindow)) {
      return deps.createIpcFailure('FORBIDDEN', 'Pomodoro access denied');
    }
    try {
      return deps.createIpcSuccess(closePomodoroWindow());
    } catch (error) {
      console.error('Failed to close pomodoro window:', error);
      return deps.createIpcFailure('INTERNAL_ERROR', 'Failed to close pomodoro window');
    }
  });

  ipcMain.handle('pomodoro-set-always-on-top', async (event, enabled) => {
    if (!isSenderWindow(event, windowManager.pomodoroWindow)) {
      return deps.createIpcFailure('FORBIDDEN', 'Pomodoro access denied');
    }
    try {
      pomodoroAlwaysOnTop = Boolean(enabled);
      applyPomodoroWindowPinState(pomodoroAlwaysOnTop);
      deps.sendPomodoroState();
      return deps.createIpcSuccess(deps.getPomodoroSnapshot());
    } catch (error) {
      console.error('Failed to update pomodoro pin state:', error);
      return deps.createIpcFailure('INTERNAL_ERROR', 'Failed to update pomodoro pin state');
    }
  });
}

function getInitialPomodoroWindowBounds() {
  const width = 336;
  const height = 360;
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

function createPomodoroWindow() {
  if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) return windowManager.pomodoroWindow;

  pomodoroAlwaysOnTop = true;
  const bounds = getInitialPomodoroWindowBounds();
  windowManager.pomodoroWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: pomodoroAlwaysOnTop,
    skipTaskbar: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', '..', 'pomodoroPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  applyPomodoroWindowPinState();
  windowManager.pomodoroWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'pomodoro.html'));

  windowManager.pomodoroWindow.webContents.on('did-finish-load', () => deps.sendPomodoroState());
  windowManager.pomodoroWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.pomodoroWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  windowManager.pomodoroWindow.on('closed', () => {
    windowManager.pomodoroWindow = null;
    deps.stopPomodoroSession();
  });

  return windowManager.pomodoroWindow;
}

function openPomodoroWindow() {
  const win = createPomodoroWindow();
  if (!win.isVisible()) {
    win.show();
  }
  win.moveTop();
  win.focus();
  deps.sendPomodoroState();
  return win;
}

function closePomodoroWindow() {
  deps.stopPomodoroSession();
  if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {
    windowManager.pomodoroWindow.close();
  }
  return deps.getPomodoroSnapshot();
}

function applyPomodoroWindowPinState(shouldRaise = false) {
  if (!windowManager.pomodoroWindow || windowManager.pomodoroWindow.isDestroyed()) return;

  windowManager.pomodoroWindow.setAlwaysOnTop(pomodoroAlwaysOnTop, POMODORO_ALWAYS_ON_TOP_LEVEL);

  if (pomodoroAlwaysOnTop) {
    windowManager.pomodoroWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    windowManager.pomodoroWindow.setVisibleOnAllWorkspaces(false);
  }

  if (!shouldRaise) return;

  if (windowManager.pomodoroWindow.isMinimized()) {
    windowManager.pomodoroWindow.restore();
  }
  if (!windowManager.pomodoroWindow.isVisible()) {
    windowManager.pomodoroWindow.show();
  }
  windowManager.pomodoroWindow.moveTop();
}

module.exports = {
  init,
  createPomodoroWindow,
  openPomodoroWindow,
  closePomodoroWindow,
  applyPomodoroWindowPinState,
  isPomodoroAlwaysOnTop: () => pomodoroAlwaysOnTop
};
