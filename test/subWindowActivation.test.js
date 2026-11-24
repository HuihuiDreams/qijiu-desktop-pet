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
      this.webContentsListeners = {};
      this.webContents = {
        on: (event, handler) => {
          this.webContentsListeners[event] = this.webContentsListeners[event] || [];
          this.webContentsListeners[event].push(handler);
        },
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

    emitWebContents(event, ...args) {
      const handlers = this.webContentsListeners[event] || [];
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

    isAlwaysOnTop() {
      return Boolean(this.alwaysOnTop);
    }

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
    statusWindow: null,
    pomodoroWindow: null,
    settingsWindow: null,
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
    mod.openSkinSelectorWindow();
    assert.equal(focusCalls.length, previousFocusCallsCount);

    // 5. Native restore triggers pulse
    win.emit('restore');
    assert.equal(win.alwaysOnTop, true);
    assert.equal(win.alwaysOnTopLevel, 'screen-saver');
    t.mock.timers.tick(200);
    assert.equal(win.alwaysOnTop, false);

    // Clean up
    mod.closeSkinSelectorWindow();
  });
});

test('SettingsWindow: activates with pop-up-menu pulse, skipTransformProcessType, guarded focus steal, and pet re-assertion', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const origPlatform = process.platform;

  try {
    withMockedModule('../src/main/windows/SettingsWindow', ({ mod, windowManager, focusCalls }) => {
      let keepPetOnTopCalls = 0;
      mod.init({
        keepPetWindowOnTop: () => { keepPetOnTopCalls += 1; },
      });

      const win = mod.openSettingsWindow();
      assert.equal(windowManager.settingsWindow, win);

      // 1. Workspace options and initial top pulse at pop-up-menu (below screen-saver pet window)
      assert.equal(win.visibleOnAllWorkspaces, true);
      assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
      assert.equal(win.alwaysOnTop, true);
      assert.equal(win.alwaysOnTopLevel, 'pop-up-menu');
      assert.ok(keepPetOnTopCalls >= 1, 'opening SettingsWindow must keep pet window above it');

      // 2. Darwin focus theft
      if (origPlatform === 'darwin') {
        assert.equal(focusCalls.length, 1);
        assert.deepEqual(focusCalls[0], { steal: true });
      }

      // 3. Stays pop-up-menu past 180ms while focused, then drops on blur/minimize/hide
      t.mock.timers.tick(200);
      assert.equal(win.alwaysOnTop, true);
      assert.equal(win.alwaysOnTopLevel, 'pop-up-menu');

      const callsBeforeMoved = keepPetOnTopCalls;
      win.emit('moved');
      assert.equal(keepPetOnTopCalls, callsBeforeMoved + 1);

      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      win.emitWebContents('input-event', {}, { type: 'mouseDown' });
      assert.equal(keepPetOnTopCalls, callsBeforeMoved + 2);
      win.emitWebContents('input-event', {}, { type: 'touchStart' });
      assert.equal(keepPetOnTopCalls, callsBeforeMoved + 3);

      win.blur();
      win.emit('blur');
      assert.equal(win.alwaysOnTop, false);
      const callsAfterBlur = keepPetOnTopCalls;
      win.emit('moved');
      win.emitWebContents('input-event', {}, { type: 'mouseDown' });
      assert.equal(keepPetOnTopCalls, callsAfterBlur, 'unpinned SettingsWindow must skip keepPetWindowOnTop on moved/input-event');
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });

      // 4. Repeated open while focused does not steal focus again
      win.focus();
      const callsBeforeFocus = keepPetOnTopCalls;
      win.emit('focus');
      assert.equal(keepPetOnTopCalls, callsBeforeFocus + 1);
      const previousFocusCallsCount = focusCalls.length;
      mod.openSettingsWindow();
      assert.equal(focusCalls.length, previousFocusCallsCount);

      // 5. Unfocused native restore pulses to pop-up-menu, keeps pet on top, and falls back after 180ms
      win.blur();
      win.emit('blur');
      const callsBeforeRestore = keepPetOnTopCalls;
      win.emit('restore');
      assert.equal(win.alwaysOnTop, true);
      assert.equal(win.alwaysOnTopLevel, 'pop-up-menu');
      assert.equal(keepPetOnTopCalls, callsBeforeRestore + 1);
      t.mock.timers.tick(200);
      assert.equal(win.alwaysOnTop, false);

      // 6. Minimize and hide drop alwaysOnTop immediately
      win.focus();
      win.emit('focus');
      assert.equal(win.alwaysOnTop, true);
      win.emit('minimize');
      assert.equal(win.alwaysOnTop, false);

      win.emit('focus');
      assert.equal(win.alwaysOnTop, true);
      win.emit('hide');
      assert.equal(win.alwaysOnTop, false);

      mod.closeSettingsWindow();
    });
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
  }
});

test('StatusWindow: activates with permanent pop-up-menu level, skipTransformProcessType, and pet re-assertion', () => {
  const origPlatform = process.platform;
  try {
    withMockedModule('../src/main/windows/StatusWindow', ({ mod, windowManager, focusCalls }) => {
      let keepPetOnTopCalls = 0;
      mod.init({
        refreshTrayMenu: () => {},
        getStatusData: () => ({ pets: [] }),
        keepPetWindowOnTop: () => { keepPetOnTopCalls += 1; },
      });

      const win = mod.openStatusWindow();
      assert.equal(windowManager.statusWindow, win);

      // 1. Workspace options
      assert.equal(win.visibleOnAllWorkspaces, true);
      assert.deepEqual(win.visibleOnAllWorkspacesOptions, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });

      // 2. Permanent pop-up-menu level (below screen-saver pet window)
      assert.equal(win.alwaysOnTop, true);
      assert.equal(win.alwaysOnTopLevel, 'pop-up-menu');
      assert.ok(keepPetOnTopCalls >= 1, 'opening StatusWindow must keep pet window above it');

      const callsAfterOpen = keepPetOnTopCalls;
      win.emit('focus');
      assert.equal(keepPetOnTopCalls, callsAfterOpen + 1);
      win.emit('show');
      assert.equal(keepPetOnTopCalls, callsAfterOpen + 2);
      win.emit('restore');
      assert.equal(keepPetOnTopCalls, callsAfterOpen + 3);
      win.emit('moved');
      assert.equal(keepPetOnTopCalls, callsAfterOpen + 4);

      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      win.emitWebContents('input-event', {}, { type: 'mouseDown' });
      assert.equal(keepPetOnTopCalls, callsAfterOpen + 5);
      win.emitWebContents('input-event', {}, { type: 'touchStart' });
      assert.equal(keepPetOnTopCalls, callsAfterOpen + 6);
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });

      // 3. Focus steal guarded
      if (origPlatform === 'darwin') {
        assert.equal(focusCalls.length, 1);
        assert.deepEqual(focusCalls[0], { steal: true });
      }

      const previousFocusCallsCount = focusCalls.length;
      mod.openStatusWindow();
      assert.equal(focusCalls.length, previousFocusCallsCount);
    });
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
  }
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
