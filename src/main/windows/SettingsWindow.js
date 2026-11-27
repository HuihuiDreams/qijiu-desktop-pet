const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');
const PetScaleService = require('../services/PetScaleService');

const SETTINGS_WINDOW_WIDTH = 520;
const SETTINGS_WINDOW_HEIGHT = 456;
const SETTINGS_ALWAYS_ON_TOP_LEVEL = 'pop-up-menu';
const SETTINGS_TOP_PULSE_MS = 180;
const VALID_SETTINGS_TABS = new Set(['appearance', 'companion', 'system']);

let settingsTopPulseTimer = null;
let settingsCloseInProgress = false;
let isOpeningSettingsWindow = false;
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

function keepPetAboveSettingsWindow() {
  if (typeof deps.keepPetWindowOnTop === 'function') {
    deps.keepPetWindowOnTop();
  }
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
  keepPetAboveSettingsWindow();
  // 仅在窗口未实际持有焦点时按 180ms 回落普通层级；聚焦期间保持 pop-up-menu 级
  // （高于普通/全屏应用与状态窗口，同时让位于 screen-saver 级的主桌宠透明窗口及其右键菜单）。
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
  win.webContents.on?.('input-event', (_event, input) => {
    if (
      process.platform === 'win32'
      && (input?.type === 'mouseDown' || input?.type === 'touchStart')
      && (typeof win.isAlwaysOnTop !== 'function' || win.isAlwaysOnTop())
    ) {
      keepPetAboveSettingsWindow();
    }
  });

  const pulseWhenNotOpening = () => {
    if (!isOpeningSettingsWindow) pulseSettingsWindowTop();
  };
  win.on('focus', pulseWhenNotOpening);
  win.on('show', pulseWhenNotOpening);
  win.on('restore', pulseWhenNotOpening);
  // macOS 上 moved 是 move 的别名，拖动时逐帧触发；macOS 由窗口层级保证顺序，只在 Windows 重申
  win.on('moved', () => {
    if (process.platform === 'win32' && (typeof win.isAlwaysOnTop !== 'function' || win.isAlwaysOnTop())) {
      keepPetAboveSettingsWindow();
    }
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
  // 先完成恢复、显示与聚焦再置顶并重申主窗层级，避免全屏 RDP 抑制期间
  // show/restore 或预置顶在 focus 之前回调 keepPetWindowOnTop() 把设置窗立即隐藏。
  isOpeningSettingsWindow = true;
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
  } finally {
    isOpeningSettingsWindow = false;
  }
  pulseSettingsWindowTop();

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
