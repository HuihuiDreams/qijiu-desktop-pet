const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const WINDOW_MODULE_PATH = require.resolve('../src/main/windows/PetScaleWindow');

function loadFreshPetScaleWindow(extraDeps = {}) {
  const windowManager = { petScaleWindow: null };
  const originalLoad = Module._load;
  delete require.cache[WINDOW_MODULE_PATH];

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options || {};
      this.listeners = {};
      this.closeCalls = 0;
      this.destroyed = false;
      this.minimized = false;
      this.visible = options.show || false;
      this.webContents = {
        on: () => {},
        setWindowOpenHandler: () => {},
        send: () => {},
      };
    }

    on(channel, listener) {
      this.listeners[channel] = listener;
    }

    loadFile() {}

    isDestroyed() {
      return this.destroyed;
    }

    isVisible() {
      return this.visible;
    }

    isMinimized() {
      return this.minimized;
    }

    restore() {
      this.minimized = false;
    }

    blur() {
      this.listeners.blur?.();
    }

    show() {
      this.visible = true;
    }

    moveTop() {}

    focus() {}

    close() {
      this.closeCalls += 1;
      this.listeners.close?.();
      this.listeners.blur?.();
      this.destroyed = true;
      this.listeners.closed?.();
    }
  }

  Module._load = function loadPetScaleWindowDependencies(request, parent, isMain) {
    if (parent?.filename === WINDOW_MODULE_PATH && request === 'electron') {
      return {
        BrowserWindow: FakeBrowserWindow,
        screen: {
          getCursorScreenPoint: () => ({ x: 0, y: 0 }),
          getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 900 } }),
        },
        ipcMain: {
          handle: () => {},
        },
      };
    }
    if (parent?.filename === WINDOW_MODULE_PATH && request === './WindowManager') {
      return windowManager;
    }
    if (parent?.filename === WINDOW_MODULE_PATH && request === '../services/PetScaleService') {
      return {
        cancel: extraDeps.cancel || (() => {}),
        confirm: extraDeps.confirm || (() => 100),
        preview: extraDeps.preview || ((p) => p),
        getCommittedPercent: extraDeps.getCommittedPercent || (() => 100),
        getPreviewPercent: extraDeps.getPreviewPercent || extraDeps.getCommittedPercent || (() => 100),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // eslint-disable-next-line global-require
    const petScaleWindow = require('../src/main/windows/PetScaleWindow');
    petScaleWindow.init();
    return {
      petScaleWindow,
      windowManager,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('retains pet scale window when focus moves to another app (blur does not close)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  let cancelCount = 0;
  const { petScaleWindow, windowManager } = loadFreshPetScaleWindow({
    cancel: () => { cancelCount++; },
  });

  const win = petScaleWindow.openPetScaleWindow();
  assert.equal(windowManager.petScaleWindow, win);
  assert.equal(win.isVisible(), true);

  // Trigger blur
  win.blur();
  t.mock.timers.tick(5000);

  // Window should NOT close, cancel should NOT be called
  assert.equal(win.closeCalls, 0);
  assert.equal(cancelCount, 0);
  assert.equal(win.isDestroyed(), false);
  assert.equal(windowManager.petScaleWindow, win);

  // Explicit close rolls back preview
  petScaleWindow.closePetScaleWindow();
  assert.equal(win.closeCalls, 1);
  assert.equal(cancelCount, 1);
  assert.equal(windowManager.petScaleWindow, null);
});

test('native close of pet scale window rolls back unconfirmed scale preview exactly once', () => {
  let cancelCount = 0;
  const { petScaleWindow, windowManager } = loadFreshPetScaleWindow({
    cancel: () => { cancelCount++; },
  });

  const win = petScaleWindow.openPetScaleWindow();
  win.close();

  assert.equal(cancelCount, 1);
  assert.equal(windowManager.petScaleWindow, null);
});

test('pet scale window uses ordinary window stacking and can be minimized', () => {
  const { petScaleWindow } = loadFreshPetScaleWindow();
  const win = petScaleWindow.openPetScaleWindow();

  assert.equal(win.options.alwaysOnTop, false);
  assert.equal(win.options.minimizable, true);
  assert.equal(win.options.show, false);
});

test('openPetScaleWindow restores minimized window on reopen', () => {
  const { petScaleWindow, windowManager } = loadFreshPetScaleWindow();
  const win = petScaleWindow.openPetScaleWindow();

  win.minimized = true;
  assert.equal(win.isMinimized(), true);

  const win2 = petScaleWindow.openPetScaleWindow();
  assert.equal(win, win2);
  assert.equal(win.isMinimized(), false);
  assert.equal(windowManager.petScaleWindow, win);
});

test('closing pet scale window ignores the blur emitted by its own close operation', () => {
  let cancelCount = 0;
  const { petScaleWindow, windowManager } = loadFreshPetScaleWindow({
    cancel: () => { cancelCount++; },
  });
  const win = petScaleWindow.openPetScaleWindow();

  assert.doesNotThrow(() => petScaleWindow.closePetScaleWindow());
  assert.equal(win.closeCalls, 1);
  assert.equal(cancelCount, 1);
  assert.equal(windowManager.petScaleWindow, null);
});
