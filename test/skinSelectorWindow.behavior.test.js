const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const WINDOW_MODULE_PATH = require.resolve('../src/main/windows/SkinSelectorWindow');

function loadFreshSkinSelectorWindow() {
  const windowManager = { skinSelectorWindow: null };
  const originalLoad = Module._load;
  delete require.cache[WINDOW_MODULE_PATH];

  class FakeBrowserWindow {
    constructor() {
      this.listeners = {};
      this.closeCalls = 0;
      this.destroyed = false;
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
      return false;
    }

    show() {}

    moveTop() {}

    focus() {}

    close() {
      this.closeCalls += 1;
      // macOS can emit blur while a focused floating window is closing.
      this.listeners.blur?.();
      this.destroyed = true;
      this.listeners.closed?.();
    }
  }

  Module._load = function loadSkinSelectorDependencies(request, parent, isMain) {
    if (parent?.filename === WINDOW_MODULE_PATH && request === 'electron') {
      return {
        BrowserWindow: FakeBrowserWindow,
        ipcMain: {},
        screen: {
          getCursorScreenPoint: () => ({ x: 0, y: 0 }),
          getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 900 } }),
        },
      };
    }
    if (parent?.filename === WINDOW_MODULE_PATH && request === './WindowManager') {
      return windowManager;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // eslint-disable-next-line global-require
    const skinSelectorWindow = require('../src/main/windows/SkinSelectorWindow');
    skinSelectorWindow.init({
      getCurrentSkinId: () => 'default',
      getSkinGalleryItems: () => [],
      selectSkin: () => {},
    });
    return { skinSelectorWindow, windowManager };
  } finally {
    Module._load = originalLoad;
  }
}

test('closing the skin selector ignores the blur emitted by its own close operation', () => {
  const { skinSelectorWindow, windowManager } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.openSkinSelectorWindow();

  assert.doesNotThrow(() => skinSelectorWindow.closeSkinSelectorWindow());
  assert.equal(win.closeCalls, 1);
  assert.equal(windowManager.skinSelectorWindow, null);
});
