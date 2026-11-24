'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const SETTINGS_WINDOW_PATH = require.resolve('../src/main/windows/SettingsWindow');
const SKIN_SELECTOR_WINDOW_PATH = require.resolve('../src/main/windows/SkinSelectorWindow');
const PET_WINDOW_PATH = require.resolve('../src/main/windows/PetWindow');

const FORBIDDEN_SUBWINDOW_APIS = [
  'saveData',
  'loadData',
  'setAutoLaunch',
  'getAutoLaunch',
  'setLocale',
  'setCurrentSkin',
];

function createFakeBrowserWindowClass() {
  return class FakeBrowserWindow {
    constructor(options = {}) {
      this.options = options;
      this.visible = Boolean(options.show);
      this.minimized = false;
      this.destroyed = false;
      this.focused = false;
      this.alwaysOnTop = false;
      this.alwaysOnTopLevel = null;
      this.visibleOnAllWorkspaces = false;
      this.visibleOnAllWorkspacesOptions = null;
      this.closeCalls = 0;
      this.focusCalls = 0;
      this.listeners = {};
      this.webContentsListeners = {};
      this.sentMessages = [];
      this.windowOpenHandler = null;
      this.webContents = {
        id: 201,
        isDestroyed: () => this.destroyed,
        on: (event, handler) => {
          this.webContentsListeners[event] = this.webContentsListeners[event] || [];
          this.webContentsListeners[event].push(handler);
        },
        setWindowOpenHandler: (handler) => {
          this.windowOpenHandler = handler;
        },
        send: (channel, ...args) => {
          this.sentMessages.push({ channel, args });
        },
      };
    }

    on(event, handler) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(handler);
    }

    emit(event, ...args) {
      for (const h of this.listeners[event] || []) {
        h(...args);
      }
    }

    emitWebContents(event, ...args) {
      for (const h of this.webContentsListeners[event] || []) {
        h(...args);
      }
    }

    loadFile(filePath) {
      this.loadedFile = filePath;
      return Promise.resolve();
    }

    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    show() { this.visible = true; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; }
    focus() {
      this.focused = true;
      this.focusCalls += 1;
    }
    blur() { this.focused = false; }
    isFocused() { return this.focused; }
    isAlwaysOnTop() { return Boolean(this.alwaysOnTop); }
    moveTop() {}
    setIgnoreMouseEvents() {}
    setAlwaysOnTop(flag, level) {
      this.alwaysOnTop = Boolean(flag);
      this.alwaysOnTopLevel = level || null;
    }
    setVisibleOnAllWorkspaces(flag, options) {
      this.visibleOnAllWorkspaces = Boolean(flag);
      this.visibleOnAllWorkspacesOptions = options;
    }
    close() {
      this.closeCalls += 1;
      this.emit('close');
      this.destroyed = true;
      this.visible = false;
      this.emit('closed');
    }
  };
}

function loadSettingsWindowHarness(options = {}) {
  const FakeBrowserWindow = createFakeBrowserWindowClass();
  const focusCalls = [];
  const flushCalls = [];
  const workArea = options.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
  const cursorPoint = options.cursorPoint || { x: 100, y: 100 };
  const windowManager = {
    settingsWindow: null,
    skinSelectorWindow: null,
    mainWindow: null,
  };

  delete require.cache[SETTINGS_WINDOW_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === SETTINGS_WINDOW_PATH) {
      if (request === 'electron') {
        return {
          app: {
            focus(opts) { focusCalls.push(opts); },
          },
          BrowserWindow: FakeBrowserWindow,
          screen: {
            getCursorScreenPoint: () => cursorPoint,
            getDisplayNearestPoint: () => ({ workArea }),
          },
        };
      }
      if (request === './WindowManager') {
        return windowManager;
      }
      if (request === '../services/PetScaleService') {
        return {
          flushPreview: () => {
            flushCalls.push('flushPreview');
            return 100;
          },
        };
      }
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = require(SETTINGS_WINDOW_PATH);
    return { mod, windowManager, focusCalls, flushCalls };
  } finally {
    Module._load = originalLoad;
  }
}

