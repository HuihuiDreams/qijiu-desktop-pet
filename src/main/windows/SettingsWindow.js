const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');
const PetScaleService = require('../services/PetScaleService');

const SETTINGS_WINDOW_WIDTH = 520;
const SETTINGS_WINDOW_HEIGHT = 476;
const SETTINGS_ALWAYS_ON_TOP_LEVEL = 'screen-saver';
const SETTINGS_TOP_PULSE_MS = 180;
const VALID_SETTINGS_TABS = new Set(['appearance', 'companion', 'system']);

let settingsTopPulseTimer = null;
let settingsCloseInProgress = false;
let activeInitialTab = 'appearance';
let deps = {};

function init(dependencies = {}) {
  deps = dependencies || {};
}

function normalizeSettingsTab(tab) {
  return VALID_SETTINGS_TABS.has(tab) ? tab : 'appearance';
}

function getInitialSettingsWindowBounds() {
  const width = SETTINGS_WINDOW_WIDTH;
  const height = SETTINGS_WINDOW_HEIGHT;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width: areaWidth, height: areaHeight } = display.workArea;

  const rawX = Math.round(x + (areaWidth - width) / 2);
  const rawY = Math.round(y + (areaHeight - height) / 2);
  const maxX = Math.max(x, x + areaWidth - width);
  const maxY = Math.max(y, y + areaHeight - height);

  return {
    width,
    height,
    x: Math.min(Math.max(rawX, x), maxX),
    y: Math.min(Math.max(rawY, y), maxY),
  };
}

function pulseSettingsWindowTop() {
  if (settingsTopPulseTimer) {
    clearTimeout(settingsTopPulseTimer);
    settingsTopPulseTimer = null;
  }
  const win = windowManager.settingsWindow;
  if (!win || win.isDestroyed()) return;

  if (typeof win.setAlwaysOnTop === 'function') {
    win.setAlwaysOnTop(true, SETTINGS_ALWAYS_ON_TOP_LEVEL);
  }
  if (typeof win.moveTop === 'function') {
    win.moveTop();
  }
  settingsTopPulseTimer = setTimeout(() => {
    settingsTopPulseTimer = null;
    const currentWin = windowManager.settingsWindow;
    if (currentWin && !currentWin.isDestroyed() && typeof currentWin.setAlwaysOnTop === 'function') {
      currentWin.setAlwaysOnTop(false);
    }
  }, SETTINGS_TOP_PULSE_MS);
}

function flushPendingPetScale() {
  if (typeof deps.flushPetScalePreview === 'function') {
    deps.flushPetScalePreview();
    return;
  }
  if (typeof PetScaleService.flushPreview === 'function') {
    PetScaleService.flushPreview();
  }
}

function createSettingsWindow(initialTab = 'appearance') {
  if (windowManager.settingsWindow && !windowManager.settingsWindow.isDestroyed()) {
    return windowManager.settingsWindow;
  }

  activeInitialTab = normalizeSettingsTab(initialTab);
  settingsCloseInProgress = false;

  const win = new BrowserWindow({
    ...getInitialSettingsWindowBounds(),
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', '..', 'settingsPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windowManager.settingsWindow = win;

  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }

  win.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'settings.html'));

  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed?.()) {
      win.webContents.send('settings-switch-tab', activeInitialTab);
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  win.on('focus', () => {
    pulseSettingsWindowTop();
  });
  win.on('show', () => {
    pulseSettingsWindowTop();
  });
  win.on('restore', () => {
    pulseSettingsWindowTop();
  });
  win.on('close', () => {
    if (settingsCloseInProgress) return;
    settingsCloseInProgress = true;
    flushPendingPetScale();
  });
  win.on('closed', () => {
    if (settingsTopPulseTimer) {
      clearTimeout(settingsTopPulseTimer);
      settingsTopPulseTimer = null;
    }
    if (windowManager.settingsWindow === win) {
      windowManager.settingsWindow = null;
    }
    settingsCloseInProgress = false;
  });

  return win;
}

function openSettingsWindow(initialTab = 'appearance') {
  const targetTab = normalizeSettingsTab(initialTab);
  activeInitialTab = targetTab;

  const wasAlreadyCreated = Boolean(windowManager.settingsWindow && !windowManager.settingsWindow.isDestroyed());
  const win = createSettingsWindow(targetTab);

  if (process.platform === 'darwin' && typeof app?.focus === 'function' && (typeof win.isFocused !== 'function' || !win.isFocused())) {
    app.focus({ steal: true });
  }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) {
    win.show();
  }
  pulseSettingsWindowTop();
  win.focus();

  if (wasAlreadyCreated && win.webContents && !win.webContents.isDestroyed?.()) {
    win.webContents.send('settings-switch-tab', targetTab);
  }
  return win;
}

function closeSettingsWindow() {
  if (settingsCloseInProgress) return;

  settingsCloseInProgress = true;
  flushPendingPetScale();
  const win = windowManager.settingsWindow;
  if (win && !win.isDestroyed()) {
    win.close();
  } else {
    settingsCloseInProgress = false;
  }
}

module.exports = {
  init,
  createSettingsWindow,
  openSettingsWindow,
  closeSettingsWindow,
  pulseSettingsWindowTop,
  getInitialSettingsWindowBounds,
  normalizeSettingsTab,
};
