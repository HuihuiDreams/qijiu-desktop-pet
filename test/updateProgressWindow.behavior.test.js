const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const WINDOW_MODULE_PATH = require.resolve('../src/main/windows/UpdateProgressWindow');

function loadFreshUpdateProgressWindow() {
  const windowManager = { updateProgressWindow: null, mainWindow: null };
  const createdWindows = [];
  const originalLoad = Module._load;
  delete require.cache[WINDOW_MODULE_PATH];

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.listeners = {};
      this.destroyed = false;
      this.sent = [];
      this.webContentsListeners = {};
      this.webContents = {
        setWindowOpenHandler: () => {},
        on: () => {},
        once: (event, listener) => { this.webContentsListeners[event] = listener; },
        send: (channel, payload) => { this.sent.push([channel, payload]); },
      };
      createdWindows.push(this);
    }

    on(event, listener) { this.listeners[event] = listener; }
    setMenuBarVisibility() {}
    loadFile() {}
    setTitle() {}
    show() {}
    focus() {}
    isDestroyed() { return this.destroyed; }

    // 真实 Electron 里 closed 事件晚于 close() 调用异步触发，这里拆开模拟
    close() { this.destroyed = true; }
    emitClosed() { this.listeners.closed?.(); }
    finishLoad() { this.webContentsListeners['did-finish-load']?.(); }
  }

  Module._load = function loadUpdateProgressDependencies(request, parent, isMain) {
    if (parent?.filename === WINDOW_MODULE_PATH && request === 'electron') {
      return { BrowserWindow: FakeBrowserWindow };
    }
    if (parent?.filename === WINDOW_MODULE_PATH && request === './WindowManager') {
      return windowManager;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // eslint-disable-next-line global-require
    const updateProgressWindow = require('../src/main/windows/UpdateProgressWindow');
    updateProgressWindow.init({
      trayText: (_key, fallback) => fallback,
      trayT: (key) => key,
    });
    return { updateProgressWindow, windowManager, createdWindows };
  } finally {
    Module._load = originalLoad;
  }
}

const checking = { mode: 'checking', title: 'Checking', message: 'checking-msg' };
const downloading = { mode: 'downloading', title: 'Downloading', message: 'downloading-msg', percent: 0 };

test('progress sent while the window is still loading is not overwritten by the initial payload', () => {
  const { updateProgressWindow, createdWindows } = loadFreshUpdateProgressWindow();

  updateProgressWindow.showUpdateProgressWindow(checking);
  updateProgressWindow.showUpdateProgressWindow(downloading);
  updateProgressWindow.setUpdateProgress(35);
  const [win] = createdWindows;
  win.sent.length = 0; // 加载中发出的消息会被页面丢弃，只关心加载完成后补发的内容

  win.finishLoad();

  assert.equal(win.sent.length, 1);
  assert.deepEqual(win.sent[0][1], {
    mode: 'downloading',
    title: 'Downloading Update',
    message: 'updateDownloadingMsg',
    percent: 35,
  });
});

test('a window shown for the first time delivers its own payload once loaded', () => {
  const { updateProgressWindow, createdWindows } = loadFreshUpdateProgressWindow();

  updateProgressWindow.showUpdateProgressWindow(checking);
  createdWindows[0].sent.length = 0;
  createdWindows[0].finishLoad();

  assert.deepEqual(createdWindows[0].sent, [['update-progress', { ...checking, percent: 0 }]]);
});

test('closing resets the remembered payload so a new window does not replay stale progress', () => {
  const { updateProgressWindow, createdWindows } = loadFreshUpdateProgressWindow();

  updateProgressWindow.showUpdateProgressWindow(downloading);
  updateProgressWindow.setUpdateProgress(80);
  updateProgressWindow.closeUpdateProgressWindow();
  updateProgressWindow.showUpdateProgressWindow(checking);

  const secondWindow = createdWindows[1];
  secondWindow.sent.length = 0;
  secondWindow.finishLoad();

  assert.deepEqual(secondWindow.sent, [['update-progress', { ...checking, percent: 0 }]]);
});

test('the late closed event of an old window does not clear the reference to a newer window', () => {
  const { updateProgressWindow, windowManager, createdWindows } = loadFreshUpdateProgressWindow();

  updateProgressWindow.showUpdateProgressWindow(checking);
  const [oldWindow] = createdWindows;
  updateProgressWindow.closeUpdateProgressWindow();
  assert.equal(windowManager.updateProgressWindow, null);

  updateProgressWindow.showUpdateProgressWindow(downloading);
  const newWindow = createdWindows[1];
  assert.equal(windowManager.updateProgressWindow, newWindow);

  oldWindow.emitClosed();
  assert.equal(windowManager.updateProgressWindow, newWindow, 'stale closed event must not null the new window');

  newWindow.close();
  newWindow.emitClosed();
  assert.equal(windowManager.updateProgressWindow, null, 'the window still clears its own reference');
});