test('settingsPreload.js exposes narrow semantic APIs without forbidden keys', () => {
  const source = fs.readFileSync(path.join(ROOT, 'settingsPreload.js'), 'utf8');
  const windowSource = fs.readFileSync(path.join(ROOT, 'src/main/windows/SettingsWindow.js'), 'utf8');

  assert.match(windowSource, /preload: path\.join\([^\n]*'settingsPreload\.js'\)/);
  assert.match(source, /function subscribeIpc\(channel, listener\)/);
  assert.match(source, /contextBridge\.exposeInMainWorld\('electronAPI'/);

  for (const api of [
    'getLocale',
    'onLocaleChange',
    'getSnapshot',
    'previewPetScale',
    'commitPetScale',
    'resetPetScale',
    'setWindowAwareness',
    'setWeatherEnabled',
    'setCityName',
    'setBreakReminder',
    'setScreensaver',
    'changeSettingsLocale',
    'changeAutoLaunch',
    'openSkinSelector',
    'closeSettingsWindow',
    'onSettingsUpdated',
    'onSwitchTab',
    'onRestoreSkinFocus',
  ]) {
    assert.match(source, new RegExp(`${api}:`), `settingsPreload.js must expose ${api}`);
  }

  for (const forbidden of FORBIDDEN_SUBWINDOW_APIS) {
    assert.equal(
      source.includes(`${forbidden}:`),
      false,
      `settingsPreload.js must NOT expose forbidden API ${forbidden}`,
    );
  }
});

test('SettingsWindow: single instance reuse, initialTab switch, workArea clamping, security guards, and top pulse', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const origPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

  const { mod, windowManager, focusCalls, flushCalls } = loadSettingsWindowHarness({
    workArea: { x: 100, y: 50, width: 400, height: 360 },
  });

  try {
    const win = mod.openSettingsWindow('companion');
    assert.equal(windowManager.settingsWindow, win);
    // WorkArea smaller than preferred 520x456 clamps both dimensions and origin into workArea
    assert.equal(win.options.width, 400);
    assert.equal(win.options.height, 360);
    assert.equal(win.options.transparent, true);
    assert.equal(win.options.frame, false);
    assert.equal(win.options.alwaysOnTop, false);
    assert.equal(win.options.minimizable, true);
    assert.equal(win.options.resizable, false);
    assert.equal(win.options.hasShadow, false);
    assert.equal(win.options.webPreferences.sandbox, true);
    assert.equal(win.options.webPreferences.contextIsolation, true);
    assert.equal(win.options.webPreferences.nodeIntegration, false);

    assert.equal(win.options.x, 100);
    assert.equal(win.options.y, 50);

    // Navigation & window.open denial
    assert.deepEqual(win.windowOpenHandler(), { action: 'deny' });
    let prevented = false;
    win.emitWebContents('will-navigate', { preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);

    // Initial load pushes initialTab
    win.emitWebContents('did-finish-load');
    assert.deepEqual(win.sentMessages.at(-1), {
      channel: 'settings-switch-tab',
      args: ['companion'],
    });

    // Top promotion & macOS app.focus({ steal: true }): stays pop-up-menu while focused,
    // drops on blur so external apps can cover it, and returns on focus.
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'pop-up-menu');
    assert.deepEqual(focusCalls, [{ steal: true }]);
    t.mock.timers.tick(200);
    assert.equal(win.alwaysOnTop, true, 'focused settings window must stay pop-up-menu past 180ms');

    win.blur();
    win.emit('blur');
    assert.equal(win.alwaysOnTop, false, 'blur must drop alwaysOnTop so other apps cover settings');

    win.focus();
    win.emit('focus');
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'pop-up-menu');

    // Reopen existing focused instance switches tab without stealing focus again
    const win2 = mod.openSettingsWindow('system');
    assert.equal(win2, win);
    assert.equal(focusCalls.length, 1);
    assert.deepEqual(win.sentMessages.at(-1), {
      channel: 'settings-switch-tab',
      args: ['system'],
    });

    // Close flushes pending pet scale preview once and cleans windowManager
    mod.closeSettingsWindow();
    assert.deepEqual(flushCalls, ['flushPreview']);
    assert.equal(win.closeCalls, 1);
    assert.equal(windowManager.settingsWindow, null);
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    delete require.cache[SETTINGS_WINDOW_PATH];
  }
});

test('SettingsWindow: native close flushes pending pet scale preview once', () => {
  const { mod, windowManager, flushCalls } = loadSettingsWindowHarness();
  try {
    const win = mod.openSettingsWindow();
    assert.equal(win.options.width, 520);
    assert.equal(win.options.height, 456);
    win.close();
    assert.deepEqual(flushCalls, ['flushPreview']);
    assert.equal(windowManager.settingsWindow, null);
  } finally {
    delete require.cache[SETTINGS_WINDOW_PATH];
  }
});

