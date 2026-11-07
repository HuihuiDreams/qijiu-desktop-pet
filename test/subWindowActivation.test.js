'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function createHarness() {
  const focusCalls = [];
  const fakeApp = {
    focus(options) {
      focusCalls.push(options);
    },
  };

  class FakeBrowserWindow {
    constructor(options = {}) {
      this.options = options;
      this.visible = options.show || false;
      this.minimized = false;
      this.destroyed = false;
      this.focused = false;
      this.alwaysOnTop = false;
      this.alwaysOnTopLevel = null;
      this.visibleOnAllWorkspaces = false;
      this.visibleOnAllWorkspacesOptions = null;
      this.listeners = {};
      this.webContents = {
        on: () => {},
        setWindowOpenHandler: () => {},
        send: () => {},
      };
    }

    on(event, handler) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(handler);
    }

    emit(event, ...args) {
      const handlers = this.listeners[event] || [];
      for (const h of handlers) h(...args);
    }

    loadFile() {
      return Promise.resolve();
    }

    isDestroyed() {
      return this.destroyed;
    }

    isVisible() {
      return this.visible;
    }

    show() {
      this.visible = true;
    }

    isMinimized() {
      return this.minimized;
    }

    restore() {
      this.minimized = false;
    }

    focus() {
      this.focused = true;
    }

    blur() {
      this.focused = false;
    }

    isFocused() {
      return this.focused;
    }

    moveTop() {}

    setAlwaysOnTop(flag, level) {
      this.alwaysOnTop = Boolean(flag);
      this.alwaysOnTopLevel = level || null;
    }

    setVisibleOnAllWorkspaces(flag, options) {
      this.visibleOnAllWorkspaces = Boolean(flag);
      this.visibleOnAllWorkspacesOptions = options;
    }

    close() {
      this.destroyed = true;
      this.emit('close');
      this.emit('closed');
    }
  }

  const fakeScreen = {
    getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    getDisplayNearestPoint: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    }),
  };

  const ipcHandlers = {};
  const fakeIpcMain = {
    handle: (channel, handler) => {
      ipcHandlers[channel] = handler;
    },
    on: () => {},
  };

  return {
    focusCalls,
    fakeApp,
    FakeBrowserWindow,
    fakeScreen,
    fakeIpcMain,
    ipcHandlers,
  };
}

function withMockedModule(targetModulePath, testFn) {
  const resolvedPath = require.resolve(targetModulePath);
  delete require.cache[resolvedPath];

  const harness = createHarness();
  const windowManager = {
    skinSelectorWindow: null,
    petScaleWindow: null,
    statusWindow: null,
    citySettingWindow: null,
    pomodoroWindow: null,
    mainWindow: null,
  };

  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === resolvedPath) {
      if (request === 'electron') {
        return {
          app: harness.fakeApp,
          BrowserWindow: harness.FakeBrowserWindow,
          screen: harness.fakeScreen,
          ipcMain: harness.fakeIpcMain,
        };
      }
      if (request === './WindowManager') {
        return windowManager;
      }
      if (request.includes('PetScaleService')) {
        return {
          cancel: () => {},
          confirm: () => 100,
          preview: (p) => p,
          getCommittedPercent: () => 100,
          getPreviewPercent: () => 100,
        };
      }
      if (request.includes('IpcSenderAuthorization')) {
        return {
          isSenderWindow: () => true,
          isSenderMainWindow: () => true,
        };
      }
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = require(resolvedPath);
    return testFn({ mod, windowManager, ...harness });
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedPath];
  }
}

test('SkinSelectorWindow: activates with screen-saver pulse, skipTransformProcessType, and guarded focus steal', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });

  withMockedModule('../src/main/windows/SkinSelectorWindow', ({ mod, windowManager, focusCalls }) => {
    mod.init({
      getCurrentSkinId: () => 'default',
      revertSkinPreview: () => {},
      confirmSkinSelection: () => {},
      getGalleryData: () => [],
      getSkinGalleryItems: () => [],
    });

    const win = mod.openSkinSelectorWindow();
    assert.equal(windowManager.skinSelectorWindow, win);

    // 1. Initial workspace options and top pulse
    assert.equal(win.visibleOnAllWorkspaces, true);
    assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'screen-saver');

    // 2. Darwin focus theft happened because win was not yet focused
    if (process.platform === 'darwin') {
      assert.equal(focusCalls.length, 1);
      assert.deepEqual(focusCalls[0], { steal: true });
    }

    // 3. 180ms pulse elapses -> drops alwaysOnTop to false
    t.mock.timers.tick(200);
    assert.equal(win.alwaysOnTop, false);

    // 4. Repeated open when already focused does NOT steal focus again
    const previousFocusCallsCount = focusCalls.length;
    mod.openSkinSelectorWindow();
    assert.equal(focusCalls.length, previousFocusCallsCount);

    // 5. Subsequent native 'focus' event triggers another 180ms pulse
    win.emit('focus');
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'screen-saver');
    t.mock.timers.tick(200);
    assert.equal(win.alwaysOnTop, false);

    // Clean up
    mod.closeSkinSelectorWindow();
  });
});

