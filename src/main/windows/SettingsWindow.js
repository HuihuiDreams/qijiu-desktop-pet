const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');
const PetScaleService = require('../services/PetScaleService');

const SETTINGS_WINDOW_WIDTH = 520;
const SETTINGS_WINDOW_HEIGHT = 456;
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

function clampBoundLength(preferred, available) {
  return Number.isFinite(available) && available > 0
    ? Math.max(1, Math.min(preferred, Math.floor(available)))
    : preferred;
}

function getInitialSettingsWindowBounds() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width: areaWidth, height: areaHeight } = display.workArea;
  const width = clampBoundLength(SETTINGS_WINDOW_WIDTH, areaWidth);
  const height = clampBoundLength(SETTINGS_WINDOW_HEIGHT, areaHeight);

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

function clearSettingsWindowTop() {
  if (settingsTopPulseTimer) {
    clearTimeout(settingsTopPulseTimer);
    settingsTopPulseTimer = null;
  }
  const win = windowManager.settingsWindow;
  if (win && !win.isDestroyed() && typeof win.setAlwaysOnTop === 'function') {
    win.setAlwaysOnTop(false);
  }
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
  // 仅在窗口未实际持有焦点时按 180ms 回落普通层级；聚焦期间持续保持 screen-saver 级，
  // 防止主透明宠物窗口在 180ms 后或 3 秒置顶巡检时压住正在操作的设置对话框。
  settingsTopPulseTimer = setTimeout(() => {
    settingsTopPulseTimer = null;
    const currentWin = windowManager.settingsWindow;
    if (!currentWin || currentWin.isDestroyed()) return;
    if (typeof currentWin.isFocused === 'function' && currentWin.isFocused()) return;
    if (typeof currentWin.setAlwaysOnTop === 'function') {
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
  win.on('blur', () => {
    clearSettingsWindowTop();
  });
  win.on('minimize', () => {
    clearSettingsWindowTop();
  });
  win.on('hide', () => {
    clearSettingsWindowTop();
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