test('SkinSelectorWindow: returnFocusToSettings isolates settings-launched vs tray-launched flows', () => {
  const FakeBrowserWindow = createFakeBrowserWindowClass();
  const focusCalls = [];
  const windowManager = {
    skinSelectorWindow: null,
    settingsWindow: new FakeBrowserWindow({ show: true }),
  };

  delete require.cache[SKIN_SELECTOR_WINDOW_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === SKIN_SELECTOR_WINDOW_PATH) {
      if (request === 'electron') {
        return {
          app: { focus: (opts) => focusCalls.push(opts) },
          BrowserWindow: FakeBrowserWindow,
          screen: {
            getCursorScreenPoint: () => ({ x: 0, y: 0 }),
            getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 900 } }),
          },
        };
      }
      if (request === './WindowManager') {
        return windowManager;
      }
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const skinSelectorWindow = require(SKIN_SELECTOR_WINDOW_PATH);
    skinSelectorWindow.init({
      getCurrentSkinId: () => 'default',
      getSkinGalleryItems: () => [],
      selectSkin: () => {},
      revertSkinPreview: () => {},
    });

    // 1. Opened from tray -> closing skin selector must NOT steal focus or notify settingsWindow
    const trayWin = skinSelectorWindow.openSkinSelectorWindow({ fromSettings: false });
    trayWin.close();
    assert.equal(windowManager.settingsWindow.focusCalls, 0);
    assert.equal(windowManager.settingsWindow.sentMessages.length, 0);

    // 2. Opened from settings -> closing skin selector focuses visible non-minimized settingsWindow
    const fromSettingsWin = skinSelectorWindow.openSkinSelectorWindow({ fromSettings: true });
    fromSettingsWin.close();
    assert.equal(windowManager.settingsWindow.focusCalls, 1);
    assert.deepEqual(windowManager.settingsWindow.sentMessages, [
      { channel: 'settings-restore-skin-focus', args: [] },
    ]);

    // 2b. Subsequent open without options (e.g. openSkinSelectorForQA) does not reuse stale returnFocusToSettings
    const neutralWin = skinSelectorWindow.openSkinSelectorWindow();
    neutralWin.close();
    assert.equal(windowManager.settingsWindow.focusCalls, 1);
    assert.equal(windowManager.settingsWindow.sentMessages.length, 1);

    // 3. Minimized settingsWindow does NOT receive focus restoration
    windowManager.settingsWindow.minimized = true;
    const win3 = skinSelectorWindow.openSkinSelectorWindow({ fromSettings: true });
    win3.close();
    assert.equal(windowManager.settingsWindow.focusCalls, 1);
    assert.equal(windowManager.settingsWindow.sentMessages.length, 1);
  } finally {
    Module._load = originalLoad;
    delete require.cache[SKIN_SELECTOR_WINDOW_PATH];
  }
});

