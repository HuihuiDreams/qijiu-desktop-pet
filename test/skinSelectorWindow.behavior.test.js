const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const test = require('node:test');

const WINDOW_MODULE_PATH = require.resolve('../src/main/windows/SkinSelectorWindow');

function loadFreshSkinSelectorWindow() {
  const windowManager = { skinSelectorWindow: null };
  const app = new EventEmitter();
  let appActive = false;
  let focusedWindow = null;
  app.isActive = () => appActive;
  const originalLoad = Module._load;
  delete require.cache[WINDOW_MODULE_PATH];

  class FakeBrowserWindow {
    static getFocusedWindow() {
      return focusedWindow;
    }

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
        app,
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
    return {
      skinSelectorWindow,
      windowManager,
      setAppActive: (active) => { appActive = active; },
      setFocusedWindow: (win) => { focusedWindow = win; },
      handOffFocusTo: (win) => {
        focusedWindow = win;
        app.emit('browser-window-focus', {}, win);
      },
    };
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

test('a delayed focus handoff to another DeskPet window keeps the skin selector open', () => {
  const { skinSelectorWindow, windowManager, setFocusedWindow, handOffFocusTo } = loadFreshSkinSelectorWindow();
  const selectorWindow = skinSelectorWindow.openSkinSelectorWindow();
  const pomodoroWindow = { isDestroyed: () => false };
  windowManager.pomodoroWindow = pomodoroWindow;
  setFocusedWindow(null);

  selectorWindow.listeners.blur();
  handOffFocusTo(pomodoroWindow);

  assert.equal(selectorWindow.closeCalls, 0);
  assert.equal(windowManager.skinSelectorWindow, selectorWindow);
});

test('moving focus outside DeskPet closes the skin selector after the handoff window', async () => {
  const { skinSelectorWindow, windowManager, setFocusedWindow } = loadFreshSkinSelectorWindow();
  const selectorWindow = skinSelectorWindow.openSkinSelectorWindow();
  setFocusedWindow(null);

  selectorWindow.listeners.blur();
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(selectorWindow.closeCalls, 1);
  assert.equal(windowManager.skinSelectorWindow, null);
});

test('an active DeskPet app keeps the selector open when macOS reports no focused window', async () => {
  const { skinSelectorWindow, windowManager, setAppActive, setFocusedWindow } = loadFreshSkinSelectorWindow();
  const selectorWindow = skinSelectorWindow.openSkinSelectorWindow();
  setFocusedWindow(null);
  setAppActive(true);

  selectorWindow.listeners.blur();
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(selectorWindow.closeCalls, 0);
  assert.equal(windowManager.skinSelectorWindow, selectorWindow);
});

test('sendSkinSelectorData returns immediately when window is null or destroyed', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  assert.doesNotThrow(() => skinSelectorWindow.sendSkinSelectorData());
});

test('sendSkinSelectorData sends gallery data with isSelected correctly marked', () => {
  const { skinSelectorWindow, windowManager } = loadFreshSkinSelectorWindow();
  
  skinSelectorWindow.init({
    getCurrentSkinId: () => 'skin-b',
    getSkinGalleryItems: () => [
      { id: 'skin-a' },
      { id: 'skin-b' },
    ],
    selectSkin: () => {},
  });

  const win = skinSelectorWindow.openSkinSelectorWindow();
  let sentData = null;
  win.webContents.send = (channel, data) => {
    if (channel === 'skin-selector-data') sentData = data;
  };

  skinSelectorWindow.sendSkinSelectorData();

  assert.ok(sentData);
  assert.equal(sentData.length, 2);
  assert.equal(sentData[0].isSelected, false);
  assert.equal(sentData[1].isSelected, true);
});

test('openSkinSelectorWindow reuses existing window and refreshes data on second call', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  const win1 = skinSelectorWindow.openSkinSelectorWindow();
  
  let sendCalls = 0;
  win1.webContents.send = (channel) => {
    if (channel === 'skin-selector-data') sendCalls++;
  };

  const win2 = skinSelectorWindow.openSkinSelectorWindow();
  
  assert.equal(win1, win2);
  assert.equal(sendCalls, 1);
});

test('cancelSkinSelection reverts to original skin when preview changed the skin', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  
  let selectedSkin = null;
  skinSelectorWindow.init({
    getCurrentSkinId: () => 'skin-b',
    getSkinGalleryItems: () => [],
    selectSkin: (id) => { selectedSkin = id; },
  });

  skinSelectorWindow.setSkinSelectorOriginalSkinId('skin-a');
  skinSelectorWindow.closeSkinSelectorWindow();
  
  assert.equal(selectedSkin, 'skin-a');
  assert.equal(skinSelectorWindow.getSkinSelectorOriginalSkinId(), null);
});

test('closeSkinSelectorWindow re-entrance protection: second call is a no-op', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.openSkinSelectorWindow();
  
  win.close = () => {
    win.closeCalls += 1;
    skinSelectorWindow.closeSkinSelectorWindow();
    win.destroyed = true;
  };

  skinSelectorWindow.closeSkinSelectorWindow();
  assert.equal(win.closeCalls, 1);
});

test('closeSkinSelectorWindow when window is already null/destroyed resets closeInProgress', () => {
  const { skinSelectorWindow, windowManager } = loadFreshSkinSelectorWindow();
  windowManager.skinSelectorWindow = null;
  assert.doesNotThrow(() => skinSelectorWindow.closeSkinSelectorWindow());
});

test('scheduleBlurClose does not schedule when close is already in progress', async () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.openSkinSelectorWindow();
  
  win.close = () => {
    win.closeCalls += 1;
  };

  skinSelectorWindow.closeSkinSelectorWindow();
  win.listeners.blur();
  
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(win.closeCalls, 1);
});

test('scheduleBlurClose does not schedule when a DeskPet window is focused', async () => {
  const { skinSelectorWindow, windowManager, setFocusedWindow } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.openSkinSelectorWindow();
  
  windowManager.mainWindow = {};
  setFocusedWindow(windowManager.mainWindow);
  
  win.listeners.blur();
  await new Promise((resolve) => setTimeout(resolve, 120));
  
  assert.equal(win.closeCalls, 0);
});

test('getter/setter verification', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  
  skinSelectorWindow.setSkinSelectorSelectionInProgress(true);
  assert.equal(skinSelectorWindow.isSkinSelectorSelectionInProgress(), true);
  
  skinSelectorWindow.setSkinSelectorSelectionInProgress(false);
  assert.equal(skinSelectorWindow.isSkinSelectorSelectionInProgress(), false);
  
  skinSelectorWindow.setSkinSelectorOriginalSkinId('test-skin');
  assert.equal(skinSelectorWindow.getSkinSelectorOriginalSkinId(), 'test-skin');
});