test('PetScaleWindow: activates with screen-saver pulse, skipTransformProcessType, and guarded focus steal', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });

  withMockedModule('../src/main/windows/PetScaleWindow', ({ mod, windowManager, focusCalls }) => {
    mod.init();

    const win = mod.openPetScaleWindow();
    assert.equal(windowManager.petScaleWindow, win);

    // 1. Workspace options and initial top pulse
    assert.equal(win.visibleOnAllWorkspaces, true);
    assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'screen-saver');

    // 2. Darwin focus theft
    if (process.platform === 'darwin') {
      assert.equal(focusCalls.length, 1);
      assert.deepEqual(focusCalls[0], { steal: true });
    }

    // 3. Pulse timer drops to false after 180ms
    t.mock.timers.tick(200);
    assert.equal(win.alwaysOnTop, false);

    // 4. Repeated open while focused does not steal focus again
    const previousFocusCallsCount = focusCalls.length;
    mod.openPetScaleWindow();
    assert.equal(focusCalls.length, previousFocusCallsCount);

    // 5. Native restore triggers pulse
    win.emit('restore');
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'screen-saver');
    t.mock.timers.tick(200);
    assert.equal(win.alwaysOnTop, false);

    mod.closePetScaleWindow();
  });
});

test('StatusWindow: activates with permanent screen-saver level and skipTransformProcessType', () => {
  withMockedModule('../src/main/windows/StatusWindow', ({ mod, windowManager, focusCalls }) => {
    mod.init({
      refreshTrayMenu: () => {},
      getStatusData: () => ({ pets: [] }),
    });

    const win = mod.openStatusWindow();
    assert.equal(windowManager.statusWindow, win);

    // 1. Workspace options
    assert.equal(win.visibleOnAllWorkspaces, true);
    assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });

    // 2. Permanent screen-saver level
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'screen-saver');

    // 3. Focus steal guarded
    if (process.platform === 'darwin') {
      assert.equal(focusCalls.length, 1);
      assert.deepEqual(focusCalls[0], { steal: true });
    }

    const previousFocusCallsCount = focusCalls.length;
    mod.openStatusWindow();
    assert.equal(focusCalls.length, previousFocusCallsCount);
  });
});

test('CitySettingWindow: activates with screen-saver pulse, skipTransformProcessType, and guarded focus steal', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });

  withMockedModule('../src/main/windows/CitySettingWindow', ({ mod, windowManager, focusCalls }) => {
    mod.init();

    const win = mod.openCitySettingWindow();
    assert.equal(windowManager.citySettingWindow, win);
    assert.equal(win.options.show, false);

    assert.equal(win.visibleOnAllWorkspaces, true);
    assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'screen-saver');

    if (process.platform === 'darwin') {
      assert.equal(focusCalls.length, 1);
      assert.deepEqual(focusCalls[0], { steal: true });
    }

    t.mock.timers.tick(200);
    assert.equal(win.alwaysOnTop, false);

    const previousFocusCallsCount = focusCalls.length;
    mod.openCitySettingWindow();
    assert.equal(focusCalls.length, previousFocusCallsCount);
  });
});

test('PomodoroWindow: activates with skipTransformProcessType and guarded focus steal', async () => {
  await withMockedModule('../src/main/windows/PomodoroWindow', async ({ mod, windowManager, focusCalls, ipcHandlers }) => {
    mod.init({
      sendPomodoroState: () => {},
      stopPomodoroSession: () => {},
      getPomodoroSnapshot: () => ({}),
      createIpcSuccess: (data) => ({ success: true, data }),
      createIpcFailure: (code, message) => ({ success: false, code, message }),
    });

    const win = mod.openPomodoroWindow();
    assert.equal(windowManager.pomodoroWindow, win);
    assert.equal(win.options.show, false);

    if (process.platform === 'darwin') {
      assert.equal(focusCalls.length, 1);
      assert.deepEqual(focusCalls[0], { steal: true });
    }

    // Pinned state sets workspace with skipTransformProcessType
    assert.equal(win.visibleOnAllWorkspaces, true);
    assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });

    // Unpinned state via IPC sets workspace to false with skipTransformProcessType
    await ipcHandlers['pomodoro-set-always-on-top']({ sender: win.webContents }, false);
    assert.equal(win.visibleOnAllWorkspaces, false);
    assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
      skipTransformProcessType: true,
    });

    // Re-pin via IPC restores workspace with skipTransformProcessType
    await ipcHandlers['pomodoro-set-always-on-top']({ sender: win.webContents }, true);
    assert.equal(win.visibleOnAllWorkspaces, true);
    assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });

    const previousFocusCallsCount = focusCalls.length;
    mod.openPomodoroWindow();
    assert.equal(focusCalls.length, previousFocusCallsCount);
  });
});

test('SubWindow focus theft is platform-gated: darwin steals focus, win32 does not', () => {
  const origPlatform = process.platform;
  try {
    // 1. On darwin
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    withMockedModule('../src/main/windows/PomodoroWindow', ({ mod, focusCalls }) => {
      mod.init({
        sendPomodoroState: () => {},
        stopPomodoroSession: () => {},
        getPomodoroSnapshot: () => ({}),
      });
      mod.openPomodoroWindow();
      assert.equal(focusCalls.length, 1);
      assert.deepEqual(focusCalls[0], { steal: true });
    });

    // 2. On win32
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    withMockedModule('../src/main/windows/PomodoroWindow', ({ mod, focusCalls }) => {
      mod.init({
        sendPomodoroState: () => {},
        stopPomodoroSession: () => {},
        getPomodoroSnapshot: () => ({}),
      });
      mod.openPomodoroWindow();
      assert.equal(focusCalls.length, 0);
    });
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
  }
});