test('PetWindow: keeps settingsWindow below PetWindow while retaining RDP suppression and close cleanup', () => {
  const FakeBrowserWindow = createFakeBrowserWindowClass();
  const windowManager = {
    mainWindow: null,
    statusWindow: null,
    pomodoroWindow: null,
    skinSelectorWindow: null,
    settingsWindow: null,
    updateProgressWindow: null,
  };
  let nativePayload = {};

  delete require.cache[PET_WINDOW_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === PET_WINDOW_PATH) {
      if (request === 'electron') {
        return {
          app: { on: () => {} },
          BrowserWindow: FakeBrowserWindow,
          ipcMain: { on: () => {} },
          screen: {
            getPrimaryDisplay: () => ({ id: 'primary' }),
            on: () => {},
            removeListener: () => {},
          },
        };
      }
      if (request === './WindowManager') return windowManager;
      if (request === './UpdateProgressWindow') return { closeUpdateProgressWindow: () => {} };
      if (request.includes('FinalSaveService')) return { installFinalSaveBeforeClose: () => {} };
      if (request.includes('IpcSenderAuthorization')) return { isSenderMainWindow: () => true };
      if (request.includes('StartupCachePolicy')) return { shouldClearStartupCache: () => false };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const origPlatform = process.platform;
  try {
    const PetWindow = require(PET_WINDOW_PATH);
    PetWindow.init({
      DisplayService: {
        setCurrentPetDisplay: () => {},
        getDesktopWindowBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
        lockPetWindowToBounds: () => {},
        sendScreenInfo: () => {},
        stopDragPoll: () => {},
        displayFitScheduler: { schedule: () => {}, clear: () => {} },
      },
      WindowAwarenessService: {
        sendActiveWindowInfo: () => {},
        getLastPayload: () => ({}),
        getNativePayload: () => nativePayload,
        stopActiveWindowAwareness: () => {},
        startActiveWindowAwareness: () => {},
      },
      PetVisibilityService: {
        isPetCurrentlyHidden: () => false,
        sendPetVisibility: () => {},
      },
      MeetingDetectorController: { startMeetingDetector: () => {} },
      WeatherSyncController: {
        updateWeatherSyncSettings: () => {},
        getWeatherSyncSettings: () => ({}),
      },
      app: { isPackaged: true, getVersion: () => '1.0.0', commandLine: { hasSwitch: () => false } },
      StoreManager: { getStore: () => ({ get: () => '1.0.0', set: () => {} }) },
    });

    PetWindow.createWindow();
    const settingsWin = new FakeBrowserWindow({ show: true });
    settingsWin.alwaysOnTop = true;
    let moveTopCalled = 0;
    settingsWin.moveTop = () => { moveTopCalled += 1; };
    windowManager.settingsWindow = settingsWin;

    PetWindow.keepPetWindowOnTop();
    assert.equal(moveTopCalled, 0, 'settingsWindow must stay below PetWindow during keepPetWindowOnTop');

    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    nativePayload = { active: true, window: { ownerName: 'mstsc', isFullScreen: true, isMinimized: false } };
    PetWindow.onActiveWindowChanged();
    assert.equal(settingsWin.visible, false, 'fullscreen RDP suppression must still hide alwaysOnTop settingsWindow');

    nativePayload = { active: false, reason: 'no-active-window' };
    PetWindow.onActiveWindowChanged();
    assert.equal(settingsWin.visible, true, 'leaving RDP must still restore suppressed settingsWindow');

    windowManager.mainWindow.emit('closed');
    assert.equal(settingsWin.closeCalls, 1, 'closing mainWindow must close settingsWindow');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    Module._load = originalLoad;
    delete require.cache[PET_WINDOW_PATH];
  }
});

test('SettingsWindow: keeps pop-up-menu below PetWindow while focused and drops on blur/minimize/hide or unfocused pulse', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const FakeBrowserWindow = createFakeBrowserWindowClass();
  const order = [];
  const windowManager = {
    mainWindow: null,
    statusWindow: null,
    pomodoroWindow: null,
    skinSelectorWindow: null,
    settingsWindow: null,
    updateProgressWindow: null,
  };

  class TrackingBrowserWindow extends FakeBrowserWindow {
    moveTop() {
      order.push(this === windowManager.mainWindow ? 'mainWindow' : 'settingsWindow');
    }
  }

  delete require.cache[SETTINGS_WINDOW_PATH];
  delete require.cache[PET_WINDOW_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === SETTINGS_WINDOW_PATH) {
      if (request === 'electron') {
        return {
          app: { focus: () => {} },
          BrowserWindow: TrackingBrowserWindow,
          screen: {
            getCursorScreenPoint: () => ({ x: 0, y: 0 }),
            getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 900 } }),
          },
        };
      }
      if (request === './WindowManager') return windowManager;
      if (request === '../services/PetScaleService') return { flushPreview: () => 100 };
    }
    if (parent?.filename === PET_WINDOW_PATH) {
      if (request === 'electron') {
        return {
          app: { on: () => {} },
          BrowserWindow: TrackingBrowserWindow,
          ipcMain: { on: () => {} },
          screen: {
            getPrimaryDisplay: () => ({ id: 'primary' }),
            on: () => {},
            removeListener: () => {},
          },
        };
      }
      if (request === './WindowManager') return windowManager;
      if (request === './UpdateProgressWindow') return { closeUpdateProgressWindow: () => {} };
      if (request.includes('FinalSaveService')) return { installFinalSaveBeforeClose: () => {} };
      if (request.includes('IpcSenderAuthorization')) return { isSenderMainWindow: () => true };
      if (request.includes('StartupCachePolicy')) return { shouldClearStartupCache: () => false };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const origPlatform = process.platform;
  try {
    const SettingsWindow = require(SETTINGS_WINDOW_PATH);
    const PetWindow = require(PET_WINDOW_PATH);
    SettingsWindow.init({
      flushPetScalePreview: () => 100,
      keepPetWindowOnTop: PetWindow.keepPetWindowOnTop,
    });
    PetWindow.init({
      DisplayService: {
        setCurrentPetDisplay: () => {},
        getDesktopWindowBounds: () => ({ x: 0, y: 0, width: 1600, height: 900 }),
        lockPetWindowToBounds: () => {},
        sendScreenInfo: () => {},
        stopDragPoll: () => {},
        displayFitScheduler: { schedule: () => {}, clear: () => {} },
      },
      WindowAwarenessService: {
        sendActiveWindowInfo: () => {},
        getLastPayload: () => ({}),
        getNativePayload: () => ({}),
        stopActiveWindowAwareness: () => {},
        startActiveWindowAwareness: () => {},
      },
      PetVisibilityService: { isPetCurrentlyHidden: () => false, sendPetVisibility: () => {} },
      MeetingDetectorController: { startMeetingDetector: () => {} },
      WeatherSyncController: { updateWeatherSyncSettings: () => {}, getWeatherSyncSettings: () => ({}) },
      app: { isPackaged: true, getVersion: () => '1.0.0', commandLine: { hasSwitch: () => false } },
      StoreManager: { getStore: () => ({ get: () => '1.0.0', set: () => {} }) },
    });

    PetWindow.createWindow();
    order.length = 0;
    const settingsWin = SettingsWindow.openSettingsWindow('appearance');
    assert.equal(order.at(-1), 'mainWindow', 'openSettingsWindow must re-assert mainWindow above settingsWindow');

    // Past the 180ms pulse while focused, SettingsWindow stays pop-up-menu and PetWindow stays above it
    t.mock.timers.tick(200);
    assert.equal(settingsWin.isAlwaysOnTop(), true);
    assert.equal(settingsWin.alwaysOnTopLevel, 'pop-up-menu');

    order.length = 0;
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(order, ['mainWindow']);

    order.length = 0;
    settingsWin.emit('focus');
    assert.equal(order.at(-1), 'mainWindow', 'focus must re-assert mainWindow above settingsWindow');

    order.length = 0;
    settingsWin.emit('moved');
    assert.equal(order.at(-1), 'mainWindow', 'moved must re-assert mainWindow above settingsWindow');

    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    order.length = 0;
    settingsWin.emitWebContents('input-event', {}, { type: 'mouseDown' });
    assert.equal(order.at(-1), 'mainWindow', 'win32 mouseDown must re-assert mainWindow above settingsWindow');

    order.length = 0;
    settingsWin.emitWebContents('input-event', {}, { type: 'touchStart' });
    assert.equal(order.at(-1), 'mainWindow', 'win32 touchStart must re-assert mainWindow above settingsWindow');
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });

    // Blurred/unpinned settings window must not invoke keepPetWindowOnTop on moved/input-event
    settingsWin.blur();
    settingsWin.emit('blur');
    order.length = 0;
    settingsWin.emit('moved');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    settingsWin.emitWebContents('input-event', {}, { type: 'mouseDown' });
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    assert.deepEqual(order, [], 'unpinned settingsWindow must skip pet re-assertion on moved/input-event');

    // Blur, minimize, and hide each drop alwaysOnTop
    for (const evt of ['blur', 'minimize', 'hide']) {
      settingsWin.focus();
      settingsWin.emit('focus');
      assert.equal(settingsWin.isAlwaysOnTop(), true);
      settingsWin.blur();
      settingsWin.emit(evt);
      assert.equal(settingsWin.isAlwaysOnTop(), false, `${evt} must drop alwaysOnTop`);
    }

    // Unfocused show/restore still falls back to normal level after 180ms
    settingsWin.blur();
    settingsWin.emit('show');
    assert.equal(settingsWin.isAlwaysOnTop(), true);
    t.mock.timers.tick(200);
    assert.equal(settingsWin.isAlwaysOnTop(), false);

    windowManager.mainWindow.emit('closed');
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    Module._load = originalLoad;
    delete require.cache[SETTINGS_WINDOW_PATH];
    delete require.cache[PET_WINDOW_PATH];
  }
});
